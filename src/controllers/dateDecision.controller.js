// src/controllers/dateDecision.controller.js

const dateDecisionService = require('../services/dateDecision.service');
const datePlanningService = require('../services/datePlanning.service');
const logger = require('../utils/logger');

/**
 * DATE DECISION CONTROLLER
 * 
 * Handles API endpoints for date readiness assessment and planning.
 * 
 * Endpoints:
 * - GET  /matches/:matchId/date-readiness  - Get date readiness assessment
 * - GET  /matches/:matchId/date-plan       - Get personalized date plan
 * - POST /matches/:matchId/date-decision/refresh - Force refresh decision
 * - GET  /matches/:matchId/date-status     - Quick status check
 */

/**
 * Get date readiness assessment for a match
 * 
 * Returns the full decision with score breakdown, blockers, cautions,
 * and suggested games if not ready.
 * 
 * @route GET /api/v1/matches/:matchId/date-readiness
 */
exports.getDateReadiness = async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user._id;
    const { refresh } = req.query; // Optional: ?refresh=true

    logger.info('Getting date readiness', { matchId, userId, refresh });

    const forceRefresh = refresh === 'true';
    const result = await dateDecisionService.getDateReadiness(matchId, userId, forceRefresh);

    return res.status(200).json({
      success: true,
      message: 'Date readiness retrieved successfully',
      data: result
    });

  } catch (error) {
    logger.error('Error in getDateReadiness:', error);

    if (error.message === 'Match not found') {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    if (error.message === 'You are not a participant in this match') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this match'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to get date readiness',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get personalized date plan for a match
 * 
 * Only available for couples with 'ready' or 'almost_ready' status.
 * Generates venue suggestions, conversation starters, and more.
 * 
 * @route GET /api/v1/matches/:matchId/date-plan
 */
exports.getDatePlan = async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user._id;
    const { regenerate } = req.query; // Optional: ?regenerate=true

    logger.info('Getting date plan', { matchId, userId, regenerate });

    let result;

    if (regenerate === 'true') {
      // Force regenerate the date plan
      result = await datePlanningService.generateDatePlan(matchId, userId);
    } else {
      // Get existing or generate if needed
      result = await datePlanningService.getDatePlan(matchId, userId);
    }

    return res.status(200).json({
      success: true,
      message: 'Date plan retrieved successfully',
      data: result
    });

  } catch (error) {
    logger.error('Error in getDatePlan:', error);

    if (error.message === 'Match not found') {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    if (error.message === 'You are not a participant in this match') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this match'
      });
    }

    if (error.message === 'Date decision not found. Please check readiness first.') {
      return res.status(400).json({
        success: false,
        message: 'Please check date readiness first before requesting a date plan',
        code: 'READINESS_CHECK_REQUIRED'
      });
    }

    if (error.message === 'Date plan not available for this decision status') {
      return res.status(400).json({
        success: false,
        message: 'Date plan is only available for couples who are ready or almost ready',
        code: 'NOT_READY_FOR_DATE_PLAN'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to get date plan',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Force refresh the date decision
 * 
 * Regenerates the decision with the latest game data.
 * Useful after completing new games.
 * 
 * @route POST /api/v1/matches/:matchId/date-decision/refresh
 */
exports.refreshDateDecision = async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user._id;

    logger.info('Refreshing date decision', { matchId, userId });

    const result = await dateDecisionService.getDateReadiness(matchId, userId, true);

    return res.status(200).json({
      success: true,
      message: 'Date decision refreshed successfully',
      data: result
    });

  } catch (error) {
    logger.error('Error in refreshDateDecision:', error);

    if (error.message === 'Match not found') {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    if (error.message === 'You are not a participant in this match') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to refresh this match'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to refresh date decision',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get quick status check for UI badges/indicators
 * 
 * Lightweight endpoint that returns just the decision status
 * without full breakdown. Good for list views.
 * 
 * @route GET /api/v1/matches/:matchId/date-status
 */
exports.getDateStatus = async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user._id;

    logger.info('Getting date status', { matchId, userId });

    const result = await dateDecisionService.getQuickStatus(matchId, userId);

    return res.status(200).json({
      success: true,
      data: result
    });

  } catch (error) {
    logger.error('Error in getDateStatus:', error);

    if (error.message === 'Match not found') {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    if (error.message === 'You are not a participant in this match') {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to view this match'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Failed to get date status',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Record date outcome feedback
 * 
 * Allows users to report whether they proceeded with the date
 * and provide feedback. Useful for improving recommendations.
 * 
 * @route POST /api/v1/matches/:matchId/date-decision/feedback
 */
exports.recordDateFeedback = async (req, res) => {
  try {
    const { matchId } = req.params;
    const userId = req.user._id;
    const { proceeded, feedback } = req.body;

    logger.info('Recording date feedback', { matchId, userId, proceeded });

    // Validate input
    if (typeof proceeded !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: 'Please indicate whether you proceeded with the date'
      });
    }

    // Get the decision
    const DateDecision = require('../models/DateDecision');
    const Match = require('../models/Match');

    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({
        success: false,
        message: 'Match not found'
      });
    }

    const userIdStr = userId.toString();
    const isParticipant =
      match.userId?.toString() === userIdStr ||
      match.matchedUserId?.toString() === userIdStr;

    if (!isParticipant) {
      return res.status(403).json({
        success: false,
        message: 'You are not authorized to provide feedback for this match'
      });
    }

    // Find and update decision
    const player1Id = match.userId;
    const player2Id = match.matchedUserId;

    const decision = await DateDecision.findForCouple(matchId, player1Id, player2Id);

    if (!decision) {
      return res.status(404).json({
        success: false,
        message: 'Date decision not found'
      });
    }

    // Update feedback
    decision.dateOutcome = {
      proceeded,
      feedbackAt: new Date(),
      feedback: feedback?.substring(0, 500) // Limit feedback length
    };

    await decision.save();

    return res.status(200).json({
      success: true,
      message: 'Thank you for your feedback!',
      data: {
        proceeded,
        recordedAt: decision.dateOutcome.feedbackAt
      }
    });

  } catch (error) {
    logger.error('Error in recordDateFeedback:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to record feedback',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get decision info (static data)
 * 
 * Returns the decision matrix info - useful for frontend displays.
 * 
 * @route GET /api/v1/date-decision/info
 */
exports.getDecisionInfo = async (req, res) => {
  try {
    const DateDecision = require('../models/DateDecision');
    const info = DateDecision.getDecisionInfo();

    return res.status(200).json({
      success: true,
      data: {
        decisions: info,
        thresholds: {
          ready: 75,
          almostReady: 60,
          caution: 45,
          notYet: 0
        },
        weights: {
          compatibility: '35%',
          engagement: '20%',
          redFlagAssessment: '25%',
          mutualInterest: '20%'
        }
      }
    });

  } catch (error) {
    logger.error('Error in getDecisionInfo:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to get decision info'
    });
  }
};