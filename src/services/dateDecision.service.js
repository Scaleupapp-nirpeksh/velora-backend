// src/services/dateDecision.service.js

const mongoose = require('mongoose');
const DateDecision = require('../models/DateDecision');
const CoupleCompatibility = require('../models/CoupleCompatibility');
const AnswerAnalysis = require('../models/AnswerAnalysis');
const Match = require('../models/Match');
const User = require('../models/User');
const Block = require('../models/Block');
const logger = require('../utils/logger');

/**
 * DATE DECISION SERVICE
 * 
 * Calculates whether a couple is ready to meet in person based on:
 * - CoupleCompatibility aggregated scores
 * - AnswerAnalysis red flags and dealbreakers
 * - Game engagement level
 * - Mutual interest signals
 * 
 * Readiness Formula:
 * Score = Compatibility(35%) + Engagement(20%) + RedFlagAssessment(25%) + MutualInterest(20%)
 * 
 * Decision Matrix:
 * - READY (≥75): Full date plan
 * - ALMOST_READY (60-74): Partial plan + game suggestions
 * - CAUTION (45-59): Concerns highlighted
 * - NOT_YET (<45): More games needed
 * - BLOCKED: Critical issues override score
 */

class DateDecisionService {

  // =====================================================
  // CONSTANTS
  // =====================================================

  static WEIGHTS = {
    compatibility: 0.35,
    engagement: 0.20,
    redFlagAssessment: 0.25,
    mutualInterest: 0.20
  };

  static THRESHOLDS = {
    ready: 75,
    almostReady: 60,
    caution: 45
    // Below 45 = not_yet
  };

  static GAME_TYPES = [
    'two_truths_lie',
    'would_you_rather',
    'intimacy_spectrum',
    'never_have_i_ever',
    'what_would_you_do',
    'dream_board'
  ];

  static DIMENSION_TO_GAME = {
    intuition: 'two_truths_lie',
    lifestyle: 'would_you_rather',
    physical: 'intimacy_spectrum',
    experience: 'never_have_i_ever',
    character: 'what_would_you_do',
    future: 'dream_board'
  };

  static DEALBREAKER_CATEGORIES = ['kids', 'religion', 'location', 'lifestyle', 'values'];

  // =====================================================
  // MAIN PUBLIC METHODS
  // =====================================================

  /**
   * Get date readiness for a match
   * Returns cached decision if recent, or generates new one
   * 
   * @param {ObjectId} matchId - The match ID
   * @param {ObjectId} userId - Requesting user (for validation)
   * @param {Boolean} forceRefresh - Force regeneration
   * @returns {Promise<Object>} Date decision data
   */
  async getDateReadiness(matchId, userId, forceRefresh = false) {
    try {
      logger.info('Getting date readiness', { matchId, userId, forceRefresh });

      // Validate match and get players
      const match = await this._validateMatch(matchId, userId);
      const { player1Id, player2Id } = this._getPlayerIds(match, userId);

      // Check for existing decision
      let decision = await DateDecision.findForCouple(matchId, player1Id, player2Id);

      // Check if we need to regenerate
      const shouldRegenerate = forceRefresh || 
        !decision || 
        this._isDecisionStale(decision);

      if (shouldRegenerate) {
        decision = await this.generateDateDecision(matchId, userId);
      }

      // Mark as viewed
      decision.markViewed(userId);
      await decision.save();

      return this._formatDecisionResponse(decision, userId);

    } catch (error) {
      logger.error('Error getting date readiness:', error);
      throw error;
    }
  }

