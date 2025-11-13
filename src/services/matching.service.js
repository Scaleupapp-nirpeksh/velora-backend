const User = require('../models/User');
const Match = require('../models/Match');
const AnswerAnalysis = require('../models/AnswerAnalysis');
const DistanceService = require('./distance.service');
const logger = require('../utils/logger');

/**
 * Matching Service
 * Core algorithm for generating compatibility matches between users
 */
class MatchingService {
  /**
   * Generate matches for a user
   * 
   * @param {String} userId - User ID to generate matches for
   * @returns {Object} - Generated matches and stats
   */
  static async generateMatches(userId) {
    try {
      logger.info(`Starting match generation for user: ${userId}`);

      // Step 1: Get current user with analysis
      const currentUser = await this._getCurrentUser(userId);
      if (!currentUser) {
        throw new Error('User not found or incomplete profile');
      }

      // Step 2: Get candidate users (basic filtering)
      const candidates = await this._getCandidateUsers(currentUser);
      logger.info(`Found ${candidates.length} candidate users`);

      if (candidates.length === 0) {
        return {
          success: true,
          matches: [],
          message: 'No potential matches found. Try expanding your preferences or completing your profile.',
          stats: {
            totalCandidates: 0,
            afterDealbreakers: 0,
            afterDistance: 0,
            finalMatches: 0
          }
        };
      }

      // Step 3: Filter by dealbreakers
      const afterDealbreakers = await this._filterByDealbreakers(currentUser, candidates);
      logger.info(`After dealbreaker filtering: ${afterDealbreakers.length} candidates`);

      // Step 4: Filter by distance
      const afterDistance = DistanceService.filterByDistance(currentUser, afterDealbreakers);
      logger.info(`After distance filtering: ${afterDistance.length} candidates`);

      if (afterDistance.length === 0) {
        return {
          success: true,
          matches: [],
          message: 'No matches found within your distance range. Try upgrading to Premium for wider search.',
          stats: {
            totalCandidates: candidates.length,
            afterDealbreakers: afterDealbreakers.length,
            afterDistance: 0,
            finalMatches: 0
          }
        };
      }

      // Step 5: Calculate compatibility scores
      const scoredMatches = await this._calculateCompatibility(currentUser, afterDistance);
      logger.info(`Calculated compatibility for ${scoredMatches.length} matches`);

      // Step 6: Filter by minimum score
      const minScore = parseInt(process.env.MATCHING_MIN_COMPATIBILITY_SCORE || 50);
      const qualifiedMatches = scoredMatches.filter(m => m.compatibilityScore >= minScore);
      logger.info(`After minimum score filter (${minScore}): ${qualifiedMatches.length} matches`);

      if (qualifiedMatches.length === 0) {
        return {
          success: true,
          matches: [],
          message: 'No high-compatibility matches found. Answer more questions to improve matching.',
          stats: {
            totalCandidates: candidates.length,
            afterDealbreakers: afterDealbreakers.length,
            afterDistance: afterDistance.length,
            finalMatches: 0
          }
        };
      }

      // Step 7: Rank and assign tiers
      const rankedMatches = this._rankAndAssignTiers(qualifiedMatches);
      logger.info(`Ranked ${rankedMatches.length} matches`);

      // Step 8: Save matches to database
      const savedMatches = await this._saveMatches(userId, rankedMatches);
      logger.info(`Saved ${savedMatches.length} matches to database`);

      return {
        success: true,
        matches: savedMatches,
        message: `Successfully generated ${savedMatches.length} matches`,
        stats: {
          totalCandidates: candidates.length,
          afterDealbreakers: afterDealbreakers.length,
          afterDistance: afterDistance.length,
          finalMatches: savedMatches.length
        }
      };

    } catch (error) {
      logger.error('Error generating matches:', error);
      throw error;
    }
  }

  /**
   * Get current user with validation
   * @private
   */
  static async _getCurrentUser(userId) {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.isActive || user.isBanned) {
      throw new Error('User account is not active');
    }

    // Check if user has completed analysis
    const analysis = await AnswerAnalysis.findOne({ userId });
    const minQuestions = parseInt(process.env.ANALYSIS_MIN_QUESTIONS || 15);
    
