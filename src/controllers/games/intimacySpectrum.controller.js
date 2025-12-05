// src/controllers/games/intimacySpectrum.controller.js

const intimacySpectrumService = require('../../services/games/intimacySpectrum.service');
const IntimacySpectrumSession = require('../../models/games/IntimacySpectrumSession');
const IntimacySpectrumQuestion = require('../../models/games/IntimacySpectrumQuestion');
const s3Service = require('../../services/s3.service');
const logger = require('../../utils/logger');

/**
 * INTIMACY SPECTRUM HTTP CONTROLLER
 * 
 * REST API endpoints for the Intimacy Spectrum slider game.
 * 
 * Note: Most gameplay happens via Socket.io (real-time).
 * These endpoints handle:
 * - Fetching questions and categories
 * - Getting results after game completion
 * - Getting AI insights
 * - Game history
 * - Voice note uploads
 * - Checking pending invitations (for app launch)
 */

// =====================================================
// QUESTIONS & CATEGORIES
// =====================================================

/**
 * Get all questions (for admin/debug purposes)
 * GET /api/games/intimacy-spectrum/questions
 */
exports.getQuestions = async (req, res) => {
  try {
    const { category, spiceLevel } = req.query;

    let questions;

    if (category) {
      questions = await IntimacySpectrumQuestion.getByCategory(category);
    } else if (spiceLevel) {
      questions = await IntimacySpectrumQuestion.getBySpiceLevel(parseInt(spiceLevel));
    } else {
      questions = await IntimacySpectrumQuestion.getAllActive();
    }

    res.status(200).json({
      success: true,
      count: questions.length,
      data: questions.map(q => ({
        questionNumber: q.questionNumber,
        category: q.category,
        questionText: q.questionText,
        leftLabel: q.leftLabel,
        rightLabel: q.rightLabel,
        spiceLevel: q.spiceLevel
      }))
    });

  } catch (error) {
    logger.error('Error fetching questions:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch questions'
    });
  }
};

/**
 * Get question categories with info
 * GET /api/games/intimacy-spectrum/categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categoryInfo = IntimacySpectrumQuestion.getCategoryInfo();

    // Get question counts per category
    const counts = await IntimacySpectrumQuestion.aggregate([
      { $match: { isActive: true } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          avgSpiceLevel: { $avg: '$spiceLevel' }
        }
      },
      { $sort: { avgSpiceLevel: 1 } }
    ]);

    const categories = counts.map(cat => ({
      category: cat._id,
      ...categoryInfo[cat._id],
      questionCount: cat.count,
      avgSpiceLevel: Math.round(cat.avgSpiceLevel * 10) / 10
    }));

    res.status(200).json({
      success: true,
      data: categories
    });

  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
};

// =====================================================
// GAME STATE & INVITATIONS
// =====================================================

/**
 * Check for pending game invitation
 * GET /api/games/intimacy-spectrum/pending-invitation
 */
exports.getPendingInvitation = async (req, res) => {
  try {
    const userId = req.user._id;

    const invitation = await intimacySpectrumService.getPendingInvitation(userId);

    res.status(200).json({
      success: true,
      hasPendingInvitation: !!invitation,
      data: invitation
    });

  } catch (error) {
    logger.error('Error checking pending invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check pending invitation'
    });
  }
};

/**
 * Get user's active game session
 * GET /api/games/intimacy-spectrum/active
 */
exports.getActiveSession = async (req, res) => {
  try {
    const userId = req.user._id;

    const session = await intimacySpectrumService.getActiveSession(userId);

    res.status(200).json({
      success: true,
      hasActiveSession: !!session,
      data: session
    });

  } catch (error) {
    logger.error('Error fetching active session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch active session'
    });
  }
};

/**
 * Create game invitation via HTTP (alternative to socket)
 * POST /api/games/intimacy-spectrum/invite
 * Body: { matchId }
 */