  /**
   * Generate or regenerate date decision
   * 
   * @param {ObjectId} matchId - The match ID
   * @param {ObjectId} userId - Requesting user
   * @returns {Promise<DateDecision>} Generated decision
   */
  async generateDateDecision(matchId, userId) {
    try {
      logger.info('Generating date decision', { matchId, userId });

      // Validate and get players
      const match = await this._validateMatch(matchId, userId);
      const { player1Id, player2Id } = this._getPlayerIds(match, userId);

      // Get or create decision document
      let decision = await DateDecision.getOrCreate(matchId, player1Id, player2Id);
      decision.clearForRegeneration();

      // ==================== GATHER DATA ====================

      // 1. Get CoupleCompatibility
      const compatibility = await this._getCompatibilityData(matchId, player1Id, player2Id);

      // 2. Get AnswerAnalysis for both users
      const [player1Analysis, player2Analysis] = await Promise.all([
        AnswerAnalysis.findOne({ oduserId: player1Id }),
        AnswerAnalysis.findOne({ oduserId: player2Id })
      ]);

      // 3. Get user profiles
      const [player1User, player2User] = await Promise.all([
        User.findById(player1Id).select('firstName location'),
        User.findById(player2Id).select('firstName location')
      ]);

      // 4. Check for blocks
      const blockExists = await this._checkForBlocks(player1Id, player2Id);

      // ==================== CHECK BLOCKERS ====================

      const blockers = [];

      // Block check
      if (blockExists) {
        blockers.push({
          type: 'blocked_user',
          severity: 'critical',
          description: 'One user has blocked the other. A date is not possible.',
          category: 'relationship'
        });
      }

      // Dealbreaker conflicts
      const dealbreakersConflicts = this._checkDealbreakers(player1Analysis, player2Analysis);
      blockers.push(...dealbreakersConflicts);

      // Severe red flags (severity 4-5)
      const severeRedFlags = this._checkSevereRedFlags(player1Analysis, player2Analysis, compatibility);
      blockers.push(...severeRedFlags);

      // Authenticity concerns
      const authConcerns = this._checkAuthenticityConcerns(player1Analysis, player2Analysis);
      blockers.push(...authConcerns);

      // ==================== CALCULATE SCORES ====================

      const scoreBreakdown = this._calculateScoreBreakdown(
        compatibility,
        match,
        player1Analysis,
        player2Analysis
      );

      // Calculate total readiness score
      const readinessScore = Math.round(
        scoreBreakdown.compatibility.weighted +
        scoreBreakdown.engagement.weighted +
        scoreBreakdown.redFlagAssessment.weighted +
        scoreBreakdown.mutualInterest.weighted
      );

      // ==================== CHECK CAUTIONS ====================

      const cautions = this._identifyCautions(
        compatibility,
        player1Analysis,
        player2Analysis,
        scoreBreakdown
      );

      // ==================== DETERMINE DECISION ====================

      let decisionType;
      
      if (blockers.length > 0) {
        decisionType = 'blocked';
      } else if (readinessScore >= DateDecisionService.THRESHOLDS.ready) {
        decisionType = 'ready';
      } else if (readinessScore >= DateDecisionService.THRESHOLDS.almostReady) {
        decisionType = 'almost_ready';
      } else if (readinessScore >= DateDecisionService.THRESHOLDS.caution) {
        decisionType = 'caution';
      } else {
        decisionType = 'not_yet';
      }

      // ==================== SUGGESTED GAMES ====================

      const suggestedGames = this._getSuggestedGames(compatibility, decisionType);

      // ==================== CONFIDENCE ASSESSMENT ====================

      const { confidence, confidenceReason } = this._assessConfidence(compatibility, scoreBreakdown);

      // ==================== POPULATE DECISION ====================

      decision.decision = decisionType;
      decision.readinessScore = readinessScore;
      decision.scoreBreakdown = scoreBreakdown;
      decision.confidence = confidence;
      decision.confidenceReason = confidenceReason;

      decision.blockers = blockers;
      decision.hasBlockers = blockers.length > 0;
      
      decision.cautions = cautions;
      decision.hasCautions = cautions.length > 0;

      decision.suggestedGames = suggestedGames;
      decision.estimatedGamesToReady = this._estimateGamesToReady(decisionType, compatibility);
      decision.improvementTips = this._getImprovementTips(decisionType, compatibility, cautions);

      // Date plan available for ready/almost_ready
      decision.datePlanAvailable = ['ready', 'almost_ready'].includes(decisionType);

      // Track data sources
      decision.dataSources = {
        coupleCompatibilityScore: compatibility?.overallCompatibility?.score || null,
        coupleCompatibilityConfidence: compatibility?.overallCompatibility?.confidence || null,
        gamesIncluded: compatibility ? this._getIncludedGames(compatibility) : [],
        totalGamesPlayed: compatibility?.totalGamesIncluded || 0,
        answerAnalysisChecked: !!(player1Analysis || player2Analysis),
        dealbreakersChecked: true
      };

      decision.coupleCompatibilityId = compatibility?._id;
      decision.generatedAt = new Date();
      decision.lastRefreshedAt = new Date();

      await decision.save();

      logger.info('Date decision generated', {
        matchId,
        decision: decisionType,
        readinessScore,
        blockers: blockers.length,
        cautions: cautions.length
      });

      return decision;

    } catch (error) {
      logger.error('Error generating date decision:', error);
      throw error;
    }
  }

