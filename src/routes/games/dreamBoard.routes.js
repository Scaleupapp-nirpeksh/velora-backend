// src/routes/games/dreamBoard.routes.js

const express = require('express');
const router = express.Router();
const multer = require('multer');
const dreamBoardController = require('../../controllers/games/dreamBoard.controller');
const { authenticate } = require('../../middleware/auth.middleware');

/**
 * DREAM BOARD ROUTES
 * 
 * REST API routes for the async vision board compatibility game.
 * All routes require authentication.
 * 
 * Base path: /api/games/dream-board
 * 
 * Endpoints:
 * 
 * INFO & CATEGORIES:
 *   GET    /info                                    - Game information
 *   GET    /categories                              - All categories with cards
 * 
 * INVITATIONS:
 *   POST   /invite                                  - Create invitation
 *   GET    /pending                                 - Get pending invitation
 *   POST   /accept/:sessionId                       - Accept invitation
 *   POST   /decline/:sessionId                      - Decline invitation
 * 
 * GAME STATE:
 *   GET    /active                                  - Get active game
 *   GET    /session/:sessionId                      - Get session state
 * 
 * CARD SELECTION:
 *   GET    /category/:sessionId/:categoryNumber     - Get category with cards
 *   POST   /select/:sessionId                       - Submit card selection
 * 
 * VOICE ELABORATION (during gameplay):
 *   POST   /elaborate/:sessionId/:categoryNumber    - Add voice elaboration
 *   GET    /elaborate/:sessionId/:categoryNumber    - Get elaboration
 *   DELETE /elaborate/:sessionId/:categoryNumber    - Delete elaboration
 * 
 * RESULTS:
 *   GET    /results/:sessionId                      - Get game results
 *   GET    /history                                 - Get completed games
 * 
 * DISCUSSION (post-game):
 *   GET    /discussion/:sessionId                   - Get discussion notes
 *   POST   /discussion/:sessionId                   - Add discussion note
 *   POST   /discussion/:sessionId/listened/:noteIndex - Mark listened
 * 
 * MANAGEMENT:
 *   POST   /abandon/:sessionId                      - Abandon game
 */

// =====================================================
// MULTER CONFIGURATION FOR VOICE NOTES
// =====================================================

const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  // Accept common audio formats
  const allowedMimes = [
    'audio/mpeg',        // mp3
    'audio/mp4',         // m4a
    'audio/x-m4a',       // m4a variant
    'audio/wav',         // wav
    'audio/webm',        // webm
    'audio/ogg',         // ogg
    'audio/aac',         // aac
    'audio/x-aac'        // aac variant
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid audio format. Supported: mp3, m4a, wav, webm, ogg, aac'), false);
  }
};

// Standard upload config for discussion notes (10MB max)
const uploadDiscussion = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  }
});

// Smaller upload config for elaborations (5MB max, 2 min max)
const uploadElaboration = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max (elaborations are shorter)
  }
});

// Apply authentication to all routes
router.use(authenticate);

// =====================================================
// GAME INFO & CATEGORIES
// =====================================================

/**
 * @route   GET /api/games/dream-board/info
 * @desc    Get game information and how-it-works
 * @access  Private
 */
router.get('/info', (req, res) => dreamBoardController.getGameInfo(req, res));

/**
 * @route   GET /api/games/dream-board/categories
 * @desc    Get all categories with cards, priorities, and timelines
 * @access  Private
 */
router.get('/categories', (req, res) => dreamBoardController.getAllCategories(req, res));

// =====================================================
// INVITATIONS
// =====================================================

/**
 * @route   POST /api/games/dream-board/invite
 * @desc    Create a new game invitation
 * @access  Private
 * @body    { matchId: string }
 */
router.post('/invite', (req, res) => dreamBoardController.createInvitation(req, res));

/**
 * @route   GET /api/games/dream-board/pending
 * @desc    Get pending invitation for current user
 * @access  Private
 */
router.get('/pending', (req, res) => dreamBoardController.getPendingInvitation(req, res));

/**
 * @route   POST /api/games/dream-board/accept/:sessionId
 * @desc    Accept a game invitation
 * @access  Private
 */
router.post('/accept/:sessionId', (req, res) => dreamBoardController.acceptInvitation(req, res));

/**
 * @route   POST /api/games/dream-board/decline/:sessionId
 * @desc    Decline a game invitation
 * @access  Private
 */
router.post('/decline/:sessionId', (req, res) => dreamBoardController.declineInvitation(req, res));

// =====================================================
// GAME STATE
// =====================================================

/**
 * @route   GET /api/games/dream-board/active
 * @desc    Get active game for current user
 * @access  Private
 */
router.get('/active', (req, res) => dreamBoardController.getActiveSession(req, res));

/**
 * @route   GET /api/games/dream-board/session/:sessionId
 * @desc    Get specific session state
 * @access  Private
 */
router.get('/session/:sessionId', (req, res) => dreamBoardController.getSessionState(req, res));

// =====================================================
// CATEGORIES & CARD SELECTION
// =====================================================

/**
 * @route   GET /api/games/dream-board/category/:sessionId/:categoryNumber
 * @desc    Get a specific category with cards for selection
 * @access  Private
 * @params  sessionId - Game session UUID
 *          categoryNumber - Category number (1-10)
 */