exports.createInvitation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { matchId } = req.body;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: 'Match ID is required'
      });
    }

    const result = await intimacySpectrumService.createInvitation(userId, matchId);

    res.status(201).json({
      success: true,
      message: 'Game invitation sent',
      data: {
        sessionId: result.session.sessionId,
        status: result.session.status,
        expiresAt: result.session.expiresAt,
        invitedUser: result.invitedUser
      }
    });

  } catch (error) {
    logger.error('Error creating invitation:', error);

    const statusCode = error.message.includes('not found') ? 404
      : error.message.includes('not part of') ? 403
      : error.message.includes('already exists') ? 409
      : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to create invitation'
    });
  }
};

/**
 * Accept game invitation via HTTP
 * POST /api/games/intimacy-spectrum/sessions/:sessionId/accept
 */
exports.acceptInvitation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    const session = await intimacySpectrumService.acceptInvitation(sessionId, userId);

    res.status(200).json({
      success: true,
      message: 'Game invitation accepted',
      data: {
        sessionId: session.sessionId,
        status: session.status
      }
    });

  } catch (error) {
    logger.error('Error accepting invitation:', error);

    const statusCode = error.message.includes('not found') ? 404
      : error.message.includes('Only the invited') ? 403
      : error.message.includes('expired') ? 410
      : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to accept invitation'
    });
  }
};

/**
 * Decline game invitation via HTTP
 * POST /api/games/intimacy-spectrum/sessions/:sessionId/decline
 */
exports.declineInvitation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    await intimacySpectrumService.declineInvitation(sessionId, userId);

    res.status(200).json({
      success: true,
      message: 'Game invitation declined'
    });

  } catch (error) {
    logger.error('Error declining invitation:', error);

    const statusCode = error.message.includes('not found') ? 404
      : error.message.includes('Only the invited') ? 403
      : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to decline invitation'
    });
  }
};

// =====================================================
// SESSION DETAILS
// =====================================================

/**
 * Get session details (for reconnection or status check)
 * GET /api/games/intimacy-spectrum/sessions/:sessionId
 */
exports.getSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Verify user is a player
    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this game'
      });
    }

    const isPlayer1 = p1Id === userIdStr;
    const partner = isPlayer1 ? session.player2 : session.player1;
    const you = isPlayer1 ? session.player1 : session.player2;

    // Build response based on game status
    const response = {
      sessionId: session.sessionId,
      status: session.status,
      matchId: session.matchId,
      partner: {
        oduserId: partner.userId._id,
        firstName: partner.userId.firstName,
        lastName: partner.userId.lastName,
        profilePhoto: partner.userId.profilePhoto,
        isConnected: partner.isConnected
      },
      you: {
        totalAnswered: you.totalAnswered,
        totalTimedOut: you.totalTimedOut
      },
      progress: {
        currentQuestionIndex: session.currentQuestionIndex,
        totalQuestions: 30,
        percent: Math.round((session.currentQuestionIndex / 30) * 100)
      },
      timestamps: {
        invitedAt: session.invitedAt,
        acceptedAt: session.acceptedAt,
        startedAt: session.startedAt,
        completedAt: session.completedAt
      }
    };

    // Add current question if game is in progress
    if (session.status === 'playing') {
      const questionNumber = session.questionOrder[session.currentQuestionIndex];
      const question = await IntimacySpectrumQuestion.findOne({ questionNumber });

      response.currentQuestion = {
        index: session.currentQuestionIndex,
        number: questionNumber,
        category: question.category,
        questionText: question.questionText,
        leftLabel: question.leftLabel,
        rightLabel: question.rightLabel,
        spiceLevel: question.spiceLevel,
        expiresAt: session.currentQuestionExpiresAt
      };
    }

    // Add results if game is completed
    if (['completed', 'discussion'].includes(session.status)) {
      response.results = session.results;
      response.aiInsights = session.aiInsights;
    }

    res.status(200).json({
      success: true,
      data: response
    });

  } catch (error) {
    logger.error('Error fetching session:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch session'
    });
  }
};

// =====================================================
// RESULTS
// =====================================================

