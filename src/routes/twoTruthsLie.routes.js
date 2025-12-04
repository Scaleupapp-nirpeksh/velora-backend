const express = require('express');
const router = express.Router();
const multer = require('multer');
const twoTruthsLieController = require('../controllers/twoTruthsLie.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * Two Truths & A Lie Routes
 * 
 * All routes require authentication via the protect middleware.
 * 
 * Base path: /api/v1/games/two-truths-lie
 */

// Configure multer for voice note uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB max
  },
  fileFilter: (req, file, cb) => {
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
  },
});

// Apply authentication to all routes
router.use(authenticate);

// ==================== GAME MANAGEMENT ====================

/**
 * @route   POST /api/v1/games/two-truths-lie/start
 * @desc    Start a new game with a matched partner
 * @access  Private
 * @body    { partnerId: ObjectId }
 */
router.post(
  '/start',
  twoTruthsLieController.startGame
);

/**
 * @route   GET /api/v1/games/two-truths-lie/active
 * @desc    Get all active games for current user
 * @access  Private
 */
router.get(
  '/active',
  twoTruthsLieController.getActiveGames
);

/**
 * @route   GET /api/v1/games/two-truths-lie/pending
 * @desc    Get pending invitations for current user
 * @access  Private
 */
router.get(
  '/pending',
  twoTruthsLieController.getPendingInvitations
);

/**
 * @route   GET /api/v1/games/two-truths-lie/history
 * @desc    Get completed games history
 * @access  Private
 * @query   { page, limit, partnerId }
 */
router.get(
  '/history',
  twoTruthsLieController.getHistory
);

/**
 * @route   GET /api/v1/games/two-truths-lie/stats
 * @desc    Get user's game statistics
 * @access  Private
 */
router.get(
  '/stats',
  twoTruthsLieController.getStats
);

/**
 * @route   GET /api/v1/games/two-truths-lie/:gameId
 * @desc    Get game details by ID
 * @access  Private (participants only)
 */
router.get(
  '/:gameId',
  twoTruthsLieController.getGame
);

/**
 * @route   DELETE /api/v1/games/two-truths-lie/:gameId
 * @desc    Cancel a game
 * @access  Private (participants only)
 * @body    { reason?: string }
 */
router.delete(
  '/:gameId',
  twoTruthsLieController.cancelGame
);

// ==================== INVITATION HANDLING ====================

/**
 * @route   POST /api/v1/games/two-truths-lie/:gameId/accept
 * @desc    Accept game invitation
 * @access  Private (invited partner only)
 */
router.post(
  '/:gameId/accept',
  twoTruthsLieController.acceptInvitation
);

/**
 * @route   POST /api/v1/games/two-truths-lie/:gameId/decline
 * @desc    Decline game invitation
 * @access  Private (invited partner only)
 */
router.post(
  '/:gameId/decline',
  twoTruthsLieController.declineInvitation
);

// ==================== STATEMENTS PHASE ====================

/**
 * @route   POST /api/v1/games/two-truths-lie/:gameId/statements
 * @desc    Submit all 10 rounds of statements
 * @access  Private (participants only, during writing_phase)
 * @body    { rounds: [{ roundNumber, statements: [{ text, isLie }] }] }
 */
router.post(
  '/:gameId/statements',
  twoTruthsLieController.submitStatements
);

/**
 * @route   GET /api/v1/games/two-truths-lie/:gameId/my-statements
 * @desc    Get user's own submitted statements
 * @access  Private (participants only)
 */
router.get(
  '/:gameId/my-statements',
  twoTruthsLieController.getMyStatements
);

// ==================== ANSWERING PHASE ====================

/**
 * @route   GET /api/v1/games/two-truths-lie/:gameId/questions
 * @desc    Get partner's statements to answer
 * @access  Private (participants only, during/after answering_phase)
 */
router.get(
  '/:gameId/questions',
  twoTruthsLieController.getQuestions
);

/**
 * @route   POST /api/v1/games/two-truths-lie/:gameId/answers
 * @desc    Submit all 10 answers
 * @access  Private (participants only, during answering_phase)
 * @body    { answers: [{ roundNumber, selectedIndex }] }
 */
router.post(
  '/:gameId/answers',
  twoTruthsLieController.submitAnswers
);

// ==================== RESULTS & DISCUSSION ====================

/**
 * @route   GET /api/v1/games/two-truths-lie/:gameId/results
 * @desc    Get full game results with insights
 * @access  Private (participants only, after completion)
 */
router.get(
  '/:gameId/results',
  twoTruthsLieController.getResults
);

/**
 * @route   POST /api/v1/games/two-truths-lie/:gameId/voice-notes
 * @desc    Send a voice note (max 60 seconds)
 * @access  Private (participants only, after completion)
 * @body    { duration, relatedRoundNumber? }
 * @file    audio (mp3, m4a, wav, webm, ogg)
 */
router.post(
  '/:gameId/voice-notes',
  upload.single('audio'),
  twoTruthsLieController.sendVoiceNote
);

/**
 * @route   GET /api/v1/games/two-truths-lie/:gameId/voice-notes
 * @desc    Get all voice notes for a game
 * @access  Private (participants only)
 */
router.get(
  '/:gameId/voice-notes',
  twoTruthsLieController.getVoiceNotes
);

/**
 * @route   POST /api/v1/games/two-truths-lie/:gameId/voice-notes/:voiceNoteId/listened
 * @desc    Mark a voice note as listened
 * @access  Private (receiver only)
 */
router.post(
  '/:gameId/voice-notes/:voiceNoteId/listened',
  twoTruthsLieController.markVoiceNoteListened
);

// ==================== RESTART ====================

/**
 * @route   POST /api/v1/games/two-truths-lie/:gameId/restart-request
 * @desc    Request to play again
 * @access  Private (participants only, after completion)
 */
router.post(
  '/:gameId/restart-request',
  twoTruthsLieController.requestRestart
);

/**
 * @route   POST /api/v1/games/two-truths-lie/:gameId/restart-accept
 * @desc    Accept restart request
 * @access  Private (other participant only)
 */
router.post(
  '/:gameId/restart-accept',
  twoTruthsLieController.acceptRestart
);

/**
 * @route   POST /api/v1/games/two-truths-lie/:gameId/restart-decline
 * @desc    Decline restart request
 * @access  Private (other participant only)
 */
router.post(
  '/:gameId/restart-decline',
  twoTruthsLieController.declineRestart
);

// ==================== DEBUG/ADMIN ====================

/**
 * @route   POST /api/v1/games/two-truths-lie/:gameId/regenerate-insights
 * @desc    Force regenerate AI insights
 * @access  Private (participants only, for debugging)
 */
router.post(
  '/:gameId/regenerate-insights',
  twoTruthsLieController.regenerateInsights
);

// Error handling for multer
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large. Maximum size is 5MB.',
      });
    }
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
  
  if (error.message && error.message.includes('Invalid audio format')) {
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
  
  next(error);
});

module.exports = router;