// src/services/coupleCompatibility.service.js

const mongoose = require('mongoose');
const CoupleCompatibility = require('../models/CoupleCompatibility');
const TwoTruthsLieGame = require('../models/TwoTruthsLieGame');
const TwoTruthsLieStatement = require('../models/TwoTruthsLieStatement');
const TwoTruthsLieVoiceNote = require('../models/TwoTruthsLieVoiceNote');
const WouldYouRatherSession = require('../models/games/WouldYouRatherSession');
const WouldYouRatherQuestion = require('../models/games/WouldYouRatherQuestion');
const IntimacySpectrumSession = require('../models/games/IntimacySpectrumSession');
const IntimacySpectrumQuestion = require('../models/games/IntimacySpectrumQuestion');
const NeverHaveIEverSession = require('../models/games/NeverHaveIEverSession');
const NeverHaveIEverStatement = require('../models/games/NeverHaveIEverQuestion');
const WhatWouldYouDoSession = require('../models/games/WhatWouldYouDoSession');
const WhatWouldYouDoScenario = require('../models/games/WhatWouldYouDoQuestion');
const DreamBoardSession = require('../models/games/DreamBoardSession');
const DreamBoardCategory = require('../models/games/DreamBoardCategory');
const Match = require('../models/Match');
const OpenAI = require('openai');
const logger = require('../utils/logger');

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * COUPLE COMPATIBILITY SERVICE
 * 
 * Aggregates data from all 6 compatibility games to generate
 * comprehensive relationship insights.
 * 
 * Core Responsibilities:
 * - Query latest completed games for a match
 * - Compute dimension scores from game results
 * - Aggregate insights (strengths, discussion areas, conversation starters)
 * - Generate AI narrative (requires 3+ games)
 * - Detect updates (new games since last generation)
 */

class CoupleCompatibilityService {

  // =====================================================
  // GAME TYPE CONSTANTS
  // =====================================================

  static GAME_TYPES = [
    'two_truths_lie',
    'would_you_rather', 
    'intimacy_spectrum',
    'never_have_i_ever',
    'what_would_you_do',
    'dream_board'
  ];

  static DIMENSION_MAP = {
    two_truths_lie: 'intuition',
    would_you_rather: 'lifestyle',
    intimacy_spectrum: 'physical',
    never_have_i_ever: 'experience',
    what_would_you_do: 'character',
    dream_board: 'future'
  };

  static MINIMUM_GAMES_FOR_AI = 3;

  // =====================================================
  // MAIN DASHBOARD
  // =====================================================

  /**
   * Get compatibility dashboard for a match
   * Returns cached data + checks for updates
   * 
   * @param {ObjectId} matchId - The match ID
   * @param {ObjectId} userId - Requesting user (for validation)
   * @returns {Promise<Object>} Dashboard data
   */
  async getDashboard(matchId, userId) {
    try {
      logger.info('Getting compatibility dashboard', { matchId, userId });

      // Validate match and get players
      const match = await this._validateMatch(matchId, userId);
      const { player1Id, player2Id } = this._getPlayerIds(match, userId);

      // Get the canonical matchId (the one games use) - this handles bidirectional matches
      const canonicalMatchId = await this._getCanonicalMatchId(player1Id, player2Id);

      // Get or check existing compatibility document - search by BOTH matchId and player IDs
      let compatibility = await this._findCompatibilityForCouple(matchId, player1Id, player2Id);
      
      // Get current game status (live query) - use canonical matchId for games
      const gameMatchId = canonicalMatchId || matchId;
      const currentGamesStatus = await this.getCurrentGamesStatus(gameMatchId, player1Id, player2Id);
      const totalGamesCompleted = Object.values(currentGamesStatus)
        .filter(g => g.completed).length;

      // If no compatibility exists yet
      if (!compatibility) {
        return {
          matchId,
          exists: false,
          lastGeneratedAt: null,
          
          // Update detection
          updateAvailable: totalGamesCompleted > 0,
          updateReason: totalGamesCompleted > 0 
            ? `${totalGamesCompleted} game${totalGamesCompleted > 1 ? 's' : ''} ready to analyze`
            : null,
          newGamesSinceLastUpdate: Object.entries(currentGamesStatus)
            .filter(([_, g]) => g.completed)
            .map(([type, _]) => type),
          
          // Games status
          gamesSnapshot: this._getEmptyGamesSnapshot(),
          totalGamesIncluded: 0,
          currentGamesStatus,
          totalGamesCompleted,
          
          // Empty scores
          dimensionScores: this._getEmptyDimensionScores(),
          overallCompatibility: {
            score: null,
            confidence: 'minimal',
            level: null
          },
          
          // Empty insights
          strengths: [],
          discussionAreas: [],
          conversationStarters: [],
          
          // AI not available
          aiInsights: null,
          aiInsightsAvailable: false,
          gamesNeededForAI: CoupleCompatibilityService.MINIMUM_GAMES_FOR_AI,
          
          // Metadata
          gameDisplayInfo: CoupleCompatibility.getGameDisplayInfo(),
          confidenceLevelInfo: CoupleCompatibility.getConfidenceLevelInfo(),
          compatibilityLevelInfo: CoupleCompatibility.getCompatibilityLevelInfo()
        };
      }

      // Check for updates (new games since last generation)
      const updateCheck = this._checkForUpdates(compatibility, currentGamesStatus);

      return {
        matchId,
        exists: true,
        lastGeneratedAt: compatibility.lastGeneratedAt,
        
        // Update detection
        updateAvailable: updateCheck.updateAvailable,
        updateReason: updateCheck.reason,
        newGamesSinceLastUpdate: updateCheck.newGames,
        
        // Cached games snapshot
        gamesSnapshot: compatibility.gamesSnapshot,
        totalGamesIncluded: compatibility.totalGamesIncluded,
        
        // Live games status
        currentGamesStatus,
        totalGamesCompleted,
        
        // Cached dimension scores
        dimensionScores: compatibility.dimensionScores,
        
        // Cached overall compatibility
        overallCompatibility: compatibility.overallCompatibility,
        
        // Cached aggregated insights
        strengths: compatibility.strengths,
        discussionAreas: compatibility.discussionAreas,
        conversationStarters: compatibility.conversationStarters,
        redFlags: compatibility.redFlags,
        hiddenAlignments: compatibility.hiddenAlignments,
        
        // Cached AI insights
        aiInsights: compatibility.aiInsights,
        aiInsightsAvailable: compatibility.aiInsightsAvailable,
        gamesNeededForAI: compatibility.gamesNeededForAI,
        
        // Metadata
        gameDisplayInfo: CoupleCompatibility.getGameDisplayInfo(),
        confidenceLevelInfo: CoupleCompatibility.getConfidenceLevelInfo(),
        compatibilityLevelInfo: CoupleCompatibility.getCompatibilityLevelInfo()
      };

    } catch (error) {
      logger.error('Error getting compatibility dashboard:', error);
      throw error;
    }
  }

  // =====================================================
  // GENERATE / REFRESH COMPATIBILITY
  // =====================================================

