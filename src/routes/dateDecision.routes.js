// src/routes/dateDecision.routes.js

const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth.middleware');
const dateDecisionController = require('../controllers/dateDecision.controller');

/**
 * DATE DECISION ROUTES
 * 
 * All routes require authentication.
 * 
 * Match-specific routes (nested under /matches/:matchId):
 * - GET  /date-readiness           - Get date readiness assessment
 * - GET  /date-plan                - Get personalized date plan
 * - GET  /date-status              - Quick status check for UI
 * - POST /date-decision/refresh    - Force refresh decision
 * - POST /date-decision/feedback   - Record date outcome feedback
 * 
 * Static routes:
 * - GET  /date-decision/info       - Get decision matrix info
 */

// =====================================================
// STATIC ROUTES (no matchId required)
// =====================================================

/**
 * @route   GET /api/v1/date-decision/info
 * @desc    Get decision matrix info (thresholds, weights, labels)
 * @access  Private
 */
router.get(
  '/date-decision/info',
  authenticate,
  dateDecisionController.getDecisionInfo
);

// =====================================================
// MATCH-SPECIFIC ROUTES
// =====================================================

/**
 * @route   GET /api/v1/matches/:matchId/date-readiness
 * @desc    Get date readiness assessment for a match
 * @access  Private (match participants only)
 * @query   refresh=true - Force regenerate decision
 */
router.get(
  '/matches/:matchId/date-readiness',
  authenticate,
  dateDecisionController.getDateReadiness
);

/**
 * @route   GET /api/v1/matches/:matchId/date-plan
 * @desc    Get personalized date plan (only for ready/almost_ready)
 * @access  Private (match participants only)
 * @query   regenerate=true - Force regenerate date plan
 */
router.get(
  '/matches/:matchId/date-plan',
  authenticate,
  dateDecisionController.getDatePlan
);

/**
 * @route   GET /api/v1/matches/:matchId/date-status
 * @desc    Quick status check for UI badges/indicators
 * @access  Private (match participants only)
 */
router.get(
  '/matches/:matchId/date-status',
  authenticate,
  dateDecisionController.getDateStatus
);

/**
 * @route   POST /api/v1/matches/:matchId/date-decision/refresh
 * @desc    Force refresh the date decision with latest data
 * @access  Private (match participants only)
 */
router.post(
  '/matches/:matchId/date-decision/refresh',
  authenticate,
  dateDecisionController.refreshDateDecision
);

/**
 * @route   POST /api/v1/matches/:matchId/date-decision/feedback
 * @desc    Record whether couple proceeded with date and feedback
 * @access  Private (match participants only)
 * @body    { proceeded: boolean, feedback?: string }
 */
router.post(
  '/matches/:matchId/date-decision/feedback',
  authenticate,
  dateDecisionController.recordDateFeedback
);

module.exports = router;