router.get('/category/:sessionId/:categoryNumber', (req, res) => dreamBoardController.getCategory(req, res));

/**
 * @route   POST /api/games/dream-board/select/:sessionId
 * @desc    Submit a card selection for a category
 * @access  Private
 * @params  sessionId - Game session UUID
 * @body    {
 *            categoryNumber: number (1-10),
 *            cardId: string ('A', 'B', 'C', or 'D'),
 *            priority: string ('heart_set', 'dream', or 'flow'),
 *            timeline: string ('cant_wait', 'when_right', or 'someday')
 *          }
 */
router.post('/select/:sessionId', (req, res) => dreamBoardController.submitSelection(req, res));

// =====================================================
// VOICE ELABORATION (During Gameplay)
// =====================================================

/**
 * @route   POST /api/games/dream-board/elaborate/:sessionId/:categoryNumber
 * @desc    Add a voice elaboration to explain a card selection
 * @access  Private
 * @params  sessionId - Game session UUID
 *          categoryNumber - Category number (1-10)
 * 
 * Multipart form data:
 * - voiceNote: audio file (required, max 5MB)
 * - duration: number in seconds (required, max 120)
 * 
 * Notes:
 * - Must select a card for the category before adding elaboration
 * - Can only add elaborations while game is active
 * - Voice notes are transcribed using Whisper
 * - AI uses transcripts to find hidden alignments
 */
router.post(
  '/elaborate/:sessionId/:categoryNumber',
  uploadElaboration.single('voiceNote'),
  (req, res) => dreamBoardController.addElaboration(req, res)
);

/**
 * @route   GET /api/games/dream-board/elaborate/:sessionId/:categoryNumber
 * @desc    Get the voice elaboration for a specific category
 * @access  Private
 * @params  sessionId - Game session UUID
 *          categoryNumber - Category number (1-10)
 */
router.get(
  '/elaborate/:sessionId/:categoryNumber',
  (req, res) => dreamBoardController.getElaboration(req, res)
);

/**
 * @route   DELETE /api/games/dream-board/elaborate/:sessionId/:categoryNumber
 * @desc    Delete an elaboration (to re-record)
 * @access  Private
 * @params  sessionId - Game session UUID
 *          categoryNumber - Category number (1-10)
 * 
 * Notes:
 * - Can only delete while game is active
 * - After deletion, user can record a new elaboration
 */
router.delete(
  '/elaborate/:sessionId/:categoryNumber',
  (req, res) => dreamBoardController.deleteElaboration(req, res)
);

// =====================================================
// RESULTS
// =====================================================

/**
 * @route   GET /api/games/dream-board/results/:sessionId
 * @desc    Get full results for a completed game
 * @access  Private
 * 
 * Returns:
 * - Overall alignment score
 * - Per-category analysis with card comparisons
 * - AI-generated insights (aligned, close, conversation starters)
 * - Hidden alignments/concerns from voice elaborations
 * - Elaboration summaries for each category
 */
router.get('/results/:sessionId', (req, res) => dreamBoardController.getResults(req, res));

/**
 * @route   GET /api/games/dream-board/history
 * @desc    Get completed games history
 * @access  Private
 * @query   limit - Max number of games to return (default: 10)
 */
router.get('/history', (req, res) => dreamBoardController.getGameHistory(req, res));

// =====================================================
// DISCUSSION VOICE NOTES (Post-Game)
// =====================================================

/**
 * @route   GET /api/games/dream-board/discussion/:sessionId
 * @desc    Get all discussion notes for a session
 * @access  Private
 */
router.get('/discussion/:sessionId', (req, res) => dreamBoardController.getDiscussionNotes(req, res));

/**
 * @route   POST /api/games/dream-board/discussion/:sessionId
 * @desc    Add a discussion voice note (after game completion)
 * @access  Private
 * 
 * Multipart form data:
 * - voiceNote: audio file (required, max 10MB)
 * - duration: number in seconds (required)
 * - categoryNumber: number 1-10 (optional, for category-specific discussion)
 */
router.post(
  '/discussion/:sessionId',
  uploadDiscussion.single('voiceNote'),
  (req, res) => dreamBoardController.addDiscussionNote(req, res)
);

/**
 * @route   POST /api/games/dream-board/discussion/:sessionId/listened/:noteIndex
 * @desc    Mark a discussion note as listened
 * @access  Private
 */
router.post(
  '/discussion/:sessionId/listened/:noteIndex',
  (req, res) => dreamBoardController.markNoteListened(req, res)
);

// =====================================================
// GAME MANAGEMENT
// =====================================================

/**
 * @route   POST /api/games/dream-board/abandon/:sessionId
 * @desc    Abandon an active game
 * @access  Private
 */
router.post('/abandon/:sessionId', (req, res) => dreamBoardController.abandonGame(req, res));

// =====================================================
// ERROR HANDLING FOR MULTER
// =====================================================

router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      // Check which route was hit to give appropriate message
      const isElaboration = req.path.includes('/elaborate/');
      const maxSize = isElaboration ? '5MB' : '10MB';
      return res.status(400).json({
        success: false,
        message: `Voice note must be under ${maxSize}`
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