  /**
   * Generate or refresh compatibility analysis
   * Pulls latest data from all completed games
   * 
   * @param {ObjectId} matchId - The match ID
   * @param {ObjectId} userId - Requesting user
   * @returns {Promise<Object>} Generated compatibility data
   */
  async generateCompatibility(matchId, userId) {
    try {
      logger.info('Generating compatibility', { matchId, userId });

      // Validate match
      const match = await this._validateMatch(matchId, userId);
      const { player1Id, player2Id } = this._getPlayerIds(match, userId);

      // Get the canonical matchId (the one games use)
      const canonicalMatchId = await this._getCanonicalMatchId(player1Id, player2Id);
      const gameMatchId = canonicalMatchId || matchId;

      // Check if compatibility already exists for this couple (by player IDs)
      let compatibility = await this._findCompatibilityForCouple(matchId, player1Id, player2Id);
      
      if (!compatibility) {
        // Create new - use the matchId passed in (user's perspective)
        compatibility = await CoupleCompatibility.getOrCreate(matchId, player1Id, player2Id);
      }
      
      // Clear existing data for fresh generation
      compatibility.clearForRegeneration();

      // Get latest completed sessions for all games - use canonical matchId
      const gameSessions = await this.getLatestGameSessions(gameMatchId, player1Id, player2Id);

      // Process each game and update compatibility
      const gameData = {};
      
      for (const gameType of CoupleCompatibilityService.GAME_TYPES) {
        const session = gameSessions[gameType];
        
        if (session) {
          // Update game snapshot
          const snapshotData = this._extractSnapshotData(gameType, session);
          compatibility.updateGameSnapshot(gameType, snapshotData);
          
          // Update dimension score
          const dimension = CoupleCompatibilityService.DIMENSION_MAP[gameType];
          compatibility.updateDimensionScore(dimension, snapshotData.score, gameType);
          
          // Store full game data for aggregation
          gameData[gameType] = {
            session,
            score: snapshotData.score,
            insights: this._extractGameInsights(gameType, session)
          };
        }
      }

      // Calculate overall score
      compatibility.calculateOverallScore();

      // Aggregate insights from all games
      this._aggregateInsights(compatibility, gameData);

      // Generate AI insights if eligible (3+ games)
      if (compatibility.totalGamesIncluded >= CoupleCompatibilityService.MINIMUM_GAMES_FOR_AI) {
        try {
          const aiInsights = await this._generateAIInsights(compatibility, gameData, player1Id, player2Id);
          compatibility.setAIInsights(aiInsights);
        } catch (aiError) {
          logger.error('Error generating AI insights:', aiError);
          // Continue without AI insights
        }
      }

      // Update generation timestamp
      compatibility.lastGeneratedAt = new Date();
      
      // Save
      await compatibility.save();

      logger.info('Compatibility generated successfully', { 
        matchId, 
        gamesIncluded: compatibility.totalGamesIncluded,
        overallScore: compatibility.overallCompatibility.score 
      });

      // Return full dashboard
      return this.getDashboard(matchId, userId);

    } catch (error) {
      logger.error('Error generating compatibility:', error);
      throw error;
    }
  }

  // =====================================================
  // CURRENT GAMES STATUS (LIVE QUERY)
  // =====================================================

  /**
   * Get current status of all games for a match
   * Live query - not cached
   * 
   * @param {ObjectId} matchId 
   * @param {ObjectId} player1Id 
   * @param {ObjectId} player2Id 
   * @returns {Promise<Object>} Status for each game type
   */
  async getCurrentGamesStatus(matchId, player1Id, player2Id) {
    const status = {};

    // Two Truths & A Lie
    const ttlGame = await TwoTruthsLieGame.findOne({
      matchId,
      status: 'completed'
    }).sort({ completedAt: -1 });
    
    status.two_truths_lie = {
      completed: !!ttlGame,
      latestCompletedAt: ttlGame?.completedAt || null,
      sessionId: ttlGame?._id?.toString() || null,
      playCount: await TwoTruthsLieGame.countDocuments({ matchId, status: 'completed' })
    };

    // Would You Rather
    const wyrSession = await WouldYouRatherSession.findOne({
      matchId,
      status: { $in: ['completed', 'discussion'] }
    }).sort({ completedAt: -1 });
    
    status.would_you_rather = {
      completed: !!wyrSession,
      latestCompletedAt: wyrSession?.completedAt || null,
      sessionId: wyrSession?.sessionId || null,
      playCount: await WouldYouRatherSession.countDocuments({ 
        matchId, 
        status: { $in: ['completed', 'discussion'] }
      })
    };

    // Intimacy Spectrum
    const isSession = await IntimacySpectrumSession.findOne({
      matchId,
      status: { $in: ['completed', 'discussion'] }
    }).sort({ completedAt: -1 });
    
    status.intimacy_spectrum = {
      completed: !!isSession,
      latestCompletedAt: isSession?.completedAt || null,
      sessionId: isSession?.sessionId || null,
      playCount: await IntimacySpectrumSession.countDocuments({ 
        matchId, 
        status: { $in: ['completed', 'discussion'] }
      })
    };

    // Never Have I Ever
    const nhieSession = await NeverHaveIEverSession.findOne({
      matchId,
      status: { $in: ['completed', 'discussion'] }
    }).sort({ completedAt: -1 });
    
    status.never_have_i_ever = {
      completed: !!nhieSession,
      latestCompletedAt: nhieSession?.completedAt || null,
      sessionId: nhieSession?.sessionId || null,
      playCount: await NeverHaveIEverSession.countDocuments({ 
        matchId, 
        status: { $in: ['completed', 'discussion'] }
      })
    };

    // What Would You Do
    const wwydSession = await WhatWouldYouDoSession.findOne({
      matchId,
      status: 'completed'
    }).sort({ completedAt: -1 });
    
    status.what_would_you_do = {
      completed: !!wwydSession,
      latestCompletedAt: wwydSession?.completedAt || null,
      sessionId: wwydSession?.sessionId || null,
      playCount: await WhatWouldYouDoSession.countDocuments({ 
        matchId, 
        status: 'completed'
      })
    };

    // Dream Board
    const dbSession = await DreamBoardSession.findOne({
      matchId,
      status: 'completed'
    }).sort({ completedAt: -1 });
    
    status.dream_board = {
      completed: !!dbSession,
      latestCompletedAt: dbSession?.completedAt || null,
      sessionId: dbSession?.sessionId || null,
      playCount: await DreamBoardSession.countDocuments({ 
        matchId, 
        status: 'completed'
      })
    };

    return status;
  }

  // =====================================================
  // GET LATEST GAME SESSIONS
  // =====================================================

