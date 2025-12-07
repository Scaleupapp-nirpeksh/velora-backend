// src/services/games/whatWouldYouDo.service.js

const WhatWouldYouDoQuestion = require('../../models/games/WhatWouldYouDoQuestion');
const WhatWouldYouDoSession = require('../../models/games/WhatWouldYouDoSession');
const Match = require('../../models/Match');
const User = require('../../models/User');
const s3Service = require('../s3.service');
const OpenAI = require('openai');
const logger = require('../../utils/logger');

// Initialize OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * WHAT WOULD YOU DO - GAME SERVICE
 * 
 * Async scenario-based compatibility game with voice note responses.
 * 
 * Key Features:
 * - Voice note recording + Whisper transcription
 * - Async gameplay (no timers, 72hr expiry)
 * - AI analysis comparing both players' responses
 * - Per-question and overall compatibility scoring
 * - Post-game discussion via voice notes
 */

class WhatWouldYouDoService {

  // =====================================================
  // INVITATION MANAGEMENT
  // =====================================================

  /**
   * Create a new game invitation
   */
  async createInvitation(initiatorId, matchId) {
    // Validate match exists and is mutual
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    // Determine who is the other user
    const oduserId1 = match.userId.toString();
    const oduserId2 = match.matchedUserId.toString();
    const initiatorIdStr = initiatorId.toString();

    if (initiatorIdStr !== oduserId1 && initiatorIdStr !== oduserId2) {
      throw new Error('You are not part of this match');
    }

    const invitedUserId = initiatorIdStr === oduserId1 ? oduserId2 : oduserId1;

    // Check for existing active game between these users
    const existingGame = await WhatWouldYouDoSession.hasActiveGame(initiatorId, invitedUserId);
    if (existingGame) {
      throw new Error('An active game already exists between you two');
    }

    // Get invited user details
    const invitedUser = await User.findById(invitedUserId)
      .select('firstName lastName profilePhoto');
    
    if (!invitedUser) {
      throw new Error('Invited user not found');
    }

    // Create session
    const session = new WhatWouldYouDoSession({
      matchId,
      player1: {
        userId: initiatorId,
        answers: [],
        totalAnswered: 0,
        isComplete: false
      },
      player2: {
        userId: invitedUserId,
        answers: [],
        totalAnswered: 0,
        isComplete: false
      },
      status: 'pending',
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000) // 72 hours
    });

    // Initialize question order
    session.initializeQuestions();

    await session.save();

    // Populate for response
    await session.populate('player1.userId', 'firstName lastName profilePhoto');
    await session.populate('player2.userId', 'firstName lastName profilePhoto');

    logger.info('What Would You Do invitation created', {
      sessionId: session.sessionId,
      initiator: initiatorId,
      invited: invitedUserId
    });

