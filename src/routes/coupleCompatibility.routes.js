// src/routes/coupleCompatibility.routes.js

const express = require('express');
const router = express.Router();
const coupleCompatibilityController = require('../controllers/coupleCompatibility.controller');
const { authenticate } = require('../middleware/auth.middleware');

/**
 * COUPLE COMPATIBILITY ROUTES
 * 
 * All routes require authentication via protect middleware.
 * Match participation is validated in the controller/service layer.
 * 
 * Base path: /api/compatibility
 */

// =====================================================
// STATIC INFO (No matchId required)
// =====================================================

/**
 * @route   GET /api/compatibility/game-info
 * @desc    Get static game display info (names, emojis, descriptions)
 * @access  Private
 */
router.get(
  '/game-info',
  authenticate,
  coupleCompatibilityController.getGameDisplayInfo.bind(coupleCompatibilityController)
);

// =====================================================
// MATCH-SPECIFIC ROUTES
// =====================================================

/**
 * @route   GET /api/compatibility/:matchId/dashboard
 * @desc    Get compatibility dashboard with cached data + update detection
 * @access  Private (match participants only)
 * @returns {Object} Full dashboard data including:
 *          - Cached compatibility scores and insights
 *          - Update detection (new games since last generation)
 *          - Current games status (live query)
 *          - AI insights (if 3+ games completed)
 */
router.get(
  '/:matchId/dashboard',
  authenticate,
  coupleCompatibilityController.getDashboard.bind(coupleCompatibilityController)
);

/**
 * @route   POST /api/compatibility/:matchId/generate
 * @desc    Generate or refresh compatibility analysis
 * @access  Private (match participants only)
 * @returns {Object} Full dashboard data after generation
 * @note    This pulls latest data from all completed games,
 *          recalculates scores, aggregates insights, and
 *          generates AI narrative if 3+ games are completed
 */
router.post(
  '/:matchId/generate',
  authenticate,
  coupleCompatibilityController.generateCompatibility.bind(coupleCompatibilityController)
);

/**
 * @route   GET /api/compatibility/:matchId/status
 * @desc    Quick status check for polling
 * @access  Private (match participants only)
 * @returns {Object} Lightweight status:
 *          - exists: boolean
 *          - lastGeneratedAt: Date
 *          - totalGamesIncluded: number
 *          - overallScore: number
 *          - aiInsightsAvailable: boolean
 */
router.get(
  '/:matchId/status',
  authenticate,
  coupleCompatibilityController.getStatus.bind(coupleCompatibilityController)
);

/**
 * @route   GET /api/compatibility/:matchId/games-status
 * @desc    Get current status of all games (live query)
 * @access  Private (match participants only)
 * @returns {Object} Status for each of the 6 games:
 *          - completed: boolean
 *          - latestCompletedAt: Date
 *          - sessionId: string
 *          - playCount: number
 */
router.get(
  '/:matchId/games-status',
  authenticate,
  coupleCompatibilityController.getCurrentGamesStatus.bind(coupleCompatibilityController)
);

/**
 * @route   GET /api/compatibility/:matchId/history
 * @desc    Get list of all completed games for a match
 * @access  Private (match participants only)
 * @returns {Object} List of games with basic info:
 *          - gameType, displayName, emoji
 *          - status (completed/not_played)
 *          - completedAt, score, quickSummary
 *          - playCount, includedInCompatibility
 */
router.get(
  '/:matchId/history',
  authenticate,
  coupleCompatibilityController.getGameHistory.bind(coupleCompatibilityController)
);

/**
 * @route   GET /api/compatibility/:matchId/game/:gameType
 * @desc    Get full details for a specific game
 * @access  Private (match participants only)
 * @param   {string} gameType - One of:
 *          - two_truths_lie
 *          - would_you_rather
 *          - intimacy_spectrum
 *          - never_have_i_ever
 *          - what_would_you_do
 *          - dream_board
 * @query   {string} sessionId - Optional specific session ID
 * @returns {Object} Full game details including:
 *          - All rounds/questions with both players' answers
 *          - Voice notes and transcriptions
 *          - AI insights and analysis
 *          - Compatibility score
 */
router.get(
  '/:matchId/game/:gameType',
  authenticate,
  coupleCompatibilityController.getGameDetails.bind(coupleCompatibilityController)
);

module.exports = router;