  /**
   * Get the latest completed session for each game type
   * 
   * @param {ObjectId} matchId 
   * @param {ObjectId} player1Id 
   * @param {ObjectId} player2Id 
   * @returns {Promise<Object>} Latest session for each game type
   */
  async getLatestGameSessions(matchId, player1Id, player2Id) {
    const sessions = {};

    // Two Truths & A Lie
    sessions.two_truths_lie = await TwoTruthsLieGame.findOne({
      matchId,
      status: 'completed'
    })
      .sort({ completedAt: -1 })
      .populate('initiatorId', 'firstName lastName')
      .populate('partnerId', 'firstName lastName');

    // Would You Rather
    sessions.would_you_rather = await WouldYouRatherSession.findOne({
      matchId,
      status: { $in: ['completed', 'discussion'] }
    })
      .sort({ completedAt: -1 })
      .populate('player1.userId', 'firstName lastName')
      .populate('player2.userId', 'firstName lastName');

    // Intimacy Spectrum
    sessions.intimacy_spectrum = await IntimacySpectrumSession.findOne({
      matchId,
      status: { $in: ['completed', 'discussion'] }
    })
      .sort({ completedAt: -1 })
      .populate('player1.userId', 'firstName lastName')
      .populate('player2.userId', 'firstName lastName');

    // Never Have I Ever
    sessions.never_have_i_ever = await NeverHaveIEverSession.findOne({
      matchId,
      status: { $in: ['completed', 'discussion'] }
    })
      .sort({ completedAt: -1 })
      .populate('player1.userId', 'firstName lastName')
      .populate('player2.userId', 'firstName lastName');

    // What Would You Do
    sessions.what_would_you_do = await WhatWouldYouDoSession.findOne({
      matchId,
      status: 'completed'
    })
      .sort({ completedAt: -1 })
      .populate('player1.userId', 'firstName lastName')
      .populate('player2.userId', 'firstName lastName');

    // Dream Board
    sessions.dream_board = await DreamBoardSession.findOne({
      matchId,
      status: 'completed'
    })
      .sort({ completedAt: -1 })
      .populate('player1.userId', 'firstName lastName')
      .populate('player2.userId', 'firstName lastName');

    return sessions;
  }

  // =====================================================
  // GAME HISTORY
  // =====================================================

  /**
   * Get list of all completed games for a match
   * Basic info for history list view
   * 
   * @param {ObjectId} matchId 
   * @param {ObjectId} userId 
   * @returns {Promise<Object>} List of games with basic info
   */
  async getGameHistory(matchId, userId) {
    try {
      // Validate
      const match = await this._validateMatch(matchId, userId);
      const { player1Id, player2Id } = this._getPlayerIds(match, userId);

      // Get the canonical matchId (the one games use)
      const canonicalMatchId = await this._getCanonicalMatchId(player1Id, player2Id);
      const gameMatchId = canonicalMatchId || matchId;

      // Get compatibility document for "includedInCompatibility" flag
      const compatibility = await this._findCompatibilityForCouple(matchId, player1Id, player2Id);
      
      const gameDisplayInfo = CoupleCompatibility.getGameDisplayInfo();
      const history = [];

      for (const gameType of CoupleCompatibilityService.GAME_TYPES) {
        const displayInfo = gameDisplayInfo[gameType];
        const gameHistory = await this._getGameHistoryForType(
          gameType, 
          gameMatchId,  // Use canonical matchId for games
          player1Id, 
          player2Id,
          compatibility
        );
        
        history.push({
          gameType,
          displayName: displayInfo.displayName,
          emoji: displayInfo.emoji,
          dimension: displayInfo.dimension,
          dimensionLabel: displayInfo.dimensionLabel,
          description: displayInfo.description,
          ...gameHistory
        });
      }

      return {
        matchId,
        games: history,
        totalCompleted: history.filter(g => g.status === 'completed').length,
        totalGames: 6
      };

    } catch (error) {
      logger.error('Error getting game history:', error);
      throw error;
    }
  }

  /**
   * Get history for a specific game type
   */
  async _getGameHistoryForType(gameType, matchId, player1Id, player2Id, compatibility) {
    let latestSession = null;
    let playCount = 0;

    switch (gameType) {
      case 'two_truths_lie':
        latestSession = await TwoTruthsLieGame.findOne({
          matchId,
          status: 'completed'
        }).sort({ completedAt: -1 });
        playCount = await TwoTruthsLieGame.countDocuments({ matchId, status: 'completed' });
        break;

      case 'would_you_rather':
        latestSession = await WouldYouRatherSession.findOne({
          matchId,
          status: { $in: ['completed', 'discussion'] }
        }).sort({ completedAt: -1 });
        playCount = await WouldYouRatherSession.countDocuments({ 
          matchId, 
          status: { $in: ['completed', 'discussion'] }
        });
        break;

      case 'intimacy_spectrum':
        latestSession = await IntimacySpectrumSession.findOne({
          matchId,
          status: { $in: ['completed', 'discussion'] }
        }).sort({ completedAt: -1 });
        playCount = await IntimacySpectrumSession.countDocuments({ 
          matchId, 
          status: { $in: ['completed', 'discussion'] }
        });
        break;

      case 'never_have_i_ever':
        latestSession = await NeverHaveIEverSession.findOne({
          matchId,
          status: { $in: ['completed', 'discussion'] }
        }).sort({ completedAt: -1 });
        playCount = await NeverHaveIEverSession.countDocuments({ 
          matchId, 
          status: { $in: ['completed', 'discussion'] }
        });
        break;

      case 'what_would_you_do':
        latestSession = await WhatWouldYouDoSession.findOne({
          matchId,
          status: 'completed'
        }).sort({ completedAt: -1 });
        playCount = await WhatWouldYouDoSession.countDocuments({ 
          matchId, 
          status: 'completed'
        });
        break;

      case 'dream_board':
        latestSession = await DreamBoardSession.findOne({
          matchId,
          status: 'completed'
        }).sort({ completedAt: -1 });
        playCount = await DreamBoardSession.countDocuments({ 
          matchId, 
          status: 'completed'
        });
        break;
    }

    if (!latestSession) {
      return {
        status: 'not_played',
        completedAt: null,
        score: null,
        quickSummary: null,
        playCount: 0,
        sessionId: null,
        includedInCompatibility: false
      };
    }

    const snapshotData = this._extractSnapshotData(gameType, latestSession);
    const includedSessionId = compatibility?.gamesSnapshot?.[gameType]?.sessionId;
    
    return {
      status: 'completed',
      completedAt: latestSession.completedAt,
      score: snapshotData.score,
      quickSummary: snapshotData.quickSummary,
      playCount,
      sessionId: snapshotData.sessionId,
      includedInCompatibility: includedSessionId === snapshotData.sessionId
    };
  }

  // =====================================================
  // GAME DETAILS
  // =====================================================

