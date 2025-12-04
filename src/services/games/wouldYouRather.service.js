// src/services/games/wouldYouRather.service.js

const WouldYouRatherQuestion = require('../../models/games/WouldYouRatherQuestion');
const WouldYouRatherSession = require('../../models/games/WouldYouRatherSession');
const Match = require('../../models/Match');
const User = require('../../models/User');
const openaiService = require('../openai.service');

/**
 * WOULD YOU RATHER GAME SERVICE
 * 
 * Central business logic for the Would You Rather game.
 * Used by both HTTP controllers and Socket.io handlers.
 * 
 * Responsibilities:
 * - Game invitation management
 * - Game flow control (start, answer, next question, complete)
 * - Results calculation
 * - AI insights generation
 * - Voice note management
 */

class WouldYouRatherService {
  
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
    const user1 = match.userId.toString();           // FIXED
    const user2 = match.matchedUserId.toString();    // FIXED
    const initiatorStr = initiatorId.toString();

    if (initiatorStr !== user1 && initiatorStr !== user2) {
      throw new Error('You are not part of this match');
    }

    // Check if mutually matched
    if (!match.isMutualMatch) {
      throw new Error('Both users must have liked each other to play games');
    }

    const invitedUserId = initiatorStr === user1 ? user2 : user1;

    // Check for existing active session
    const existingSession = await WouldYouRatherSession.findOne({
      matchId,
      status: { $in: ['pending', 'starting', 'playing', 'paused'] }
    });

    if (existingSession) {
      throw new Error('An active game already exists with this match');
    }

    // Create the session
    const session = await WouldYouRatherSession.createSession(
      matchId,
      initiatorId,
      invitedUserId
    );

    // Get invited user details for notification
    const invitedUser = await User.findById(invitedUserId)
      .select('firstName lastName username profilePhoto');

    const initiator = await User.findById(initiatorId)
      .select('firstName lastName username profilePhoto');