/**
 * Get game results (after completion)
 * GET /api/games/intimacy-spectrum/sessions/:sessionId/results
 */
exports.getResults = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    // Verify user is a player first
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this game'
      });
    }

    const results = await intimacySpectrumService.getResults(sessionId);

    res.status(200).json({
      success: true,
      data: results
    });

  } catch (error) {
    logger.error('Error fetching results:', error);

    const statusCode = error.message.includes('not found') ? 404
      : error.message.includes('not yet completed') ? 400
      : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to fetch results'
    });
  }
};

/**
 * Get detailed question-by-question breakdown
 * GET /api/games/intimacy-spectrum/sessions/:sessionId/detailed
 */
exports.getDetailedResults = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    // Verify user is a player
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this game'
      });
    }

    const detailed = await intimacySpectrumService.getDetailedResults(sessionId);

    res.status(200).json({
      success: true,
      data: detailed
    });

  } catch (error) {
    logger.error('Error fetching detailed results:', error);

    const statusCode = error.message.includes('not found') ? 404
      : error.message.includes('not yet completed') ? 400
      : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to fetch detailed results'
    });
  }
};

/**
 * Get AI-generated insights
 * GET /api/games/intimacy-spectrum/sessions/:sessionId/insights
 */
exports.getAiInsights = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    // Verify user is a player
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this game'
      });
    }

    // Generate insights if not already done
    const insights = await intimacySpectrumService.generateAiInsights(sessionId);

    res.status(200).json({
      success: true,
      data: insights
    });

  } catch (error) {
    logger.error('Error fetching AI insights:', error);

    const statusCode = error.message.includes('not found') ? 404
      : error.message.includes('must be completed') ? 400
      : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to fetch AI insights'
    });
  }
};

// =====================================================
// HISTORY
// =====================================================

/**
 * Get user's game history
 * GET /api/games/intimacy-spectrum/history
 */
exports.getHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 10 } = req.query;

    const history = await intimacySpectrumService.getGameHistory(
      userId,
      Math.min(parseInt(limit), 50)
    );

    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });

  } catch (error) {
    logger.error('Error fetching game history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch game history'
    });
  }
};

// =====================================================
// VOICE NOTES
// =====================================================

/**
 * Upload a voice note
 * POST /api/games/intimacy-spectrum/sessions/:sessionId/voice-notes
 * Multipart form: audio file
 */
exports.uploadVoiceNote = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Audio file is required'
      });
    }

    // Get duration from request body (sent by client)
    const duration = parseInt(req.body.duration);

    if (!duration || duration <= 0 || duration > 60) {
      return res.status(400).json({
        success: false,
        message: 'Valid duration (1-60 seconds) is required'
      });
    }

    // Verify user is a player
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this game'
      });
    }

    // Upload to S3
    const fileName = `intimacy-spectrum/${sessionId}/${userId}_${Date.now()}.webm`;
    const audioUrl = await s3Service.uploadFile(req.file.buffer, fileName, req.file.mimetype);

    // Add voice note to session
    const result = await intimacySpectrumService.addVoiceNote(
      sessionId,
      userId,
      audioUrl,
      duration
    );

    res.status(201).json({
      success: true,
      message: 'Voice note uploaded',
      data: {
        audioUrl,
        duration,
        totalVoiceNotes: result.count
      }
    });

  } catch (error) {
    logger.error('Error uploading voice note:', error);

    const statusCode = error.message.includes('not found') ? 404
      : error.message.includes('not a player') ? 403
      : error.message.includes('only available after') ? 400
      : error.message.includes('Maximum') ? 400
      : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to upload voice note'
    });
  }
};

/**
 * Get voice notes for a session
 * GET /api/games/intimacy-spectrum/sessions/:sessionId/voice-notes
 */
exports.getVoiceNotes = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Verify user is a player
    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this game'
      });
    }

    res.status(200).json({
      success: true,
      count: session.voiceNotes.length,
      data: session.voiceNotes
    });

  } catch (error) {
    logger.error('Error fetching voice notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voice notes'
    });
  }
};