  /**
   * Get full details for a specific game
   * Includes all rounds/questions, answers, voice notes, AI insights
   * 
   * @param {ObjectId} matchId 
   * @param {String} gameType 
   * @param {ObjectId} userId 
   * @param {String} sessionId - Optional specific session ID
   * @returns {Promise<Object>} Full game details
   */
  async getGameDetails(matchId, gameType, userId, sessionId = null) {
    try {
      // Validate
      const match = await this._validateMatch(matchId, userId);
      const { player1Id, player2Id } = this._getPlayerIds(match, userId);

      if (!CoupleCompatibilityService.GAME_TYPES.includes(gameType)) {
        throw new Error(`Invalid game type: ${gameType}`);
      }

      // Get the canonical matchId (the one games use)
      const canonicalMatchId = await this._getCanonicalMatchId(player1Id, player2Id);
      const gameMatchId = canonicalMatchId || matchId;

      const gameDisplayInfo = CoupleCompatibility.getGameDisplayInfo()[gameType];

      switch (gameType) {
        case 'two_truths_lie':
          return this._getTwoTruthsLieDetails(gameMatchId, userId, sessionId, gameDisplayInfo);
        
        case 'would_you_rather':
          return this._getWouldYouRatherDetails(gameMatchId, userId, sessionId, gameDisplayInfo);
        
        case 'intimacy_spectrum':
          return this._getIntimacySpectrumDetails(gameMatchId, userId, sessionId, gameDisplayInfo);
        
        case 'never_have_i_ever':
          return this._getNeverHaveIEverDetails(gameMatchId, userId, sessionId, gameDisplayInfo);
        
        case 'what_would_you_do':
          return this._getWhatWouldYouDoDetails(gameMatchId, userId, sessionId, gameDisplayInfo);
        
        case 'dream_board':
          return this._getDreamBoardDetails(gameMatchId, userId, sessionId, gameDisplayInfo);
        
        default:
          throw new Error(`Unsupported game type: ${gameType}`);
      }

    } catch (error) {
      logger.error('Error getting game details:', error);
      throw error;
    }
  }

  // =====================================================
  // INDIVIDUAL GAME DETAIL METHODS
  // =====================================================

  /**
   * Get Two Truths & A Lie full details
   */
  async _getTwoTruthsLieDetails(matchId, userId, sessionId, displayInfo) {
    const query = sessionId 
      ? { _id: sessionId, status: 'completed' }
      : { matchId, status: 'completed' };

    const game = await TwoTruthsLieGame.findOne(query)
      .sort({ completedAt: -1 })
      .populate('initiatorId', 'firstName lastName profilePhoto')
      .populate('partnerId', 'firstName lastName profilePhoto');

    if (!game) {
      return { exists: false, gameType: 'two_truths_lie', displayInfo };
    }

    // Get all statements (rounds)
    const statements = await TwoTruthsLieStatement.find({ gameId: game._id })
      .sort({ roundNumber: 1 })
      .lean();

    // Get voice notes
    const voiceNotes = await TwoTruthsLieVoiceNote.find({ gameId: game._id })
      .sort({ createdAt: 1 })
      .lean();

    // Organize by round
    const rounds = [];
    for (let i = 1; i <= 10; i++) {
      const initiatorStatement = statements.find(
        s => s.roundNumber === i && s.authorId.toString() === game.initiatorId._id.toString()
      );
      const partnerStatement = statements.find(
        s => s.roundNumber === i && s.authorId.toString() === game.partnerId._id.toString()
      );

      rounds.push({
        roundNumber: i,
        initiator: initiatorStatement ? {
          statements: initiatorStatement.statements,
          lieIndex: initiatorStatement.lieIndex,
          partnerGuess: initiatorStatement.partnerGuessIndex,
          guessedCorrectly: initiatorStatement.lieIndex === initiatorStatement.partnerGuessIndex
        } : null,
        partner: partnerStatement ? {
          statements: partnerStatement.statements,
          lieIndex: partnerStatement.lieIndex,
          partnerGuess: partnerStatement.partnerGuessIndex,
          guessedCorrectly: partnerStatement.lieIndex === partnerStatement.partnerGuessIndex
        } : null
      });
    }

    return {
      exists: true,
      gameType: 'two_truths_lie',
      displayInfo,
      session: {
        id: game._id,
        completedAt: game.completedAt,
        initiator: game.initiatorId,
        partner: game.partnerId
      },
      scores: {
        initiatorScore: game.initiatorScore,
        partnerScore: game.partnerScore,
        winner: game.winner
      },
      rounds,
      voiceNotes: voiceNotes.map(vn => ({
        id: vn._id,
        senderId: vn.senderId,
        audioUrl: vn.audioUrl,
        duration: vn.duration,
        createdAt: vn.createdAt
      })),
      insights: game.insights,
      compatibilityScore: game.insights?.compatibilityScore || null
    };
  }

  /**
   * Get Would You Rather full details
   */
  async _getWouldYouRatherDetails(matchId, userId, sessionId, displayInfo) {
    const query = sessionId 
      ? { sessionId, status: { $in: ['completed', 'discussion'] } }
      : { matchId, status: { $in: ['completed', 'discussion'] } };

    const session = await WouldYouRatherSession.findOne(query)
      .sort({ completedAt: -1 })
      .populate('player1.userId', 'firstName lastName profilePhoto')
      .populate('player2.userId', 'firstName lastName profilePhoto');

    if (!session) {
      return { exists: false, gameType: 'would_you_rather', displayInfo };
    }

    // Get questions
    const questions = await WouldYouRatherQuestion.find({
      questionNumber: { $in: session.questionOrder }
    }).lean();

    const questionMap = {};
    questions.forEach(q => {
      questionMap[q.questionNumber] = q;
    });

    // Build question details
    const questionDetails = [];
    for (const qNum of session.questionOrder) {
      const question = questionMap[qNum];
      const p1Answer = session.player1.answers.find(a => a.questionNumber === qNum);
      const p2Answer = session.player2.answers.find(a => a.questionNumber === qNum);

      questionDetails.push({
        questionNumber: qNum,
        category: question?.category,
        optionA: question?.optionA,
        optionB: question?.optionB,
        player1Answer: p1Answer?.answer || null,
        player2Answer: p2Answer?.answer || null,
        matched: p1Answer?.answer && p2Answer?.answer && p1Answer.answer === p2Answer.answer,
        bothAnswered: !!p1Answer?.answer && !!p2Answer?.answer
      });
    }

    return {
      exists: true,
      gameType: 'would_you_rather',
      displayInfo,
      session: {
        id: session.sessionId,
        completedAt: session.completedAt,
        player1: session.player1.userId,
        player2: session.player2.userId
      },
      results: session.results,
      questions: questionDetails,
      voiceNotes: session.voiceNotes || [],
      aiInsights: session.aiInsights,
      compatibilityScore: session.results?.compatibilityScore || null
    };
  }

  /**
   * Get Intimacy Spectrum full details
   */
  async _getIntimacySpectrumDetails(matchId, userId, sessionId, displayInfo) {
    const query = sessionId 
      ? { sessionId, status: { $in: ['completed', 'discussion'] } }
      : { matchId, status: { $in: ['completed', 'discussion'] } };

    const session = await IntimacySpectrumSession.findOne(query)
      .sort({ completedAt: -1 })
      .populate('player1.userId', 'firstName lastName profilePhoto')
      .populate('player2.userId', 'firstName lastName profilePhoto');

    if (!session) {
      return { exists: false, gameType: 'intimacy_spectrum', displayInfo };
    }

    // Get questions
    const questions = await IntimacySpectrumQuestion.find({
      questionNumber: { $in: session.questionOrder }
    }).lean();

    const questionMap = {};
    questions.forEach(q => {
      questionMap[q.questionNumber] = q;
    });

    // Build question details with slider positions
    const questionDetails = [];
    for (const qNum of session.questionOrder) {
      const question = questionMap[qNum];
      const p1Answer = session.player1.answers.find(a => a.questionNumber === qNum);
      const p2Answer = session.player2.answers.find(a => a.questionNumber === qNum);

      const gap = (p1Answer?.position !== null && p2Answer?.position !== null)
        ? Math.abs(p1Answer.position - p2Answer.position)
        : null;

      questionDetails.push({
        questionNumber: qNum,
        category: question?.category,
        question: question?.question,
        leftLabel: question?.leftLabel,
        rightLabel: question?.rightLabel,
        spiceLevel: question?.spiceLevel,
        player1Position: p1Answer?.position ?? null,
        player2Position: p2Answer?.position ?? null,
        gap,
        alignment: gap !== null ? session.getAlignmentLabel(gap) : null,
        bothAnswered: p1Answer?.position !== null && p2Answer?.position !== null
      });
    }

    return {
      exists: true,
      gameType: 'intimacy_spectrum',
      displayInfo,
      session: {
        id: session.sessionId,
        completedAt: session.completedAt,
        player1: session.player1.userId,
        player2: session.player2.userId
      },
      results: session.results,
      questions: questionDetails,
      voiceNotes: session.voiceNotes || [],
      aiInsights: session.aiInsights,
      compatibilityScore: session.results?.compatibilityScore || null
    };
  }

