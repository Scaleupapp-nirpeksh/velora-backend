// src/controllers/games/wouldYouRather.controller.js

const wouldYouRatherService = require('../../services/games/wouldYouRather.service');
const WouldYouRatherSession = require('../../models/games/WouldYouRatherSession');
const WouldYouRatherQuestion = require('../../models/games/WouldYouRatherQuestion');
const s3Service = require('../../services/s3.service');
const logger = require('../../utils/logger');

/**
 * WOULD YOU RATHER HTTP CONTROLLER
 * 
 * REST API endpoints for the Would You Rather game.
 * 
 * Note: Most gameplay happens via Socket.io (real-time).
 * These endpoints handle:
 * - Fetching results after game completion
 * - Getting AI insights
 * - Game history
 * - Voice note uploads
 * - Checking pending invitations (for app launch)
 */

/**
 * Get all questions (for admin/debug purposes)
 * GET /api/games/would-you-rather/questions
 */
exports.getQuestions = async (req, res) => {
  try {
    const { category } = req.query;

    let questions;
    if (category) {
      questions = await WouldYouRatherQuestion.getByCategory(category);
    } else {
      questions = await WouldYouRatherQuestion.getAllActive();
    }

    res.status(200).json({
      success: true,
      count: questions.length,
      data: questions.map(q => ({
        questionNumber: q.questionNumber,
        category: q.category,
        optionA: q.optionA,
        optionB: q.optionB,
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
 * Get question categories with counts
 * GET /api/games/would-you-rather/categories
 */
exports.getCategories = async (req, res) => {
  try {
    const categories = await WouldYouRatherQuestion.aggregate([
      { $match: { isActive: true } },
      { 
        $group: { 
          _id: '$category', 
          count: { $sum: 1 },
          avgSpiceLevel: { $avg: '$spiceLevel' }
        } 
      },
      { $sort: { count: -1 } }
    ]);

    res.status(200).json({
      success: true,
      data: categories.map(cat => ({
        category: cat._id,
        questionCount: cat.count,
        avgSpiceLevel: Math.round(cat.avgSpiceLevel * 10) / 10
      }))
    });

  } catch (error) {
    logger.error('Error fetching categories:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
};

/**
 * Check for pending game invitation
 * GET /api/games/would-you-rather/pending-invitation
 */
exports.getPendingInvitation = async (req, res) => {
  try {
    const userId = req.user._id;

    const invitation = await wouldYouRatherService.getPendingInvitation(userId);

    res.status(200).json({
      success: true,
      hasPendingInvitation: !!invitation,
      data: invitation
    });

  } catch (error) {
    logger.error('Error checking pending invitation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check pending invitations'
    });
  }
};

/**
 * Get active game session (if any)
 * GET /api/games/would-you-rather/active
 */
exports.getActiveSession = async (req, res) => {
  try {
    const userId = req.user._id;

    const session = await wouldYouRatherService.getActiveSession(userId);

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
 * Get game results
 * GET /api/games/would-you-rather/sessions/:sessionId/results
 */
exports.getResults = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    const results = await wouldYouRatherService.getResults(sessionId, userId);

    res.status(200).json({
      success: true,
      data: results
    });

  } catch (error) {
    logger.error('Error fetching results:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: error.message || 'Failed to fetch results'
    });
  }
};

/**
 * Get detailed answer breakdown
 * GET /api/games/would-you-rather/sessions/:sessionId/detailed
 */
exports.getDetailedResults = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    const detailed = await wouldYouRatherService.getDetailedResults(sessionId, userId);

    res.status(200).json({
      success: true,
      data: detailed
    });

  } catch (error) {
    logger.error('Error fetching detailed results:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: error.message || 'Failed to fetch detailed results'
    });
  }
};

/**
 * Get or generate AI insights
 * GET /api/games/would-you-rather/sessions/:sessionId/insights
 */
exports.getAiInsights = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    // First verify user is a player
    const session = await WouldYouRatherSession.findOne({ sessionId });
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    const isPlayer = 
      session.player1.userId.toString() === userId.toString() ||
      session.player2.userId.toString() === userId.toString();

    if (!isPlayer) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this game'
      });
    }

    if (!['completed', 'discussion'].includes(session.status)) {
      return res.status(400).json({
        success: false,
        message: 'Game is not completed yet'
      });
    }

    // Check if insights already exist
    if (session.aiInsights?.generatedAt) {
      return res.status(200).json({
        success: true,
        data: session.aiInsights
      });
    }

    // Generate new insights
    const insights = await wouldYouRatherService.generateAiInsights(sessionId);

    res.status(200).json({
      success: true,
      data: insights
    });

  } catch (error) {
    logger.error('Error fetching AI insights:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to fetch AI insights'
    });
  }
};

/**
 * Get game history for current user
 * GET /api/games/would-you-rather/history
 */
