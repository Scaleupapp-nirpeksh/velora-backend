const express = require('express');
const router = express.Router();
const MatchController = require('../controllers/match.controller');
const { authenticate } = require('../middleware/auth.middleware'); 
const matchValidator = require('../validators/match.validator');

/**
 * Match Routes
 * All routes require authentication
 * Base path: /api/v1/matches
 */

// Apply authentication middleware to all routes
router.use(authenticate); // ✅ FIXED: Use authenticate function

/**
 * @route   POST /api/v1/matches/generate
 * @desc    Generate matches for current user
 * @access  Private
 */
router.post(
  '/generate',
  MatchController.generateMatches
);

/**
 * @route   GET /api/v1/matches
 * @desc    Get user's matches (tiered display)
 * @access  Private
 * @query   status - Filter by status (optional)
 */
router.get(
  '/',
  matchValidator.getMatches,
  MatchController.getMatches
);

/**
 * @route   GET /api/v1/matches/stats
 * @desc    Get match statistics for user
 * @access  Private
 */
router.get(
  '/stats',
  MatchController.getMatchStats
);

/**
 * @route   GET /api/v1/matches/mutual
 * @desc    Get mutual matches
 * @access  Private
 */
router.get(
  '/mutual',
  MatchController.getMutualMatches
);

/**
 * @route   POST /api/v1/matches/refresh
 * @desc    Refresh matches (re-generate)
 * @access  Private
 */
router.post(
  '/refresh',
  MatchController.refreshMatches
);

/**
 * @route   GET /api/v1/matches/preview/:userId
 * @desc    Get compatibility preview with another user
 * @access  Private
 * @param   userId - Target user ID
 */
router.get(
  '/preview/:userId',
  matchValidator.compatibilityPreview,
  MatchController.getCompatibilityPreview
);

/**
 * @route   GET /api/v1/matches/:matchId
 * @desc    Get specific match details
 * @access  Private
 * @param   matchId - Match ID
 */
router.get(
  '/:matchId',
  matchValidator.matchId,
  MatchController.getMatchDetails
);

/**
 * @route   POST /api/v1/matches/:matchId/reveal
 * @desc    Reveal/unlock a match
 * @access  Private
 * @param   matchId - Match ID
 */
router.post(
  '/:matchId/reveal',
  matchValidator.matchId,
  MatchController.revealMatch
);

/**
 * @route   POST /api/v1/matches/:matchId/like
 * @desc    Like a match with optional message
 * @access  Private
 * @body    { message?, voiceMessageUrl?, voiceTranscription?, useAiSuggestion?, suggestionIndex? }
 */
router.post(
  '/:matchId/like',
  MatchController.likeMatchWithMessage
);

/**
 * @route   GET /api/v1/matches/:matchId/conversation-starters
 * @desc    Get AI-generated conversation starters
 * @access  Private
 * @query   regenerate - Force regeneration
 */
router.get(
  '/:matchId/conversation-starters',
  MatchController.getConversationStarters
);

/**
 * @route   POST /api/v1/matches/:matchId/pass
 * @desc    Pass on a match
 * @access  Private
 * @param   matchId - Match ID
 */
router.post(
  '/:matchId/pass',
  matchValidator.matchId,
  MatchController.passMatch
);

/**
 * @route   GET /api/v1/matches/likes/received
 * @desc    Get likes received by current user
 * @access  Private
 */
router.get(
  '/likes/received',
  MatchController.getReceivedLikes
);

/**
 * @route   POST /api/v1/matches/likes/:likeMatchId/respond
 * @desc    Respond to a received like (accept / reject)
 * @access  Private
 * @body    { action: 'like' | 'pass', message?, voiceMessageUrl?, voiceTranscription? }
 */
router.post(
  '/likes/:likeMatchId/respond',
  MatchController.respondToReceivedLike
);


module.exports = router;