  /**
   * Get Never Have I Ever full details
   */
  async _getNeverHaveIEverDetails(matchId, userId, sessionId, displayInfo) {
    const query = sessionId 
      ? { sessionId, status: { $in: ['completed', 'discussion'] } }
      : { matchId, status: { $in: ['completed', 'discussion'] } };

    const session = await NeverHaveIEverSession.findOne(query)
      .sort({ completedAt: -1 })
      .populate('player1.userId', 'firstName lastName profilePhoto')
      .populate('player2.userId', 'firstName lastName profilePhoto');

    if (!session) {
      return { exists: false, gameType: 'never_have_i_ever', displayInfo };
    }

    // Get statements
    const statements = await NeverHaveIEverStatement.find({
      statementNumber: { $in: session.statementOrder }
    }).lean();

    const statementMap = {};
    statements.forEach(s => {
      statementMap[s.statementNumber] = s;
    });

    // Build statement details
    const statementDetails = [];
    for (const sNum of session.statementOrder) {
      const statement = statementMap[sNum];
      const p1Answer = session.player1.answers.find(a => a.statementNumber === sNum);
      const p2Answer = session.player2.answers.find(a => a.statementNumber === sNum);

      statementDetails.push({
        statementNumber: sNum,
        category: statement?.category,
        statement: statement?.statement,
        spiceLevel: statement?.spiceLevel,
        player1HasDone: p1Answer?.hasDoneIt ?? null,
        player2HasDone: p2Answer?.hasDoneIt ?? null,
        sharedExperience: p1Answer?.hasDoneIt && p2Answer?.hasDoneIt,
        neitherHasDone: p1Answer?.hasDoneIt === false && p2Answer?.hasDoneIt === false,
        bothAnswered: p1Answer?.hasDoneIt !== null && p2Answer?.hasDoneIt !== null
      });
    }

    return {
      exists: true,
      gameType: 'never_have_i_ever',
      displayInfo,
      session: {
        id: session.sessionId,
        completedAt: session.completedAt,
        player1: session.player1.userId,
        player2: session.player2.userId
      },
      results: session.results,
      statements: statementDetails,
      badges: session.badges || [],
      voiceNotes: session.voiceNotes || [],
      aiInsights: session.aiInsights,
      compatibilityScore: session.results?.compatibilityScore || null
    };
  }

  /**
   * Get What Would You Do full details
   */
  async _getWhatWouldYouDoDetails(matchId, userId, sessionId, displayInfo) {
    const query = sessionId 
      ? { sessionId, status: 'completed' }
      : { matchId, status: 'completed' };

    const session = await WhatWouldYouDoSession.findOne(query)
      .sort({ completedAt: -1 })
      .populate('player1.userId', 'firstName lastName profilePhoto')
      .populate('player2.userId', 'firstName lastName profilePhoto');

    if (!session) {
      return { exists: false, gameType: 'what_would_you_do', displayInfo };
    }

    // Get scenarios
    const scenarios = await WhatWouldYouDoScenario.find({
      scenarioNumber: { $in: session.scenarioOrder }
    }).lean();

    const scenarioMap = {};
    scenarios.forEach(s => {
      scenarioMap[s.scenarioNumber] = s;
    });

    // Build scenario details
    const scenarioDetails = [];
    for (const sNum of session.scenarioOrder) {
      const scenario = scenarioMap[sNum];
      const p1Response = session.player1.responses?.find(r => r.scenarioNumber === sNum);
      const p2Response = session.player2.responses?.find(r => r.scenarioNumber === sNum);

      scenarioDetails.push({
        scenarioNumber: sNum,
        category: scenario?.category,
        scenario: scenario?.scenario,
        context: scenario?.context,
        player1: p1Response ? {
          voiceNoteUrl: p1Response.voiceNoteUrl,
          duration: p1Response.duration,
          transcript: p1Response.transcript,
          submittedAt: p1Response.submittedAt
        } : null,
        player2: p2Response ? {
          voiceNoteUrl: p2Response.voiceNoteUrl,
          duration: p2Response.duration,
          transcript: p2Response.transcript,
          submittedAt: p2Response.submittedAt
        } : null,
        aiAnalysis: session.results?.scenarioAnalysis?.find(a => a.scenarioNumber === sNum) || null
      });
    }

    return {
      exists: true,
      gameType: 'what_would_you_do',
      displayInfo,
      session: {
        id: session.sessionId,
        completedAt: session.completedAt,
        player1: session.player1.userId,
        player2: session.player2.userId
      },
      results: session.results,
      scenarios: scenarioDetails,
      discussionNotes: session.discussionNotes || [],
      aiInsights: session.aiInsights || session.results?.overallInsights,
      compatibilityScore: session.results?.overallCompatibility || null
    };
  }

