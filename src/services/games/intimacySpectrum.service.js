// src/services/games/intimacySpectrum.service.js

const IntimacySpectrumQuestion = require('../../models/games/IntimacySpectrumQuestion');
const IntimacySpectrumSession = require('../../models/games/IntimacySpectrumSession');
const Match = require('../../models/Match');
const User = require('../../models/User');
const openaiService = require('../openai.service');
const logger = require('../../utils/logger');

/**
 * INTIMACY SPECTRUM GAME SERVICE
 * 
 * Central business logic for the Intimacy Spectrum slider game.
 * Used by both HTTP controllers and Socket.io handlers.
 * 
 * Responsibilities:
 * - Game invitation management
 * - Game flow control (start, answer, next question, complete)
 * - Results calculation
 * - AI insights generation
 * - Voice note management
 */

class IntimacySpectrumService {

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

    // Check for existing active session between these users
    const existingSession = await IntimacySpectrumSession.findOne({
      $or: [
        { 'player1.userId': initiatorId, 'player2.userId': invitedUserId },
        { 'player1.userId': invitedUserId, 'player2.userId': initiatorId }
      ],
      status: { $in: ['pending', 'starting', 'playing', 'paused'] }
    });

    if (existingSession) {
      throw new Error('An active game already exists with this match');
    }

    // Get question order (fixed: 1-30, easy to spicy)
    const questionOrder = IntimacySpectrumQuestion.getDefaultQuestionOrder();

    // Create the session
    const session = new IntimacySpectrumSession({
      matchId,
      player1: {
        userId: initiatorId,
        isReady: true,
        isConnected: true
      },
      player2: {
        userId: invitedUserId,
        isReady: false,
        isConnected: false
      },
      questionOrder,
      status: 'pending'
    });

    await session.save();

    // Populate user info
    await session.populate('player1.userId', 'firstName lastName profilePhoto');
    await session.populate('player2.userId', 'firstName lastName profilePhoto');

    logger.info('Intimacy Spectrum invitation created', {
      sessionId: session.sessionId,
      initiator: initiatorId,
      invited: invitedUserId
    });

