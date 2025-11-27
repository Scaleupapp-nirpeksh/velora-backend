// routes/test.routes.js
const express = require('express');
const router = express.Router();
const testMatchingService = require('../services/testMatching.service');
const { authenticate } = require('../middleware/auth.middleware');

// Only enable in development/testing environments
if (process.env.NODE_ENV !== 'production') {
  
  /**
   * POST /api/v1/test/create-perfect-match
   * Creates near-identical answers for testing high compatibility
   */
  router.post('/create-perfect-match', authenticate, async (req, res) => {
    try {
      const { sourceUserId, targetUserId } = req.body;

      // Validate inputs
      if (!sourceUserId || !targetUserId) {
        return res.status(400).json({
          success: false,
          message: 'Both sourceUserId and targetUserId are required'
        });
      }

      if (sourceUserId === targetUserId) {
        return res.status(400).json({
          success: false,
          message: 'Source and target users must be different'
        });
      }

      // Create the near-perfect match
      const result = await testMatchingService.createNearPerfectMatch(
        sourceUserId,
        targetUserId
      );

      res.status(200).json({
        success: true,
        message: 'Near-perfect match created successfully',
        data: result
      });

    } catch (error) {
      console.error('Test match creation error:', error);
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  /**
   * GET /api/v1/test/verify-match/:userId1/:userId2
   * Verify compatibility between two users
   */
  router.get('/verify-match/:userId1/:userId2', authenticate, async (req, res) => {
    try {
      const { userId1, userId2 } = req.params;
      const Match = require('../models/Match');
      
      const match = await Match.findOne({
        $or: [
          { userId: userId1, matchedUserId: userId2 },
          { userId: userId2, matchedUserId: userId1 }
        ]
      });

      if (!match) {
        return res.status(404).json({
          success: false,
          message: 'No match found between these users'
        });
      }

      res.status(200).json({
        success: true,
        data: {
          compatibilityScore: match.compatibilityScore,
          dimensionScores: match.dimensionScores,
          rank: match.rank,
          revealTier: match.revealTier,
          status: match.status
        }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  });
}

module.exports = router;