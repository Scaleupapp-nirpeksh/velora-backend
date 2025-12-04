// src/routes/games/wouldYouRather.routes.js

const express = require('express');
const router = express.Router();
const multer = require('multer');

const wouldYouRatherController = require('../../controllers/games/wouldYouRather.controller');
const { authenticate } = require('../../middleware/auth.middleware');

/**
 * WOULD YOU RATHER ROUTES
 * 
 * Base path: /api/games/would-you-rather
 * 
 * All routes require authentication.
 * 
 * Routes:
 * 
 * Questions & Categories:
 * - GET  /questions              - Get all questions (admin/debug)
 * - GET  /categories             - Get categories with counts
 * 
 * Game State:
 * - GET  /pending-invitation     - Check for pending invitation
 * - GET  /active                 - Get active session (if any)
 * 
 * Invitations (HTTP fallback for Socket):
 * - POST /invite                 - Create game invitation
 * - POST /sessions/:sessionId/accept   - Accept invitation
 * - POST /sessions/:sessionId/decline  - Decline invitation
 * 
 * Session Details:
 * - GET  /sessions/:sessionId           - Get session details
 * - GET  /sessions/:sessionId/results   - Get game results
 * - GET  /sessions/:sessionId/detailed  - Get detailed breakdown
 * - GET  /sessions/:sessionId/insights  - Get AI insights
 * 
 * Voice Notes:
 * - GET  /sessions/:sessionId/voice-notes  - Get voice notes
 * - POST /sessions/:sessionId/voice-notes  - Upload voice note
 * 
 * History:
 * - GET  /history                - Get user's game history
 * - GET  /history/:matchId       - Get history with specific match
 */

// =====================================================
// MULTER CONFIG FOR VOICE NOTE UPLOADS
// =====================================================

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'audio/mpeg',      // mp3
    'audio/mp4',       // m4a
    'audio/wav',       // wav
    'audio/webm',      // webm
    'audio/ogg'        // ogg
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only audio files are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

// =====================================================
// QUESTIONS & CATEGORIES
// =====================================================

/**
 * @route   GET /api/games/would-you-rather/questions
 * @desc    Get all questions (optionally filter by category)
 * @access  Private
 * @query   category - Optional category filter
 */
router.get('/questions', authenticate, wouldYouRatherController.getQuestions);

/**
 * @route   GET /api/games/would-you-rather/categories
 * @desc    Get all categories with question counts
 * @access  Private
 */
router.get('/categories', authenticate, wouldYouRatherController.getCategories);

// =====================================================
// GAME STATE
// =====================================================

/**
 * @route   GET /api/games/would-you-rather/pending-invitation
 * @desc    Check if user has a pending game invitation
 * @access  Private
 */
router.get('/pending-invitation', authenticate, wouldYouRatherController.getPendingInvitation);

/**
 * @route   GET /api/games/would-you-rather/active
 * @desc    Get user's active game session (if any)
 * @access  Private
 */
router.get('/active', authenticate, wouldYouRatherController.getActiveSession);

// =====================================================
// INVITATIONS (HTTP Fallback for Socket)
// =====================================================

/**
 * @route   POST /api/games/would-you-rather/invite
 * @desc    Create a game invitation
 * @access  Private
 * @body    { matchId: ObjectId }
 */
router.post('/invite', authenticate, wouldYouRatherController.createInvitation);

/**
 * @route   POST /api/games/would-you-rather/sessions/:sessionId/accept
 * @desc    Accept a game invitation
 * @access  Private
 */
router.post('/sessions/:sessionId/accept', authenticate, wouldYouRatherController.acceptInvitation);

/**
 * @route   POST /api/games/would-you-rather/sessions/:sessionId/decline
 * @desc    Decline a game invitation
 * @access  Private
 */
router.post('/sessions/:sessionId/decline', authenticate, wouldYouRatherController.declineInvitation);

// =====================================================
// SESSION DETAILS
// =====================================================

/**
 * @route   GET /api/games/would-you-rather/sessions/:sessionId
 * @desc    Get session details (for reconnection or status check)
 * @access  Private
 */
router.get('/sessions/:sessionId', authenticate, wouldYouRatherController.getSession);

/**
 * @route   GET /api/games/would-you-rather/sessions/:sessionId/results
 * @desc    Get game results (after completion)
 * @access  Private
 */
router.get('/sessions/:sessionId/results', authenticate, wouldYouRatherController.getResults);

/**
 * @route   GET /api/games/would-you-rather/sessions/:sessionId/detailed
 * @desc    Get detailed question-by-question breakdown
 * @access  Private
 */
router.get('/sessions/:sessionId/detailed', authenticate, wouldYouRatherController.getDetailedResults);

/**
 * @route   GET /api/games/would-you-rather/sessions/:sessionId/insights
 * @desc    Get AI-generated compatibility insights
 * @access  Private
 */
router.get('/sessions/:sessionId/insights', authenticate, wouldYouRatherController.getAiInsights);

// =====================================================
// VOICE NOTES
// =====================================================

/**
 * @route   GET /api/games/would-you-rather/sessions/:sessionId/voice-notes
 * @desc    Get all voice notes for a session
 * @access  Private
 */
router.get('/sessions/:sessionId/voice-notes', authenticate, wouldYouRatherController.getVoiceNotes);

/**
 * @route   POST /api/games/would-you-rather/sessions/:sessionId/voice-notes
 * @desc    Upload a voice note for post-game discussion
 * @access  Private
 * @body    multipart/form-data with 'audio' file and 'duration' field
 */
router.post(
  '/sessions/:sessionId/voice-notes',
  authenticate,
  upload.single('audio'),
  wouldYouRatherController.uploadVoiceNote
);

// =====================================================
// HISTORY
// =====================================================

/**
 * @route   GET /api/games/would-you-rather/history
 * @desc    Get user's game history
 * @access  Private
 * @query   limit - Max results (default: 20)
 */
router.get('/history', authenticate, wouldYouRatherController.getGameHistory);

/**
 * @route   GET /api/games/would-you-rather/history/:matchId
 * @desc    Get game history with a specific match
 * @access  Private
 */
router.get('/history/:matchId', authenticate, wouldYouRatherController.getMatchHistory);

// =====================================================
// ERROR HANDLER FOR MULTER
// =====================================================

router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB'
      });
    }
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }
  
  if (error.message === 'Invalid file type. Only audio files are allowed.') {
    return res.status(400).json({
      success: false,
      message: error.message
    });
  }

  next(error);
});

module.exports = router;