  /**
   * Get Dream Board full details
   */
  async _getDreamBoardDetails(matchId, userId, sessionId, displayInfo) {
    const query = sessionId 
      ? { sessionId, status: 'completed' }
      : { matchId, status: 'completed' };

    const session = await DreamBoardSession.findOne(query)
      .sort({ completedAt: -1 })
      .populate('player1.userId', 'firstName lastName profilePhoto')
      .populate('player2.userId', 'firstName lastName profilePhoto');

    if (!session) {
      return { exists: false, gameType: 'dream_board', displayInfo };
    }

    // Get category definitions
    const categories = await DreamBoardCategory.find({}).lean();
    const categoryMap = {};
    categories.forEach(c => {
      categoryMap[c.categoryId] = c;
    });

    // Build category details
    const categoryDetails = [];
    const categoryIds = [
      'our_home', 'our_family', 'our_careers', 'our_money', 'our_weekends',
      'our_adventures', 'our_roots', 'our_intimacy', 'our_growth', 'our_someday'
    ];

    for (let i = 0; i < categoryIds.length; i++) {
      const catId = categoryIds[i];
      const categoryDef = categoryMap[catId];
      
      const p1Selection = session.player1.selections?.find(s => s.categoryId === catId);
      const p2Selection = session.player2.selections?.find(s => s.categoryId === catId);
      
      const categoryAnalysis = session.results?.categoryAnalysis?.find(
        a => a.categoryId === catId
      );

      categoryDetails.push({
        categoryNumber: i + 1,
        categoryId: catId,
        displayName: categoryDef?.displayName,
        question: categoryDef?.question,
        cards: categoryDef?.cards,
        player1: p1Selection ? {
          cardId: p1Selection.cardId,
          priority: p1Selection.priority,
          timeline: p1Selection.timeline,
          elaboration: p1Selection.elaboration ? {
            voiceNoteUrl: p1Selection.elaboration.voiceNoteUrl,
            duration: p1Selection.elaboration.duration,
            transcript: p1Selection.elaboration.transcript
          } : null
        } : null,
        player2: p2Selection ? {
          cardId: p2Selection.cardId,
          priority: p2Selection.priority,
          timeline: p2Selection.timeline,
          elaboration: p2Selection.elaboration ? {
            voiceNoteUrl: p2Selection.elaboration.voiceNoteUrl,
            duration: p2Selection.elaboration.duration,
            transcript: p2Selection.elaboration.transcript
          } : null
        } : null,
        analysis: categoryAnalysis || null
      });
    }

    return {
      exists: true,
      gameType: 'dream_board',
      displayInfo,
      session: {
        id: session.sessionId,
        completedAt: session.completedAt,
        player1: session.player1.userId,
        player2: session.player2.userId
      },
      results: session.results,
      categories: categoryDetails,
      discussionNotes: session.discussionNotes || [],
      hiddenAlignments: session.results?.hiddenAlignments || null,
      hiddenConcerns: session.results?.hiddenConcerns || null,
      compatibilityScore: session.results?.overallAlignment || null
    };
  }

  // =====================================================
  // EXTRACT SNAPSHOT DATA
  // =====================================================

  /**
   * Extract snapshot data from a game session
   */
  _extractSnapshotData(gameType, session) {
    switch (gameType) {
      case 'two_truths_lie':
        return {
          sessionId: session._id.toString(),
          completedAt: session.completedAt,
          score: session.insights?.compatibilityScore || this._calculateTTLScore(session),
          quickSummary: session.insights?.summary?.substring(0, 200) || 
            `${session.initiatorScore + session.partnerScore}/20 correct guesses`
        };

      case 'would_you_rather':
        return {
          sessionId: session.sessionId,
          completedAt: session.completedAt,
          score: session.results?.compatibilityScore || 0,
          quickSummary: session.aiInsights?.summary?.substring(0, 200) ||
            `${session.results?.matchedAnswers || 0}/50 matched`
        };

      case 'intimacy_spectrum':
        return {
          sessionId: session.sessionId,
          completedAt: session.completedAt,
          score: session.results?.compatibilityScore || 0,
          quickSummary: session.aiInsights?.summary?.substring(0, 200) ||
            `Average gap: ${session.results?.averageGap || 0} points`
        };

      case 'never_have_i_ever':
        return {
          sessionId: session.sessionId,
          completedAt: session.completedAt,
          score: session.results?.compatibilityScore || 0,
          quickSummary: session.aiInsights?.summary?.substring(0, 200) ||
            `${session.results?.sharedExperiences || 0} shared experiences`
        };

      case 'what_would_you_do':
        return {
          sessionId: session.sessionId,
          completedAt: session.completedAt,
          score: session.results?.overallCompatibility || 0,
          quickSummary: session.results?.overallInsights?.substring(0, 200) ||
            'Character compatibility assessment'
        };

      case 'dream_board':
        return {
          sessionId: session.sessionId,
          completedAt: session.completedAt,
          score: session.results?.overallAlignment || 0,
          quickSummary: session.results?.overallInsight?.substring(0, 200) ||
            `${session.results?.alignedCount || 0}/10 aligned dreams`
        };

      default:
        return {
          sessionId: null,
          completedAt: null,
          score: null,
          quickSummary: null
        };
    }
  }

  /**
   * Calculate TTL score if not present
   */
  _calculateTTLScore(session) {
    const totalCorrect = (session.initiatorScore || 0) + (session.partnerScore || 0);
    return Math.round((totalCorrect / 20) * 100);
  }

  // =====================================================
  // EXTRACT GAME INSIGHTS
  // =====================================================

  /**
   * Extract insights from a game session for aggregation
   */
  _extractGameInsights(gameType, session) {
    switch (gameType) {
      case 'two_truths_lie':
        return {
          observations: session.insights?.observations || [],
          funFacts: session.insights?.funFacts || [],
          conversationStarters: session.insights?.conversationStarters || []
        };

      case 'would_you_rather':
        return {
          compatibilityHighlights: session.aiInsights?.compatibilityHighlights || [],
          interestingDifferences: session.aiInsights?.interestingDifferences || [],
          strongestCategory: session.aiInsights?.strongestCategory,
          weakestCategory: session.aiInsights?.weakestCategory
        };

      case 'intimacy_spectrum':
        return {
          hottestAlignments: session.aiInsights?.hottestAlignments || [],
          worthDiscussing: session.aiInsights?.worthDiscussing || [],
          suggestionToTry: session.aiInsights?.suggestionToTry
        };

      case 'never_have_i_ever':
        return {
          sharedHighlights: session.aiInsights?.sharedHighlights || [],
          uniqueExperiences: session.aiInsights?.uniqueExperiences || [],
          badges: session.badges || []
        };

      case 'what_would_you_do':
        return {
          strengthAreas: session.results?.categoryBreakdown?.filter(c => c.score >= 70) || [],
          concernAreas: session.results?.categoryBreakdown?.filter(c => c.score < 50) || [],
          redFlags: session.results?.redFlags || [],
          greenFlags: session.results?.greenFlags || []
        };

      case 'dream_board':
        return {
          alignedDreams: session.results?.categoryAnalysis?.filter(c => c.alignmentLevel === 'aligned') || [],
          differentDreams: session.results?.categoryAnalysis?.filter(c => c.alignmentLevel === 'different') || [],
          hiddenAlignments: session.results?.hiddenAlignments,
          hiddenConcerns: session.results?.hiddenConcerns
        };

      default:
        return {};
    }
  }

  // =====================================================
  // AGGREGATE INSIGHTS
  // =====================================================

  /**
   * Aggregate insights from all games into compatibility document
   */
  _aggregateInsights(compatibility, gameData) {
    // Clear existing
    compatibility.strengths = [];
    compatibility.discussionAreas = [];
    compatibility.conversationStarters = [];
    compatibility.redFlags = [];
    compatibility.hiddenAlignments = [];

    for (const [gameType, data] of Object.entries(gameData)) {
      if (!data) continue;

      const { score, insights } = data;
      const displayInfo = CoupleCompatibility.getGameDisplayInfo()[gameType];

      // Add strengths (high scores or positive insights)
      if (score >= 70) {
        compatibility.addStrength(
          displayInfo.dimensionLabel,
          `Strong ${displayInfo.dimensionLabel.toLowerCase()} compatibility from ${displayInfo.displayName}`,
          gameType,
          score >= 85 ? 'significant' : 'moderate'
        );
      }

      // Add discussion areas (lower scores)
      if (score < 60 && score !== null) {
        compatibility.addDiscussionArea(
          displayInfo.dimensionLabel,
          `Room for growth in ${displayInfo.dimensionLabel.toLowerCase()} - explore this together`,
          gameType,
          score < 40 ? 'significant' : 'moderate'
        );
      }

      // Game-specific insight aggregation
      this._aggregateGameSpecificInsights(compatibility, gameType, insights, displayInfo);
    }

    // Limit arrays to reasonable sizes
    compatibility.strengths = compatibility.strengths.slice(0, 10);
    compatibility.discussionAreas = compatibility.discussionAreas.slice(0, 10);
    compatibility.conversationStarters = compatibility.conversationStarters.slice(0, 10);
    compatibility.redFlags = compatibility.redFlags.slice(0, 5);
    compatibility.hiddenAlignments = compatibility.hiddenAlignments.slice(0, 5);
  }

