// src/services/games/neverHaveIEver.service.js

const NeverHaveIEverQuestion = require('../../models/games/NeverHaveIEverQuestion');
const NeverHaveIEverSession = require('../../models/games/NeverHaveIEverSession');
const Match = require('../../models/Match');
const User = require('../../models/User');
const OpenAI = require('openai');
const logger = require('../../utils/logger');

// Initialize OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * NEVER HAVE I EVER GAME SERVICE
 * 
 * Central business logic for the Never Have I Ever discovery game.
 * Used by both HTTP controllers and Socket.io handlers.
 * 
 * Responsibilities:
 * - Game invitation management
 * - Game flow control (start, answer, next question, complete)
 * - Results calculation
 * - AI insights generation
 * - Voice note management
 */

class NeverHaveIEverService {

  // =====================================================
  // INVITATION MANAGEMENT
  // =====================================================

  /**
   * Create a new game invitation
   * @param {ObjectId} initiatorId - User sending the invitation
   * @param {ObjectId} matchId - The match to play with
   * @returns {Promise<Object>} Session and invited user info
   */
  async createInvitation(initiatorId, matchId) {
    // Validate match exists and users are mutually matched
    const match = await Match.findById(matchId);

    if (!match) {
      throw new Error('Match not found');
    }

    // Determine who is the other player
    const user1 = match.userId.toString();
    const user2 = match.matchedUserId.toString();
    const initiatorStr = initiatorId.toString();

    if (initiatorStr !== user1 && initiatorStr !== user2) {
      throw new Error('You are not part of this match');
    }

    // Check if mutually matched
    if (!match.isMutualMatch) {
      throw new Error('Both users must have liked each other to play games');
    }

    const invitedUserId = initiatorStr === user1 ? user2 : user1;

    // Check for existing active game
    const existingGame = await NeverHaveIEverSession.hasActiveGame(initiatorId, invitedUserId);
    if (existingGame) {
      throw new Error('An active Never Have I Ever game already exists between you two');
    }

    // Get invited user info
    const invitedUser = await User.findById(invitedUserId)
      .select('firstName lastName profilePhoto');

    if (!invitedUser) {
      throw new Error('Invited user not found');
    }

    // Create session
    const session = new NeverHaveIEverSession({
      matchId,
      player1: {
        userId: initiatorId,
        isConnected: true
      },
      player2: {
        userId: invitedUserId,
        isConnected: false
      },
      status: 'pending',
      invitedAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    });

    // Initialize question order
    session.initializeQuestions();

    await session.save();

    logger.info('Never Have I Ever invitation created', {
      sessionId: session.sessionId,
      initiator: initiatorId,
      invited: invitedUserId
    });

    return {
      session,
      invitedUser
    };
  }

  /**
   * Accept a game invitation
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User accepting (must be player2)
   * @returns {Promise<Object>} Updated session
   */
  async acceptInvitation(sessionId, oduserId) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();

    if (p2Id !== oduserId.toString()) {
      throw new Error('Only the invited player can accept');
    }

    if (session.status !== 'pending') {
      throw new Error('This invitation is no longer pending');
    }

    if (new Date() > session.expiresAt) {
      session.status = 'expired';
      await session.save();
      throw new Error('This invitation has expired');
    }

    session.status = 'starting';
    session.acceptedAt = new Date();
    session.player2.isConnected = true;
    session.lastActivityAt = new Date();

    await session.save();

    logger.info('Never Have I Ever invitation accepted', {
      sessionId,
      oduserId
    });

