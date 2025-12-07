// src/routes/games/whatWouldYouDo.routes.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const whatWouldYouDoController = require('../../controllers/games/whatWouldYouDo.controller');
const { authenticate } = require('../../middleware/auth.middleware');

/**
 * WHAT WOULD YOU DO - GAME ROUTES
 * 
 * All routes require authentication.
 * Voice note uploads use multer with memory storage.
 * 
 * Base path: /api/games/what-would-you-do
 */

// Configure multer for voice note uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Accept common audio formats
    const allowedMimeTypes = [
      'audio/mp4',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/webm',
      'audio/ogg',
      'audio/aac'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid audio format. Supported: m4a, mp3, wav, webm, ogg, aac'), false);
    }
  }
});

// Apply auth middleware to all routes
router.use(authenticate);

// =====================================================
// GAME INFO
// =====================================================

/**
 * GET /api/games/what-would-you-do/info
 * Get game information and how-it-works
 */
router.get('/info', (req, res) => whatWouldYouDoController.getGameInfo(req, res));

/**
 * GET /api/games/what-would-you-do/questions
 * Get all questions (admin/debug)
 */
router.get('/questions', (req, res) => whatWouldYouDoController.getAllQuestions(req, res));

// =====================================================
// INVITATIONS
// =====================================================

/**
 * POST /api/games/what-would-you-do/invite
 * Create a new game invitation
 * Body: { matchId: string }
 */
router.post('/invite', (req, res) => whatWouldYouDoController.createInvitation(req, res));

/**
 * GET /api/games/what-would-you-do/pending
 * Get pending invitation for current user
 */
router.get('/pending', (req, res) => whatWouldYouDoController.getPendingInvitation(req, res));

/**
 * POST /api/games/what-would-you-do/accept/:sessionId
 * Accept a game invitation
 */
router.post('/accept/:sessionId', (req, res) => whatWouldYouDoController.acceptInvitation(req, res));

/**
 * POST /api/games/what-would-you-do/decline/:sessionId
 * Decline a game invitation
 */
router.post('/decline/:sessionId', (req, res) => whatWouldYouDoController.declineInvitation(req, res));

// =====================================================
// GAME STATE
// =====================================================

/**
 * GET /api/games/what-would-you-do/active
 * Get active game for current user
 */
router.get('/active', (req, res) => whatWouldYouDoController.getActiveSession(req, res));

/**
 * GET /api/games/what-would-you-do/session/:sessionId
 * Get specific session state
 */
router.get('/session/:sessionId', (req, res) => whatWouldYouDoController.getSessionState(req, res));

// =====================================================
// QUESTIONS & ANSWERS
// =====================================================

/**
 * GET /api/games/what-would-you-do/question/:sessionId/:questionNumber
 * Get a specific question for answering
 */
router.get('/question/:sessionId/:questionNumber', (req, res) => whatWouldYouDoController.getQuestion(req, res));

/**
 * POST /api/games/what-would-you-do/answer/:sessionId
 * Submit a voice note answer
 * 
 * Multipart form data:
 * - voiceNote: audio file (required)
 * - questionNumber: number 1-15 (required)
 * - duration: number in seconds (required)
 */
router.post(
  '/answer/:sessionId',
  upload.single('voiceNote'),
  (req, res) => whatWouldYouDoController.submitAnswer(req, res)
);

/**
 * POST /api/games/what-would-you-do/retry-transcription/:sessionId
 * Retry transcription for a specific answer
 * Body: { questionNumber: number }
 */
router.post('/retry-transcription/:sessionId', (req, res) => whatWouldYouDoController.retryTranscription(req, res));

// =====================================================
// RESULTS
// =====================================================

/**
 * GET /api/games/what-would-you-do/results/:sessionId
 * Get full results for a completed game
 */
router.get('/results/:sessionId', (req, res) => whatWouldYouDoController.getResults(req, res));

/**
 * GET /api/games/what-would-you-do/history
 * Get completed games history
 * Query: ?limit=10
 */
router.get('/history', (req, res) => whatWouldYouDoController.getGameHistory(req, res));

// =====================================================
// DISCUSSION
// =====================================================

/**
 * GET /api/games/what-would-you-do/discussion/:sessionId
 * Get all discussion notes for a session
 */
router.get('/discussion/:sessionId', (req, res) => whatWouldYouDoController.getDiscussionNotes(req, res));

/**
 * POST /api/games/what-would-you-do/discussion/:sessionId
 * Add a discussion voice note
 * 
 * Multipart form data:
 * - voiceNote: audio file (required)
 * - duration: number in seconds (required)
 * - questionNumber: number 1-15 (optional, for question-specific discussion)
 */
router.post(
  '/discussion/:sessionId',
  upload.single('voiceNote'),
  (req, res) => whatWouldYouDoController.addDiscussionNote(req, res)
);

/**
 * POST /api/games/what-would-you-do/discussion/:sessionId/listened/:noteIndex
 * Mark a discussion note as listened
 */
router.post('/discussion/:sessionId/listened/:noteIndex', (req, res) => whatWouldYouDoController.markNoteListened(req, res));

// =====================================================
// GAME MANAGEMENT
// =====================================================

/**
 * POST /api/games/what-would-you-do/abandon/:sessionId
 * Abandon an active game
 */
router.post('/abandon/:sessionId', (req, res) => whatWouldYouDoController.abandonGame(req, res));

// =====================================================
// ERROR HANDLING FOR MULTER
// =====================================================

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'Voice note must be under 10MB'
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Only one voice note allowed per request'
      });
    }
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`
    });
  }
  
  if (err.message && err.message.includes('Invalid audio format')) {
    return res.status(400).json({
      success: false,
      message: err.message
    });
  }

  next(err);
});

module.exports = router;