    if (!analysis || user.questionsAnswered < minQuestions) {
      throw new Error(`User must answer at least ${minQuestions} questions before matching`);
    }

    // Attach analysis to user object for later use
    user.analysis = analysis;
    
    return user;
  }

  /**
   * Get candidate users for matching (Stage 1: Basic Filtering)
   * @private
   */
  static async _getCandidateUsers(currentUser) {
    try {
      const minQuestions = parseInt(process.env.ANALYSIS_MIN_QUESTIONS || 15);

      // Build query
      const query = {
        _id: { $ne: currentUser._id }, // Not self
        isActive: true,
        isBanned: false,
        questionsAnswered: { $gte: minQuestions }, // Has completed minimum questions
      };

      // Gender preference filtering
      if (currentUser.interestedIn && currentUser.interestedIn !== 'everyone') {
        // Map interestedIn to gender
        // interestedIn: 'men' -> gender: 'male'
        // interestedIn: 'women' -> gender: 'female'
        const genderMap = {
          'men': 'male',
          'women': 'female'
        };
        
        query.gender = genderMap[currentUser.interestedIn];
      }

      // Reverse gender preference check
      // If candidate has preference, make sure currentUser matches it
      const candidates = await User.find(query).lean();

      // Filter by reverse preference
      const filtered = candidates.filter(candidate => {
        if (!candidate.interestedIn || candidate.interestedIn === 'everyone') {
          return true; // No preference = matches everyone
        }

        const genderMap = {
          'men': 'male',
          'women': 'female'
        };

        return currentUser.gender === genderMap[candidate.interestedIn];
      });

      // Check if already matched (to avoid duplicates)
      const alreadyMatched = await Match.find({
        userId: currentUser._id,
        status: { $in: ['pending', 'revealed', 'liked', 'mutual_like'] }
      }).distinct('matchedUserId');

      // Filter out already matched users
      return filtered.filter(candidate => 
        !alreadyMatched.some(id => id.toString() === candidate._id.toString())
      );

    } catch (error) {
      logger.error('Error getting candidate users:', error);
      throw error;
    }
  }

  /**
   * Filter candidates by dealbreakers (Stage 2)
   * @private
   */
  static async _filterByDealbreakers(currentUser, candidates) {
    try {
      const currentAnalysis = currentUser.analysis;
      
      if (!currentAnalysis || !currentAnalysis.dealbreakers || 
          currentAnalysis.dealbreakers.length === 0) {
        // No dealbreakers = all candidates pass
        return candidates;
      }

      const filtered = [];

      for (const candidate of candidates) {
        // Get candidate's analysis
        const candidateAnalysis = await AnswerAnalysis.findOne({ userId: candidate._id });
        
        if (!candidateAnalysis) {
          // No analysis = skip this candidate
          continue;
        }

        // Check for dealbreaker conflicts
        const hasConflict = this._checkDealbreakers(
          currentAnalysis.dealbreakers,
          candidateAnalysis.dealbreakers
        );

        if (!hasConflict) {
          // Attach analysis for later use
          candidate.analysis = candidateAnalysis;
          filtered.push(candidate);
        }
      }

      return filtered;

    } catch (error) {
      logger.error('Error filtering by dealbreakers:', error);
      throw error;
    }
  }

  /**
   * Check if two users have conflicting dealbreakers
   * @private
   */
  static _checkDealbreakers(dealbreakers1, dealbreakers2) {
    if (!dealbreakers1 || !dealbreakers2) return false;

    for (const db1 of dealbreakers1) {
      for (const db2 of dealbreakers2) {
        // Same dealbreaker type?
        if (db1.type === db2.type) {
          // Check if values conflict
          if (db1.incompatibleWith && db1.incompatibleWith.includes(db2.value)) {
            return true; // Conflict found
          }
        }
      }
    }

    return false; // No conflicts
  }

  /**
   * Calculate compatibility scores between users (Stage 4)
   * @private
   */
  static async _calculateCompatibility(currentUser, candidates) {
    const currentAnalysis = currentUser.analysis;
    const scoredMatches = [];
  
    for (const candidate of candidates) {
      try {
        // Get candidate analysis - either attached or fetch it
        let candidateAnalysis = candidate.analysis;
        
        // If analysis wasn't attached (lost during distance filtering), fetch it
        if (!candidateAnalysis) {
          candidateAnalysis = await AnswerAnalysis.findOne({ userId: candidate._id }).lean();
        }
  
        if (!candidateAnalysis) {
          logger.warn(`No analysis found for candidate ${candidate._id}`);
          continue;
        }
  
        // Calculate compatibility on common dimensions only
        const compatibility = this._calculateDimensionCompatibility(
          currentAnalysis,
          candidateAnalysis
        );
  
        if (!compatibility) {
          logger.warn(`No compatibility calculated between ${currentUser._id} and ${candidate._id}`);
          continue;
        }
  
        // Calculate distance
        const distanceKm = candidate.distanceKm || 
          DistanceService.calculateDistanceBetweenUsers(currentUser, candidate);
  
        scoredMatches.push({
          matchedUserId: candidate._id,
          matchedUser: candidate,
          compatibilityScore: compatibility.overallScore,
          dimensionScores: compatibility.dimensionScores,
          dimensionsAnalyzed: compatibility.dimensionsAnalyzed,
          totalDimensions: 6,
          isPartialAnalysis: compatibility.isPartialAnalysis,
          distanceKm: distanceKm || 0,
          hasDealbreakers: false,
          isHighQualityMatch: compatibility.overallScore >= 75,
        });
  
      } catch (error) {
        logger.error(`Error calculating compatibility for candidate ${candidate._id}:`, error);
      }
    }
  
    return scoredMatches;
  }

  /**
   * Calculate compatibility between two analyses
   * Only uses dimensions where BOTH users have scores
   * @private
   */
  static _calculateDimensionCompatibility(analysis1, analysis2) {
    const dimensions = [
      'emotional_intimacy',
      'life_vision',
      'conflict_communication',
      'love_languages',
      'physical_sexual',
      'lifestyle'
    ];

    const weights = {
      emotional_intimacy: 0.25,
      life_vision: 0.20,
      conflict_communication: 0.15,
      love_languages: 0.15,
      physical_sexual: 0.15,
      lifestyle: 0.10
    };

    const commonDimensions = [];
    const dimensionScores = {};

    // Calculate score for each dimension
    for (const dim of dimensions) {
      const score1 = analysis1.dimensionScores?.[dim]?.score;
      const score2 = analysis2.dimensionScores?.[dim]?.score;

      if (score1 !== undefined && score2 !== undefined) {
        // Both users have this dimension analyzed
        commonDimensions.push(dim);
        
        // Compatibility = 100 - absolute difference
        // Smaller difference = higher compatibility
        const compatibility = 100 - Math.abs(score1 - score2);
        dimensionScores[dim] = Math.max(0, Math.min(100, compatibility));
      }
    }

    if (commonDimensions.length === 0) {
      return null; // No common dimensions
    }

    // Calculate weighted average (only common dimensions)
    let totalWeight = 0;
    let weightedSum = 0;

    for (const dim of commonDimensions) {
      const weight = weights[dim];
      totalWeight += weight;
      weightedSum += dimensionScores[dim] * weight;
    }

    const overallScore = Math.round(weightedSum / totalWeight);

    return {
      overallScore,
      dimensionScores,
      dimensionsAnalyzed: commonDimensions.length,
      isPartialAnalysis: commonDimensions.length < 6
    };
  }

  /**
   * Rank matches and assign reveal tiers (Stage 7)
   * @private
   */
  static _rankAndAssignTiers(matches) {
    // Sort by compatibility score (highest first)
    matches.sort((a, b) => b.compatibilityScore - a.compatibilityScore);

    // Assign ranks
    matches.forEach((match, index) => {
      match.rank = index + 1;
    });

    const totalMatches = matches.length;

    // Assign reveal tiers based on rank
    matches.forEach(match => {
      const tier = this._calculateRevealTier(match.rank, totalMatches);
      match.revealTier = tier.revealTier;
      match.isTeaser = tier.isTeaser;
    });

    return matches;
  }

  /**
   * Calculate reveal tier for a match based on rank and total matches
   * @private
   */
  static _calculateRevealTier(rank, totalMatches) {
    // Edge case: 1 user
    if (totalMatches === 1) {
      return { revealTier: 'fully_revealed', isTeaser: false };
    }

    // Edge case: 2 users
    if (totalMatches === 2) {
      if (rank === 2) return { revealTier: 'fully_revealed', isTeaser: false };
      if (rank === 1) return { revealTier: 'partially_revealed', isTeaser: false };
    }

    // Edge case: 3 users
    if (totalMatches === 3) {
      if (rank === 3) return { revealTier: 'fully_revealed', isTeaser: false };
      if (rank === 2) return { revealTier: 'partially_revealed', isTeaser: false };
      if (rank === 1) return { revealTier: 'premium_locked', isTeaser: false };
    }

    // For 4-9 matches: proportional tiers
    if (totalMatches < 10) {
      const fullyCount = Math.max(1, Math.floor(totalMatches * 0.3));
      const partialCount = Math.floor(totalMatches * 0.3);
      const teaserRank = fullyCount + partialCount + 1; // First of locked tier

      if (rank > fullyCount + partialCount) {
        // Bottom tier: fully revealed
        return { revealTier: 'fully_revealed', isTeaser: false };
      } else if (rank > fullyCount) {
        // Middle tier: partially revealed
        return { revealTier: 'partially_revealed', isTeaser: false };
      } else if (rank === teaserRank) {
        // Teaser match
        return { revealTier: 'fully_revealed', isTeaser: true };
      } else {
        // Top tier: locked
        return { revealTier: 'premium_locked', isTeaser: false };
      }
    }

    // For 10+ matches: standard percentile-based tiers
    const percentile = (rank / totalMatches) * 100;

    // Bottom 30%: fully revealed
    if (percentile > 70) {
      return { revealTier: 'fully_revealed', isTeaser: false };
    }

    // Middle 30%: partially revealed
    if (percentile > 40) {
      return { revealTier: 'partially_revealed', isTeaser: false };
    }

    // Top 40%: locked
    // But lowest rank in top 40% is teaser
    const teaserRank = Math.ceil(totalMatches * 0.4);
    if (rank === teaserRank) {
      return { revealTier: 'fully_revealed', isTeaser: true };
    }

    return { revealTier: 'premium_locked', isTeaser: false };
  }

  /**
   * Save matches to database (Stage 8)
   * @private
   */
  static async _saveMatches(userId, matches) {
    const saved = [];

    for (const match of matches) {
      try {
        // Check if match already exists
        const existing = await Match.findOne({
          userId: userId,
          matchedUserId: match.matchedUserId
        });

        if (existing) {
          // Update existing match
          existing.compatibilityScore = match.compatibilityScore;
          existing.dimensionScores = match.dimensionScores;
          existing.dimensionsAnalyzed = match.dimensionsAnalyzed;
          existing.isPartialAnalysis = match.isPartialAnalysis;
          existing.rank = match.rank;
          existing.revealTier = match.revealTier;
          existing.isTeaser = match.isTeaser;
          existing.distanceKm = match.distanceKm;
          existing.isHighQualityMatch = match.isHighQualityMatch;
          existing.scoreRecalculatedAt = new Date();
          
          await existing.save();
          saved.push(existing);
        } else {
          // Create new match
          const newMatch = new Match({
            userId: userId,
            matchedUserId: match.matchedUserId,
            compatibilityScore: match.compatibilityScore,
            dimensionScores: match.dimensionScores,
            dimensionsAnalyzed: match.dimensionsAnalyzed,
            totalDimensions: match.totalDimensions,
            isPartialAnalysis: match.isPartialAnalysis,
            rank: match.rank,
            revealTier: match.revealTier,
            isTeaser: match.isTeaser,
            distanceKm: match.distanceKm,
            hasDealbreakers: match.hasDealbreakers,
            isHighQualityMatch: match.isHighQualityMatch,
            status: 'pending',
            generatedAt: new Date(),
            matchingAlgorithmVersion: '1.0'
          });

          await newMatch.save();
          saved.push(newMatch);
        }

      } catch (error) {
        logger.error(`Error saving match for user ${match.matchedUserId}:`, error);
        // Continue with other matches
      }
    }

    return saved;
  }

  /**
   * Get matches for a user (with tier-based filtering)
   * 
   * @param {String} userId - User ID
   * @param {Object} filters - Optional filters (status, tier)
   * @returns {Object} - Matches grouped by tier
   */
  static async getMatches(userId, filters = {}) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const isPremium = user.isPremium && user.premiumExpiry > new Date();

      // Development mode premium testing
      const devPremium = process.env.NODE_ENV === 'development' && 
                         process.env.PREMIUM_TESTING_ENABLED === 'true' &&
                         user.isPremium;

      const hasAccess = isPremium || devPremium;

      // Build query
      const query = { userId, status: filters.status || 'pending' };

      const matches = await Match.find(query)
        .populate('matchedUserId', 'firstName lastName username profilePhoto bio location dateOfBirth')
        .sort({ rank: 1 }); // Best matches first

      // Group by tier
      const grouped = {
        fullyRevealed: [],
        partiallyRevealed: [],
        premiumLocked: [],
        stats: {
          total: matches.length,
          highQuality: matches.filter(m => m.isHighQualityMatch).length,
          avgScore: matches.length > 0 
            ? Math.round(matches.reduce((sum, m) => sum + m.compatibilityScore, 0) / matches.length)
            : 0
        }
      };

      matches.forEach(match => {
        const matchData = this._formatMatchData(match, hasAccess);

        if (match.revealTier === 'fully_revealed') {
          grouped.fullyRevealed.push(matchData);
        } else if (match.revealTier === 'partially_revealed') {
          grouped.partiallyRevealed.push(hasAccess ? this._formatMatchData(match, true) : matchData);
        } else if (match.revealTier === 'premium_locked') {
          grouped.premiumLocked.push(hasAccess ? this._formatMatchData(match, true) : matchData);
        }
      });

      return grouped;

    } catch (error) {
      logger.error('Error getting matches:', error);
      throw error;
    }
  }

  /**
   * Format match data based on reveal tier and premium access
   * @private
   */
  static _formatMatchData(match, hasPremiumAccess) {
    const base = {
      matchId: match._id,
      rank: match.rank,
      compatibilityScore: match.compatibilityScore,
      dimensionScores: match.dimensionScores,
      distanceKm: match.distanceKm,
      distanceFormatted: DistanceService.formatDistance(match.distanceKm),
      isPartialAnalysis: match.isPartialAnalysis,
      analysisMessage: match.analysisMessage,
      compatibilityMessage: match.compatibilityMessage,
      revealTier: match.revealTier,
      isTeaser: match.isTeaser,
      status: match.status
    };

    // Fully revealed OR premium access
    if (match.revealTier === 'fully_revealed' || hasPremiumAccess) {
      return {
        ...base,
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
        fullyRevealed: true
      };
    }

    // Partially revealed
    if (match.revealTier === 'partially_revealed') {
      return {
        ...base,
        user: {
          username: match.matchedUserId.username,
          profilePhoto: 'BLURRED', // Frontend should blur this
          location: match.matchedUserId.location?.city,
          bio: match.matchedUserId.bio?.text
        },
        fullyRevealed: false
      };
    }

    // Premium locked
    return {
      ...base,
      user: {
        username: match.matchedUserId.username,
        profilePhoto: 'BLURRED',
        location: match.matchedUserId.location?.city,
        bio: match.matchedUserId.bio?.text
      },
      fullyRevealed: false,
      requiresPremium: true
    };
  }

  /**
   * Calculate age from date of birth
   * @private
   */
  static _calculateAge(dateOfBirth) {
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

  /**
   * Refresh matches for a user (re-generate)
   * 
   * @param {String} userId - User ID
   * @returns {Object} - New matches
   */
  static async refreshMatches(userId) {
    try {
      // Delete existing pending matches
      await Match.deleteMany({ userId, status: 'pending' });

      // Generate new matches
      return await this.generateMatches(userId);

    } catch (error) {
      logger.error('Error refreshing matches:', error);
      throw error;
    }
  }

    /**
 * Get a specific match by ID
 * @param {String} matchId - Match ID
 * @param {String} userId - User ID (for verification)
 * @returns {Object} - Match object
 */
static async getMatch(matchId, userId) {
  try {
    const match = await Match.findOne({
      _id: matchId,
      $or: [
        { userId: userId },
        { matchedUserId: userId }
      ]
    }).populate('matchedUserId', 'firstName lastName username profilePhoto');

    return match;
  } catch (error) {
    logger.error('Error getting match:', error);
    return null;
  }
}
}

module.exports = MatchingService;