exports.getGameHistory = async (req, res) => {
  try {
    const userId = req.user._id;
    const { limit = 20 } = req.query;

    const history = await wouldYouRatherService.getGameHistory(
      userId, 
      parseInt(limit)
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

/**
 * Get game history with a specific match
 * GET /api/games/would-you-rather/history/:matchId
 */
exports.getMatchHistory = async (req, res) => {
  try {
    const { matchId } = req.params;

    if (!matchId) {
      return res.status(400).json({
        success: false,
        message: 'Match ID is required'
      });
    }

    const history = await WouldYouRatherSession.getMatchHistory(matchId);

    res.status(200).json({
      success: true,
      count: history.length,
      data: history
    });

  } catch (error) {
    logger.error('Error fetching match history:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch match history'
    });
  }
};

/**
 * Upload voice note for a session
 * POST /api/games/would-you-rather/sessions/:sessionId/voice-notes
 * Body: multipart/form-data with 'audio' file
 */
exports.uploadVoiceNote = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Audio file is required'
      });
    }

    // Validate file type
    const allowedMimeTypes = ['audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/webm', 'audio/ogg'];
    if (!allowedMimeTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid audio format. Allowed: mp3, mp4, wav, webm, ogg'
      });
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'Audio file too large. Maximum size is 5MB'
      });
    }

    // Get duration from request body (frontend should calculate this)
    const duration = parseInt(req.body.duration) || 0;
    
    if (duration <= 0 || duration > 60) {
      return res.status(400).json({
        success: false,
        message: 'Duration must be between 1 and 60 seconds'
      });
    }

    // Upload to S3
    const key = `games/wyr/${sessionId}/voice-notes/${userId}-${Date.now()}.${getFileExtension(req.file.mimetype)}`;
    
    const audioUrl = await s3Service.uploadFile(
      req.file.buffer,
      key,
      req.file.mimetype
    );

    // Add voice note to session
    const result = await wouldYouRatherService.addVoiceNote(
      sessionId,
      userId,
      audioUrl,
      duration
    );

    res.status(201).json({
      success: true,
      message: 'Voice note uploaded successfully',
      data: {
        audioUrl,
        duration,
        voiceNoteCount: result.voiceNotes.length
      }
    });

  } catch (error) {
    logger.error('Error uploading voice note:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: error.message || 'Failed to upload voice note'
    });
  }
};

/**
 * Get voice notes for a session
 * GET /api/games/would-you-rather/sessions/:sessionId/voice-notes
 */
exports.getVoiceNotes = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    const voiceNotes = await wouldYouRatherService.getVoiceNotes(sessionId, userId);

    res.status(200).json({
      success: true,
      count: voiceNotes.length,
      data: voiceNotes
    });

  } catch (error) {
    logger.error('Error fetching voice notes:', error);
    res.status(error.message.includes('not found') ? 404 : 500).json({
      success: false,
      message: error.message || 'Failed to fetch voice notes'
    });
  }
};

/**
 * Get session details (for reconnection)
 * GET /api/games/would-you-rather/sessions/:sessionId
 */
exports.getSession = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    const session = await WouldYouRatherSession.findBySessionId(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }

    // Verify user is a player
    const isPlayer1 = session.player1.userId._id.toString() === userId.toString();
    const isPlayer2 = session.player2.userId._id.toString() === userId.toString();

    if (!isPlayer1 && !isPlayer2) {
      return res.status(403).json({
        success: false,
        message: 'You are not a player in this game'
      });
    }

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
        totalQuestions: 50,
        percent: Math.round((session.currentQuestionIndex / 50) * 100)
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
      const question = await WouldYouRatherQuestion.findOne({ questionNumber });

      response.currentQuestion = {
        index: session.currentQuestionIndex,
        number: questionNumber,
        category: question.category,
        optionA: question.optionA,
        optionB: question.optionB,
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

/**
 * Create game invitation via HTTP (alternative to socket)
 * POST /api/games/would-you-rather/invite
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

    const result = await wouldYouRatherService.createInvitation(userId, matchId);

    res.status(201).json({
      success: true,
      message: 'Game invitation sent',
      data: result
    });

  } catch (error) {
    logger.error('Error creating invitation:', error);
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      message: error.message || 'Failed to create invitation'
    });
  }
};

/**
 * Accept invitation via HTTP (alternative to socket)
 * POST /api/games/would-you-rather/sessions/:sessionId/accept
 */
exports.acceptInvitation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    const result = await wouldYouRatherService.acceptInvitation(sessionId, userId);

    res.status(200).json({
      success: true,
      message: 'Game invitation accepted',
      data: result
    });

  } catch (error) {
    logger.error('Error accepting invitation:', error);
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      message: error.message || 'Failed to accept invitation'
    });
  }
};

/**
 * Decline invitation via HTTP (alternative to socket)
 * POST /api/games/would-you-rather/sessions/:sessionId/decline
 */
exports.declineInvitation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        success: false,
        message: 'Session ID is required'
      });
    }

    const result = await wouldYouRatherService.declineInvitation(sessionId, userId);

    res.status(200).json({
      success: true,
      message: 'Game invitation declined',
      data: result
    });

  } catch (error) {
    logger.error('Error declining invitation:', error);
    res.status(error.message.includes('not found') ? 404 : 400).json({
      success: false,
      message: error.message || 'Failed to decline invitation'
    });
  }
};

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get file extension from MIME type
 */
function getFileExtension(mimeType) {
  const extensions = {
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/wav': 'wav',
    'audio/webm': 'webm',
    'audio/ogg': 'ogg'
  };
  return extensions[mimeType] || 'mp3';
}