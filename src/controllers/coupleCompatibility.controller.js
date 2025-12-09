// src/controllers/coupleCompatibility.controller.js

const coupleCompatibilityService = require('../services/coupleCompatibility.service');
const logger = require('../utils/logger');

/**
 * COUPLE COMPATIBILITY CONTROLLER
 * 
 * HTTP request handlers for the aggregated compatibility system.
 * All endpoints require authentication and match participation validation.
 */

class CoupleCompatibilityController {

  // =====================================================
  // GET DASHBOARD
  // =====================================================

  /**
   * Get compatibility dashboard for a match
   * Returns cached data + update detection
   * 
   * GET /api/compatibility/:matchId/dashboard
   */
  async getDashboard(req, res) {
    try {
      const { matchId } = req.params;
      const userId = req.user._id;

      // Validate matchId
      if (!matchId || matchId === 'undefined') {
        return res.status(400).json({
          success: false,
          message: 'Match ID is required'
        });
      }

      const dashboard = await coupleCompatibilityService.getDashboard(matchId, userId);

      return res.status(200).json({
        success: true,
        data: dashboard
      });

    } catch (error) {
      logger.error('Error in getDashboard controller:', error);

      if (error.message === 'Match not found') {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      if (error.message === 'You are not a participant in this match') {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this compatibility'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to get compatibility dashboard',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // =====================================================
  // GENERATE COMPATIBILITY
  // =====================================================

  /**
   * Generate or refresh compatibility analysis
   * Pulls latest data from all completed games
   * 
   * POST /api/compatibility/:matchId/generate
   */
  async generateCompatibility(req, res) {
    try {
      const { matchId } = req.params;
      const userId = req.user._id;

      // Validate matchId
      if (!matchId || matchId === 'undefined') {
        return res.status(400).json({
          success: false,
          message: 'Match ID is required'
        });
      }

      logger.info('Generate compatibility request', { matchId, userId });

      const result = await coupleCompatibilityService.generateCompatibility(matchId, userId);

      return res.status(200).json({
        success: true,
        message: 'Compatibility analysis generated successfully',
        data: result
      });

    } catch (error) {
      logger.error('Error in generateCompatibility controller:', error);

      if (error.message === 'Match not found') {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      if (error.message === 'You are not a participant in this match') {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to generate compatibility for this match'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to generate compatibility analysis',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // =====================================================
  // QUICK STATUS
  // =====================================================

  /**
   * Quick status check for polling
   * Lightweight endpoint
   * 
   * GET /api/compatibility/:matchId/status
   */
  async getStatus(req, res) {
    try {
      const { matchId } = req.params;
      const userId = req.user._id;

      // Validate matchId
      if (!matchId || matchId === 'undefined') {
        return res.status(400).json({
          success: false,
          message: 'Match ID is required'
        });
      }

      const status = await coupleCompatibilityService.getQuickStatus(matchId, userId);

      return res.status(200).json({
        success: true,
        data: status
      });

    } catch (error) {
      logger.error('Error in getStatus controller:', error);

      if (error.message === 'Match not found') {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      if (error.message === 'You are not a participant in this match') {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this status'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to get compatibility status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // =====================================================
  // GAME HISTORY
  // =====================================================

  /**
   * Get list of all completed games for a match
   * Basic info for history list view
   * 
   * GET /api/compatibility/:matchId/history
   */
  async getGameHistory(req, res) {
    try {
      const { matchId } = req.params;
      const userId = req.user._id;

      // Validate matchId
      if (!matchId || matchId === 'undefined') {
        return res.status(400).json({
          success: false,
          message: 'Match ID is required'
        });
      }

      const history = await coupleCompatibilityService.getGameHistory(matchId, userId);

      return res.status(200).json({
        success: true,
        data: history
      });

    } catch (error) {
      logger.error('Error in getGameHistory controller:', error);

      if (error.message === 'Match not found') {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      if (error.message === 'You are not a participant in this match') {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this game history'
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to get game history',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // =====================================================
  // GAME DETAILS
  // =====================================================

  /**
   * Get full details for a specific game
   * Includes all rounds/questions, answers, voice notes, AI insights
   * 
   * GET /api/compatibility/:matchId/game/:gameType
   * Query params: ?sessionId=xxx (optional, for specific session)
   */
  async getGameDetails(req, res) {
    try {
      const { matchId, gameType } = req.params;
      const { sessionId } = req.query;
      const userId = req.user._id;

      // Validate matchId
      if (!matchId || matchId === 'undefined') {
        return res.status(400).json({
          success: false,
          message: 'Match ID is required'
        });
      }

      // Validate gameType
      const validGameTypes = [
        'two_truths_lie',
        'would_you_rather',
        'intimacy_spectrum',
        'never_have_i_ever',
        'what_would_you_do',
        'dream_board'
      ];

      if (!gameType || !validGameTypes.includes(gameType)) {
        return res.status(400).json({
          success: false,
          message: `Invalid game type. Must be one of: ${validGameTypes.join(', ')}`
        });
      }

      const details = await coupleCompatibilityService.getGameDetails(
        matchId, 
        gameType, 
        userId, 
        sessionId || null
      );

      return res.status(200).json({
        success: true,
        data: details
      });

    } catch (error) {
      logger.error('Error in getGameDetails controller:', error);

      if (error.message === 'Match not found') {
        return res.status(404).json({
          success: false,
          message: 'Match not found'
        });
      }

      if (error.message === 'You are not a participant in this match') {
        return res.status(403).json({
          success: false,
          message: 'You are not authorized to view this game'
        });
      }

      if (error.message.includes('Invalid game type')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: 'Failed to get game details',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // =====================================================
  // GET CURRENT GAMES STATUS
  // =====================================================

  /**
   * Get current status of all games (live query)
   * Useful for checking what games are available before generating
   * 
   * GET /api/compatibility/:matchId/games-status
   */
  async getCurrentGamesStatus(req, res) {
    try {
      const { matchId } = req.params;
      const userId = req.user._id;

      // Validate matchId
      if (!matchId || matchId === 'undefined') {
        return res.status(400).json({
          success: false,
          message: 'Match ID is required'
        });
      }

      // Validate match first
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
          message: 'You are not authorized to view this match'
        });
      }

      // Get player IDs
      const player1Id = match.userId;
      const player2Id = match.matchedUserId;

      // Get canonical matchId (the one games use)
      const canonicalMatchId = await coupleCompatibilityService._getCanonicalMatchId(player1Id, player2Id);
      const gameMatchId = canonicalMatchId || matchId;

      const gamesStatus = await coupleCompatibilityService.getCurrentGamesStatus(
        gameMatchId, 
        player1Id, 
        player2Id
      );

      // Calculate totals
      const totalCompleted = Object.values(gamesStatus).filter(g => g.completed).length;
      const totalGames = 6;

      return res.status(200).json({
        success: true,
        data: {
          matchId,
          gamesStatus,
          totalCompleted,
          totalGames,
          canGenerateAI: totalCompleted >= 3
        }
      });

    } catch (error) {
      logger.error('Error in getCurrentGamesStatus controller:', error);

      return res.status(500).json({
        success: false,
        message: 'Failed to get games status',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }

  // =====================================================
  // GET GAME DISPLAY INFO (Static)
  // =====================================================

  /**
   * Get static game display info (names, emojis, descriptions)
   * Useful for frontend to display game cards
   * 
   * GET /api/compatibility/game-info
   */
  async getGameDisplayInfo(req, res) {
    try {
      const CoupleCompatibility = require('../models/CoupleCompatibility');
      
      return res.status(200).json({
        success: true,
        data: {
          gameDisplayInfo: CoupleCompatibility.getGameDisplayInfo(),
          confidenceLevelInfo: CoupleCompatibility.getConfidenceLevelInfo(),
          compatibilityLevelInfo: CoupleCompatibility.getCompatibilityLevelInfo()
        }
      });

    } catch (error) {
      logger.error('Error in getGameDisplayInfo controller:', error);

      return res.status(500).json({
        success: false,
        message: 'Failed to get game display info',
        error: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  }
}

module.exports = new CoupleCompatibilityController();