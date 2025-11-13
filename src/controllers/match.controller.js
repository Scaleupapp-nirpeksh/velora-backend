const MatchingService = require('../services/matching.service');
const ConversationStarterService = require('../services/conversationStarter.service');
const Match = require('../models/Match');
const User = require('../models/User');
const AnswerAnalysis = require('../models/AnswerAnalysis');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

/**
 * Match Controller
 * Handles HTTP requests for matching operations
 */
class MatchController {
  constructor() {
    // Bind all methods to this instance
    this.generateMatches = this.generateMatches.bind(this);
    this.getMatches = this.getMatches.bind(this);
    this.getMatchDetails = this.getMatchDetails.bind(this);
    this.revealMatch = this.revealMatch.bind(this);
    this.likeMatchWithMessage = this.likeMatchWithMessage.bind(this);
    this.getConversationStarters = this.getConversationStarters.bind(this);
    this.passMatch = this.passMatch.bind(this);
    this.getMutualMatches = this.getMutualMatches.bind(this);
    this.getMatchStats = this.getMatchStats.bind(this);
    this.refreshMatches = this.refreshMatches.bind(this);
    this.getCompatibilityPreview = this.getCompatibilityPreview.bind(this);
    this._calculateAge = this._calculateAge.bind(this);
    this.getReceivedLikes = this.getReceivedLikes.bind(this);
    this.respondToReceivedLike = this.respondToReceivedLike.bind(this);
  }