    return {
      session,
      invitedUser: {
        oduserId: session.player2.userId._id,
        firstName: session.player2.userId.firstName,
        lastName: session.player2.userId.lastName,
        profilePhoto: session.player2.userId.profilePhoto
      }
    };
  }

  /**
   * Accept a game invitation
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User accepting
   * @returns {Promise<Object>} Updated session
   */
  async acceptInvitation(sessionId, userId) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    // Verify user is player2
    const player2Id = session.player2.userId._id 
      ? session.player2.userId._id.toString() 
      : session.player2.userId.toString();

    if (player2Id !== userId.toString()) {
      throw new Error('Only the invited player can accept');
    }

    // Accept the invitation
    await session.accept();

    logger.info('Intimacy Spectrum invitation accepted', {
      sessionId: session.sessionId,
      acceptedBy: userId
    });

    return session;
  }

  /**
   * Decline a game invitation
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User declining
   * @returns {Promise<Object>} Updated session
   */
  async declineInvitation(sessionId, userId) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    // Verify user is player2
    const player2Id = session.player2.userId._id 
      ? session.player2.userId._id.toString() 
      : session.player2.userId.toString();

    if (player2Id !== userId.toString()) {
      throw new Error('Only the invited player can decline');
    }

    // Decline the invitation
    await session.decline();

    logger.info('Intimacy Spectrum invitation declined', {
      sessionId: session.sessionId,
      declinedBy: userId
    });

    return session;
  }

  /**
   * Get pending invitation for a user
   * @param {ObjectId} userId - User to check
   * @returns {Promise<Object|null>} Pending invitation or null
   */
  async getPendingInvitation(userId) {
    const session = await IntimacySpectrumSession.findPendingInvitation(userId);

    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      status: session.status,
      expiresAt: session.expiresAt,
      invitedBy: {
        oduserId: session.player1.userId._id,
        firstName: session.player1.userId.firstName,
        lastName: session.player1.userId.lastName,
        profilePhoto: session.player1.userId.profilePhoto
      }
    };
  }

  // =====================================================
  // GAME FLOW CONTROL
  // =====================================================

  /**
   * Start the game after acceptance
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} First question data
   */
  async startGame(sessionId) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    // Start the game
    await session.startGame();

    // Get the first question
    const firstQuestionNumber = session.questionOrder[0];
    const question = await IntimacySpectrumQuestion.findOne({
      questionNumber: firstQuestionNumber
    });

    return {
      sessionId: session.sessionId,
      status: session.status,
      currentQuestion: {
        index: 0,
        number: firstQuestionNumber,
        category: question.category,
        questionText: question.questionText,
        leftLabel: question.leftLabel,
        rightLabel: question.rightLabel,
        spiceLevel: question.spiceLevel,
        startsAt: session.currentQuestionStartedAt,
        expiresAt: session.currentQuestionExpiresAt
      },
      totalQuestions: 30,
      progress: 0
    };
  }

  /**
   * Get current question for a session
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Current question data
   */
  async getCurrentQuestion(sessionId) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (session.status !== 'playing') {
      throw new Error('Game is not in playing state');
    }

    const questionNumber = session.questionOrder[session.currentQuestionIndex];
    const question = await IntimacySpectrumQuestion.findOne({ questionNumber });

    return {
      sessionId: session.sessionId,
      currentQuestion: {
        index: session.currentQuestionIndex,
        number: questionNumber,
        category: question.category,
        questionText: question.questionText,
        leftLabel: question.leftLabel,
        rightLabel: question.rightLabel,
        spiceLevel: question.spiceLevel,
        startsAt: session.currentQuestionStartedAt,
        expiresAt: session.currentQuestionExpiresAt
      },
      totalQuestions: 30,
      progress: session.progressPercent
    };
  }

  /**
   * Submit an answer for current question
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User answering
   * @param {Number} position - Slider position (0-100)
   * @returns {Promise<Object>} Answer result
   */
  async submitAnswer(sessionId, userId, position) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    const result = await session.recordAnswer(
      userId,
      session.currentQuestionIndex,
      position
    );

    logger.info('Intimacy Spectrum answer submitted', {
      sessionId,
      oduserId: userId,
      questionIndex: session.currentQuestionIndex,
      position
    });

    return {
      recorded: true,
      position,
      bothAnswered: result.bothAnswered,
      questionIndex: session.currentQuestionIndex
    };
  }

  /**
   * Get reveal data after both players answer
   * @param {String} sessionId - Session UUID
   * @param {Number} questionIndex - Question index
   * @returns {Promise<Object>} Reveal data with both positions
   */
  async getRevealData(sessionId, questionIndex) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    const questionNumber = session.questionOrder[questionIndex];
    const question = await IntimacySpectrumQuestion.findOne({ questionNumber });

    const p1Answer = session.player1.answers.find(
      a => a.questionNumber === questionNumber
    );
    const p2Answer = session.player2.answers.find(
      a => a.questionNumber === questionNumber
    );

    const p1Position = p1Answer?.position ?? null;
    const p2Position = p2Answer?.position ?? null;

    // Calculate gap and alignment
    let gap = null;
    let alignment = null;
    let compatibilityPercent = null;

    if (p1Position !== null && p2Position !== null) {
      gap = Math.abs(p1Position - p2Position);
      alignment = session.getAlignmentLabel(gap);
      compatibilityPercent = 100 - gap;
    }

    return {
      questionIndex,
      questionNumber,
      question: {
        questionText: question.questionText,
        leftLabel: question.leftLabel,
        rightLabel: question.rightLabel,
        category: question.category,
        spiceLevel: question.spiceLevel
      },
      player1: {
        oduserId: session.player1.userId._id,
        firstName: session.player1.userId.firstName,
        position: p1Position,
        timedOut: p1Position === null
      },
      player2: {
        oduserId: session.player2.userId._id,
        firstName: session.player2.userId.firstName,
        position: p2Position,
        timedOut: p2Position === null
      },
      gap,
      compatibilityPercent,
      alignment,
      isLastQuestion: questionIndex >= 29
    };
  }

  /**
   * Move to next question
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Next question data or completion
   */
  async nextQuestion(sessionId) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    const result = await session.nextQuestion();

    if (result.isComplete || session.status === 'completed') {
      // Game completed, generate insights
      await this.generateAiInsights(sessionId);

      return {
        isComplete: true,
        sessionId: session.sessionId,
        results: session.results
      };
    }

    // Get next question details
    const question = await IntimacySpectrumQuestion.findOne({
      questionNumber: result.questionNumber
    });

    return {
      isComplete: false,
      sessionId: session.sessionId,
      currentQuestion: {
        index: result.questionIndex,
        number: result.questionNumber,
        category: question.category,
        questionText: question.questionText,
        leftLabel: question.leftLabel,
        rightLabel: question.rightLabel,
        spiceLevel: question.spiceLevel,
        startsAt: session.currentQuestionStartedAt,
        expiresAt: session.currentQuestionExpiresAt
      },
      totalQuestions: 30,
      progress: Math.round((result.questionIndex / 30) * 100)
    };
  }

  /**
   * Handle question timeout
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Timeout result
   */
  async handleTimeout(sessionId) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session || session.status !== 'playing') {
      return null;
    }

    const questionNumber = session.questionOrder[session.currentQuestionIndex];

    // Check who timed out
    const p1Answer = session.player1.answers.find(
      a => a.questionNumber === questionNumber
    );
    const p2Answer = session.player2.answers.find(
      a => a.questionNumber === questionNumber
    );

    const p1Answered = p1Answer && p1Answer.position !== null;
    const p2Answered = p2Answer && p2Answer.position !== null;

    if (!p1Answered && !p2Answered) {
      await session.recordTimeout(null); // Both timed out
    } else if (!p1Answered) {
      await session.recordTimeout(session.player1.userId);
    } else if (!p2Answered) {
      await session.recordTimeout(session.player2.userId);
    }

    return {
      questionIndex: session.currentQuestionIndex,
      player1TimedOut: !p1Answered,
      player2TimedOut: !p2Answered
    };
  }

  // =====================================================
  // RESULTS & INSIGHTS
  // =====================================================

  /**
   * Get game results
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Full results
   */
  async getResults(sessionId) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!['completed', 'discussion'].includes(session.status)) {
      throw new Error('Game is not yet completed');
    }

    // Get category info for display
    const categoryInfo = IntimacySpectrumQuestion.getCategoryInfo();

    // Enrich category breakdown with display info
    const enrichedBreakdown = session.results.categoryBreakdown.map(cat => ({
      ...cat.toObject(),
      displayName: categoryInfo[cat.category]?.name || cat.category,
      emoji: categoryInfo[cat.category]?.emoji || '🔥',
      description: categoryInfo[cat.category]?.description || ''
    }));

    return {
      sessionId: session.sessionId,
      status: session.status,
      completedAt: session.completedAt,
      players: {
        player1: {
          oduserId: session.player1.userId._id,
          firstName: session.player1.userId.firstName,
          lastName: session.player1.userId.lastName,
          profilePhoto: session.player1.userId.profilePhoto,
          totalAnswered: session.player1.totalAnswered,
          totalTimedOut: session.player1.totalTimedOut
        },
        player2: {
          oduserId: session.player2.userId._id,
          firstName: session.player2.userId.firstName,
          lastName: session.player2.userId.lastName,
          profilePhoto: session.player2.userId.profilePhoto,
          totalAnswered: session.player2.totalAnswered,
          totalTimedOut: session.player2.totalTimedOut
        }
      },
      results: {
        ...session.results.toObject(),
        categoryBreakdown: enrichedBreakdown
      },
      aiInsights: session.aiInsights,
      voiceNotes: session.voiceNotes
    };
  }

  /**
   * Get detailed question-by-question breakdown
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Detailed breakdown
   */
  async getDetailedResults(sessionId) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!['completed', 'discussion'].includes(session.status)) {
      throw new Error('Game is not yet completed');
    }

    // Get all questions
    const questions = await IntimacySpectrumQuestion.find({
      questionNumber: { $in: session.questionOrder }
    }).lean();

    const questionMap = {};
    questions.forEach(q => {
      questionMap[q.questionNumber] = q;
    });

    // Build detailed breakdown
    const breakdown = session.questionOrder.map((questionNumber, index) => {
      const question = questionMap[questionNumber];
      const p1Answer = session.player1.answers.find(
        a => a.questionNumber === questionNumber
      );
      const p2Answer = session.player2.answers.find(
        a => a.questionNumber === questionNumber
      );

      const p1Position = p1Answer?.position ?? null;
      const p2Position = p2Answer?.position ?? null;

      let gap = null;
      let alignment = null;

      if (p1Position !== null && p2Position !== null) {
        gap = Math.abs(p1Position - p2Position);
        alignment = session.getAlignmentLabel(gap);
      }

      return {
        index,
        questionNumber,
        category: question.category,
        questionText: question.questionText,
        leftLabel: question.leftLabel,
        rightLabel: question.rightLabel,
        spiceLevel: question.spiceLevel,
        player1Position: p1Position,
        player2Position: p2Position,
        gap,
        alignment,
        insight: question.insight
      };
    });

    return {
      sessionId: session.sessionId,
      totalQuestions: 30,
      breakdown
    };
  }

  /**
   * Generate AI insights for completed game
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Generated insights
   */
  async generateAiInsights(sessionId) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!['completed', 'discussion'].includes(session.status)) {
      throw new Error('Game must be completed for insights');
    }

    // Check if insights already exist
    if (session.aiInsights && session.aiInsights.generatedAt) {
      return session.aiInsights;
    }

    try {
      // Get detailed results for AI analysis
      const detailedResults = await this.getDetailedResults(sessionId);

      // Find key alignments and differences
      const alignments = [];
      const differences = [];

      detailedResults.breakdown.forEach(q => {
        if (q.gap === null) return;

        if (q.gap <= 15) {
          alignments.push({
            question: q.questionText,
            category: q.category,
            gap: q.gap,
            p1: q.player1Position,
            p2: q.player2Position
          });
        } else if (q.gap >= 40) {
          differences.push({
            question: q.questionText,
            category: q.category,
            gap: q.gap,
            p1: q.player1Position,
            p2: q.player2Position,
            leftLabel: q.leftLabel,
            rightLabel: q.rightLabel
          });
        }
      });

      // Build prompt
      const prompt = this._buildAiPrompt(
        session.results,
        alignments.slice(0, 5),
        differences.slice(0, 5),
        session.player1.userId.firstName,
        session.player2.userId.firstName
      );

      // Call OpenAI
      const aiResponse = await openaiService.generateChatCompletion([
        {
          role: 'system',
          content: this._getSystemPrompt()
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        model: 'gpt-4',
        temperature: 0.8,
        max_tokens: 800
      });

      // Parse response
      const insights = this._parseAiResponse(aiResponse);

      // Save insights
      await session.setAiInsights(insights);

      logger.info('AI insights generated for Intimacy Spectrum', {
        sessionId,
        compatibilityScore: session.results.compatibilityScore
      });

      return insights;

    } catch (error) {
      logger.error('Failed to generate AI insights:', error);

      // Return fallback insights
      const fallbackInsights = {
        summary: `You scored ${session.results.compatibilityScore}% compatibility! You have some exciting areas of alignment to explore together.`,
        hottestAlignments: [
          'You both showed openness to exploring together',
          'Your communication preferences are well-matched'
        ],
        worthDiscussing: [
          'Talk about pace and timing preferences',
          'Share specific fantasies when you feel comfortable'
        ],
        firstTimePrediction: 'With this level of compatibility, your first time together should feel natural and exciting.',
        suggestionToTry: 'Start with what you both scored highest on and let things flow from there.'
      };

      await session.setAiInsights(fallbackInsights);
      return fallbackInsights;
    }
  }

  /**
   * Build system prompt for AI
   * @private
   */
  _getSystemPrompt() {
    return `You are a playful, sex-positive relationship analyst helping couples understand their sexual compatibility.

Your tone is:
- Flirty and encouraging
- Sex-positive and non-judgmental
- Specific and actionable
- Focused on connection and exploration

Never be clinical or preachy. Be the fun friend who gives great advice.`;
  }

  /**
   * Build prompt for AI analysis
   * @private
   */
  _buildAiPrompt(results, alignments, differences, name1, name2) {
    let prompt = `Analyze this Intimacy Spectrum game between ${name1} and ${name2}:\n\n`;

    prompt += `OVERALL: ${results.compatibilityScore}% sexual compatibility\n`;
    prompt += `Average position gap: ${results.averageGap} points\n\n`;

    prompt += `CATEGORY SCORES:\n`;
    results.categoryBreakdown.forEach(cat => {
      const emoji = cat.compatibilityPercent >= 80 ? '🔥' : cat.compatibilityPercent >= 60 ? '✨' : '💬';
      prompt += `${emoji} ${cat.category}: ${cat.compatibilityPercent}%\n`;
    });

    prompt += `\nHOTTEST ALIGNMENTS (where they matched closely):\n`;
    alignments.forEach((a, i) => {
      prompt += `${i + 1}. "${a.question}" - Gap: ${a.gap} (${a.p1} vs ${a.p2})\n`;
    });

    prompt += `\nWORTH DISCUSSING (where they differed):\n`;
    differences.forEach((d, i) => {
      prompt += `${i + 1}. "${d.question}" - Gap: ${d.gap}\n`;
      prompt += `   ${name1}: ${d.p1} (toward "${d.p1 < 50 ? d.leftLabel : d.rightLabel}")\n`;
      prompt += `   ${name2}: ${d.p2} (toward "${d.p2 < 50 ? d.leftLabel : d.rightLabel}")\n`;
    });

    prompt += `\nProvide analysis in this EXACT format:
SUMMARY: [2-3 flirty sentences about their sexual compatibility - be encouraging and specific]
ALIGNMENT1: [First thing they'll enjoy together]
ALIGNMENT2: [Second thing they'll enjoy together]
ALIGNMENT3: [Third thing they'll enjoy together]
DISCUSS1: [First topic to discuss before getting intimate]
DISCUSS2: [Second topic to discuss]
PREDICTION: [Playful prediction about their first time together]
SUGGESTION: [One specific thing to try on their first night based on their results]`;

    return prompt;
  }

  /**
   * Parse AI response into structured format
   * @private
   */
  _parseAiResponse(response) {
    const text = response.content || response;

    const insights = {
      summary: '',
      hottestAlignments: [],
      worthDiscussing: [],
      firstTimePrediction: '',
      suggestionToTry: ''
    };

    // Parse summary
    const summaryMatch = text.match(/SUMMARY:\s*(.+?)(?=ALIGNMENT1:|$)/s);
    if (summaryMatch) {
      insights.summary = summaryMatch[1].trim();
    }

    // Parse alignments
    for (let i = 1; i <= 3; i++) {
      const regex = new RegExp(`ALIGNMENT${i}:\\s*(.+?)(?=ALIGNMENT${i + 1}:|DISCUSS1:|$)`, 's');
      const match = text.match(regex);
      if (match) {
        insights.hottestAlignments.push(match[1].trim());
      }
    }

    // Parse discussions
    for (let i = 1; i <= 2; i++) {
      const regex = new RegExp(`DISCUSS${i}:\\s*(.+?)(?=DISCUSS${i + 1}:|PREDICTION:|$)`, 's');
      const match = text.match(regex);
      if (match) {
        insights.worthDiscussing.push(match[1].trim());
      }
    }

    // Parse prediction
    const predictionMatch = text.match(/PREDICTION:\s*(.+?)(?=SUGGESTION:|$)/s);
    if (predictionMatch) {
      insights.firstTimePrediction = predictionMatch[1].trim();
    }

    // Parse suggestion
    const suggestionMatch = text.match(/SUGGESTION:\s*(.+?)$/s);
    if (suggestionMatch) {
      insights.suggestionToTry = suggestionMatch[1].trim();
    }

    return insights;
  }

  // =====================================================
  // VOICE NOTES
  // =====================================================

  /**
   * Add voice note to session
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User sending
   * @param {String} audioUrl - S3 URL
   * @param {Number} duration - Duration in seconds
   * @returns {Promise<Object>} Updated voice notes
   */
  async addVoiceNote(sessionId, userId, audioUrl, duration) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    // Verify user is a player
    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      throw new Error('User is not a player in this game');
    }

    await session.addVoiceNote(userId, audioUrl, duration);

    logger.info('Voice note added to Intimacy Spectrum session', {
      sessionId,
      oduserId: userId,
      duration
    });

    return {
      voiceNotes: session.voiceNotes,
      count: session.voiceNotes.length
    };
  }

  // =====================================================
  // SESSION MANAGEMENT
  // =====================================================

  /**
   * Get active session for user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object|null>} Active session or null
   */
  async getActiveSession(userId) {
    const session = await IntimacySpectrumSession.findActiveForUser(userId);

    if (!session) {
      return null;
    }

    // Determine which player the user is
    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const isPlayer1 = p1Id === userId.toString();

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
  async getGameHistory(userId, limit = 10) {
    const sessions = await IntimacySpectrumSession.findCompletedForUser(userId, limit);

    return sessions.map(session => {
      const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
      const isPlayer1 = p1Id === userId.toString();

      return {
        sessionId: session.sessionId,
        completedAt: session.completedAt,
        compatibilityScore: session.results.compatibilityScore,
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
  async updateConnectionStatus(sessionId, userId, isConnected) {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) return;

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const userIdStr = userId.toString();

    if (p1Id === userIdStr) {
      session.player1.isConnected = isConnected;
    } else {
      session.player2.isConnected = isConnected;
    }

    session.lastActivityAt = new Date();
    await session.save();
  }
}

module.exports = new IntimacySpectrumService();