  /**
   * Quick status check (lightweight)
   */
  async getQuickStatus(matchId, userId) {
    try {
      const match = await this._validateMatch(matchId, userId);
      const { player1Id, player2Id } = this._getPlayerIds(match, userId);

      const decision = await DateDecision.findForCouple(matchId, player1Id, player2Id);

      if (!decision) {
        return {
          exists: false,
          decision: null,
          readinessScore: null,
          datePlanAvailable: false
        };
      }

      return {
        exists: true,
        decision: decision.decision,
        decisionEmoji: decision.decisionEmoji,
        decisionLabel: decision.decisionLabel,
        readinessScore: decision.readinessScore,
        datePlanAvailable: decision.datePlanAvailable,
        generatedAt: decision.generatedAt
      };

    } catch (error) {
      logger.error('Error getting quick status:', error);
      throw error;
    }
  }

  // =====================================================
  // SCORE CALCULATION METHODS
  // =====================================================

  /**
   * Calculate the full score breakdown
   */
  _calculateScoreBreakdown(compatibility, match, player1Analysis, player2Analysis) {
    const breakdown = {
      compatibility: this._calculateCompatibilityScore(compatibility),
      engagement: this._calculateEngagementScore(compatibility),
      redFlagAssessment: this._calculateRedFlagScore(player1Analysis, player2Analysis, compatibility),
      mutualInterest: this._calculateMutualInterestScore(match)
    };

    return breakdown;
  }

  /**
   * Compatibility score component (35%)
   */
  _calculateCompatibilityScore(compatibility) {
    const weight = DateDecisionService.WEIGHTS.compatibility;
    
    if (!compatibility || !compatibility.overallCompatibility?.score) {
      return {
        score: 0,
        weight,
        weighted: 0,
        source: 'CoupleCompatibility'
      };
    }

    const score = compatibility.overallCompatibility.score;
    
    return {
      score,
      weight,
      weighted: score * weight,
      source: 'CoupleCompatibility'
    };
  }

  /**
   * Engagement score component (20%)
   * Based on games played out of 6
   */
  _calculateEngagementScore(compatibility) {
    const weight = DateDecisionService.WEIGHTS.engagement;
    const totalGames = 6;
    const gamesPlayed = compatibility?.totalGamesIncluded || 0;

    // Score scales non-linearly to reward more games
    // 0 games = 0, 1 = 30, 2 = 50, 3 = 70, 4 = 85, 5 = 95, 6 = 100
    const scoreMap = {
      0: 0,
      1: 30,
      2: 50,
      3: 70,
      4: 85,
      5: 95,
      6: 100
    };

    const score = scoreMap[Math.min(gamesPlayed, 6)] || 0;

    return {
      score,
      weight,
      weighted: score * weight,
      gamesPlayed,
      gamesTotal: totalGames
    };
  }

  /**
   * Red flag assessment component (25%)
   * Starts at 100, deducted for flags
   */
  _calculateRedFlagScore(player1Analysis, player2Analysis, compatibility) {
    const weight = DateDecisionService.WEIGHTS.redFlagAssessment;
    let score = 100;
    let flagsFound = 0;
    let criticalFlags = 0;

    // Deduct for AnswerAnalysis red flags
    const analyzeFlags = (analysis) => {
      if (!analysis?.redFlags) return;
      
      for (const flag of analysis.redFlags) {
        flagsFound++;
        if (flag.severity >= 4) {
          criticalFlags++;
          score -= 30; // Critical flags hurt a lot
        } else if (flag.severity >= 3) {
          score -= 15;
        } else {
          score -= 5;
        }
      }
    };

    analyzeFlags(player1Analysis);
    analyzeFlags(player2Analysis);

    // Deduct for compatibility red flags
    if (compatibility?.redFlags?.length) {
      for (const flag of compatibility.redFlags) {
        flagsFound++;
        score -= 10;
      }
    }

    score = Math.max(0, score);

    return {
      score,
      weight,
      weighted: score * weight,
      flagsFound,
      criticalFlags
    };
  }