  /**
   * Generate matches for current user
   * POST /api/v1/matches/generate
   */
  async generateMatches(req, res, next) {
    try {
      const userId = req.user._id;

      logger.info(`Generating matches for user: ${userId}`);

      const result = await MatchingService.generateMatches(userId);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          totalMatches: result.matches.length,
          stats: result.stats,
          matches: result.matches.map(m => ({
            matchId: m._id,
            rank: m.rank,
            compatibilityScore: m.compatibilityScore,
            revealTier: m.revealTier,
            isTeaser: m.isTeaser,
            isHighQualityMatch: m.isHighQualityMatch
          }))
        }
      });

    } catch (error) {
      logger.error('Error generating matches:', error);
      next(new ApiError(error.message, 500));
    }
  }

  /**
   * Get user's matches (with tier-based filtering)
   * GET /api/v1/matches
   * Query params: status (optional)
   */
  async getMatches(req, res, next) {
    try {
      const userId = req.user._id;
      const { status } = req.query;

      logger.info(`Getting matches for user: ${userId}, status: ${status || 'pending'}`);

      const filters = {};
      if (status) {
        filters.status = status;
      }

      const matches = await MatchingService.getMatches(userId, filters);

      res.status(200).json({
        success: true,
        data: {
          stats: matches.stats,
          fullyRevealed: matches.fullyRevealed,
          partiallyRevealed: matches.partiallyRevealed,
          premiumLocked: matches.premiumLocked
        }
      });

    } catch (error) {
      logger.error('Error getting matches:', error);
      next(new ApiError(error.message, 500));
    }
  }

  /**
   * Get specific match details
   * GET /api/v1/matches/:matchId
   */
  async getMatchDetails(req, res, next) {
    try {
      const userId = req.user._id;
      const { matchId } = req.params;

      logger.info(`Getting match details: ${matchId} for user: ${userId}`);

      const match = await Match.findOne({ _id: matchId, userId })
        .populate('matchedUserId', 'firstName lastName username profilePhoto bio location dateOfBirth');

      if (!match) {
        return next(new ApiError('Match not found', 404));
      }

      // Check if user has access to this match
      const user = await User.findById(userId);
      const isPremium = user.isPremium && user.premiumExpiry > new Date();
      const devPremium = process.env.NODE_ENV === 'development' && 
                         process.env.PREMIUM_TESTING_ENABLED === 'true' &&
                         user.isPremium;
      const hasAccess = isPremium || devPremium;

      // Format response based on tier and access
      const response = {
        matchId: match._id,
        rank: match.rank,
        compatibilityScore: match.compatibilityScore,
        compatibilityMessage: match.compatibilityMessage,
        dimensionScores: match.dimensionScores,
        dimensionsAnalyzed: match.dimensionsAnalyzed,
        totalDimensions: match.totalDimensions,
        isPartialAnalysis: match.isPartialAnalysis,
        analysisMessage: match.analysisMessage,
        distanceKm: match.distanceKm,
        revealTier: match.revealTier,
        isTeaser: match.isTeaser,
        status: match.status,
        isHighQualityMatch: match.isHighQualityMatch,
        isMutualMatch: match.isMutualMatch
      };

      // Determine what user info to show
      if (match.revealTier === 'fully_revealed' || hasAccess || match.status === 'revealed') {
        response.user = {
          userId: match.matchedUserId._id,
          firstName: match.matchedUserId.firstName,
          lastName: match.matchedUserId.lastName,
          username: match.matchedUserId.username,
          profilePhoto: match.matchedUserId.profilePhoto,
          bio: match.matchedUserId.bio?.text,
          location: match.matchedUserId.location?.city,
          age: this._calculateAge(match.matchedUserId.dateOfBirth)
        };
        response.fullyRevealed = true;
      } else if (match.revealTier === 'partially_revealed') {
        response.user = {
          username: match.matchedUserId.username,
          profilePhoto: 'BLURRED',
          location: match.matchedUserId.location?.city,
          bio: match.matchedUserId.bio?.text
        };
        response.fullyRevealed = false;
      } else {
        response.user = {
          username: match.matchedUserId.username,
          profilePhoto: 'BLURRED',
          location: match.matchedUserId.location?.city,
          bio: match.matchedUserId.bio?.text
        };
        response.fullyRevealed = false;
        response.requiresPremium = true;
      }

      res.status(200).json({
        success: true,
        data: response
      });

    } catch (error) {
      logger.error('Error getting match details:', error);
      next(new ApiError(error.message, 500));
    }
  }

  /**
   * Reveal/unlock a match
   * POST /api/v1/matches/:matchId/reveal
   */
  async revealMatch(req, res, next) {
    try {
      const userId = req.user._id;
      const { matchId } = req.params;

      logger.info(`Revealing match: ${matchId} for user: ${userId}`);

      const match = await Match.findOne({ _id: matchId, userId })
        .populate('matchedUserId', 'firstName lastName username profilePhoto bio location dateOfBirth');

      if (!match) {
        return next(new ApiError('Match not found', 404));
      }

      // Check if already revealed
      if (match.status === 'revealed' || match.status === 'liked' || match.status === 'passed') {
        return next(new ApiError('Match already revealed', 400));
      }

      // Check if user needs premium
      const user = await User.findById(userId);
      const isPremium = user.isPremium && user.premiumExpiry > new Date();
      const devPremium = process.env.NODE_ENV === 'development' && 
                         process.env.PREMIUM_TESTING_ENABLED === 'true' &&
                         user.isPremium;
      const hasAccess = isPremium || devPremium;

      if (match.revealTier === 'premium_locked' && !hasAccess) {
        return res.status(403).json({
          success: false,
          error: 'Premium subscription required to reveal this match',
          requiresPremium: true,
          upgradeUrl: '/premium'
        });
      }

      // Reveal the match
      await match.reveal();

      res.status(200).json({
        success: true,
        message: 'Match revealed successfully',
        data: {
          matchId: match._id,
          user: {
            userId: match.matchedUserId._id,
            firstName: match.matchedUserId.firstName,
            lastName: match.matchedUserId.lastName,
            username: match.matchedUserId.username,
            profilePhoto: match.matchedUserId.profilePhoto,
            bio: match.matchedUserId.bio?.text,
            location: match.matchedUserId.location?.city,
            age: this._calculateAge(match.matchedUserId.dateOfBirth)
          },
          compatibilityScore: match.compatibilityScore,
          revealedAt: match.revealedAt
        }
      });

    } catch (error) {
      logger.error('Error revealing match:', error);
      next(new ApiError(error.message, 500));
    }
  }

  /**
   * Like a match
   * POST /api/v1/matches/:matchId/like
   */
  async likeMatchWithMessage(req, res, next) {
  try {
    const userId = req.user._id;
    const { matchId } = req.params;
    const { 
      message, 
      voiceMessageUrl, 
      voiceTranscription,
      useAiSuggestion,
      suggestionIndex 
    } = req.body;

    logger.info(`User ${userId} liking match ${matchId} with message`);

    const match = await Match.findOne({ _id: matchId, userId })
      .populate('matchedUserId');

    if (!match) {
      return next(new ApiError('Match not found', 404));
    }

    // Validation checks
    if (match.status === 'pending') {
      return next(new ApiError('Match must be revealed before liking', 400));
    }

    if (match.status === 'liked' || match.status === 'mutual_like') {
      return next(new ApiError('Match already liked', 400));
    }

    // Save initial message if provided
    if (message || voiceMessageUrl) {
      match.initialMessage = {
        text: message,
        voiceUrl: voiceMessageUrl,
        voiceTranscription: voiceTranscription,
        sentAt: new Date()
      };
    } else if (useAiSuggestion && suggestionIndex !== undefined) {
      // Use AI-generated suggestion
      if (match.conversationStarters && match.conversationStarters[suggestionIndex]) {
        match.initialMessage = {
          text: match.conversationStarters[suggestionIndex].suggestion,
          sentAt: new Date()
        };
      }
    }

    // Like the match
    await match.like();

    // Check for mutual match
    const reverseMatch = await Match.findOne({
      userId: match.matchedUserId._id,
      matchedUserId: userId
    });

    let isMutual = false;
    if (reverseMatch && (reverseMatch.status === 'liked' || reverseMatch.status === 'mutual_like')) {
      await match.markMutual();
      await reverseMatch.markMutual();
      await match.unlockMessaging();
      await reverseMatch.unlockMessaging();
      isMutual = true;

      // If mutual, create a conversation in your messaging system
      if (match.initialMessage || reverseMatch.initialMessage) {
        // Create initial conversation with the message
        await this._createInitialConversation(
          userId, 
          match.matchedUserId._id,
          match.initialMessage || reverseMatch.initialMessage
        );
      }
    }

    res.status(200).json({
      success: true,
      message: isMutual ? 'It\'s a mutual match! 🎉' : 'Match liked successfully',
      data: {
        matchId: match._id,
        status: match.status,
        isMutualMatch: isMutual,
        messagingUnlocked: isMutual,
        messageSent: !!match.initialMessage
      }
    });

  } catch (error) {
    logger.error('Error liking match with message:', error);
    next(new ApiError(error.message, 500));
  }
  }