  /**
   * Aggregate game-specific insights
   */
  _aggregateGameSpecificInsights(compatibility, gameType, insights, displayInfo) {
    if (!insights) return;

    switch (gameType) {
      case 'two_truths_lie':
        // Add conversation starters
        (insights.conversationStarters || []).forEach(cs => {
          compatibility.addConversationStarter(cs, gameType, `From your ${displayInfo.displayName} game`);
        });
        break;

      case 'would_you_rather':
        // Add differences as discussion areas
        (insights.interestingDifferences || []).slice(0, 2).forEach(diff => {
          compatibility.addDiscussionArea(
            'Lifestyle Preferences',
            diff,
            gameType,
            'minor'
          );
        });
        break;

      case 'intimacy_spectrum':
        // Add hot alignments as strengths
        (insights.hottestAlignments || []).slice(0, 2).forEach(alignment => {
          compatibility.addStrength('Physical Chemistry', alignment, gameType, 'significant');
        });
        // Add worth discussing as discussion areas
        (insights.worthDiscussing || []).slice(0, 2).forEach(topic => {
          compatibility.addDiscussionArea('Intimacy', topic, gameType, 'moderate');
        });
        break;

      case 'what_would_you_do':
        // Add red flags
        (insights.redFlags || []).forEach(flag => {
          compatibility.redFlags.push({
            flag: flag.description || flag,
            severity: flag.severity || 'moderate',
            sourceGame: gameType
          });
        });
        // Add green flags as strengths
        (insights.greenFlags || []).slice(0, 2).forEach(flag => {
          compatibility.addStrength('Character', flag.description || flag, gameType, 'significant');
        });
        break;

      case 'dream_board':
        // Add hidden alignments
        if (insights.hiddenAlignments) {
          compatibility.hiddenAlignments.push({
            description: insights.hiddenAlignments,
            sourceGame: gameType
          });
        }
        // Add aligned dreams as strengths
        (insights.alignedDreams || []).slice(0, 2).forEach(dream => {
          compatibility.addStrength(
            'Shared Vision',
            `Aligned on ${dream.categoryId?.replace('our_', '').replace('_', ' ')}`,
            gameType,
            'moderate'
          );
        });
        break;
    }
  }

  // =====================================================
  // AI INSIGHTS GENERATION
  // =====================================================