  /**
   * Mutual interest component (20%)
   * Based on match status and interaction signals
   */
  _calculateMutualInterestScore(match) {
    const weight = DateDecisionService.WEIGHTS.mutualInterest;
    let score = 0;
    const factors = [];

    if (!match) {
      return { score: 0, weight, weighted: 0, factors: [] };
    }

    // Both users liked each other (mutual_like status)
    if (match.status === 'mutual_like') {
      score += 50;
      factors.push('mutual_like');
    } else if (match.status === 'revealed' || match.status === 'liked') {
      score += 30;
      factors.push('match_active');
    }

    // Initial messages sent
    if (match.initialMessages?.user1Sent && match.initialMessages?.user2Sent) {
      score += 25;
      factors.push('both_messaged');
    } else if (match.initialMessages?.user1Sent || match.initialMessages?.user2Sent) {
      score += 10;
      factors.push('one_messaged');
    }

    // Conversation starters used indicates engagement
    if (match.conversationStarters?.length > 0) {
      score += 15;
      factors.push('conversation_starters');
    }

    // Game initiations show interest
    if (match.gamesPlayed > 0) {
      score += 10;
      factors.push('games_initiated');
    }

    score = Math.min(100, score);

    return {
      score,
      weight,
      weighted: score * weight,
      factors
    };
  }

  // =====================================================
  // BLOCKER CHECK METHODS
  // =====================================================

  /**
   * Check for dealbreaker conflicts between users
   */
  _checkDealbreakers(player1Analysis, player2Analysis) {
    const conflicts = [];

    if (!player1Analysis?.dealbreakers || !player2Analysis?.dealbreakers) {
      return conflicts;
    }

    const p1 = player1Analysis.dealbreakers;
    const p2 = player2Analysis.dealbreakers;

    // Kids dealbreaker
    if (p1.kids && p2.kids && p1.kids !== p2.kids) {
      // Check if it's a hard conflict (wants vs doesn't want)
      const wantsKids = ['definitely_want', 'probably_want'];
      const noKids = ['definitely_not', 'probably_not'];
      
      if ((wantsKids.includes(p1.kids) && noKids.includes(p2.kids)) ||
          (noKids.includes(p1.kids) && wantsKids.includes(p2.kids))) {
        conflicts.push({
          type: 'dealbreaker_conflict',
          severity: 'critical',
          description: 'Fundamental disagreement about having children. One wants kids, the other doesn\'t.',
          category: 'kids'
        });
      }
    }

    // Religion dealbreaker
    if (p1.religion?.mustMatch && p2.religion?.mustMatch) {
      if (p1.religion.value !== p2.religion.value) {
        conflicts.push({
          type: 'dealbreaker_conflict',
          severity: 'critical',
          description: 'Both require matching religious beliefs, but beliefs differ.',
          category: 'religion'
        });
      }
    }

    // Location dealbreaker
    if (p1.location?.mustBeNear && p2.location?.mustBeNear) {
      // This would need actual location comparison
      // For now, flag if both have strict location requirements
      if (p1.location.city !== p2.location.city) {
        conflicts.push({
          type: 'dealbreaker_conflict',
          severity: 'high',
          description: 'Different location requirements that may be hard to reconcile.',
          category: 'location'
        });
      }
    }

    return conflicts;
  }