    return {
      session: {
        sessionId: session.sessionId,
        status: session.status,
        expiresAt: session.expiresAt
      },
      invitedUser: {
        oduserId: invitedUserId,
        firstName: invitedUser.firstName,
        lastName: invitedUser.lastName,
        username: invitedUser.username,
        profilePhoto: invitedUser.profilePhoto
      },
      initiator: {
        oduserId: initiatorId,
        firstName: initiator.firstName,
        lastName: initiator.lastName,
        username: initiator.username,
        profilePhoto: initiator.profilePhoto
      }
    };
  }

  /**
   * Accept a game invitation
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User accepting (must be player2)
   * @returns {Promise<Object>} Updated session
   */
  async acceptInvitation(sessionId, userId) {
    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    // Verify user is the invited player
    if (session.player2.userId._id.toString() !== userId.toString()) {
      throw new Error('You are not the invited player');
    }

    // Accept the invitation
    await session.accept();

    return {
      sessionId: session.sessionId,
      status: session.status,
      player1: {
        oduserId: session.player1.userId._id,
        firstName: session.player1.userId.firstName,
        lastName: session.player1.userId.lastName,
        profilePhoto: session.player1.userId.profilePhoto
      },
      player2: {
        oduserId: session.player2.userId._id,
        firstName: session.player2.userId.firstName,
        lastName: session.player2.userId.lastName,
        profilePhoto: session.player2.userId.profilePhoto
      }
    };
  }

  /**
   * Decline a game invitation
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User declining (must be player2)
   * @returns {Promise<Object>} Updated session
   */
  async declineInvitation(sessionId, userId) {
    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    // Verify user is the invited player
    if (session.player2.userId._id.toString() !== userId.toString()) {
      throw new Error('You are not the invited player');
    }

    await session.decline();

    return {
      sessionId: session.sessionId,
      status: 'declined'
    };
  }

  /**
   * Get pending invitation for a user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object|null>} Pending invitation or null
   */
  async getPendingInvitation(userId) {
    const session = await WouldYouRatherSession.findPendingInvitation(userId);

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
    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    // Start the game
    await session.startGame();

    // Get the first question
    const firstQuestionNumber = session.questionOrder[0];
    const question = await WouldYouRatherQuestion.findOne({
      questionNumber: firstQuestionNumber
    });

    return {
      sessionId: session.sessionId,
      status: session.status,
      currentQuestion: {
        index: 0,
        number: firstQuestionNumber,
        category: question.category,
        optionA: question.optionA,
        optionB: question.optionB,
        startsAt: session.currentQuestionStartedAt,
        expiresAt: session.currentQuestionExpiresAt
      },
      totalQuestions: 50,
      progress: 0
    };
  }

  /**
   * Get current question for a session
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Current question data
   */
  async getCurrentQuestion(sessionId) {
    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (session.status !== 'playing') {
      throw new Error('Game is not in playing state');
    }

    const questionNumber = session.questionOrder[session.currentQuestionIndex];
    const question = await WouldYouRatherQuestion.findOne({
      questionNumber
    });

    // Check if each player has answered
    const p1Answer = session.player1.answers.find(
      a => a.questionNumber === questionNumber
    );
    const p2Answer = session.player2.answers.find(
      a => a.questionNumber === questionNumber
    );

    return {
      sessionId: session.sessionId,
      currentQuestion: {
        index: session.currentQuestionIndex,
        number: questionNumber,
        category: question.category,
        optionA: question.optionA,
        optionB: question.optionB,
        startsAt: session.currentQuestionStartedAt,
        expiresAt: session.currentQuestionExpiresAt
      },
      totalQuestions: 50,
      progress: Math.round((session.currentQuestionIndex / 50) * 100),
      player1Answered: p1Answer?.answer !== null && p1Answer?.answer !== undefined,
      player2Answered: p2Answer?.answer !== null && p2Answer?.answer !== undefined
    };
  }

  /**
   * Record a player's answer
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User answering
   * @param {Number} questionIndex - Question index (0-49)
   * @param {String} answer - 'A' or 'B'
   * @returns {Promise<Object>} Answer result
   */
  async recordAnswer(sessionId, userId, questionIndex, answer) {
    // Validate answer
    if (!['A', 'B'].includes(answer)) {
      throw new Error('Answer must be A or B');
    }

    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    // Record the answer
    const result = await session.recordAnswer(userId, questionIndex, answer);

    // Determine which player this is
    const isPlayer1 = session.player1.userId._id.toString() === userId.toString();

    return {
      sessionId: session.sessionId,
      questionIndex,
      yourAnswer: answer,
      bothAnswered: result.bothAnswered,
      partnerAnswer: result.bothAnswered ? result.partnerAnswer : null,
      matched: result.bothAnswered ? answer === result.partnerAnswer : null,
      waitingForPartner: !result.bothAnswered
    };
  }

  /**
   * Handle question timeout
   * @param {String} sessionId - Session UUID
   * @param {Number} questionIndex - Question that timed out
   * @returns {Promise<Object>} Timeout result with both answers
   */
  async handleTimeout(sessionId, questionIndex) {
    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    const result = await session.handleTimeout(questionIndex);

    if (!result) {
      return null; // Already moved past this question
    }

    const questionNumber = session.questionOrder[questionIndex];
    const question = await WouldYouRatherQuestion.findOne({
      questionNumber
    });

    return {
      sessionId: session.sessionId,
      questionIndex,
      questionNumber,
      player1Answer: result.player1Answer,
      player2Answer: result.player2Answer,
      matched: result.player1Answer && result.player2Answer 
        ? result.player1Answer === result.player2Answer 
        : false,
      bothTimedOut: !result.player1Answer && !result.player2Answer,
      category: question.category
    };
  }

  /**
   * Move to the next question
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Next question data or completion status
   */
  async nextQuestion(sessionId) {
    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    const result = await session.nextQuestion();

    // If game is complete
    if (session.status === 'completed') {
      // Generate AI insights asynchronously
      this.generateAiInsights(sessionId).catch(err => {
        console.error('Failed to generate AI insights:', err);
      });

      return {
        sessionId: session.sessionId,
        isComplete: true,
        status: 'completed',
        results: session.results
      };
    }

    // Get the next question
    const questionNumber = session.questionOrder[result.questionIndex];
    const question = await WouldYouRatherQuestion.findOne({
      questionNumber
    });

    return {
      sessionId: session.sessionId,
      isComplete: false,
      currentQuestion: {
        index: result.questionIndex,
        number: questionNumber,
        category: question.category,
        optionA: question.optionA,
        optionB: question.optionB,
        startsAt: session.currentQuestionStartedAt,
        expiresAt: session.currentQuestionExpiresAt
      },
      totalQuestions: 50,
      progress: Math.round((result.questionIndex / 50) * 100)
    };
  }

  // =====================================================
  // RESULTS & INSIGHTS
  // =====================================================

  /**
   * Get game results
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User requesting (must be a player)
   * @returns {Promise<Object>} Game results
   */
  async getResults(sessionId, userId) {
    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    // Verify user is a player
    const isPlayer1 = session.player1.userId._id.toString() === userId.toString();
    const isPlayer2 = session.player2.userId._id.toString() === userId.toString();

    if (!isPlayer1 && !isPlayer2) {
      throw new Error('You are not a player in this game');
    }

    if (!['completed', 'discussion'].includes(session.status)) {
      throw new Error('Game is not completed yet');
    }

    // Get partner info
    const partner = isPlayer1 ? session.player2 : session.player1;
    const you = isPlayer1 ? session.player1 : session.player2;

    return {
      sessionId: session.sessionId,
      status: session.status,
      completedAt: session.completedAt,
      results: {
        compatibilityScore: session.results.compatibilityScore,
        totalQuestions: session.results.totalQuestions,
        matchedAnswers: session.results.matchedAnswers,
        differentAnswers: session.results.differentAnswers,
        yourTimedOut: you.totalTimedOut,
        partnerTimedOut: partner.totalTimedOut,
        categoryBreakdown: session.results.categoryBreakdown
      },
      partner: {
        oduserId: partner.userId._id,
        firstName: partner.userId.firstName,
        lastName: partner.userId.lastName,
        profilePhoto: partner.userId.profilePhoto,
        averageResponseTime: partner.averageResponseTimeMs
      },
      yourStats: {
        averageResponseTime: you.averageResponseTimeMs,
        totalAnswered: you.totalAnswered
      },
      aiInsights: session.aiInsights || null,
      voiceNotes: session.voiceNotes.length
    };
  }

  /**
   * Get detailed answer breakdown
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User requesting
   * @returns {Promise<Object>} Question-by-question breakdown
   */
  async getDetailedResults(sessionId, userId) {
    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    // Verify user is a player
    const isPlayer1 = session.player1.userId._id.toString() === userId.toString();
    const isPlayer2 = session.player2.userId._id.toString() === userId.toString();

    if (!isPlayer1 && !isPlayer2) {
      throw new Error('You are not a player in this game');
    }

    if (!['completed', 'discussion'].includes(session.status)) {
      throw new Error('Game is not completed yet');
    }

    // Get all questions
    const questions = await WouldYouRatherQuestion.find({
      questionNumber: { $in: session.questionOrder }
    }).lean();

    const questionMap = {};
    questions.forEach(q => {
      questionMap[q.questionNumber] = q;
    });

    // Build detailed breakdown
    const breakdown = [];

    for (let i = 0; i < session.questionOrder.length; i++) {
      const questionNumber = session.questionOrder[i];
      const question = questionMap[questionNumber];

      const p1Answer = session.player1.answers.find(
        a => a.questionNumber === questionNumber
      );
      const p2Answer = session.player2.answers.find(
        a => a.questionNumber === questionNumber
      );

      const yourAnswer = isPlayer1 ? p1Answer : p2Answer;
      const partnerAnswer = isPlayer1 ? p2Answer : p1Answer;

      breakdown.push({
        index: i,
        questionNumber,
        category: question.category,
        optionA: question.optionA,
        optionB: question.optionB,
        yourAnswer: yourAnswer?.answer || null,
        partnerAnswer: partnerAnswer?.answer || null,
        matched: yourAnswer?.answer && partnerAnswer?.answer 
          ? yourAnswer.answer === partnerAnswer.answer 
          : false,
        yourResponseTimeMs: yourAnswer?.responseTimeMs || null,
        partnerResponseTimeMs: partnerAnswer?.responseTimeMs || null
      });
    }

    return {
      sessionId: session.sessionId,
      breakdown
    };
  }

  /**
   * Generate AI insights for completed game
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} AI insights
   */
  async generateAiInsights(sessionId) {
    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!['completed', 'discussion'].includes(session.status)) {
      throw new Error('Game is not completed yet');
    }

    // Check if insights already generated
    if (session.aiInsights?.generatedAt) {
      return session.aiInsights;
    }

    // Get all questions for context
    const questions = await WouldYouRatherQuestion.find({
      questionNumber: { $in: session.questionOrder }
    }).lean();

    const questionMap = {};
    questions.forEach(q => {
      questionMap[q.questionNumber] = q;
    });

    // Build the differences list for AI
    const keyDifferences = [];
    const keyAlignments = [];

    for (const questionNumber of session.questionOrder) {
      const question = questionMap[questionNumber];
      const p1Answer = session.player1.answers.find(
        a => a.questionNumber === questionNumber
      );
      const p2Answer = session.player2.answers.find(
        a => a.questionNumber === questionNumber
      );

      if (p1Answer?.answer && p2Answer?.answer) {
        const p1Choice = p1Answer.answer === 'A' ? question.optionA : question.optionB;
        const p2Choice = p2Answer.answer === 'A' ? question.optionA : question.optionB;

        if (p1Answer.answer !== p2Answer.answer) {
          keyDifferences.push({
            category: question.category,
            optionA: question.optionA,
            optionB: question.optionB,
            player1Chose: p1Choice,
            player2Chose: p2Choice,
            insight: question.insight
          });
        } else {
          keyAlignments.push({
            category: question.category,
            bothChose: p1Choice,
            insight: question.insight
          });
        }
      }
    }

    // Find strongest and weakest categories
    const sortedCategories = [...session.results.categoryBreakdown]
      .filter(c => c.totalQuestions > 0)
      .sort((a, b) => b.compatibilityPercent - a.compatibilityPercent);

    const strongestCategory = sortedCategories[0]?.category || 'lifestyle';
    const weakestCategory = sortedCategories[sortedCategories.length - 1]?.category || 'money';

    // Build prompt for OpenAI
    const prompt = this._buildAiPrompt(
      session.results,
      keyDifferences.slice(0, 5), // Top 5 differences
      keyAlignments.slice(0, 5),  // Top 5 alignments
      strongestCategory,
      weakestCategory
    );

    try {
      // Call OpenAI
      const aiResponse = await openaiService.generateChatCompletion([
        {
          role: 'system',
          content: `You are a warm, insightful relationship compatibility analyst. 
            Analyze the "Would You Rather" game results and provide actionable, 
            encouraging insights. Focus on how differences can complement each other.
            Be concise but meaningful. Avoid generic advice.`
        },
        {
          role: 'user',
          content: prompt
        }
      ], {
        model: 'gpt-4',
        temperature: 0.7,
        max_tokens: 600
      });

      // Parse AI response
      const insights = this._parseAiResponse(
        aiResponse,
        strongestCategory,
        weakestCategory
      );

      // Save insights to session
      await session.setAiInsights(insights);

      return insights;

    } catch (error) {
      console.error('AI insights generation failed:', error);
      
      // Return basic insights if AI fails
      const fallbackInsights = {
        summary: `You matched on ${session.results.matchedAnswers} out of ${session.results.bothAnswered} questions (${session.results.compatibilityScore}% compatibility). Your strongest area is ${strongestCategory}.`,
        compatibilityHighlights: [
          `Strong alignment in ${strongestCategory} values`,
          `You both answered consistently throughout the game`
        ],
        interestingDifferences: [
          `Different perspectives on ${weakestCategory} topics`
        ],
        relationshipTip: 'Your differences can be opportunities to learn from each other.',
        strongestCategory,
        weakestCategory
      };

      await session.setAiInsights(fallbackInsights);
      return fallbackInsights;
    }
  }

  /**
   * Build prompt for OpenAI
   * @private
   */
  _buildAiPrompt(results, differences, alignments, strongestCategory, weakestCategory) {
    let prompt = `Analyze this couple's "Would You Rather" game results:\n\n`;
    
    prompt += `OVERALL RESULTS:\n`;
    prompt += `- Compatibility Score: ${results.compatibilityScore}%\n`;
    prompt += `- Questions Matched: ${results.matchedAnswers}/${results.bothAnswered}\n`;
    prompt += `- Strongest Category: ${strongestCategory}\n`;
    prompt += `- Needs Discussion: ${weakestCategory}\n\n`;

    prompt += `CATEGORY BREAKDOWN:\n`;
    results.categoryBreakdown.forEach(cat => {
      const emoji = cat.compatibilityPercent >= 70 ? '✅' : cat.compatibilityPercent >= 40 ? '🔶' : '⚠️';
      prompt += `${emoji} ${cat.category}: ${cat.compatibilityPercent}% (${cat.matchedAnswers}/${cat.totalQuestions})\n`;
    });

    prompt += `\nKEY ALIGNMENTS (where they agreed):\n`;
    alignments.forEach((a, i) => {
      prompt += `${i + 1}. [${a.category}] Both chose: "${a.bothChose}" - ${a.insight}\n`;
    });

    prompt += `\nKEY DIFFERENCES (where they disagreed):\n`;
    differences.forEach((d, i) => {
      prompt += `${i + 1}. [${d.category}] Player 1: "${d.player1Chose}" vs Player 2: "${d.player2Chose}" - ${d.insight}\n`;
    });

    prompt += `\nProvide your analysis in this EXACT format:
SUMMARY: [2-3 sentences about their overall compatibility]
HIGHLIGHT1: [First compatibility strength]
HIGHLIGHT2: [Second compatibility strength]  
HIGHLIGHT3: [Third compatibility strength]
DIFFERENCE1: [First interesting difference and what it means]
DIFFERENCE2: [Second interesting difference and what it means]
TIP: [One specific, actionable relationship tip based on their results]`;

    return prompt;
  }

  /**
   * Parse AI response into structured format
   * @private
   */
  _parseAiResponse(response, strongestCategory, weakestCategory) {
    const text = response.content || response;
    
    const insights = {
      summary: '',
      compatibilityHighlights: [],
      interestingDifferences: [],
      relationshipTip: '',
      strongestCategory,
      weakestCategory
    };

    // Parse each section
    const summaryMatch = text.match(/SUMMARY:\s*(.+?)(?=HIGHLIGHT1:|$)/s);
    if (summaryMatch) {
      insights.summary = summaryMatch[1].trim();
    }

    // Parse highlights
    for (let i = 1; i <= 3; i++) {
      const regex = new RegExp(`HIGHLIGHT${i}:\\s*(.+?)(?=HIGHLIGHT${i + 1}:|DIFFERENCE1:|$)`, 's');
      const match = text.match(regex);
      if (match) {
        insights.compatibilityHighlights.push(match[1].trim());
      }
    }

    // Parse differences
    for (let i = 1; i <= 2; i++) {
      const regex = new RegExp(`DIFFERENCE${i}:\\s*(.+?)(?=DIFFERENCE${i + 1}:|TIP:|$)`, 's');
      const match = text.match(regex);
      if (match) {
        insights.interestingDifferences.push(match[1].trim());
      }
    }

    // Parse tip
    const tipMatch = text.match(/TIP:\s*(.+?)$/s);
    if (tipMatch) {
      insights.relationshipTip = tipMatch[1].trim();
    }

    return insights;
  }

  // =====================================================
  // VOICE NOTES
  // =====================================================

  /**
   * Add a voice note to completed game
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User sending voice note
   * @param {String} audioUrl - S3 URL of audio
   * @param {Number} duration - Duration in seconds
   * @returns {Promise<Object>} Updated voice notes
   */
  async addVoiceNote(sessionId, userId, audioUrl, duration) {
    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    await session.addVoiceNote(userId, audioUrl, duration);

    return {
      sessionId: session.sessionId,
      voiceNotes: session.voiceNotes.map(vn => ({
        oduserId: vn.oduserId,
        audioUrl: vn.audioUrl,
        duration: vn.duration,
        sentAt: vn.sentAt
      }))
    };
  }

  /**
   * Get voice notes for a session
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User requesting (must be a player)
   * @returns {Promise<Array>} Voice notes
   */
  async getVoiceNotes(sessionId, userId) {
    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    // Verify user is a player
    const isPlayer = 
      session.player1.userId._id.toString() === userId.toString() ||
      session.player2.userId._id.toString() === userId.toString();

    if (!isPlayer) {
      throw new Error('You are not a player in this game');
    }

    return session.voiceNotes.map(vn => ({
      oduserId: vn.oduserId,
      audioUrl: vn.audioUrl,
      duration: vn.duration,
      sentAt: vn.sentAt,
      isYours: vn.oduserId.toString() === userId.toString()
    }));
  }

  // =====================================================
  // SESSION MANAGEMENT
  // =====================================================

  /**
   * Get active session for a user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object|null>} Active session or null
   */
  async getActiveSession(userId) {
    const session = await WouldYouRatherSession.findActiveSession(userId);

    if (!session) {
      return null;
    }

    const isPlayer1 = session.player1.userId._id.toString() === userId.toString();
    const partner = isPlayer1 ? session.player2 : session.player1;

    return {
      sessionId: session.sessionId,
      status: session.status,
      currentQuestionIndex: session.currentQuestionIndex,
      partner: {
        oduserId: partner.userId._id,
        firstName: partner.userId.firstName,
        lastName: partner.userId.lastName,
        profilePhoto: partner.userId.profilePhoto
      }
    };
  }

  /**
   * Get game history for a user
   * @param {ObjectId} userId - User ID
   * @param {Number} limit - Max results
   * @returns {Promise<Array>} Game history
   */
  async getGameHistory(userId, limit = 20) {
    const sessions = await WouldYouRatherSession.getUserHistory(userId);

    return sessions.map(session => {
      const isPlayer1 = session.player1.userId._id.toString() === userId.toString();
      const partner = isPlayer1 ? session.player2 : session.player1;

      return {
        sessionId: session.sessionId,
        matchId: session.matchId,
        partner: {
          oduserId: partner.userId._id,
          firstName: partner.userId.firstName,
          lastName: partner.userId.lastName,
          profilePhoto: partner.userId.profilePhoto
        },
        compatibilityScore: session.results.compatibilityScore,
        completedAt: session.completedAt
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
    const session = await WouldYouRatherSession.findOne({ sessionId });

    if (session) {
      await session.updateConnectionStatus(userId, isConnected);
    }
  }

  /**
   * Cleanup expired invitations
   * Called by scheduled job
   */
  async cleanupExpiredInvitations() {
    const count = await WouldYouRatherSession.cleanupExpired();
    console.log(`[WYR] Cleaned up ${count} expired invitations`);
    return count;
  }
}

// Export singleton instance
module.exports = new WouldYouRatherService();