const mongoose = require('mongoose');
const TwoTruthsLieGame = require('../models/TwoTruthsLieGame');
const TwoTruthsLieStatement = require('../models/TwoTruthsLieStatement');
const TwoTruthsLieVoiceNote = require('../models/TwoTruthsLieVoiceNote');
const Match = require('../models/Match');
const User = require('../models/User');
const s3Service = require('./s3.service');
const twoTruthsLieInsightsService = require('./twoTruthsLieInsights.service');
const logger = require('../utils/logger');

/**
 * TwoTruthsLie Service
 * 
 * Core business logic for the async Two Truths & A Lie game.
 * 
 * Game Flow:
 * 1. User A starts game with mutual match → Partner receives notification
 * 2. Partner accepts/declines invitation
 * 3. Both players write 10 rounds of statements (async)
 * 4. Both players answer partner's questions (async)
 * 5. Results shown with AI insights
 * 6. Voice note discussion available
 * 7. Restart option (requires both to agree)
 */

class TwoTruthsLieService {
  
  // ==================== GAME CREATION ====================

  /**
   * Start a new game with a mutual match
   * @param {ObjectId} initiatorId - User starting the game
   * @param {ObjectId} partnerId - The partner to play with
   * @returns {Promise<Object>} - Created game
   */
  async startGame(initiatorId, partnerId) {
    try {
      logger.info('Starting Two Truths & Lie game', { initiatorId, partnerId });

      // Validate users exist
      const [initiator, partner] = await Promise.all([
        User.findById(initiatorId).select('firstName lastName username profilePhoto'),
        User.findById(partnerId).select('firstName lastName username profilePhoto'),
      ]);

      if (!initiator) {
        throw new Error('Initiator user not found');
      }
      if (!partner) {
        throw new Error('Partner user not found');
      }

      // Validate mutual match exists
      const match = await this._validateMutualMatch(initiatorId, partnerId);

      // Check for existing active game between these users
      const existingGame = await TwoTruthsLieGame.findActiveGameBetweenUsers(
        initiatorId,
        partnerId
      );

      if (existingGame) {
        throw new Error('An active game already exists between these users');
      }

      // Create the game
      const game = await TwoTruthsLieGame.create({
        initiatorId,
        partnerId,
        matchId: match._id,
        status: 'pending_acceptance',
        invitedAt: new Date(),
      });

      // Populate for response
      await game.populate([
        { path: 'initiatorId', select: 'firstName lastName username profilePhoto' },
        { path: 'partnerId', select: 'firstName lastName username profilePhoto' },
      ]);

      logger.info('Game created successfully', { gameId: game._id });

      return {
        game,
        initiator,
        partner,
      };

    } catch (error) {
      logger.error('Error starting game:', error);
      throw error;
    }
  }

  // ==================== INVITATION HANDLING ====================