/**
 * Get AI conversation starters for a match
 * GET /api/v1/matches/:matchId/conversation-starters
 */
async getConversationStarters(req, res, next) {
  try {
    const userId = req.user._id;
    const { matchId } = req.params;
    const { regenerate } = req.query;

    const match = await Match.findOne({ _id: matchId, userId });

    if (!match) {
      return next(new ApiError('Match not found', 404));
    }

    // Check if already cached and not regenerating
    if (match.conversationStarters?.length > 0 && !regenerate) {
      return res.status(200).json({
        success: true,
        data: {
          starters: match.conversationStarters,
          cached: true
        }
      });
    }

    // Generate new starters
    const ConversationStarterService = require('../services/conversationStarter.service');
    const starters = await ConversationStarterService.generateStarters(
      userId,
      match.matchedUserId,
      {
        overallScore: match.compatibilityScore,
        dimensionScores: match.dimensionScores
      }
    );

    // Cache in match document
    match.conversationStarters = starters;
    await match.save();

    res.status(200).json({
      success: true,
      data: {
        starters: starters,
        cached: false
      }
    });

  } catch (error) {
    logger.error('Error getting conversation starters:', error);
    next(new ApiError(error.message, 500));
  }
}

  /**
   * Pass on a match
   * POST /api/v1/matches/:matchId/pass
   */
  async passMatch(req, res, next) {
    try {
      const userId = req.user._id;
      const { matchId } = req.params;

      logger.info(`User ${userId} passing on match: ${matchId}`);

      const match = await Match.findOne({ _id: matchId, userId });

      if (!match) {
        return next(new ApiError('Match not found', 404));
      }

      // Check if match is revealed
      if (match.status === 'pending') {
        return next(new ApiError('Match must be revealed before passing', 400));
      }

      if (match.status === 'passed') {
        return next(new ApiError('Match already passed', 400));
      }

      // Pass the match
      await match.pass();

      res.status(200).json({
        success: true,
        message: 'Match passed successfully',
        data: {
          matchId: match._id,
          status: match.status
        }
      });

    } catch (error) {
      logger.error('Error passing match:', error);
      next(new ApiError(error.message, 500));
    }
  }

  /**
   * Get mutual matches
   * GET /api/v1/matches/mutual
   */
  async getMutualMatches(req, res, next) {
    try {
      const userId = req.user._id;

      logger.info(`Getting mutual matches for user: ${userId}`);

      const matches = await Match.findMutualMatches(userId);

      const formattedMatches = matches.map(match => ({
        matchId: match._id,
        user: {
          userId: match.matchedUserId._id,
          firstName: match.matchedUserId.firstName,
          lastName: match.matchedUserId.lastName,
          username: match.matchedUserId.username,
          profilePhoto: match.matchedUserId.profilePhoto,
          bio: match.matchedUserId.bio?.text,
          location: match.matchedUserId.location?.city
        },
        compatibilityScore: match.compatibilityScore,
        mutualMatchedAt: match.mutualMatchedAt,
        messagingUnlocked: !!match.messagingUnlockedAt
      }));

      res.status(200).json({
        success: true,
        data: {
          totalMutualMatches: formattedMatches.length,
          matches: formattedMatches
        }
      });

    } catch (error) {
      logger.error('Error getting mutual matches:', error);
      next(new ApiError(error.message, 500));
    }
  }

  /**
   * Get match statistics
   * GET /api/v1/matches/stats
   */
  async getMatchStats(req, res, next) {
    try {
      const userId = req.user._id;

      logger.info(`Getting match stats for user: ${userId}`);

      const stats = await Match.getStats(userId);

      res.status(200).json({
        success: true,
        data: stats
      });

    } catch (error) {
      logger.error('Error getting match stats:', error);
      next(new ApiError(error.message, 500));
    }
  }

  /**
   * Refresh matches (re-generate)
   * POST /api/v1/matches/refresh
   */
  async refreshMatches(req, res, next) {
    try {
      const userId = req.user._id;

      logger.info(`Refreshing matches for user: ${userId}`);

      const result = await MatchingService.refreshMatches(userId);

      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          totalMatches: result.matches.length,
          stats: result.stats
        }
      });

    } catch (error) {
      logger.error('Error refreshing matches:', error);
      next(new ApiError(error.message, 500));
    }
  }

  /**
   * Get compatibility preview with another user
   * GET /api/v1/matches/preview/:userId
   */
  async getCompatibilityPreview(req, res, next) {
    try {
      const currentUserId = req.user._id;
      const { userId } = req.params;

      logger.info(`Getting compatibility preview between ${currentUserId} and ${userId}`);

      // Check if match already exists
      const existingMatch = await Match.findOne({
        userId: currentUserId,
        matchedUserId: userId
      });

      if (existingMatch) {
        return res.status(200).json({
          success: true,
          data: {
            compatibilityScore: existingMatch.compatibilityScore,
            dimensionScores: existingMatch.dimensionScores,
            isPartialAnalysis: existingMatch.isPartialAnalysis,
            alreadyMatched: true
          }
        });
      }

      // Calculate preview (not saved)
      const currentUser = await User.findById(currentUserId);
      const targetUser = await User.findById(userId);

      if (!targetUser) {
        return next(new ApiError('User not found', 404));
      }

      const currentAnalysis = await AnswerAnalysis.findOne({ userId: currentUserId });
      const targetAnalysis = await AnswerAnalysis.findOne({ userId });

      if (!currentAnalysis || !targetAnalysis) {
        return next(new ApiError('Both users must complete analysis first', 400));
      }

      // Use matching service's compatibility calculation
      const compatibility = MatchingService._calculateDimensionCompatibility(
        currentAnalysis,
        targetAnalysis
      );

      res.status(200).json({
        success: true,
        data: {
          compatibilityScore: compatibility.overallScore,
          dimensionScores: compatibility.dimensionScores,
          isPartialAnalysis: compatibility.isPartialAnalysis,
          dimensionsAnalyzed: compatibility.dimensionsAnalyzed,
          alreadyMatched: false
        }
      });

    } catch (error) {
      logger.error('Error getting compatibility preview:', error);
      next(new ApiError(error.message, 500));
    }
  }

  /**
 * Get incoming likes (who liked me)
 * GET /api/v1/matches/likes/received
 */
  async getReceivedLikes(req, res, next) {
    try {
      const userId = req.user._id;
      logger.info(`Getting received likes for user: ${userId}`);

      const matches = await Match.findReceivedLikes(userId);

      const formatted = matches.map(match => ({
        matchId: match._id,                 // this is A→B matchId
        fromUser: {                         // the liker (A)
          userId: match.userId._id,
          firstName: match.userId.firstName,
          lastName: match.userId.lastName,
          username: match.userId.username,
          profilePhoto: match.userId.profilePhoto,
          bio: match.userId.bio?.text,
          location: match.userId.location?.city,
          age: this._calculateAge(match.userId.dateOfBirth)
        },
        // compatibility from this match (it’s symmetric)
        compatibilityScore: match.compatibilityScore,
        dimensionScores: match.dimensionScores,
        isPartialAnalysis: match.isPartialAnalysis,
        analysisMessage: match.analysisMessage,
        compatibilityMessage: match.compatibilityMessage,
        distanceKm: match.distanceKm,
        status: match.status,              // from A’s side
        initialMessage: match.initialMessage, // A’s conversation starter/message with like
        mutualMatchedAt: match.mutualMatchedAt,
        messagingUnlocked: !!match.messagingUnlockedAt
      }));

      res.status(200).json({
        success: true,
        data: {
          total: formatted.length,
          likes: formatted
        }
      });

    } catch (error) {
      logger.error('Error getting received likes:', error);
      next(new ApiError(error.message, 500));
    }
  }


  /**
   * Respond to a received like (accept / reject)
   * POST /api/v1/matches/likes/:likeMatchId/respond
   * Body:
   *  - action: 'like' | 'pass'
   *  - message?: string              // optional reply text from B
   *  - voiceMessageUrl?: string      // optional reply voice
   *  - voiceTranscription?: string   // optional transcription
   */
  async respondToReceivedLike(req, res, next) {
    try {
      const userId = req.user._id;              // B
      const { likeMatchId } = req.params;       // A→B matchId
      const { action, message, voiceMessageUrl, voiceTranscription } = req.body;

      logger.info(`User ${userId} responding to received like ${likeMatchId} with action: ${action}`);

      if (!['like', 'pass'].includes(action)) {
        return next(new ApiError('Invalid action. Must be "like" or "pass".', 400));
      }

      // 1️⃣ Find the incoming A→B match where current user is the matchedUser
      const incomingMatch = await Match.findOne({
        _id: likeMatchId,
        matchedUserId: userId
      }).populate('userId'); // userId = A

      if (!incomingMatch) {
        return next(new ApiError('Incoming like not found', 404));
      }

      const otherUserId = incomingMatch.userId._id; // A

      // If the incoming match is already mutual or passed, short-circuit
      if (incomingMatch.status === 'mutual_like') {
        return res.status(200).json({
          success: true,
          message: 'Already a mutual match',
          data: {
            fromUserId: otherUserId,
            isMutualMatch: true,
            messagingUnlocked: !!incomingMatch.messagingUnlockedAt
          }
        });
      }

      if (incomingMatch.status === 'passed') {
        return next(new ApiError('This like has already been passed on', 400));
      }

      // 2️⃣ Ensure we have B→A match (my perspective)
      let myMatch = await Match.findOne({
        userId,
        matchedUserId: otherUserId
      });

      if (!myMatch) {
        // Create a mirrored match using incoming data
        myMatch = new Match({
          userId,
          matchedUserId: otherUserId,
          compatibilityScore: incomingMatch.compatibilityScore,
          dimensionScores: incomingMatch.dimensionScores,
          dimensionsAnalyzed: incomingMatch.dimensionsAnalyzed,
          totalDimensions: incomingMatch.totalDimensions,
          isPartialAnalysis: incomingMatch.isPartialAnalysis,
          rank: 1, // default rank in likes inbox context
          revealTier: 'fully_revealed',
          isTeaser: false,
          distanceKm: incomingMatch.distanceKm,
          hasDealbreakers: incomingMatch.hasDealbreakers,
          isHighQualityMatch: incomingMatch.isHighQualityMatch,
          status: 'revealed', // B is actively looking at this
          generatedAt: new Date(),
          matchingAlgorithmVersion: incomingMatch.matchingAlgorithmVersion || '1.0'
        });
      }

      // 3️⃣ If B chooses to pass
      if (action === 'pass') {
        await myMatch.pass();

        // Also mark A→B as passed so A doesn't keep seeing B
        if (incomingMatch.status !== 'passed') {
          await incomingMatch.pass();
        }

        return res.status(200).json({
          success: true,
          message: 'Match rejected',
          data: {
            fromUserId: otherUserId,
            status: 'passed'
          }
        });
      }

      // 4️⃣ If B chooses to like back
      // Optional reply from B (this is NOT the first message, it's their response)
      if (message || voiceMessageUrl) {
        myMatch.initialMessage = {
          text: message,
          voiceUrl: voiceMessageUrl,
          voiceTranscription: voiceTranscription,
          sentAt: new Date()
        };
      }

      // Mark B→A as liked
      await myMatch.like();

      // Now this is definitely a mutual match: A liked already
      await myMatch.markMutual();
      await incomingMatch.markMutual();
      await myMatch.unlockMessaging();
      await incomingMatch.unlockMessaging();

      // 5️⃣ Seed conversation using A's initialMessage (their convo starter)
      //    Optionally, you can also add B's reply as a second message inside your chat system.
      const openingMessage = incomingMatch.initialMessage || myMatch.initialMessage;

      if (openingMessage && typeof this._createInitialConversation === 'function') {
        // Ensure your _createInitialConversation handles "first message from A to B"
        await this._createInitialConversation(
          otherUserId,    // fromUser (A)
          userId,         // toUser (B)
          openingMessage
        );

        // If you want to add B's reply as second message, you’d do that in your chat service
        // right after this call, using myMatch.initialMessage.
      }

      return res.status(200).json({
        success: true,
        message: 'It\'s a mutual match! 🎉',
        data: {
          fromUserId: otherUserId,
          isMutualMatch: true,
          messagingUnlocked: true
        }
      });

    } catch (error) {
      logger.error('Error responding to received like:', error);
      next(new ApiError(error.message, 500));
    }
  }


  /**
   * Calculate age from date of birth
   * @private
   */
  _calculateAge(dateOfBirth) {
    if (!dateOfBirth) return null;
    
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  }
}

// Export an instance instead of the class
module.exports = new MatchController();