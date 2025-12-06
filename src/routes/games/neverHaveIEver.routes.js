// src/routes/games/neverHaveIEver.routes.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const neverHaveIEverController = require('../../controllers/games/neverHaveIEver.controller');
const { authenticate } = require('../../middleware/auth.middleware');

/**
 * NEVER HAVE I EVER ROUTES
 * 
 * REST API routes for the Never Have I Ever discovery game.
 * All routes require authentication.
 * 
 * Base path: /api/games/never-have-i-ever
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
 * @route   GET /api/games/never-have-i-ever/questions
 * @desc    Get all questions (optionally filter by category or spice level)
 * @access  Private
 * @query   category - Optional category filter
 * @query   spiceLevel - Optional spice level filter (2 or 3)
 */
router.get('/questions', neverHaveIEverController.getQuestions);

/**
 * @route   GET /api/games/never-have-i-ever/categories
 * @desc    Get all categories with question counts and info
 * @access  Private
 */
router.get('/categories', neverHaveIEverController.getCategories);

// =====================================================
// GAME STATE
// =====================================================

/**
 * @route   GET /api/games/never-have-i-ever/pending-invitation
 * @desc    Check if user has a pending game invitation
 * @access  Private
 */
router.get('/pending-invitation', neverHaveIEverController.getPendingInvitation);

/**
 * @route   GET /api/games/never-have-i-ever/active
 * @desc    Get user's active game session (if any)
 * @access  Private
 */
router.get('/active', neverHaveIEverController.getActiveSession);

/**
 * @route   GET /api/games/never-have-i-ever/history
 * @desc    Get user's completed game history
 * @access  Private
 * @query   limit - Max number of games to return (default: 10)
 */
router.get('/history', neverHaveIEverController.getGameHistory);

// =====================================================
// INVITATIONS
// =====================================================

/**
 * @route   POST /api/games/never-have-i-ever/invite
 * @desc    Create a new game invitation
 * @access  Private
 * @body    { matchId: ObjectId }
 */
router.post('/invite', neverHaveIEverController.createInvitation);

// =====================================================
// SESSION ACTIONS
// =====================================================

/**
 * @route   GET /api/games/never-have-i-ever/sessions/:sessionId
 * @desc    Get session details
 * @access  Private (participants only)
 */
router.get('/sessions/:sessionId', neverHaveIEverController.getSession);

/**
 * @route   POST /api/games/never-have-i-ever/sessions/:sessionId/accept
 * @desc    Accept a game invitation
 * @access  Private (invited player only)
 */
router.post('/sessions/:sessionId/accept', neverHaveIEverController.acceptInvitation);

/**
 * @route   POST /api/games/never-have-i-ever/sessions/:sessionId/decline
 * @desc    Decline a game invitation
 * @access  Private (invited player only)
 */
router.post('/sessions/:sessionId/decline', neverHaveIEverController.declineInvitation);

/**
 * @route   POST /api/games/never-have-i-ever/sessions/:sessionId/abandon
 * @desc    Abandon an active game
 * @access  Private (participants only)
 */
router.post('/sessions/:sessionId/abandon', neverHaveIEverController.abandonGame);

// =====================================================
// RESULTS
// =====================================================

/**
 * @route   GET /api/games/never-have-i-ever/sessions/:sessionId/results
 * @desc    Get game results (after completion)
 * @access  Private (participants only)
 */
router.get('/sessions/:sessionId/results', neverHaveIEverController.getResults);

// =====================================================
// VOICE NOTES
// =====================================================

/**
 * @route   POST /api/games/never-have-i-ever/sessions/:sessionId/voice-notes
 * @desc    Upload a voice note for discussion
 * @access  Private (participants only)
 * @body    multipart/form-data with 'audio' file and 'duration' field
 */
router.post(
  '/sessions/:sessionId/voice-notes',
  upload.single('audio'),
  neverHaveIEverController.uploadVoiceNote
);

/**
 * @route   GET /api/games/never-have-i-ever/sessions/:sessionId/voice-notes
 * @desc    Get all voice notes for a session
 * @access  Private (participants only)
 */
router.get('/sessions/:sessionId/voice-notes', neverHaveIEverController.getVoiceNotes);

/**
 * @route   POST /api/games/never-have-i-ever/sessions/:sessionId/voice-notes/:oduserId/listened
 * @desc    Mark a voice note as listened
 * @access  Private (participants only)
 */
router.post(
  '/sessions/:sessionId/voice-notes/:oduserId/listened',
  neverHaveIEverController.markVoiceNoteListened
);

module.exports = router;