  /**
   * Check for severe red flags (severity 4-5)
   */
  _checkSevereRedFlags(player1Analysis, player2Analysis, compatibility) {
    const severeFlags = [];

    const checkAnalysis = (analysis, playerLabel) => {
      if (!analysis?.redFlags) return;

      for (const flag of analysis.redFlags) {
        if (flag.severity >= 4) {
          severeFlags.push({
            type: 'severe_red_flag',
            severity: flag.severity >= 5 ? 'critical' : 'high',
            description: `${playerLabel}: ${flag.description || flag.category}`,
            category: flag.category
          });
        }
      }
    };

    checkAnalysis(player1Analysis, 'Partner assessment');
    checkAnalysis(player2Analysis, 'Your assessment');

    // Also check compatibility red flags if severe
    if (compatibility?.redFlags) {
      for (const flag of compatibility.redFlags) {
        if (flag.severity === 'severe' || flag.severity === 'critical') {
          severeFlags.push({
            type: 'severe_red_flag',
            severity: 'critical',
            description: flag.description,
            category: flag.category,
            sourceGame: flag.sourceGame
          });
        }
      }
    }

    return severeFlags;
  }

  /**
   * Check for authenticity concerns
   */
  _checkAuthenticityConcerns(player1Analysis, player2Analysis) {
    const concerns = [];

    const checkAuth = (analysis, label) => {
      if (!analysis) return;

      // Very low authenticity score is concerning
      if (analysis.authenticityScore && analysis.authenticityScore < 30) {
        concerns.push({
          type: 'authenticity_concern',
          severity: 'high',
          description: `${label} showed low authenticity in their questionnaire responses.`,
          category: 'authenticity'
        });
      }
    };

    checkAuth(player1Analysis, 'Your match');
    checkAuth(player2Analysis, 'Profile');

    return concerns;
  }

  /**
   * Check if users have blocked each other
   */
  async _checkForBlocks(player1Id, player2Id) {
    const block = await Block.findOne({
      $or: [
        { odBlockerId: player1Id, blockedUserId: player2Id },
        { odBlockerId: player2Id, blockedUserId: player1Id }
      ],
      isActive: true
    });

    return !!block;
  }

  // =====================================================
  // CAUTION IDENTIFICATION
  // =====================================================

  /**
   * Identify cautions (non-blocking concerns)
   */
  _identifyCautions(compatibility, player1Analysis, player2Analysis, scoreBreakdown) {
    const cautions = [];

    // Low dimension scores
    if (compatibility?.dimensionScores) {
      const dimensions = ['intuition', 'lifestyle', 'physical', 'experience', 'character', 'future'];
      
      for (const dim of dimensions) {
        const dimData = compatibility.dimensionScores[dim];
        if (dimData?.available && dimData.score < 50) {
          cautions.push({
            type: 'low_dimension_score',
            severity: dimData.score < 35 ? 'medium' : 'low',
            description: `Lower compatibility in ${dim} dimension (${dimData.score}%).`,
            suggestion: `Play more games that test ${dim} compatibility.`,
            relatedDimension: dim
          });
        }
      }
    }

    // Moderate red flags (severity 2-3)
    const checkModerateFlags = (analysis) => {
      if (!analysis?.redFlags) return;

      for (const flag of analysis.redFlags) {
        if (flag.severity >= 2 && flag.severity < 4) {
          cautions.push({
            type: 'moderate_red_flag',
            severity: 'medium',
            description: flag.description || `Moderate concern: ${flag.category}`,
            suggestion: 'Discuss this topic openly during your first meeting.',
            relatedDimension: flag.category
          });
        }
      }
    };

    checkModerateFlags(player1Analysis);
    checkModerateFlags(player2Analysis);

    // Incomplete assessment
    if (scoreBreakdown.engagement.gamesPlayed < 3) {
      cautions.push({
        type: 'incomplete_assessment',
        severity: 'medium',
        description: `Only ${scoreBreakdown.engagement.gamesPlayed} games played. More games = better insights.`,
        suggestion: 'Play at least 3 games for a reliable compatibility picture.'
      });
    }

    // Low engagement from one side
    if (scoreBreakdown.mutualInterest.score < 40) {
      cautions.push({
        type: 'communication_gap',
        severity: 'low',
        description: 'Limited interaction signals detected.',
        suggestion: 'Ensure both of you are actively engaged before meeting.'
      });
    }

    return cautions;
  }

  // =====================================================
  // SUGGESTED GAMES
  // =====================================================

