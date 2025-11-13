const analysisService = require('../services/analysis.service');
const logger = require('../utils/logger');

/**
 * Analysis Controller
 * 
 * HTTP request handlers for answer analysis endpoints.
 * 
 * Handles:
 * - Triggering analysis for authenticated users
 * - Retrieving analysis results
 * - Getting personality insights
 * - Fetching red flags
 * - Re-analyzing users
 * - Compatibility previews
 * 
 * All endpoints require authentication (req.user set by auth middleware)
 */

class AnalysisController {
  /**
   * Trigger analysis for the current authenticated user
   * 
   * POST /api/v1/analysis/analyze
   * 
   * Request body: { forceReanalysis: boolean } (optional)
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async analyzeCurrentUser(req, res) {
    try {
      const userId = req.user._id;
      const { forceReanalysis = false } = req.body;

      logger.info('Analysis requested', {
        userId,
        forceReanalysis,
        ip: req.ip
      });

      // Trigger analysis
      const analysis = await analysisService.analyzeUser(userId, forceReanalysis);

      // Return success response
      return res.status(200).json({
        success: true,
        message: 'Analysis completed successfully',
        data: {
          analysisId: analysis._id,
          overallScore: analysis.overallScore,
          authenticityScore: analysis.authenticityScore,
          questionsAnalyzed: analysis.questionsAnalyzed,
          lastAnalyzedAt: analysis.lastAnalyzedAt,
          hasRedFlags: analysis.redFlags.length > 0,
          redFlagsCount: analysis.redFlags.length,
          criticalRedFlags: analysis.redFlags.filter(f => f.severity >= 4).length,
          hasDealbreakers: analysis.dealbreakers.length > 0,
          dealbreakersCount: analysis.dealbreakers.length,
          dimensionScores: {
            emotionalIntimacy: analysis.dimensionScores.emotional_intimacy?.score || null,
            lifeVision: analysis.dimensionScores.life_vision?.score || null,
            conflictCommunication: analysis.dimensionScores.conflict_communication?.score || null,
            loveLanguages: analysis.dimensionScores.love_languages?.score || null,
            physicalSexual: analysis.dimensionScores.physical_sexual?.score || null,
            lifestyle: analysis.dimensionScores.lifestyle?.score || null
          }
        }
      });

    } catch (error) {
      logger.error('Analysis failed', {
        userId: req.user?._id,
        error: error.message,
        stack: error.stack
      });

      // Handle specific error cases
      if (error.message.includes('Insufficient answers')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          error: 'INSUFFICIENT_ANSWERS'
        });
      }

      if (error.message.includes('User not found')) {
        return res.status(404).json({
          success: false,
          message: 'User not found',
          error: 'USER_NOT_FOUND'
        });
      }

      // Generic error response
      return res.status(500).json({
        success: false,
        message: 'Analysis failed. Please try again.',
        error: 'ANALYSIS_FAILED'
      });
    }
  }

  /**
   * Get analysis results for the current authenticated user
   * 
   * GET /api/v1/analysis/my
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async getMyAnalysis(req, res) {
    try {
      const userId = req.user._id;

      logger.info('Analysis retrieval requested', { userId });

      // Get analysis
      const analysis = await analysisService.getAnalysis(userId);

      if (!analysis) {
        return res.status(404).json({
          success: false,
          message: 'No analysis found. Please complete at least 15 questions and trigger analysis.',
          error: 'ANALYSIS_NOT_FOUND'
        });
      }

      // Return full analysis
      return res.status(200).json({
        success: true,
        data: {
          analysisId: analysis._id,
          overallScore: analysis.overallScore,
          authenticityScore: analysis.authenticityScore,
          questionsAnalyzed: analysis.questionsAnalyzed,
          lastAnalyzedAt: analysis.lastAnalyzedAt,
          needsReanalysis: analysis.needsReanalysis,
          
          dimensionScores: analysis.dimensionScores,
          personalityProfile: analysis.personalityProfile,
          
          redFlags: analysis.redFlags.map(flag => ({
            category: flag.category,
            severity: flag.severity,
            description: flag.description,
            detectedAt: flag.detectedAt
          })),
          
          dealbreakers: analysis.dealbreakers.map(db => ({
            type: db.type,
            value: db.value,
            incompatibleWith: db.incompatibleWith
          })),
          
          aiSummary: analysis.aiSummary,
          
          createdAt: analysis.createdAt,
          updatedAt: analysis.updatedAt
        }
      });

    } catch (error) {
      logger.error('Failed to get analysis', {
        userId: req.user?._id,
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve analysis',
        error: 'RETRIEVAL_FAILED'
      });
    }
  }

  /**
   * Get personality insights for the current authenticated user
   * User-friendly formatted version of analysis
   * 
   * GET /api/v1/analysis/insights
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async getPersonalityInsights(req, res) {
    try {
      const userId = req.user._id;

      logger.info('Personality insights requested', { userId });

      // Get formatted insights
      const insights = await analysisService.getPersonalityInsights(userId);

      return res.status(200).json({
        success: true,
        data: insights
      });

    } catch (error) {
      logger.error('Failed to get personality insights', {
        userId: req.user?._id,
        error: error.message
      });

      if (error.message.includes('No analysis found')) {
        return res.status(404).json({
          success: false,
          message: error.message,
          error: 'ANALYSIS_NOT_FOUND'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve personality insights',
        error: 'RETRIEVAL_FAILED'
      });
    }
  }

  /**
   * Get red flags for the current authenticated user
   * 
   * GET /api/v1/analysis/red-flags
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async getRedFlags(req, res) {
    try {
      const userId = req.user._id;

      logger.info('Red flags requested', { userId });

      // Get red flags
      const redFlags = await analysisService.getRedFlags(userId);

      return res.status(200).json({
        success: true,
        data: redFlags
      });

    } catch (error) {
      logger.error('Failed to get red flags', {
        userId: req.user?._id,
        error: error.message
      });

      if (error.message.includes('No analysis found')) {
        return res.status(404).json({
          success: false,
          message: error.message,
          error: 'ANALYSIS_NOT_FOUND'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve red flags',
        error: 'RETRIEVAL_FAILED'
      });
    }
  }

  /**
   * Re-trigger analysis for the current authenticated user
   * Forces re-analysis even if already analyzed
   * 
   * POST /api/v1/analysis/reanalyze
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async reanalyzeCurrentUser(req, res) {
    try {
      const userId = req.user._id;

      logger.info('Re-analysis requested', { userId });

      // Force re-analysis
      const analysis = await analysisService.analyzeUser(userId, true);

      return res.status(200).json({
        success: true,
        message: 'Re-analysis completed successfully',
        data: {
          analysisId: analysis._id,
          overallScore: analysis.overallScore,
          authenticityScore: analysis.authenticityScore,
          questionsAnalyzed: analysis.questionsAnalyzed,
          lastAnalyzedAt: analysis.lastAnalyzedAt,
          previousAnalysis: {
            questionsCount: analysis.questionsAnalyzed
          },
          changes: {
            redFlagsCount: analysis.redFlags.length,
            dealbreakersCount: analysis.dealbreakers.length
          }
        }
      });

    } catch (error) {
      logger.error('Re-analysis failed', {
        userId: req.user?._id,
        error: error.message
      });

      if (error.message.includes('Insufficient answers')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          error: 'INSUFFICIENT_ANSWERS'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Re-analysis failed. Please try again.',
        error: 'REANALYSIS_FAILED'
      });
    }
  }

  /**
   * Get compatibility preview between current user and another user
   * 
   * GET /api/v1/analysis/compatibility-preview/:userId
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async getCompatibilityPreview(req, res) {
    try {
      const currentUserId = req.user._id;
      const targetUserId = req.params.userId;

      // Validate target user ID
      if (!targetUserId) {
        return res.status(400).json({
          success: false,
          message: 'Target user ID is required',
          error: 'INVALID_USER_ID'
        });
      }

      // Prevent self-compatibility check
      if (currentUserId.toString() === targetUserId.toString()) {
        return res.status(400).json({
          success: false,
          message: 'Cannot check compatibility with yourself',
          error: 'SELF_COMPATIBILITY_CHECK'
        });
      }

      logger.info('Compatibility preview requested', {
        currentUserId,
        targetUserId
      });

      // Get compatibility preview
      const compatibility = await analysisService.getCompatibilityPreview(
        currentUserId,
        targetUserId
      );

      return res.status(200).json({
        success: true,
        data: compatibility
      });

    } catch (error) {
      logger.error('Failed to get compatibility preview', {
        currentUserId: req.user?._id,
        targetUserId: req.params?.userId,
        error: error.message
      });

      if (error.message.includes('must have completed analysis')) {
        return res.status(400).json({
          success: false,
          message: error.message,
          error: 'INCOMPLETE_ANALYSIS'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to calculate compatibility',
        error: 'COMPATIBILITY_FAILED'
      });
    }
  }

  /**
   * Get analysis statistics (admin/debug endpoint)
   * Returns counts and metrics about analysis status
   * 
   * GET /api/v1/analysis/stats
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   */
  async getAnalysisStats(req, res) {
    try {
      const AnswerAnalysis = require('../models/AnswerAnalysis');
      const Answer = require('../models/Answer');

      // Get statistics
      const [
        totalAnalyses,
        needsReanalysisCount,
        avgOverallScore,
        avgAuthenticityScore,
        totalAnswers,
        avgQuestionsPerUser
      ] = await Promise.all([
        AnswerAnalysis.countDocuments(),
        AnswerAnalysis.countDocuments({ needsReanalysis: true }),
        AnswerAnalysis.aggregate([
          { $group: { _id: null, avg: { $avg: '$overallScore' } } }
        ]),
        AnswerAnalysis.aggregate([
          { $group: { _id: null, avg: { $avg: '$authenticityScore' } } }
        ]),
        Answer.countDocuments(),
        Answer.aggregate([
          { $group: { _id: '$userId', count: { $sum: 1 } } },
          { $group: { _id: null, avg: { $avg: '$count' } } }
        ])
      ]);

      return res.status(200).json({
        success: true,
        data: {
          totalAnalyses,
          needsReanalysisCount,
          averageOverallScore: avgOverallScore[0]?.avg?.toFixed(2) || null,
          averageAuthenticityScore: avgAuthenticityScore[0]?.avg?.toFixed(2) || null,
          totalAnswersSubmitted: totalAnswers,
          averageQuestionsPerUser: avgQuestionsPerUser[0]?.avg?.toFixed(2) || null
        }
      });

    } catch (error) {
      logger.error('Failed to get analysis stats', {
        error: error.message
      });

      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve statistics',
        error: 'STATS_FAILED'
      });
    }
  }
}

// Export controller instance
module.exports = new AnalysisController();