  /**
   * Generate comprehensive AI insights
   * Requires 3+ games completed
   */
  async _generateAIInsights(compatibility, gameData, player1Id, player2Id) {
    logger.info('Generating AI insights', { 
      gamesIncluded: compatibility.totalGamesIncluded 
    });

    // Build context for AI
    const context = this._buildAIContext(compatibility, gameData);

    const prompt = `You are a relationship compatibility analyst for a dating app called Velora. 
You have data from ${compatibility.totalGamesIncluded} compatibility games played by a couple.

${context}

Generate a comprehensive compatibility assessment in JSON format with the following structure:
{
  "executiveSummary": "3-4 sentence high-level summary of their compatibility",
  "compatibilityNarrative": "3-4 paragraphs covering: what makes them click, complementary traits, potential friction points, and overall dynamic",
  "relationshipDynamic": "Analysis of their communication patterns, power dynamics, and how they might navigate conflicts",
  "communicationAnalysis": "Assessment of their openness, potential avoidance patterns, and emotional intelligence based on game responses",
  "longTermPotential": {
    "score": <0-100>,
    "assessment": "2-3 sentences on long-term viability",
    "factors": ["factor1", "factor2", "factor3"]
  },
  "recommendations": {
    "dateIdeas": ["idea1", "idea2", "idea3"],
    "conversationTopics": ["topic1", "topic2", "topic3"],
    "areasToExplore": ["area1", "area2"],
    "watchOutFor": ["warning1", "warning2"]
  },
  "verdict": {
    "headline": "A catchy 3-5 word headline like 'A Promising Match' or 'Strong Foundation'",
    "summary": "2-3 sentence final assessment",
    "confidence": "low/medium/high"
  }
}

Be romantic and encouraging but honest. Focus on actionable insights. Use warm, conversational language.
Return ONLY valid JSON, no markdown or explanation.`;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: 'You are a romantic relationship analyst. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      const content = response.choices[0].message.content.trim();
      
      // Parse JSON (handle potential markdown code blocks)
      let jsonStr = content;
      if (content.startsWith('```')) {
        jsonStr = content.replace(/```json?\n?/g, '').replace(/```$/g, '').trim();
      }

      const insights = JSON.parse(jsonStr);
      
      logger.info('AI insights generated successfully');
      return insights;

    } catch (error) {
      logger.error('Error generating AI insights:', error);
      throw error;
    }
  }

  /**
   * Build context string for AI prompt
   */
  _buildAIContext(compatibility, gameData) {
    let context = `## Overall Scores\n`;
    context += `Overall Compatibility: ${compatibility.overallCompatibility.score || 'N/A'}%\n`;
    context += `Confidence Level: ${compatibility.overallCompatibility.confidence}\n\n`;

    context += `## Dimension Scores\n`;
    for (const [dim, data] of Object.entries(compatibility.dimensionScores)) {
      if (data.available) {
        context += `- ${dim}: ${data.score}%\n`;
      }
    }

    context += `\n## Game-by-Game Insights\n`;
    for (const [gameType, data] of Object.entries(gameData)) {
      if (!data) continue;
      
      const displayInfo = CoupleCompatibility.getGameDisplayInfo()[gameType];
      context += `\n### ${displayInfo.displayName} (${displayInfo.dimensionLabel})\n`;
      context += `Score: ${data.score}%\n`;
      
      if (data.insights) {
        context += `Key insights: ${JSON.stringify(data.insights)}\n`;
      }
    }

    context += `\n## Aggregated Strengths\n`;
    compatibility.strengths.forEach(s => {
      context += `- ${s.area}: ${s.description}\n`;
    });

    context += `\n## Discussion Areas\n`;
    compatibility.discussionAreas.forEach(d => {
      context += `- ${d.area}: ${d.description}\n`;
    });

    if (compatibility.redFlags.length > 0) {
      context += `\n## Potential Concerns\n`;
      compatibility.redFlags.forEach(rf => {
        context += `- ${rf.flag} (${rf.severity})\n`;
      });
    }

    if (compatibility.hiddenAlignments.length > 0) {
      context += `\n## Hidden Alignments (from voice analysis)\n`;
      compatibility.hiddenAlignments.forEach(ha => {
        context += `- ${ha.description}\n`;
      });
    }

    return context;
  }

  // =====================================================
  // UPDATE DETECTION
  // =====================================================

  /**
   * Check if updates are available
   */
  _checkForUpdates(compatibility, currentGamesStatus) {
    const newGames = [];
    let hasUpdate = false;

    for (const gameType of CoupleCompatibilityService.GAME_TYPES) {
      const snapshot = compatibility.gamesSnapshot?.[gameType];
      const current = currentGamesStatus[gameType];

      // New game completed that wasn't in snapshot
      if (current.completed && !snapshot?.included) {
        newGames.push(gameType);
        hasUpdate = true;
      }
      
      // Same game type but newer session
      if (current.completed && snapshot?.included) {
        const snapshotDate = new Date(snapshot.completedAt);
        const currentDate = new Date(current.latestCompletedAt);
        if (currentDate > snapshotDate) {
          newGames.push(gameType);
          hasUpdate = true;
        }
      }
    }

    let reason = null;
    if (newGames.length === 1) {
      const displayInfo = CoupleCompatibility.getGameDisplayInfo()[newGames[0]];
      reason = `New game completed: ${displayInfo.displayName}`;
    } else if (newGames.length > 1) {
      reason = `${newGames.length} new games completed since last update`;
    }

    return {
      updateAvailable: hasUpdate,
      reason,
      newGames
    };
  }

  // =====================================================
  // HELPER METHODS
  // =====================================================

  /**
   * Find compatibility document for a couple
   * Searches by matchId first, then by player IDs (handles bidirectional matches)
   */
  async _findCompatibilityForCouple(matchId, player1Id, player2Id) {
    // First try by exact matchId
    let compatibility = await CoupleCompatibility.findOne({ matchId });
    
    if (compatibility) {
      return compatibility;
    }

    // If not found, search by player IDs (handles case where compatibility 
    // was created from the other user's match perspective)
    compatibility = await CoupleCompatibility.findOne({
      $or: [
        { player1Id: player1Id, player2Id: player2Id },
        { player1Id: player2Id, player2Id: player1Id }
      ]
    });

    return compatibility;
  }

  /**
   * Get the canonical matchId for a couple
   * Games are created with one consistent matchId - we need to find which one
   * Returns the matchId that games were created with, or null if no games exist
   */
  async _getCanonicalMatchId(player1Id, player2Id) {
    // Check which matchId was used for games by looking at any existing game
    // Games store matchId - we need to find which Match document's ID they use
    
    // Try to find a game with either player combination
    const p1Str = player1Id.toString();
    const p2Str = player2Id.toString();

    // Check Two Truths & A Lie (uses initiatorId/partnerId)
    const ttlGame = await TwoTruthsLieGame.findOne({
      $or: [
        { initiatorId: player1Id, partnerId: player2Id },
        { initiatorId: player2Id, partnerId: player1Id }
      ],
      status: 'completed'
    }).select('matchId').lean();

    if (ttlGame?.matchId) {
      return ttlGame.matchId;
    }

    // Check Would You Rather
    const wyrSession = await WouldYouRatherSession.findOne({
      $or: [
        { 'player1.userId': player1Id, 'player2.userId': player2Id },
        { 'player1.userId': player2Id, 'player2.userId': player1Id }
      ],
      status: { $in: ['completed', 'discussion'] }
    }).select('matchId').lean();

    if (wyrSession?.matchId) {
      return wyrSession.matchId;
    }

    // Check Intimacy Spectrum
    const isSession = await IntimacySpectrumSession.findOne({
      $or: [
        { 'player1.userId': player1Id, 'player2.userId': player2Id },
        { 'player1.userId': player2Id, 'player2.userId': player1Id }
      ],
      status: { $in: ['completed', 'discussion'] }
    }).select('matchId').lean();

    if (isSession?.matchId) {
      return isSession.matchId;
    }

    // Check Never Have I Ever
    const nhieSession = await NeverHaveIEverSession.findOne({
      $or: [
        { 'player1.userId': player1Id, 'player2.userId': player2Id },
        { 'player1.userId': player2Id, 'player2.userId': player1Id }
      ],
      status: { $in: ['completed', 'discussion'] }
    }).select('matchId').lean();

    if (nhieSession?.matchId) {
      return nhieSession.matchId;
    }

    // Check What Would You Do
    const wwydSession = await WhatWouldYouDoSession.findOne({
      $or: [
        { 'player1.userId': player1Id, 'player2.userId': player2Id },
        { 'player1.userId': player2Id, 'player2.userId': player1Id }
      ],
      status: 'completed'
    }).select('matchId').lean();

    if (wwydSession?.matchId) {
      return wwydSession.matchId;
    }

    // Check Dream Board
    const dbSession = await DreamBoardSession.findOne({
      $or: [
        { 'player1.userId': player1Id, 'player2.userId': player2Id },
        { 'player1.userId': player2Id, 'player2.userId': player1Id }
      ],
      status: 'completed'
    }).select('matchId').lean();

    if (dbSession?.matchId) {
      return dbSession.matchId;
    }

    // No games found - return null (will use the passed matchId)
    return null;
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
    
    // Determine which user is which
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
   * Get empty games snapshot
   */
  _getEmptyGamesSnapshot() {
    const snapshot = {};
    for (const gameType of CoupleCompatibilityService.GAME_TYPES) {
      snapshot[gameType] = {
        included: false,
        sessionId: null,
        completedAt: null,
        score: null,
        quickSummary: null
      };
    }
    return snapshot;
  }

  /**
   * Get empty dimension scores
   */
  _getEmptyDimensionScores() {
    return {
      intuition: { score: null, available: false, sourceGame: null },
      lifestyle: { score: null, available: false, sourceGame: null },
      physical: { score: null, available: false, sourceGame: null },
      experience: { score: null, available: false, sourceGame: null },
      character: { score: null, available: false, sourceGame: null },
      future: { score: null, available: false, sourceGame: null }
    };
  }

  // =====================================================
  // QUICK STATUS CHECK
  // =====================================================

  /**
   * Quick status check for a match
   * Lightweight endpoint for polling
   */
  async getQuickStatus(matchId, userId) {
    try {
      const match = await this._validateMatch(matchId, userId);
      const { player1Id, player2Id } = this._getPlayerIds(match, userId);

      // Find compatibility by matchId OR player IDs
      const compatibility = await this._findCompatibilityForCouple(matchId, player1Id, player2Id);

      if (!compatibility) {
        return {
          exists: false,
          lastGeneratedAt: null,
          totalGamesIncluded: 0,
          overallScore: null,
          aiInsightsAvailable: false
        };
      }

      return {
        exists: true,
        lastGeneratedAt: compatibility.lastGeneratedAt,
        totalGamesIncluded: compatibility.totalGamesIncluded,
        overallScore: compatibility.overallCompatibility?.score,
        aiInsightsAvailable: !!compatibility.aiInsights
      };

    } catch (error) {
      logger.error('Error getting quick status:', error);
      throw error;
    }
  }
}

module.exports = new CoupleCompatibilityService();