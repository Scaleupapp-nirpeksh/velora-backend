const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysis.controller');
const { authenticate: protect } = require('../middleware/auth.middleware');
const validateAnalysis = require('../validators/analysis.validator');

/**
 * Analysis Routes
 * 
 * All routes require authentication (protect middleware)
 * Base path: /api/v1/analysis
 * 
 * Available endpoints:
 * - POST   /analyze                        - Trigger analysis for current user
 * - GET    /my                             - Get full analysis results
 * - GET    /insights                       - Get personality insights (formatted)
 * - GET    /red-flags                      - Get red flags only
 * - POST   /reanalyze                      - Force re-analysis
 * - GET    /compatibility-preview/:userId  - Get compatibility with another user
 * - GET    /stats                          - Get analysis statistics (admin/debug)
 */

// ==================== PUBLIC ROUTES (None - all require auth) ====================

// ==================== PROTECTED ROUTES ====================

/**
 * @route   POST /api/v1/analysis/analyze
 * @desc    Trigger AI analysis for the authenticated user
 * @access  Private (requires authentication)
 * @body    { forceReanalysis?: boolean }
 * 
 * Requirements:
 * - User must have answered at least 15 questions
 * - Returns analysis summary with scores and flags
 */
router.post(
  '/analyze',
  protect,
  validateAnalysis.analyzeRequest,
  analysisController.analyzeCurrentUser
);

/**
 * @route   GET /api/v1/analysis/my
 * @desc    Get full analysis results for the authenticated user
 * @access  Private (requires authentication)
 * 
 * Returns:
 * - Complete analysis document
 * - All dimension scores, personality profile, red flags, dealbreakers
 * - AI-generated summary
 */
router.get(
  '/my',
  protect,
  analysisController.getMyAnalysis
);

/**
 * @route   GET /api/v1/analysis/insights
 * @desc    Get user-friendly personality insights
 * @access  Private (requires authentication)
 * 
 * Returns:
 * - Formatted personality insights
 * - Translated labels (user-friendly language)
 * - Dimension breakdown with strengths and insights
 * - Perfect for displaying in mobile app UI
 */
router.get(
  '/insights',
  protect,
  analysisController.getPersonalityInsights
);

/**
 * @route   GET /api/v1/analysis/red-flags
 * @desc    Get red flags for the authenticated user
 * @access  Private (requires authentication)
 * 
 * Returns:
 * - Array of red flags sorted by severity
 * - Count of critical red flags (severity 4-5)
 * - Empty array if no red flags detected
 */
router.get(
  '/red-flags',
  protect,
  analysisController.getRedFlags
);

/**
 * @route   POST /api/v1/analysis/reanalyze
 * @desc    Force re-analysis for the authenticated user
 * @access  Private (requires authentication)
 * 
 * Use cases:
 * - User answered more questions since last analysis
 * - User wants fresh analysis with updated AI
 * - needsReanalysis flag is set to true
 */
router.post(
  '/reanalyze',
  protect,
  analysisController.reanalyzeCurrentUser
);

/**
 * @route   GET /api/v1/analysis/compatibility-preview/:userId
 * @desc    Get compatibility preview between current user and target user
 * @access  Private (requires authentication)
 * @params  userId - MongoDB ObjectId of target user
 * 
 * Returns:
 * - Overall compatibility score (0-100)
 * - Dimension-wise compatibility breakdown
 * - Dealbreaker conflicts (if any)
 * - Compatibility message
 * 
 * Requirements:
 * - Both users must have completed analysis
 * - Cannot check compatibility with self
 */
router.get(
  '/compatibility-preview/:userId',
  protect,
  validateAnalysis.compatibilityPreview,
  analysisController.getCompatibilityPreview
);

/**
 * @route   GET /api/v1/analysis/stats
 * @desc    Get analysis statistics (admin/debug endpoint)
 * @access  Private (requires authentication)
 * 
 * Returns:
 * - Total analyses count
 * - Users needing re-analysis
 * - Average scores across all users
 * - Total answers submitted
 * 
 * Note: In production, you may want to add admin-only middleware here
 */
router.get(
  '/stats',
  protect,
  analysisController.getAnalysisStats
);

// ==================== ERROR HANDLER ====================

/**
 * Catch-all for undefined routes under /analysis
 * Returns 404 for any route not defined above
 */
router.all('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Cannot ${req.method} ${req.originalUrl}`,
    error: 'ROUTE_NOT_FOUND'
  });
});

module.exports = router;