    return {
      session,
      invitedUser: {
        oduserId: invitedUserId,
        firstName: invitedUser.firstName,
        lastName: invitedUser.lastName,
        profilePhoto: invitedUser.profilePhoto
      }
    };
  }

  /**
   * Accept a game invitation
   */
  async acceptInvitation(sessionId, oduserId) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    // Verify user is player2
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    if (oduserId.toString() !== p2Id) {
      throw new Error('Only the invited player can accept');
    }

    if (session.status !== 'pending') {
      throw new Error('Invitation is no longer pending');
    }

    // Check if expired
    if (new Date() > session.expiresAt) {
      session.status = 'expired';
      await session.save();
      throw new Error('Invitation has expired');
    }

    // Accept
    session.status = 'active';
    session.acceptedAt = new Date();
    
    await session.save();

    logger.info('What Would You Do invitation accepted', {
      sessionId: session.sessionId,
      oduserId
    });

    return session;
  }

  /**
   * Decline a game invitation
   */
  async declineInvitation(sessionId, oduserId) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    if (oduserId.toString() !== p2Id) {
      throw new Error('Only the invited player can decline');
    }

    if (session.status !== 'pending') {
      throw new Error('Invitation is no longer pending');
    }

    session.status = 'declined';
    await session.save();

    logger.info('What Would You Do invitation declined', {
      sessionId: session.sessionId,
      oduserId
    });

    return session;
  }

  /**
   * Get pending invitation for a user
   */
  async getPendingInvitation(userId) {
    const session = await WhatWouldYouDoSession.findPendingInvitation(userId);
    
    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      invitedBy: {
        oduserId: session.player1.userId._id,
        firstName: session.player1.userId.firstName,
        lastName: session.player1.userId.lastName,
        profilePhoto: session.player1.userId.profilePhoto
      },
      expiresAt: session.expiresAt,
      gameInfo: {
        name: 'What Would You Do?',
        description: '15 scenarios to discover how you both handle real relationship situations',
        questionCount: 15,
        responseType: 'voice'
      }
    };
  }

  // =====================================================
  // ANSWER RECORDING
  // =====================================================

  /**
   * Record a voice note answer
   * @param {string} sessionId - Session ID
   * @param {string} userId - User ID
   * @param {number} questionNumber - Question number (1-15)
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {string} mimeType - Audio MIME type
   * @param {number} duration - Duration in seconds
   */
  async recordAnswer(sessionId, userId, questionNumber, audioBuffer, mimeType, duration) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (!['active', 'waiting'].includes(session.status)) {
      throw new Error('Game is not active');
    }

    // Verify user is a player
    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      throw new Error('You are not a player in this game');
    }

    // Validate question number
    if (questionNumber < 1 || questionNumber > 15) {
      throw new Error('Invalid question number');
    }

    // Upload voice note to S3
    const s3Key = `voice-notes/what-would-you-do/${sessionId}/${userId}_q${questionNumber}_${Date.now()}.m4a`;
    const uploadResult = await s3Service.uploadFile(audioBuffer, s3Key, mimeType);
    const voiceNoteUrl = uploadResult.url || uploadResult;

    // Transcribe with Whisper
    let transcription = null;
    try {
      transcription = await this.transcribeAudio(audioBuffer);
      logger.info('Voice note transcribed', { sessionId, userId, questionNumber });
    } catch (transcribeError) {
      logger.error('Transcription failed, continuing without:', transcribeError);
      // Continue without transcription - can retry later
    }

    // Record the answer
    session.recordAnswer(userId, questionNumber, voiceNoteUrl, duration, transcription);

    // Update status if needed
    const wasWaiting = session.status === 'waiting';
    
    if (session.player1.isComplete && session.player2.isComplete) {
      // Both complete - trigger analysis
      session.status = 'analyzing';
      await session.save();
      
      // Run analysis async
      this.runAnalysis(sessionId).catch(err => {
        logger.error('Analysis failed:', err);
      });
    } else if (session.player1.isComplete || session.player2.isComplete) {
      // One complete, waiting for other
      session.status = 'waiting';
      await session.save();
    } else {
      await session.save();
    }

    logger.info('What Would You Do answer recorded', {
      sessionId,
      userId,
      questionNumber,
      totalAnswered: userIdStr === p1Id ? session.player1.totalAnswered : session.player2.totalAnswered,
      hasTranscription: !!transcription
    });

    return {
      questionNumber,
      voiceNoteUrl,
      duration,
      transcription,
      progress: session.getPlayerProgress(userId),
      status: session.status,
      bothComplete: session.bothCompleted()
    };
  }

  /**
   * Transcribe audio using Whisper
   */
  async transcribeAudio(audioBuffer) {
    try {
      // Create a File-like object for the API
      const file = new File([audioBuffer], 'audio.m4a', { type: 'audio/mp4' });
      
      const response = await openaiClient.audio.transcriptions.create({
        file: file,
        model: 'whisper-1',
        language: 'en',
        response_format: 'text'
      });

      return response;
    } catch (error) {
      logger.error('Whisper transcription error:', error);
      throw error;
    }
  }

  /**
   * Retry transcription for an answer (if initial transcription failed)
   */
  async retryTranscription(sessionId, userId, questionNumber) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    let player;
    if (userIdStr === p1Id) {
      player = session.player1;
    } else if (userIdStr === p2Id) {
      player = session.player2;
    } else {
      throw new Error('User is not a player');
    }

    const answer = player.answers.find(a => a.questionNumber === questionNumber);
    if (!answer) {
      throw new Error('Answer not found');
    }

    if (answer.transcription) {
      return answer.transcription; // Already transcribed
    }

    // Fetch audio from S3 and transcribe
    const audioBuffer = await s3Service.getFile(answer.voiceNoteUrl);
    const transcription = await this.transcribeAudio(audioBuffer);

    // Update the answer
    session.updateTranscription(userId, questionNumber, transcription);
    await session.save();

    return transcription;
  }

  // =====================================================
  // GAME STATUS & PROGRESS
  // =====================================================

  /**
   * Get current session state for a user
   */
  async getSessionState(sessionId, userId) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      throw new Error('You are not a player in this game');
    }

    const isPlayer1 = userIdStr === p1Id;
    const player = isPlayer1 ? session.player1 : session.player2;
    const partner = isPlayer1 ? session.player2 : session.player1;

    const state = {
      sessionId: session.sessionId,
      status: session.status,
      partner: {
        oduserId: isPlayer1 ? p2Id : p1Id,
        firstName: partner.userId.firstName,
        lastName: partner.userId.lastName,
        profilePhoto: partner.userId.profilePhoto
      },
      progress: {
        you: {
          answered: player.totalAnswered,
          isComplete: player.isComplete,
          answeredQuestions: player.answers.map(a => a.questionNumber)
        },
        partner: {
          answered: partner.totalAnswered,
          isComplete: partner.isComplete
          // Don't reveal which questions partner answered
        }
      },
      nextQuestion: session.getNextQuestion(userId),
      expiresAt: session.expiresAt,
      timestamps: {
        invitedAt: session.invitedAt,
        acceptedAt: session.acceptedAt,
        completedAt: session.completedAt
      }
    };

    // Add results preview if completed
    if (['completed', 'discussion'].includes(session.status)) {
      state.resultsReady = true;
      state.hasViewedResults = session.hasViewedResults(userId);
    }

    return state;
  }

  /**
   * Get active session for a user
   */
  async getActiveSession(userId) {
    const session = await WhatWouldYouDoSession.findActiveForUser(userId);
    
    if (!session) {
      return null;
    }

    return this.getSessionState(session.sessionId, userId);
  }

  /**
   * Get a specific question for answering
   */
  async getQuestion(sessionId, userId, questionNumber) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (!['active', 'waiting'].includes(session.status)) {
      throw new Error('Game is not active');
    }

    // Check if already answered
    const answeredQuestions = session.getAnsweredQuestions(userId);
    if (answeredQuestions.includes(questionNumber)) {
      throw new Error('Question already answered');
    }

    // Get question
    const question = await WhatWouldYouDoQuestion.getByNumber(questionNumber);
    if (!question) {
      throw new Error('Question not found');
    }

    const categoryInfo = WhatWouldYouDoQuestion.getCategoryInfo();

    return {
      questionNumber: question.questionNumber,
      category: question.category,
      categoryName: categoryInfo[question.category].name,
      categoryEmoji: categoryInfo[question.category].emoji,
      scenarioText: question.scenarioText,
      coreQuestion: question.coreQuestion,
      intensity: question.intensity,
      suggestedDuration: question.suggestedDuration,
      progress: {
        current: answeredQuestions.length + 1,
        total: 15
      }
    };
  }

  // =====================================================
  // ANALYSIS & RESULTS
  // =====================================================

  /**
   * Run AI analysis on completed game
   */
  async runAnalysis(sessionId) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.bothCompleted()) {
      throw new Error('Both players must complete before analysis');
    }

    logger.info('Starting What Would You Do analysis', { sessionId });

    try {
      // Get all questions
      const questions = await WhatWouldYouDoQuestion.getGameQuestions();

      // Analyze each question
      const questionAnalyses = [];
      const categoryScores = {
        trust_honesty: [],
        communication: [],
        respect: [],
        values: [],
        intimacy: [],
        control_flags: []
      };

      for (const question of questions) {
        const p1Answer = session.player1.answers.find(a => a.questionNumber === question.questionNumber);
        const p2Answer = session.player2.answers.find(a => a.questionNumber === question.questionNumber);

        if (!p1Answer?.transcription || !p2Answer?.transcription) {
          // Skip questions without transcriptions
          continue;
        }

        const analysis = await this.analyzeQuestionPair(
          question,
          p1Answer.transcription,
          p2Answer.transcription,
          session.player1.userId.firstName,
          session.player2.userId.firstName
        );

        questionAnalyses.push({
          questionNumber: question.questionNumber,
          ...analysis
        });

        // Collect for category scores
        if (categoryScores[question.category]) {
          categoryScores[question.category].push(analysis.alignmentScore);
        }
      }

      // Calculate category averages
      const categoryAverages = {};
      for (const [category, scores] of Object.entries(categoryScores)) {
        if (scores.length > 0) {
          categoryAverages[category] = Math.round(
            scores.reduce((a, b) => a + b, 0) / scores.length
          );
        } else {
          categoryAverages[category] = null;
        }
      }

      // Calculate overall compatibility
      const validScores = questionAnalyses.map(q => q.alignmentScore).filter(s => s !== null);
      const overallCompatibility = validScores.length > 0
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : 50;

      // Determine compatibility level
      let compatibilityLevel;
      if (overallCompatibility >= 80) {
        compatibilityLevel = 'highly_compatible';
      } else if (overallCompatibility >= 65) {
        compatibilityLevel = 'compatible';
      } else if (overallCompatibility >= 50) {
        compatibilityLevel = 'needs_discussion';
      } else {
        compatibilityLevel = 'significant_differences';
      }

      // Find strongest areas and areas to discuss
      const strongestAreas = [];
      const areasToDiscuss = [];

      for (const analysis of questionAnalyses) {
        if (analysis.alignmentScore >= 80) {
          const question = questions.find(q => q.questionNumber === analysis.questionNumber);
          strongestAreas.push({
            category: question.category,
            insight: analysis.comparisonInsight
          });
        } else if (analysis.alignmentScore < 60) {
          const question = questions.find(q => q.questionNumber === analysis.questionNumber);
          areasToDiscuss.push({
            category: question.category,
            insight: analysis.comparisonInsight,
            questionNumber: analysis.questionNumber
          });
        }
      }

      // Get conversation starters (from lower alignment questions)
      const conversationStarters = questionAnalyses
        .filter(a => a.alignmentScore < 70 && a.discussionPrompt)
        .slice(0, 5)
        .map(a => ({
          questionNumber: a.questionNumber,
          prompt: a.discussionPrompt
        }));

      // Update session with results
      session.results = {
        overallCompatibility,
        compatibilityLevel,
        questionAnalyses,
        categoryScores: categoryAverages,
        strongestAreas: strongestAreas.slice(0, 3),
        areasToDiscuss: areasToDiscuss.slice(0, 5),
        conversationStarters
      };

      session.status = 'completed';
      session.completedAt = new Date();

      await session.save();

      // Generate AI insights
      await this.generateAIInsights(session);

      logger.info('What Would You Do analysis completed', {
        sessionId,
        overallCompatibility,
        compatibilityLevel
      });

      return session.results;

    } catch (error) {
      logger.error('Analysis error:', error);
      // Don't leave in analyzing state
      session.status = 'completed';
      session.completedAt = new Date();
      await session.save();
      throw error;
    }
  }

  /**
   * Analyze a single question's answers from both players
   */
  async analyzeQuestionPair(question, p1Transcription, p2Transcription, p1Name, p2Name) {
    try {
      const prompt = `Analyze these two responses to a relationship scenario.

SCENARIO: "${question.scenarioText}"

CORE QUESTION BEING TESTED: ${question.coreQuestion}

${p1Name.toUpperCase()}'S RESPONSE:
"${p1Transcription}"

${p2Name.toUpperCase()}'S RESPONSE:
"${p2Transcription}"

Analyze their compatibility on this scenario. Consider:
- Do they have similar values and priorities?
- Would their approaches complement each other or create conflict?
- Do they show emotional maturity and healthy communication?
- Are there any concerning patterns in either response?

Respond in JSON format:
{
  "alignmentScore": <0-100, how compatible their approaches are>,
  "alignmentLevel": "<strong_alignment|moderate_alignment|different_approaches|potential_conflict>",
  "player1Summary": "<1 sentence summary of ${p1Name}'s approach>",
  "player2Summary": "<1 sentence summary of ${p2Name}'s approach>",
  "comparisonInsight": "<1-2 sentences on how their approaches compare>",
  "discussionPrompt": "<A question they should discuss together about this topic>"
}`;

      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a relationship compatibility analyst. Be fair, balanced, and constructive. Focus on compatibility, not judgment. Respond only with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 500
      });

      const content = response.choices[0].message.content;
      return JSON.parse(content);

    } catch (error) {
      logger.error('Question analysis error:', error);
      // Return neutral analysis on error
      return {
        alignmentScore: 50,
        alignmentLevel: 'moderate_alignment',
        player1Summary: 'Response recorded',
        player2Summary: 'Response recorded',
        comparisonInsight: 'Analysis could not be completed',
        discussionPrompt: 'Discuss your thoughts on this scenario together'
      };
    }
  }

  /**
   * Generate overall AI insights
   */
  async generateAIInsights(session) {
    try {
      if (!session.results || !session.results.questionAnalyses) {
        return;
      }

      const p1Name = session.player1.userId.firstName;
      const p2Name = session.player2.userId.firstName;

      const categoryInfo = WhatWouldYouDoQuestion.getCategoryInfo();

      // Build summary of all analyses
      const analysisSummary = session.results.questionAnalyses
        .map(a => `Q${a.questionNumber}: ${a.alignmentLevel} (${a.alignmentScore}%) - ${a.comparisonInsight}`)
        .join('\n');

      const categoryBreakdown = Object.entries(session.results.categoryScores)
        .filter(([_, score]) => score !== null)
        .map(([cat, score]) => `${categoryInfo[cat].name}: ${score}%`)
        .join(', ');

      const prompt = `Based on a compatibility assessment of 15 relationship scenarios, generate insights for this couple.

OVERALL COMPATIBILITY: ${session.results.overallCompatibility}% (${session.results.compatibilityLevel})

CATEGORY SCORES: ${categoryBreakdown}

PER-QUESTION ANALYSIS:
${analysisSummary}

STRONGEST AREAS:
${session.results.strongestAreas.map(a => `- ${a.category}: ${a.insight}`).join('\n') || 'None identified'}

AREAS NEEDING DISCUSSION:
${session.results.areasToDiscuss.map(a => `- ${a.category}: ${a.insight}`).join('\n') || 'None identified'}

Generate warm, constructive insights in these 7 categories. Each should be 2-3 sentences:

1. OVERALL SUMMARY: A warm overview of their compatibility
2. COMPATIBILITY ANALYSIS: What makes them work well (or not) together
3. COMMUNICATION STYLES: How they each approach difficult conversations
4. VALUES ALIGNMENT: Where their core values align or differ
5. POTENTIAL CHALLENGES: What they should watch out for
6. STRENGTHS AS A COUPLE: What they bring out in each other
7. ADVICE FORWARD: One actionable suggestion for their relationship

Respond in JSON:
{
  "overallSummary": "...",
  "compatibilityAnalysis": "...",
  "communicationStyles": "...",
  "valuesAlignment": "...",
  "potentialChallenges": "...",
  "strengthsAsCouple": "...",
  "adviceForward": "..."
}`;

      const response = await openaiClient.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a warm, supportive relationship counselor. Provide balanced insights that help couples understand each other better. Be encouraging but honest. Respond only with valid JSON.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1000
      });

      const insights = JSON.parse(response.choices[0].message.content);

      session.aiInsights = {
        generated: true,
        generatedAt: new Date(),
        ...insights
      };

      await session.save();

      logger.info('What Would You Do AI insights generated', {
        sessionId: session.sessionId
      });

    } catch (error) {
      logger.error('Error generating AI insights:', error);
      // Don't throw - insights are optional enhancement
    }
  }

  // =====================================================
  // RESULTS RETRIEVAL
  // =====================================================

  /**
   * Get full results for a completed game
   */
  async getResults(sessionId, userId) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (!['completed', 'discussion'].includes(session.status)) {
      throw new Error('Results are not yet available');
    }

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      throw new Error('You are not a player in this game');
    }

    // Mark results as viewed
    session.markResultsViewed(userId);
    await session.save();

    const isPlayer1 = userIdStr === p1Id;

    // Get questions for context
    const questions = await WhatWouldYouDoQuestion.getGameQuestions();
    const categoryInfo = WhatWouldYouDoQuestion.getCategoryInfo();

    // Build per-question results with both answers visible
    const questionResults = [];
    for (const question of questions) {
      const answers = session.getAnswersForQuestion(question.questionNumber);
      const analysis = session.results.questionAnalyses?.find(
        a => a.questionNumber === question.questionNumber
      );

      questionResults.push({
        questionNumber: question.questionNumber,
        category: question.category,
        categoryName: categoryInfo[question.category].name,
        categoryEmoji: categoryInfo[question.category].emoji,
        scenarioText: question.scenarioText,
        coreQuestion: question.coreQuestion,
        yourAnswer: isPlayer1 ? answers.player1 : answers.player2,
        partnerAnswer: isPlayer1 ? answers.player2 : answers.player1,
        analysis: analysis ? {
          alignmentScore: analysis.alignmentScore,
          alignmentLevel: analysis.alignmentLevel,
          comparisonInsight: analysis.comparisonInsight,
          discussionPrompt: analysis.discussionPrompt
        } : null
      });
    }

    return {
      sessionId: session.sessionId,
      completedAt: session.completedAt,
      partner: {
        oduserId: isPlayer1 ? p2Id : p1Id,
        firstName: isPlayer1 ? session.player2.userId.firstName : session.player1.userId.firstName,
        lastName: isPlayer1 ? session.player2.userId.lastName : session.player1.userId.lastName,
        profilePhoto: isPlayer1 ? session.player2.userId.profilePhoto : session.player1.userId.profilePhoto
      },
      overallResults: {
        compatibility: session.results.overallCompatibility,
        compatibilityLevel: session.results.compatibilityLevel,
        categoryScores: session.results.categoryScores,
        strongestAreas: session.results.strongestAreas,
        areasToDiscuss: session.results.areasToDiscuss,
        conversationStarters: session.results.conversationStarters
      },
      questionResults,
      aiInsights: session.aiInsights,
      discussionNotes: session.discussionNotes
    };
  }

  /**
   * Get game history for a user
   */
  async getGameHistory(userId, limit = 10) {
    const sessions = await WhatWouldYouDoSession.findCompletedForUser(userId, limit);

    return sessions.map(session => {
      const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
      const isPlayer1 = userId.toString() === p1Id;
      const partner = isPlayer1 ? session.player2 : session.player1;

      return {
        sessionId: session.sessionId,
        completedAt: session.completedAt,
        partner: {
          oduserId: partner.userId._id,
          firstName: partner.userId.firstName,
          lastName: partner.userId.lastName,
          profilePhoto: partner.userId.profilePhoto
        },
        compatibility: session.results?.overallCompatibility,
        compatibilityLevel: session.results?.compatibilityLevel,
        hasViewedResults: session.hasViewedResults(userId)
      };
    });
  }

  // =====================================================
  // DISCUSSION NOTES
  // =====================================================

  /**
   * Add a discussion voice note
   */
  async addDiscussionNote(sessionId, userId, audioBuffer, mimeType, duration, questionNumber = null) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (!['completed', 'discussion'].includes(session.status)) {
      throw new Error('Discussion notes are only available after game completion');
    }

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      throw new Error('You are not a player in this game');
    }

    // Upload voice note
    const s3Key = `voice-notes/what-would-you-do/${sessionId}/discussion_${userId}_${Date.now()}.m4a`;
    const uploadResult = await s3Service.uploadFile(audioBuffer, s3Key, mimeType);
    const voiceNoteUrl = uploadResult.url || uploadResult;

    // Transcribe
    let transcription = null;
    try {
      transcription = await this.transcribeAudio(audioBuffer);
    } catch (err) {
      logger.error('Discussion note transcription failed:', err);
    }

    // Add to session
    session.addDiscussionNote(userId, voiceNoteUrl, duration, questionNumber, transcription);
    session.status = 'discussion';
    await session.save();

    logger.info('Discussion note added', {
      sessionId,
      userId,
      questionNumber
    });

    return {
      voiceNoteUrl,
      duration,
      transcription,
      questionNumber
    };
  }

  /**
   * Get discussion notes for a session
   */
  async getDiscussionNotes(sessionId, userId) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      throw new Error('You are not a player in this game');
    }

    return session.discussionNotes.map(note => ({
      userId: note.oduserId,
      isYours: note.oduserId.toString() === userIdStr,
      questionNumber: note.questionNumber,
      voiceNoteUrl: note.voiceNoteUrl,
      duration: note.duration,
      transcription: note.transcription,
      createdAt: note.createdAt,
      listened: note.listenedBy.some(l => l.oduserId.toString() === userIdStr)
    }));
  }

  /**
   * Mark a discussion note as listened
   */
  async markDiscussionNoteListened(sessionId, noteIndex, listenerId) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    session.markDiscussionNoteListened(noteIndex, listenerId);
    await session.save();
  }

  // =====================================================
  // ADMIN / MAINTENANCE
  // =====================================================

  /**
   * Expire old sessions
   */
  async expireOldSessions() {
    const expiredSessions = await WhatWouldYouDoSession.findExpiredSessions();

    for (const session of expiredSessions) {
      session.status = 'expired';
      await session.save();
      
      logger.info('Session expired', { sessionId: session.sessionId });
    }

    return expiredSessions.length;
  }

  /**
   * Abandon a game
   */
  async abandonGame(sessionId, userId) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      throw new Error('You are not a player in this game');
    }

    if (['completed', 'discussion', 'expired', 'declined', 'abandoned'].includes(session.status)) {
      throw new Error('Game cannot be abandoned');
    }

    session.status = 'abandoned';
    await session.save();

    logger.info('Game abandoned', { sessionId, userId });

    return session;
  }

 /**
   * Regenerate AI analysis for a completed game
   * Use this to re-run analysis after fixing issues (like wrong model)
   */
 async regenerateAnalysis(sessionId) {
    const session = await WhatWouldYouDoSession.findBySessionId(sessionId);
    
    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.bothCompleted()) {
      throw new Error('Both players must have completed the game');
    }

    logger.info('Regenerating What Would You Do analysis', { sessionId });

    // Reset status to analyzing
    session.status = 'analyzing';
    await session.save();

    try {
      // Get all questions
      const questions = await WhatWouldYouDoQuestion.getGameQuestions();

      // Analyze each question
      const questionAnalyses = [];
      const categoryScores = {
        trust_honesty: [],
        communication: [],
        respect: [],
        values: [],
        intimacy: [],
        control_flags: []
      };

      for (const question of questions) {
        const p1Answer = session.player1.answers.find(a => a.questionNumber === question.questionNumber);
        const p2Answer = session.player2.answers.find(a => a.questionNumber === question.questionNumber);

        if (!p1Answer?.transcription || !p2Answer?.transcription) {
          logger.warn('Missing transcription for question', { 
            sessionId, 
            questionNumber: question.questionNumber,
            p1HasTranscription: !!p1Answer?.transcription,
            p2HasTranscription: !!p2Answer?.transcription
          });
          continue;
        }

        logger.info('Analyzing question', { sessionId, questionNumber: question.questionNumber });

        const analysis = await this.analyzeQuestionPair(
          question,
          p1Answer.transcription,
          p2Answer.transcription,
          session.player1.userId.firstName,
          session.player2.userId.firstName
        );

        questionAnalyses.push({
          questionNumber: question.questionNumber,
          ...analysis
        });

        // Collect for category scores
        if (categoryScores[question.category]) {
          categoryScores[question.category].push(analysis.alignmentScore);
        }

        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      // Calculate category averages
      const categoryAverages = {};
      for (const [category, scores] of Object.entries(categoryScores)) {
        if (scores.length > 0) {
          categoryAverages[category] = Math.round(
            scores.reduce((a, b) => a + b, 0) / scores.length
          );
        } else {
          categoryAverages[category] = null;
        }
      }

      // Calculate overall compatibility
      const validScores = questionAnalyses.map(q => q.alignmentScore).filter(s => s !== null);
      const overallCompatibility = validScores.length > 0
        ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
        : 50;

      // Determine compatibility level
      let compatibilityLevel;
      if (overallCompatibility >= 80) {
        compatibilityLevel = 'highly_compatible';
      } else if (overallCompatibility >= 65) {
        compatibilityLevel = 'compatible';
      } else if (overallCompatibility >= 50) {
        compatibilityLevel = 'needs_discussion';
      } else {
        compatibilityLevel = 'significant_differences';
      }

      // Find strongest areas and areas to discuss
      const strongestAreas = [];
      const areasToDiscuss = [];

      for (const analysis of questionAnalyses) {
        if (analysis.alignmentScore >= 80) {
          const question = questions.find(q => q.questionNumber === analysis.questionNumber);
          strongestAreas.push({
            category: question.category,
            insight: analysis.comparisonInsight
          });
        } else if (analysis.alignmentScore < 60) {
          const question = questions.find(q => q.questionNumber === analysis.questionNumber);
          areasToDiscuss.push({
            category: question.category,
            insight: analysis.comparisonInsight,
            questionNumber: analysis.questionNumber
          });
        }
      }

      // Get conversation starters (from lower alignment questions)
      const conversationStarters = questionAnalyses
        .filter(a => a.alignmentScore < 70 && a.discussionPrompt)
        .slice(0, 5)
        .map(a => ({
          questionNumber: a.questionNumber,
          prompt: a.discussionPrompt
        }));

      // Update session with results
      session.results = {
        overallCompatibility,
        compatibilityLevel,
        questionAnalyses,
        categoryScores: categoryAverages,
        strongestAreas: strongestAreas.slice(0, 3),
        areasToDiscuss: areasToDiscuss.slice(0, 5),
        conversationStarters
      };

      session.status = 'completed';
      await session.save();

      // Generate AI insights
      await this.generateAIInsights(session);

      logger.info('What Would You Do analysis regenerated successfully', {
        sessionId,
        overallCompatibility,
        compatibilityLevel,
        analyzedQuestions: questionAnalyses.length
      });

      return session.results;

    } catch (error) {
      logger.error('Regenerate analysis error:', error);
      // Keep as completed but with partial results
      session.status = 'completed';
      await session.save();
      throw error;
    }
  } 
}

module.exports = new WhatWouldYouDoService();