  /**
   * Accept a game invitation
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The user accepting (must be partner)
   * @returns {Promise<Object>} - Updated game
   */
  async acceptInvitation(gameId, userId) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId);

      if (!game) {
        throw new Error('Game not found');
      }

      // Only partner can accept
      if (game.partnerId.toString() !== userId.toString()) {
        throw new Error('Only the invited partner can accept');
      }

      await game.accept();

      await game.populate([
        { path: 'initiatorId', select: 'firstName lastName username profilePhoto' },
        { path: 'partnerId', select: 'firstName lastName username profilePhoto' },
      ]);

      logger.info('Game invitation accepted', { gameId, partnerId: userId });

      return game;

    } catch (error) {
      logger.error('Error accepting invitation:', error);
      throw error;
    }
  }

  /**
   * Decline a game invitation
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The user declining (must be partner)
   * @returns {Promise<Object>} - Updated game
   */
  async declineInvitation(gameId, userId) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId);

      if (!game) {
        throw new Error('Game not found');
      }

      // Only partner can decline
      if (game.partnerId.toString() !== userId.toString()) {
        throw new Error('Only the invited partner can decline');
      }

      await game.decline();

      logger.info('Game invitation declined', { gameId, partnerId: userId });

      return game;

    } catch (error) {
      logger.error('Error declining invitation:', error);
      throw error;
    }
  }

  // ==================== GAME STATE ====================

  /**
   * Get game details with current status
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The requesting user
   * @returns {Promise<Object>} - Game details with contextual info
   */
  async getGameDetails(gameId, userId) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId)
        .populate('initiatorId', 'firstName lastName username profilePhoto')
        .populate('partnerId', 'firstName lastName username profilePhoto');

      if (!game) {
        throw new Error('Game not found');
      }

      // Verify user is participant
      if (!game.isParticipant(userId)) {
        throw new Error('You are not a participant in this game');
      }

      const userRole = game.getUserRole(userId);
      const userPhase = game.getUserPhase(userId);
      const otherPlayerId = game.getOtherPlayerId(userId);

      // Get additional context based on game status
      let additionalData = {};

      if (game.status === 'writing_phase') {
        // Check if user has submitted statements
        const hasSubmitted = await TwoTruthsLieStatement.hasSubmittedStatements(
          gameId,
          userId
        );
        additionalData.hasSubmittedStatements = hasSubmitted;
        
        // Check if partner has submitted
        const partnerSubmitted = await TwoTruthsLieStatement.hasSubmittedStatements(
          gameId,
          otherPlayerId
        );
        additionalData.partnerHasSubmittedStatements = partnerSubmitted;
      }

      if (game.status === 'answering_phase') {
        // Check if user has answered all
        const hasAnswered = await TwoTruthsLieStatement.hasAnsweredAll(
          gameId,
          userId
        );
        additionalData.hasAnsweredAll = hasAnswered;

        // Check if partner has answered all
        const partnerAnswered = await TwoTruthsLieStatement.hasAnsweredAll(
          gameId,
          otherPlayerId
        );
        additionalData.partnerHasAnsweredAll = partnerAnswered;

        // Get unanswered count
        const unanswered = await TwoTruthsLieStatement.getUnansweredForGuesser(
          gameId,
          userId
        );
        additionalData.unansweredCount = unanswered.length;
      }

      if (game.status === 'completed') {
        // Get voice note count
        const voiceNoteCount = await TwoTruthsLieVoiceNote.getCountForGame(gameId);
        additionalData.voiceNoteCount = voiceNoteCount;

        // Get unlistened voice notes for this user
        const unlistenedCount = await TwoTruthsLieVoiceNote.getUnlistenedCountForGame(
          gameId,
          userId
        );
        additionalData.unlistenedVoiceNotes = unlistenedCount;
      }

      return {
        game,
        userRole,
        userPhase,
        ...additionalData,
      };

    } catch (error) {
      logger.error('Error getting game details:', error);
      throw error;
    }
  }

  /**
   * Get all active games for a user
   * @param {ObjectId} userId - The user ID
   * @returns {Promise<Array>} - Array of active games
   */
  async getActiveGames(userId) {
    try {
      const games = await TwoTruthsLieGame.findActiveGamesForUser(userId);
      
      // Add context for each game
      const gamesWithContext = await Promise.all(
        games.map(async (game) => {
          const userRole = game.getUserRole(userId);
          const userPhase = game.getUserPhase(userId);
          
          return {
            ...game.toObject(),
            userRole,
            userPhase,
          };
        })
      );

      return gamesWithContext;

    } catch (error) {
      logger.error('Error getting active games:', error);
      throw error;
    }
  }

  /**
   * Get pending invitations for a user
   * @param {ObjectId} userId - The user ID
   * @returns {Promise<Array>} - Array of pending invitations
   */
  async getPendingInvitations(userId) {
    try {
      return TwoTruthsLieGame.findPendingInvitationsForUser(userId);
    } catch (error) {
      logger.error('Error getting pending invitations:', error);
      throw error;
    }
  }

  /**
   * Get completed games (history)
   * @param {ObjectId} userId - The user ID
   * @param {Object} options - Pagination options
   * @returns {Promise<Array>} - Array of completed games
   */
  async getGameHistory(userId, options = {}) {
    try {
      return TwoTruthsLieGame.findCompletedGamesForUser(userId, options);
    } catch (error) {
      logger.error('Error getting game history:', error);
      throw error;
    }
  }

  // ==================== STATEMENTS PHASE ====================

  /**
   * Submit all 10 rounds of statements
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The user submitting
   * @param {Array} rounds - Array of 10 rounds with statements
   * @returns {Promise<Object>} - Submission result
   */
  async submitStatements(gameId, userId, rounds) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId);

      if (!game) {
        throw new Error('Game not found');
      }

      if (!game.isParticipant(userId)) {
        throw new Error('You are not a participant in this game');
      }

      if (game.status !== 'writing_phase') {
        throw new Error('Game is not in writing phase');
      }

      // Validate rounds
      if (!Array.isArray(rounds) || rounds.length !== 10) {
        throw new Error('Must provide exactly 10 rounds');
      }

      // Validate each round has 3 statements with exactly 1 lie
      for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];
        if (!round.statements || round.statements.length !== 3) {
          throw new Error(`Round ${i + 1} must have exactly 3 statements`);
        }
        
        const lieCount = round.statements.filter(s => s.isLie).length;
        if (lieCount !== 1) {
          throw new Error(`Round ${i + 1} must have exactly 1 lie`);
        }

        // Validate statement lengths
        for (const stmt of round.statements) {
          if (!stmt.text || stmt.text.trim().length === 0) {
            throw new Error(`Round ${i + 1} has an empty statement`);
          }
          if (stmt.text.length > 200) {
            throw new Error(`Round ${i + 1} has a statement exceeding 200 characters`);
          }
        }
      }

      // Check if already submitted
      const alreadySubmitted = await TwoTruthsLieStatement.hasSubmittedStatements(
        gameId,
        userId
      );

      if (alreadySubmitted) {
        throw new Error('Statements already submitted');
      }

      // Get the other player's ID (they will be the guesser)
      const guesserId = game.getOtherPlayerId(userId);

      // Create all statements
      const statements = await TwoTruthsLieStatement.createStatementsForGame(
        gameId,
        userId,
        guesserId,
        rounds
      );

      // Update game state
      await game.submitStatements(userId);

      logger.info('Statements submitted', {
        gameId,
        userId,
        roundsCount: statements.length,
        gameStatus: game.status,
      });

      return {
        statementsCreated: statements.length,
        gameStatus: game.status,
        bothSubmitted: game.status === 'answering_phase',
      };

    } catch (error) {
      logger.error('Error submitting statements:', error);
      throw error;
    }
  }

  /**
   * Get user's own submitted statements
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The user ID
   * @returns {Promise<Array>} - User's statements
   */
  async getMyStatements(gameId, userId) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId);

      if (!game) {
        throw new Error('Game not found');
      }

      if (!game.isParticipant(userId)) {
        throw new Error('You are not a participant in this game');
      }

      const statements = await TwoTruthsLieStatement.getStatementsForAuthor(
        gameId,
        userId
      );

      return statements.map(s => s.toResultsView());

    } catch (error) {
      logger.error('Error getting my statements:', error);
      throw error;
    }
  }

  // ==================== ANSWERING PHASE ====================

  /**
   * Get questions to answer (partner's statements)
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The user ID (guesser)
   * @returns {Promise<Array>} - Statements to guess
   */
  async getQuestionsToAnswer(gameId, userId) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId);

      if (!game) {
        throw new Error('Game not found');
      }

      if (!game.isParticipant(userId)) {
        throw new Error('You are not a participant in this game');
      }

      // Can only get questions in answering phase or completed (for review)
      if (!['answering_phase', 'completed'].includes(game.status)) {
        throw new Error('Questions are not available in this phase');
      }

      const statements = await TwoTruthsLieStatement.getStatementsForGuesser(
        gameId,
        userId
      );

      // Return appropriate view based on game status
      if (game.status === 'completed') {
        // Show full results
        return statements.map(s => s.toResultsView());
      } else {
        // Show guesser view (hides lie)
        return statements.map(s => s.toGuesserView());
      }

    } catch (error) {
      logger.error('Error getting questions to answer:', error);
      throw error;
    }
  }

  /**
   * Submit all answers
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The user submitting answers
   * @param {Array} answers - Array of { roundNumber, selectedIndex }
   * @returns {Promise<Object>} - Result with score
   */
  async submitAnswers(gameId, userId, answers) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId);

      if (!game) {
        throw new Error('Game not found');
      }

      if (!game.isParticipant(userId)) {
        throw new Error('You are not a participant in this game');
      }

      if (game.status !== 'answering_phase') {
        throw new Error('Game is not in answering phase');
      }

      // Validate answers
      if (!Array.isArray(answers) || answers.length !== 10) {
        throw new Error('Must provide exactly 10 answers');
      }

      // Validate each answer
      const roundNumbers = new Set();
      for (const answer of answers) {
        if (answer.roundNumber < 1 || answer.roundNumber > 10) {
          throw new Error(`Invalid round number: ${answer.roundNumber}`);
        }
        if (answer.selectedIndex < 0 || answer.selectedIndex > 2) {
          throw new Error(`Invalid selected index for round ${answer.roundNumber}`);
        }
        if (roundNumbers.has(answer.roundNumber)) {
          throw new Error(`Duplicate answer for round ${answer.roundNumber}`);
        }
        roundNumbers.add(answer.roundNumber);
      }

      // Submit all answers and calculate score
      const result = await TwoTruthsLieStatement.submitAllAnswers(
        gameId,
        userId,
        answers
      );

      // Update game state with score
      await game.submitAnswers(userId, result.correctCount);

      logger.info('Answers submitted', {
        gameId,
        userId,
        score: result.correctCount,
        gameStatus: game.status,
      });

      // If game is now completed, generate insights
      let insights = null;
      if (game.status === 'completed') {
        try {
          insights = await this.generateInsights(gameId);
        } catch (insightError) {
          logger.error('Error generating insights:', insightError);
          // Don't fail the whole operation if insights fail
        }
      }

      return {
        score: result.correctCount,
        totalRounds: 10,
        results: result.results,
        gameStatus: game.status,
        gameCompleted: game.status === 'completed',
        insights,
      };

    } catch (error) {
      logger.error('Error submitting answers:', error);
      throw error;
    }
  }

  // ==================== RESULTS ====================

  /**
   * Get full game results
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The requesting user
   * @returns {Promise<Object>} - Full results
   */
  async getResults(gameId, userId) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId)
        .populate('initiatorId', 'firstName lastName username profilePhoto')
        .populate('partnerId', 'firstName lastName username profilePhoto');

      if (!game) {
        throw new Error('Game not found');
      }

      if (!game.isParticipant(userId)) {
        throw new Error('You are not a participant in this game');
      }

      if (game.status !== 'completed') {
        throw new Error('Game is not completed yet');
      }

      // Get all statements
      const allStatements = await TwoTruthsLieStatement.getAllForGame(gameId);

      // Separate by author
      const initiatorStatements = allStatements
        .filter(s => s.authorId._id.toString() === game.initiatorId._id.toString())
        .map(s => s.toResultsView());

      const partnerStatements = allStatements
        .filter(s => s.authorId._id.toString() === game.partnerId._id.toString())
        .map(s => s.toResultsView());

      // Get voice notes
      const voiceNotes = await TwoTruthsLieVoiceNote.getVoiceNotesForGame(gameId);

      return {
        game: {
          id: game._id,
          status: game.status,
          completedAt: game.completedAt,
          initiator: game.initiatorId,
          partner: game.partnerId,
          initiatorScore: game.initiatorScore,
          partnerScore: game.partnerScore,
          winner: game.winner,
          insights: game.insights,
          hasRestartRequest: game.hasRestartRequest,
          restartRequestedBy: game.restartRequestedBy,
        },
        initiatorStatements,
        partnerStatements,
        voiceNotes: voiceNotes.map(vn => vn.toClientView(userId)),
      };

    } catch (error) {
      logger.error('Error getting results:', error);
      throw error;
    }
  }

  // ==================== VOICE NOTES ====================

  /**
   * Upload a voice note for discussion
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The sender
   * @param {Object} audioFile - The audio file (multer file object)
   * @param {Number} duration - Duration in seconds
   * @param {Number} relatedRoundNumber - Optional round this note is about
   * @returns {Promise<Object>} - Created voice note
   */
  async sendVoiceNote(gameId, userId, audioFile, duration, relatedRoundNumber = null) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId);

      if (!game) {
        throw new Error('Game not found');
      }

      if (!game.isParticipant(userId)) {
        throw new Error('You are not a participant in this game');
      }

      // Voice notes only available after game completion
      if (game.status !== 'completed') {
        throw new Error('Voice notes are only available after game completion');
      }

      // Validate duration
      if (duration > 60) {
        throw new Error('Voice note cannot exceed 60 seconds');
      }

      // Validate audio file type
      const allowedTypes = [
        'audio/mpeg',
        'audio/mp3',
        'audio/mp4',
        'audio/m4a',
        'audio/x-m4a',
        'audio/wav',
        'audio/webm',
        'audio/ogg',
      ];

      if (!allowedTypes.includes(audioFile.mimetype)) {
        throw new Error('Invalid audio format');
      }

      // Upload to S3
      const s3Key = `games/two-truths-lie/${gameId}/voice-notes/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.m4a`;
      
      const uploadResult = await s3Service.uploadFile(
        audioFile.buffer,
        s3Key,
        audioFile.mimetype,
        'games-voice-notes'
      );

      // Get receiver ID
      const receiverId = game.getOtherPlayerId(userId);

      // Create voice note record
      const voiceNote = await TwoTruthsLieVoiceNote.createVoiceNote({
        gameId,
        senderId: userId,
        receiverId,
        audioUrl: uploadResult.url,
        s3Key: uploadResult.key,
        duration,
        fileSize: audioFile.size,
        mimeType: audioFile.mimetype,
        relatedRoundNumber,
      });

      await voiceNote.populate('senderId', 'firstName lastName username profilePhoto');

      logger.info('Voice note sent', { gameId, senderId: userId, duration });

      return voiceNote.toClientView(userId);

    } catch (error) {
      logger.error('Error sending voice note:', error);
      throw error;
    }
  }

  /**
   * Get all voice notes for a game
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The requesting user
   * @returns {Promise<Array>} - Voice notes
   */
  async getVoiceNotes(gameId, userId) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId);

      if (!game) {
        throw new Error('Game not found');
      }

      if (!game.isParticipant(userId)) {
        throw new Error('You are not a participant in this game');
      }

      const voiceNotes = await TwoTruthsLieVoiceNote.getVoiceNotesForGame(gameId);

      return voiceNotes.map(vn => vn.toClientView(userId));

    } catch (error) {
      logger.error('Error getting voice notes:', error);
      throw error;
    }
  }

  /**
   * Mark voice note as listened
   * @param {ObjectId} voiceNoteId - The voice note ID
   * @param {ObjectId} userId - The user (must be receiver)
   * @returns {Promise<Object>} - Updated voice note
   */
  async markVoiceNoteListened(voiceNoteId, userId) {
    try {
      const voiceNote = await TwoTruthsLieVoiceNote.findById(voiceNoteId);

      if (!voiceNote) {
        throw new Error('Voice note not found');
      }

      // Only receiver can mark as listened
      if (voiceNote.receiverId.toString() !== userId.toString()) {
        throw new Error('Only the receiver can mark as listened');
      }

      await voiceNote.markAsListened();

      return voiceNote.toClientView(userId);

    } catch (error) {
      logger.error('Error marking voice note as listened:', error);
      throw error;
    }
  }

  // ==================== RESTART ====================

  /**
   * Request to restart the game
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The user requesting
   * @returns {Promise<Object>} - Updated game
   */
  async requestRestart(gameId, userId) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId)
        .populate('initiatorId', 'firstName lastName username profilePhoto')
        .populate('partnerId', 'firstName lastName username profilePhoto');

      if (!game) {
        throw new Error('Game not found');
      }

      if (!game.isParticipant(userId)) {
        throw new Error('You are not a participant in this game');
      }

      await game.requestRestart(userId);

      logger.info('Restart requested', { gameId, requestedBy: userId });

      return game;

    } catch (error) {
      logger.error('Error requesting restart:', error);
      throw error;
    }
  }

  /**
   * Accept restart request and create new game
   * @param {ObjectId} gameId - The old game ID
   * @param {ObjectId} userId - The user accepting (must not be requester)
   * @returns {Promise<Object>} - New game
   */
  async acceptRestart(gameId, userId) {
    try {
      const oldGame = await TwoTruthsLieGame.findById(gameId);

      if (!oldGame) {
        throw new Error('Game not found');
      }

      if (!oldGame.isParticipant(userId)) {
        throw new Error('You are not a participant in this game');
      }

      if (!oldGame.restartRequestedBy) {
        throw new Error('No restart has been requested');
      }

      // The person accepting must be different from requester
      if (oldGame.restartRequestedBy.toString() === userId.toString()) {
        throw new Error('You cannot accept your own restart request');
      }

      // Create new game
      const newGame = await TwoTruthsLieGame.create({
        initiatorId: oldGame.initiatorId,
        partnerId: oldGame.partnerId,
        matchId: oldGame.matchId,
        status: 'writing_phase', // Skip pending_acceptance since both agreed
        acceptedAt: new Date(),
        previousGameId: oldGame._id,
        restartCount: oldGame.restartCount + 1,
        initiatorPhase: 'not_started',
        partnerPhase: 'not_started',
      });

      // Clear restart request on old game
      oldGame.restartRequestedBy = null;
      oldGame.restartRequestedAt = null;
      await oldGame.save();

      await newGame.populate([
        { path: 'initiatorId', select: 'firstName lastName username profilePhoto' },
        { path: 'partnerId', select: 'firstName lastName username profilePhoto' },
      ]);

      logger.info('Restart accepted, new game created', {
        oldGameId: gameId,
        newGameId: newGame._id,
      });

      return newGame;

    } catch (error) {
      logger.error('Error accepting restart:', error);
      throw error;
    }
  }

  /**
   * Decline restart request
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The user declining
   * @returns {Promise<Object>} - Updated game
   */
  async declineRestart(gameId, userId) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId);

      if (!game) {
        throw new Error('Game not found');
      }

      if (!game.isParticipant(userId)) {
        throw new Error('You are not a participant in this game');
      }

      if (!game.restartRequestedBy) {
        throw new Error('No restart has been requested');
      }

      // Clear the restart request
      game.restartRequestedBy = null;
      game.restartRequestedAt = null;
      await game.save();

      logger.info('Restart declined', { gameId, declinedBy: userId });

      return game;

    } catch (error) {
      logger.error('Error declining restart:', error);
      throw error;
    }
  }

  // ==================== CANCELLATION ====================

  /**
   * Cancel/leave a game
   * @param {ObjectId} gameId - The game ID
   * @param {ObjectId} userId - The user cancelling
   * @param {String} reason - Optional reason
   * @returns {Promise<Object>} - Updated game
   */
  async cancelGame(gameId, userId, reason = null) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId);

      if (!game) {
        throw new Error('Game not found');
      }

      await game.cancel(userId, reason);

      logger.info('Game cancelled', { gameId, cancelledBy: userId, reason });

      return game;

    } catch (error) {
      logger.error('Error cancelling game:', error);
      throw error;
    }
  }

  // ==================== STATISTICS ====================

  /**
   * Get user's game statistics
   * @param {ObjectId} userId - The user ID
   * @returns {Promise<Object>} - Statistics
   */
  async getUserStats(userId) {
    try {
      return TwoTruthsLieGame.getStatsForUser(userId);
    } catch (error) {
      logger.error('Error getting user stats:', error);
      throw error;
    }
  }

  // ==================== INSIGHTS ====================

  /**
   * Generate AI insights for a completed game
   * @param {ObjectId} gameId - The game ID
   * @returns {Promise<Object>} - Generated insights
   */
  async generateInsights(gameId) {
    try {
      return await twoTruthsLieInsightsService.generateInsights(gameId);
    } catch (error) {
      logger.error('Error generating insights:', error);
      throw error;
    }
  }

  /**
   * Regenerate insights (force refresh)
   * @param {ObjectId} gameId - The game ID
   * @returns {Promise<Object>} - New insights
   */
  async regenerateInsights(gameId) {
    try {
      return await twoTruthsLieInsightsService.regenerateInsights(gameId);
    } catch (error) {
      logger.error('Error regenerating insights:', error);
      throw error;
    }
  }

  // ==================== PRIVATE HELPERS ====================

  /**
   * Validate that a mutual match exists between users
   * @param {ObjectId} userId1 - First user
   * @param {ObjectId} userId2 - Second user
   * @returns {Promise<Object>} - The match document
   * @private
   */
  async _validateMutualMatch(userId1, userId2) {
    // Find match where both users have matched with each other
    const match = await Match.findOne({
      $or: [
        { userId: userId1, matchedUserId: userId2 },
        { userId: userId2, matchedUserId: userId1 },
      ],
      isMutualMatch: true,
      status: 'mutual_like',
    });

    if (!match) {
      throw new Error('Mutual match required to play games together');
    }

    return match;
  }
}

module.exports = new TwoTruthsLieService();