  /**
   * Get games to suggest based on missing dimensions
   */
  _getSuggestedGames(compatibility, decisionType) {
    const suggestions = [];

    if (!compatibility) {
      // No games played - suggest starting games
      suggestions.push({
        gameType: 'would_you_rather',
        reason: 'Great starting game to discover lifestyle compatibility',
        priority: 1,
        dimension: 'lifestyle'
      });
      suggestions.push({
        gameType: 'two_truths_lie',
        reason: 'Fun way to test how well you read each other',
        priority: 2,
        dimension: 'intuition'
      });
      return suggestions;
    }

    // Find dimensions without games
    const dimensions = ['intuition', 'lifestyle', 'physical', 'experience', 'character', 'future'];
    let priority = 1;

    for (const dim of dimensions) {
      const dimData = compatibility.dimensionScores?.[dim];
      
      if (!dimData?.available) {
        const gameType = DateDecisionService.DIMENSION_TO_GAME[dim];
        suggestions.push({
          gameType,
          reason: `Discover your ${dim} compatibility`,
          priority: priority++,
          dimension: dim
        });
      } else if (dimData.score < 50 && decisionType !== 'ready') {
        // Low score - suggest replaying
        const gameType = DateDecisionService.DIMENSION_TO_GAME[dim];
        suggestions.push({
          gameType,
          reason: `Explore ${dim} compatibility more deeply`,
          priority: priority++,
          dimension: dim
        });
      }
    }

    // Limit to top 3 suggestions
    return suggestions.slice(0, 3);
  }

  /**
   * Estimate games needed to reach ready status
   */
  _estimateGamesToReady(decisionType, compatibility) {
    if (decisionType === 'ready') return 0;
    if (decisionType === 'blocked') return null;

    const gamesPlayed = compatibility?.totalGamesIncluded || 0;

    if (decisionType === 'almost_ready') return Math.max(1, 3 - gamesPlayed);
    if (decisionType === 'caution') return Math.max(2, 4 - gamesPlayed);
    return Math.max(3, 4 - gamesPlayed); // not_yet
  }

  /**
   * Get improvement tips based on decision
   */
  _getImprovementTips(decisionType, compatibility, cautions) {
    const tips = [];

    if (decisionType === 'ready') {
      tips.push('You\'re ready! Check out your personalized date plan.');
      return tips;
    }

    if (decisionType === 'blocked') {
      tips.push('Address the critical concerns identified before proceeding.');
      return tips;
    }

    if (decisionType === 'almost_ready') {
      tips.push('You\'re very close! One or two more games will give you full confidence.');
    }

    if (decisionType === 'caution') {
      tips.push('Play games that address your areas of concern.');
    }

    if (decisionType === 'not_yet') {
      tips.push('Keep playing games to discover your true compatibility.');
      tips.push('Quality conversations during games matter more than speed.');
    }

    // Add tips based on cautions
    const lowDimensions = cautions.filter(c => c.type === 'low_dimension_score');
    if (lowDimensions.length > 0) {
      tips.push(`Focus on exploring: ${lowDimensions.map(c => c.relatedDimension).join(', ')}`);
    }

    return tips.slice(0, 4);
  }

  // =====================================================
  // CONFIDENCE ASSESSMENT
  // =====================================================