    return session;
  }

  /**
   * Decline a game invitation
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User declining
   * @returns {Promise<Object>} Updated session
   */
  async declineInvitation(sessionId, oduserId) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();

    if (p2Id !== oduserId.toString()) {
      throw new Error('Only the invited player can decline');
    }

    if (session.status !== 'pending') {
      throw new Error('This invitation is no longer pending');
    }

    session.status = 'declined';
    session.lastActivityAt = new Date();

    await session.save();

    logger.info('Never Have I Ever invitation declined', {
      sessionId,
      oduserId
    });

    return session;
  }

  /**
   * Get pending invitation for a user
   * @param {ObjectId} userId - User to check
   * @returns {Promise<Object|null>} Pending invitation or null
   */
  async getPendingInvitation(oduserId) {
    const session = await NeverHaveIEverSession.findPendingInvitation(oduserId);

    if (!session) return null;

    return {
      sessionId: session.sessionId,
      status: session.status,
      invitedBy: {
        oduserId: session.player1.userId._id,
        firstName: session.player1.userId.firstName,
        lastName: session.player1.userId.lastName,
        profilePhoto: session.player1.userId.profilePhoto
      },
      invitedAt: session.invitedAt,
      expiresAt: session.expiresAt
    };
  }

  // =====================================================
  // GAME FLOW
  // =====================================================

  /**
   * Start the game (called after countdown)
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} First question info
   */
  async startGame(sessionId) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (session.status !== 'starting') {
      throw new Error('Game is not ready to start');
    }

    // Set to playing
    session.status = 'playing';
    session.startedAt = new Date();
    session.currentQuestionIndex = 0;
    session.currentQuestionStartedAt = new Date();
    session.currentQuestionExpiresAt = new Date(Date.now() + 15 * 1000); // 15 seconds
    session.lastActivityAt = new Date();

    await session.save();

    // Get first question
    const questionNumber = session.questionOrder[0];
    const question = await NeverHaveIEverQuestion.findOne({ questionNumber });

    logger.info('Never Have I Ever game started', { sessionId });

    return {
      session,
      currentQuestion: {
        index: 0,
        number: questionNumber,
        category: question.category,
        statementText: question.statementText,
        insight: question.insight,
        spiceLevel: question.spiceLevel,
        expiresAt: session.currentQuestionExpiresAt
      }
    };
  }

  /**
   * Record a player's answer
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - Player answering
   * @param {Boolean} answer - true = "I Have", false = "I Haven't"
   * @returns {Promise<Object>} Answer result
   */
  async recordAnswer(sessionId, oduserId, answer) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (session.status !== 'playing') {
      throw new Error('Game is not in playing state');
    }

    const questionNumber = session.questionOrder[session.currentQuestionIndex];

    const result = await session.recordAnswer(oduserId, questionNumber, answer);

    // Check if both have answered
    const bothAnswered = session.bothAnswered();

    return {
      ...result,
      bothAnswered
    };
  }

  /**
   * Get reveal data (both answers) for current question
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Reveal data with points
   */
  async getRevealData(sessionId) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    const questionNumber = session.questionOrder[session.currentQuestionIndex];
    const question = await NeverHaveIEverQuestion.findOne({ questionNumber });

    const answers = session.getCurrentAnswers();
    const points = session.calculateQuestionPoints();

    // Update player points
    session.player1.discoveryPoints += points.player1Points;
    session.player2.discoveryPoints += points.player2Points;
    await session.save();

    return {
      questionNumber,
      statementText: question.statementText,
      category: question.category,
      player1Answer: answers.player1,
      player2Answer: answers.player2,
      player1Points: points.player1Points,
      player2Points: points.player2Points,
      outcome: points.outcome,
      outcomeMessage: this.getOutcomeMessage(points.outcome),
      runningTotal: {
        player1: session.player1.discoveryPoints,
        player2: session.player2.discoveryPoints
      }
    };
  }

  /**
   * Get outcome message for display
   */
  getOutcomeMessage(outcome) {
    const messages = {
      sharedExperience: [
        "You've both been there! 🤝",
        "Shared experience unlocked!",
        "You two have stories to swap!",
        "Something in common! 🎯"
      ],
      innocentTogether: [
        "Innocent together 😇",
        "Neither of you... yet?",
        "Some things are still unexplored!",
        "Clean slates here! ✨"
      ],
      secretUnlocked: [
        "Secret unlocked! 🔓",
        "There's a story here... 👀",
        "New discovery!",
        "Ask about this one! 💬"
      ],
      timedOut: [
        "Time ran out ⏰",
        "Moving on...",
        "Maybe next time!"
      ]
    };

    const options = messages[outcome] || messages.timedOut;
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Move to next question
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Next question or completion status
   */
  async nextQuestion(sessionId) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    const result = await session.nextQuestion();

    if (result.isComplete || result.status === 'completed') {
      return {
        isComplete: true,
        session
      };
    }

    // Get next question
    const question = await NeverHaveIEverQuestion.findOne({ 
      questionNumber: result.questionNumber 
    });

    return {
      isComplete: false,
      currentQuestion: {
        index: result.questionIndex,
        number: result.questionNumber,
        category: question.category,
        statementText: question.statementText,
        insight: question.insight,
        spiceLevel: question.spiceLevel,
        expiresAt: session.currentQuestionExpiresAt
      }
    };
  }

  /**
   * Handle question timeout
   * @param {String} sessionId - Session UUID
   */
  async handleTimeout(sessionId) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session || session.status !== 'playing') return;

    const questionNumber = session.questionOrder[session.currentQuestionIndex];

    // Record timeout for players who didn't answer
    const answers = session.getCurrentAnswers();

    if (!answers.player1Answered) {
      const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
      await session.recordTimeout(p1Id, questionNumber);
    }

    if (!answers.player2Answered) {
      const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
      await session.recordTimeout(p2Id, questionNumber);
    }
  }

  // =====================================================
  // RESULTS & INSIGHTS
  // =====================================================

  /**
   * Get game results
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Full results with AI insights
   */
  async getResults(sessionId) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!['completed', 'discussion'].includes(session.status)) {
      throw new Error('Game is not yet completed');
    }

    // Generate AI insights if not already done
    if (!session.aiInsights.generated) {
      await this.generateAIInsights(session);
    }

    return {
      sessionId: session.sessionId,
      status: session.status,
      completedAt: session.completedAt,
      player1: {
        oduserId: session.player1.userId._id,
        firstName: session.player1.userId.firstName,
        profilePhoto: session.player1.userId.profilePhoto,
        discoveryPoints: session.player1.discoveryPoints,
        totalIHave: session.player1.totalIHave,
        totalIHavent: session.player1.totalIHavent,
        badges: session.results.player1Badges
      },
      player2: {
        oduserId: session.player2.userId._id,
        firstName: session.player2.userId.firstName,
        profilePhoto: session.player2.userId.profilePhoto,
        discoveryPoints: session.player2.discoveryPoints,
        totalIHave: session.player2.totalIHave,
        totalIHavent: session.player2.totalIHavent,
        badges: session.results.player2Badges
      },
      results: session.results,
      aiInsights: session.aiInsights,
      voiceNotes: session.voiceNotes
    };
  }

  /**
   * Generate AI insights based on game results
   * @param {Object} session - Game session
   */
  async generateAIInsights(session) {
    try {
      const p1Name = session.player1.userId.firstName;
      const p2Name = session.player2.userId.firstName;

      // Build context for AI
      const conversationStarters = session.results.conversationStarters || [];
      const categoryBreakdown = session.results.categoryBreakdown || [];

      const prompt = `You are analyzing a "Never Have I Ever" game between ${p1Name} and ${p2Name} - a couple exploring compatibility.

GAME STATISTICS:
- Shared Experiences (both "I Have"): ${session.results.totalSharedExperiences}
- Innocent Together (both "I Haven't"): ${session.results.totalInnocentTogether}  
- Secrets Unlocked (different answers): ${session.results.totalSecretsUnlocked}

${p1Name}'s Profile:
- "I Have" answers: ${session.player1.totalIHave}
- "I Haven't" answers: ${session.player1.totalIHavent}
- Discovery Points: ${session.player1.discoveryPoints}
- Badges: ${session.results.player1Badges?.join(', ') || 'None'}

${p2Name}'s Profile:
- "I Have" answers: ${session.player2.totalIHave}
- "I Haven't" answers: ${session.player2.totalIHavent}
- Discovery Points: ${session.player2.discoveryPoints}
- Badges: ${session.results.player2Badges?.join(', ') || 'None'}

CATEGORY BREAKDOWN:
${categoryBreakdown.map(cat => `- ${cat.category}: ${cat.bothHave} shared, ${cat.bothHavent} both haven't, ${cat.different} different`).join('\n')}

KEY DIFFERENCES (Conversation Starters):
${conversationStarters.slice(0, 5).map(cs => `- "${cs.statementText}": ${p1Name}=${cs.player1Answer ? 'I Have' : "I Haven't"}, ${p2Name}=${cs.player2Answer ? 'I Have' : "I Haven't"}`).join('\n')}

Generate insights in these 5 categories. Be warm, constructive, and specific. Each should be 2-3 sentences max:

1. TRUST PATTERNS: Based on their answers about honesty, secrets, and past behavior
2. EXPERIENCE ALIGNMENT: How similar/different their life experiences are
3. CONVERSATION PROMPTS: Specific questions they should ask each other based on different answers
4. GREEN FLAGS: Positive signs from their answers
5. AREAS TO DISCUSS: Topics that revealed differences worth exploring (not red flags, just discussion points)

Format as JSON:
{
  "trustPatterns": "...",
  "experienceAlignment": "...",
  "conversationPrompts": "...",
  "greenFlags": "...",
  "areasToDiscuss": "..."
}`;

      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: 'You are a relationship insights expert. Generate warm, specific, actionable insights. Respond only with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 800
      });

      // Parse response
      let insights;
      try {
        const content = response.choices[0].message.content.trim();
        // Remove markdown code blocks if present
        const jsonStr = content.replace(/```json\n?|\n?```/g, '').trim();
        insights = JSON.parse(jsonStr);
      } catch (parseError) {
        logger.error('Failed to parse AI insights:', parseError);
        insights = {
          trustPatterns: 'Unable to generate insights at this time.',
          experienceAlignment: 'Unable to generate insights at this time.',
          conversationPrompts: 'Unable to generate insights at this time.',
          greenFlags: 'Unable to generate insights at this time.',
          areasToDiscuss: 'Unable to generate insights at this time.'
        };
      }

      // Update session
      session.aiInsights = {
        generated: true,
        generatedAt: new Date(),
        trustPatterns: insights.trustPatterns,
        experienceAlignment: insights.experienceAlignment,
        conversationPrompts: insights.conversationPrompts,
        greenFlags: insights.greenFlags,
        areasToDiscuss: insights.areasToDiscuss
      };

      await session.save();

      logger.info('Never Have I Ever AI insights generated', {
        sessionId: session.sessionId
      });

    } catch (error) {
      logger.error('Error generating AI insights:', error);
      // Don't throw - insights are optional
    }
  }

  // =====================================================
  // SESSION MANAGEMENT
  // =====================================================

  /**
   * Get active session for a user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object|null>} Active session or null
   */
  async getActiveSession(oduserId) {
    const session = await NeverHaveIEverSession.findActiveForUser(oduserId);

    if (!session) return null;

    const odusIdStr = oduserId.toString();
    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const isPlayer1 = p1Id === odusIdStr;

    return {
      sessionId: session.sessionId,
      status: session.status,
      matchId: session.matchId,
      isPlayer1,
      partner: isPlayer1 ? {
        oduserId: session.player2.userId._id,
        firstName: session.player2.userId.firstName,
        lastName: session.player2.userId.lastName,
        profilePhoto: session.player2.userId.profilePhoto
      } : {
        oduserId: session.player1.userId._id,
        firstName: session.player1.userId.firstName,
        lastName: session.player1.userId.lastName,
        profilePhoto: session.player1.userId.profilePhoto
      },
      currentQuestionIndex: session.currentQuestionIndex,
      progress: session.progressPercent
    };
  }

  /**
   * Get game history for user
   * @param {ObjectId} userId - User ID
   * @param {Number} limit - Max results
   * @returns {Promise<Array>} Completed games
   */
  async getGameHistory(oduserId, limit = 10) {
    const sessions = await NeverHaveIEverSession.findCompletedForUser(oduserId, limit);

    return sessions.map(session => {
      const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
      const isPlayer1 = p1Id === oduserId.toString();

      return {
        sessionId: session.sessionId,
        completedAt: session.completedAt,
        myPoints: isPlayer1 ? session.player1.discoveryPoints : session.player2.discoveryPoints,
        partnerPoints: isPlayer1 ? session.player2.discoveryPoints : session.player1.discoveryPoints,
        sharedExperiences: session.results.totalSharedExperiences,
        secretsUnlocked: session.results.totalSecretsUnlocked,
        partner: isPlayer1 ? {
          oduserId: session.player2.userId._id,
          firstName: session.player2.userId.firstName,
          profilePhoto: session.player2.userId.profilePhoto
        } : {
          oduserId: session.player1.userId._id,
          firstName: session.player1.userId.firstName,
          profilePhoto: session.player1.userId.profilePhoto
        }
      };
    });
  }

  /**
   * Update player connection status
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User ID
   * @param {Boolean} isConnected - Connection status
   */
  async updateConnectionStatus(sessionId, oduserId, isConnected) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) return;

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const odusIdStr = oduserId.toString();

    if (p1Id === odusIdStr) {
      session.player1.isConnected = isConnected;
    } else {
      session.player2.isConnected = isConnected;
    }

    session.lastActivityAt = new Date();
    await session.save();
  }

  /**
   * Abandon game
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User abandoning
   */
  async abandonGame(sessionId, oduserId) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!['pending', 'starting', 'playing'].includes(session.status)) {
      throw new Error('Game cannot be abandoned in current state');
    }

    session.status = 'abandoned';
    session.lastActivityAt = new Date();
    await session.save();

    logger.info('Never Have I Ever game abandoned', {
      sessionId,
      byUser: oduserId
    });

    return session;
  }

  // =====================================================
  // VOICE NOTES
  // =====================================================

  /**
   * Add voice note to session
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User adding note
   * @param {String} audioUrl - S3 URL of audio
   * @param {Number} duration - Duration in seconds
   */
  async addVoiceNote(sessionId, oduserId, audioUrl, duration) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!['completed', 'discussion'].includes(session.status)) {
      throw new Error('Voice notes only available after game completion');
    }

    await session.addVoiceNote(oduserId, audioUrl, duration);

    logger.info('Voice note added to Never Have I Ever session', {
      sessionId,
      oduserId,
      duration
    });

    return session;
  }

  /**
   * Get voice notes for session
   * @param {String} sessionId - Session UUID
   */
  async getVoiceNotes(sessionId) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    return session.voiceNotes;
  }

  /**
   * Mark voice note as listened
   * @param {String} sessionId - Session UUID  
   * @param {ObjectId} oduserId - Note creator
   * @param {ObjectId} listenerId - User who listened
   */
  async markVoiceNoteListened(sessionId, oduserId, odlistenerId) {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    return session.markVoiceNoteListened(oduserId, odlistenerId);
  }
}

module.exports = new NeverHaveIEverService();