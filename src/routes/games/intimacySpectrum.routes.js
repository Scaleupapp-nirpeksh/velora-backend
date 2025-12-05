// src/routes/games/intimacySpectrum.routes.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const intimacySpectrumController = require('../../controllers/games/intimacySpectrum.controller');
const { authenticate } = require('../../middleware/auth.middleware');

/**
 * INTIMACY SPECTRUM ROUTES
 * 
 * REST API routes for the Intimacy Spectrum slider game.
 * All routes require authentication.
 * 
 * Base path: /api/games/intimacy-spectrum
 * 
 * Note: Real-time gameplay is handled via Socket.io
 * These routes handle setup, results, and voice notes.
 */

// Configure multer for voice note uploads
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept common audio formats
  const allowedMimes = [
    'audio/mpeg',       // mp3
    'audio/mp4',        // m4a
    'audio/x-m4a',      // m4a variant
    'audio/wav',        // wav
    'audio/webm',       // webm
    'audio/ogg',        // ogg
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid audio format. Allowed: mp3, m4a, wav, webm, ogg'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  }
});

// Apply authentication to all routes
router.use(authenticate);

// =====================================================
// QUESTIONS & CATEGORIES
// =====================================================

/**
 * @route   GET /api/games/intimacy-spectrum/questions
 * @desc    Get all questions (optionally filter by category or spice level)
 * @access  Private
 * @query   category - Optional category filter
 * @query   spiceLevel - Optional spice level filter (1, 2, or 3)
 */
router.get('/questions', intimacySpectrumController.getQuestions);

/**
 * @route   GET /api/games/intimacy-spectrum/categories
 * @desc    Get all categories with question counts and info
 * @access  Private
 */
router.get('/categories', intimacySpectrumController.getCategories);

// =====================================================
// GAME STATE
// =====================================================

/**
 * @route   GET /api/games/intimacy-spectrum/pending-invitation
 * @desc    Check if user has a pending game invitation
 * @access  Private
 */
router.get('/pending-invitation', intimacySpectrumController.getPendingInvitation);

/**
 * @route   GET /api/games/intimacy-spectrum/active
 * @desc    Get user's active game session (if any)
 * @access  Private
 */
router.get('/active', intimacySpectrumController.getActiveSession);

/**
 * @route   GET /api/games/intimacy-spectrum/history
 * @desc    Get user's completed game history
 * @access  Private
 * @query   limit - Max number of results (default: 10, max: 50)
 */
router.get('/history', intimacySpectrumController.getHistory);

// =====================================================
// INVITATIONS (HTTP Fallback for Socket)
// =====================================================

/**
 * @route   POST /api/games/intimacy-spectrum/invite
 * @desc    Create a game invitation
 * @access  Private
 * @body    { matchId: ObjectId }
 */
router.post('/invite', intimacySpectrumController.createInvitation);

/**
 * @route   POST /api/games/intimacy-spectrum/sessions/:sessionId/accept
 * @desc    Accept a game invitation
 * @access  Private
 */
router.post('/sessions/:sessionId/accept', intimacySpectrumController.acceptInvitation);

/**
 * @route   POST /api/games/intimacy-spectrum/sessions/:sessionId/decline
 * @desc    Decline a game invitation
 * @access  Private
 */
router.post('/sessions/:sessionId/decline', intimacySpectrumController.declineInvitation);

// =====================================================
// SESSION DETAILS
// =====================================================

/**
 * @route   GET /api/games/intimacy-spectrum/sessions/:sessionId
 * @desc    Get session details (for reconnection or status check)
 * @access  Private
 */
router.get('/sessions/:sessionId', intimacySpectrumController.getSession);

/**
 * @route   GET /api/games/intimacy-spectrum/sessions/:sessionId/results
 * @desc    Get game results (after completion)
 * @access  Private
 */
router.get('/sessions/:sessionId/results', intimacySpectrumController.getResults);

/**
 * @route   GET /api/games/intimacy-spectrum/sessions/:sessionId/detailed
 * @desc    Get detailed question-by-question breakdown
 * @access  Private
 */
router.get('/sessions/:sessionId/detailed', intimacySpectrumController.getDetailedResults);

/**
 * @route   GET /api/games/intimacy-spectrum/sessions/:sessionId/insights
 * @desc    Get AI-generated compatibility insights
 * @access  Private
 */
router.get('/sessions/:sessionId/insights', intimacySpectrumController.getAiInsights);

// =====================================================
// VOICE NOTES
// =====================================================

/**
 * @route   POST /api/games/intimacy-spectrum/sessions/:sessionId/voice-notes
 * @desc    Upload a voice note (max 60 seconds)
 * @access  Private
 * @body    Multipart form with 'audio' file and 'duration' field
 */
router.post(
  '/sessions/:sessionId/voice-notes',
  upload.single('audio'),
  intimacySpectrumController.uploadVoiceNote
);

/**
 * @route   GET /api/games/intimacy-spectrum/sessions/:sessionId/voice-notes
 * @desc    Get all voice notes for a session
 * @access  Private
 */
router.get('/sessions/:sessionId/voice-notes', intimacySpectrumController.getVoiceNotes);

module.exports = router;