  /**
   * Assess confidence in the decision
   */
  _assessConfidence(compatibility, scoreBreakdown) {
    const gamesPlayed = scoreBreakdown.engagement.gamesPlayed;
    const compatConfidence = compatibility?.overallCompatibility?.confidence;

    if (gamesPlayed >= 5 && compatConfidence === 'comprehensive') {
      return {
        confidence: 'high',
        confidenceReason: 'Based on comprehensive game data and analysis'
      };
    }

    if (gamesPlayed >= 3 && ['comprehensive', 'good'].includes(compatConfidence)) {
      return {
        confidence: 'medium',
        confidenceReason: 'Based on good game coverage'
      };
    }

    return {
      confidence: 'low',
      confidenceReason: 'More games needed for reliable assessment'
    };
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  /**
   * Get compatibility data for the couple
   * Handles bidirectional match lookup
   */
  async _getCompatibilityData(matchId, player1Id, player2Id) {
    // Try by matchId first
    let compatibility = await CoupleCompatibility.findOne({ matchId });

    if (compatibility) return compatibility;

    // Try by player IDs (bidirectional)
    compatibility = await CoupleCompatibility.findOne({
      $or: [
        { player1Id, player2Id },
        { player1Id: player2Id, player2Id: player1Id }
      ]
    });

    return compatibility;
  }

  /**
   * Validate match and user access
   */
  async _validateMatch(matchId, userId) {
    const match = await Match.findById(matchId);

    if (!match) {
      throw new Error('Match not found');
    }

    const userIdStr = userId.toString();
    const isParticipant =
      match.userId?.toString() === userIdStr ||
      match.matchedUserId?.toString() === userIdStr;

    if (!isParticipant) {
      throw new Error('You are not a participant in this match');
    }

    return match;
  }

  /**
   * Get player IDs from match
   */
  _getPlayerIds(match, userId) {
    const userIdStr = userId.toString();

    if (match.userId?.toString() === userIdStr) {
      return {
        player1Id: match.userId,
        player2Id: match.matchedUserId
      };
    } else {
      return {
        player1Id: match.matchedUserId,
        player2Id: match.userId
      };
    }
  }

  /**
   * Check if decision is stale (older than 24 hours or new games played)
   */
  _isDecisionStale(decision) {
    if (!decision.generatedAt) return true;

    const hoursSinceGenerated = (Date.now() - decision.generatedAt.getTime()) / (1000 * 60 * 60);
    
    // Regenerate if older than 24 hours
    return hoursSinceGenerated > 24;
  }

  /**
   * Get list of included games from compatibility
   */
  _getIncludedGames(compatibility) {
    if (!compatibility?.gamesSnapshot) return [];

    const included = [];
    for (const [gameType, data] of Object.entries(compatibility.gamesSnapshot)) {
      if (data.included) {
        included.push(gameType);
      }
    }
    return included;
  }

  /**
   * Format decision response for API
   */
  _formatDecisionResponse(decision, userId) {
    return {
      matchId: decision.matchId,
      
      // Core decision
      decision: decision.decision,
      decisionEmoji: decision.decisionEmoji,
      decisionLabel: decision.decisionLabel,
      readinessScore: decision.readinessScore,
      
      // Score breakdown
      scoreBreakdown: {
        compatibility: {
          score: decision.scoreBreakdown.compatibility.score,
          contribution: Math.round(decision.scoreBreakdown.compatibility.weighted)
        },
        engagement: {
          score: decision.scoreBreakdown.engagement.score,
          contribution: Math.round(decision.scoreBreakdown.engagement.weighted),
          gamesPlayed: decision.scoreBreakdown.engagement.gamesPlayed
        },
        redFlagAssessment: {
          score: decision.scoreBreakdown.redFlagAssessment.score,
          contribution: Math.round(decision.scoreBreakdown.redFlagAssessment.weighted),
          flagsFound: decision.scoreBreakdown.redFlagAssessment.flagsFound
        },
        mutualInterest: {
          score: decision.scoreBreakdown.mutualInterest.score,
          contribution: Math.round(decision.scoreBreakdown.mutualInterest.weighted)
        }
      },
      
      // Confidence
      confidence: decision.confidence,
      confidenceReason: decision.confidenceReason,
      
      // Issues
      hasBlockers: decision.hasBlockers,
      blockers: decision.blockers,
      hasCautions: decision.hasCautions,
      cautions: decision.cautions,
      
      // Improvement path
      suggestedGames: decision.suggestedGames,
      improvementTips: decision.improvementTips,
      estimatedGamesToReady: decision.estimatedGamesToReady,
      
      // Date plan availability
      datePlanAvailable: decision.datePlanAvailable,
      
      // AI narrative availability
      aiNarrativeAvailable: decision.aiNarrativeAvailable,
      aiNarrative: decision.aiNarrative,
      
      // Metadata
      generatedAt: decision.generatedAt,
      hasViewed: decision.hasViewed(userId),
      
      // Static info
      decisionInfo: DateDecision.getDecisionInfo()
    };
  }
}

module.exports = new DateDecisionService();
