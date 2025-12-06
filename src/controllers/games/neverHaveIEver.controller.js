// src/controllers/games/neverHaveIEver.controller.js

const neverHaveIEverService = require('../../services/games/neverHaveIEver.service');
const NeverHaveIEverQuestion = require('../../models/games/NeverHaveIEverQuestion');
const NeverHaveIEverSession = require('../../models/games/NeverHaveIEverSession');
const logger = require('../../utils/logger');

/**
 * NEVER HAVE I EVER CONTROLLER
 * 
 * HTTP endpoints for the Never Have I Ever discovery game.
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
 * GET /api/games/never-have-i-ever/questions
 */
exports.getQuestions = async (req, res) => {
  try {
    const { category, spiceLevel } = req.query;

    let questions;

    if (category) {
      questions = await NeverHaveIEverQuestion.getByCategory(category);
    } else if (spiceLevel) {
      questions = await NeverHaveIEverQuestion.getBySpiceLevel(parseInt(spiceLevel));
    } else {
      questions = await NeverHaveIEverQuestion.getAllActive();
    }

    res.status(200).json({
      success: true,
      count: questions.length,
      data: questions.map(q => ({
        questionNumber: q.questionNumber,
        category: q.category,
        statementText: q.statementText,
        insight: q.insight,
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
 * GET /api/games/never-have-i-ever/categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categoryInfo = NeverHaveIEverQuestion.getCategoryInfo();

    // Get question counts per category
    const counts = await NeverHaveIEverQuestion.aggregate([
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
 * GET /api/games/never-have-i-ever/pending-invitation
 */
exports.getPendingInvitation = async (req, res) => {
  try {
    const userId = req.user._id;

    const invitation = await neverHaveIEverService.getPendingInvitation(userId);

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
 * GET /api/games/never-have-i-ever/active
 */
exports.getActiveSession = async (req, res) => {
  try {
    const userId = req.user._id;

    const session = await neverHaveIEverService.getActiveSession(userId);

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
 * POST /api/games/never-have-i-ever/invite
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

    const result = await neverHaveIEverService.createInvitation(userId, matchId);

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
 * POST /api/games/never-have-i-ever/sessions/:sessionId/accept
 */
exports.acceptInvitation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    const session = await neverHaveIEverService.acceptInvitation(sessionId, userId);

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
      : 400;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to accept invitation'
    });
  }
};

/**
 * Decline game invitation via HTTP
 * POST /api/games/never-have-i-ever/sessions/:sessionId/decline
 */
exports.declineInvitation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    const session = await neverHaveIEverService.declineInvitation(sessionId, userId);

    res.status(200).json({
      success: true,
      message: 'Game invitation declined',
      data: {
        sessionId: session.sessionId,
        status: session.status
      }
    });

  } catch (error) {
    logger.error('Error declining invitation:', error);

    const statusCode = error.message.includes('not found') ? 404
      : error.message.includes('Only the invited') ? 403
      : 400;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to decline invitation'
    });
  }
};

/**
 * Abandon game
 * POST /api/games/never-have-i-ever/sessions/:sessionId/abandon
 */
exports.abandonGame = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    const session = await neverHaveIEverService.abandonGame(sessionId, userId);

    res.status(200).json({
      success: true,
      message: 'Game abandoned',
      data: {
        sessionId: session.sessionId,
        status: session.status
      }
    });

  } catch (error) {
    logger.error('Error abandoning game:', error);

    const statusCode = error.message.includes('not found') ? 404 : 400;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to abandon game'
    });
  }
};

// =====================================================
// SESSION DETAILS
// =====================================================

/**
 * Get session details
 * GET /api/games/never-have-i-ever/sessions/:sessionId
 */
exports.getSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Verify user is participant
    const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    const userIdStr = userId.toString();

    if (userIdStr !== p1Id && userIdStr !== p2Id) {
      return res.status(403).json({
        success: false,
        message: 'You are not a participant in this game'
      });
    }

    const isPlayer1 = userIdStr === p1Id;
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
        totalIHave: you.totalIHave,
        totalIHavent: you.totalIHavent,
        discoveryPoints: you.discoveryPoints
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
      const question = await NeverHaveIEverQuestion.findOne({ questionNumber });

      response.currentQuestion = {
        index: session.currentQuestionIndex,
        number: questionNumber,
        category: question.category,
        statementText: question.statementText,
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
 * GET /api/games/never-have-i-ever/sessions/:sessionId/results
 */
exports.getResults = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    // Verify user is participant
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

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
        message: 'You are not a participant in this game'
      });
    }

    const results = await neverHaveIEverService.getResults(sessionId);

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

// =====================================================
// GAME HISTORY
// =====================================================

/**
 * Get user's game history
 * GET /api/games/never-have-i-ever/history
 */
exports.getGameHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const limit = parseInt(req.query.limit) || 10;

    const history = await neverHaveIEverService.getGameHistory(userId, limit);

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
 * Upload voice note for discussion
 * POST /api/games/never-have-i-ever/sessions/:sessionId/voice-notes
 * Body: multipart/form-data with 'audio' file
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

    // Verify user is participant
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

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
        message: 'You are not a participant in this game'
      });
    }

    // Upload to S3 (using existing upload service)
    const s3Service = require('../../services/s3.service');
    const audioUrl = await s3Service.uploadFile(req.file, 'voice-notes/never-have-i-ever');

    // Get duration from request body (frontend should calculate)
    const duration = parseInt(req.body.duration) || 0;

    await neverHaveIEverService.addVoiceNote(sessionId, userId, audioUrl, duration);

    res.status(201).json({
      success: true,
      message: 'Voice note uploaded',
      data: {
        audioUrl,
        duration
      }
    });

  } catch (error) {
    logger.error('Error uploading voice note:', error);

    const statusCode = error.message.includes('not found') ? 404
      : error.message.includes('only available') ? 400
      : 500;

    res.status(statusCode).json({
      success: false,
      message: error.message || 'Failed to upload voice note'
    });
  }
};

/**
 * Get voice notes for session
 * GET /api/games/never-have-i-ever/sessions/:sessionId/voice-notes
 */
exports.getVoiceNotes = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    // Verify user is participant
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);

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
        message: 'You are not a participant in this game'
      });
    }

    const voiceNotes = await neverHaveIEverService.getVoiceNotes(sessionId);

    res.status(200).json({
      success: true,
      count: voiceNotes.length,
      data: voiceNotes
    });

  } catch (error) {
    logger.error('Error fetching voice notes:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch voice notes'
    });
  }
};

/**
 * Mark voice note as listened
 * POST /api/games/never-have-i-ever/sessions/:sessionId/voice-notes/:oduserId/listened
 */
exports.markVoiceNoteListened = async (req, res) => {
  try {
    const listenerId = req.user._id;
    const { sessionId, oduserId } = req.params;

    await neverHaveIEverService.markVoiceNoteListened(sessionId, oduserId, listenerId);

    res.status(200).json({
      success: true,
      message: 'Voice note marked as listened'
    });

  } catch (error) {
    logger.error('Error marking voice note listened:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark voice note as listened'
    });
  }
};