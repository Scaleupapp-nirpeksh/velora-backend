const twoTruthsLieService = require('../services/twoTruthsLie.service');
const logger = require('../utils/logger');

/**
 * Two Truths & A Lie Controller
 * Handles all HTTP requests for the game with inline validation.
 */

class TwoTruthsLieController {
  
  // ==================== GAME MANAGEMENT ====================

  /**
   * Start a new game with a matched partner
   * POST /api/v1/games/two-truths-lie/start
   */
  async startGame(req, res) {
    try {
      const initiatorId = req.user._id;
      const { partnerId } = req.body;

      // Validation
      if (!partnerId) {
        return res.status(400).json({
          success: false,
          message: 'partnerId is required',
        });
      }

      if (initiatorId.toString() === partnerId) {
        return res.status(400).json({
          success: false,
          message: 'Cannot start a game with yourself',
        });
      }

      const result = await twoTruthsLieService.startGame(initiatorId, partnerId);
      const { game } = result;

      logger.info('Game started', {
        gameId: game._id.toString(),
        initiatorId: initiatorId.toString(),
        partnerId,
      });

      // Return the already-populated game directly instead of re-fetching
      res.status(201).json({
        success: true,
        message: 'Game invitation sent',
        data: {
          game,
          userRole: 'initiator',
          userPhase: game.initiatorPhase,
        },
      });

    } catch (error) {
      logger.error('Error starting game:', error);

      if (error.message.includes('mutual match') || error.message.includes('No mutual match')) {
        return res.status(403).json({
          success: false,
          message: 'You can only play with mutual matches',
        });
      }

      if (error.message.includes('active game')) {
        return res.status(409).json({
          success: false,
          message: 'You already have an active game with this person',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to start game',
      });
    }
  }

  /**
   * Get active games for current user
   * GET /api/v1/games/two-truths-lie/active
   */
  async getActiveGames(req, res) {
    try {
      const userId = req.user._id;
      const games = await twoTruthsLieService.getActiveGames(userId);

      res.json({
        success: true,
        data: {
          games,
          count: games.length,
        },
      });

    } catch (error) {
      logger.error('Error getting active games:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get active games',
      });
    }
  }

  /**
   * Get pending invitations for current user
   * GET /api/v1/games/two-truths-lie/invitations
   */
  async getPendingInvitations(req, res) {
    try {
      const userId = req.user._id;
      const invitations = await twoTruthsLieService.getPendingInvitations(userId);

      res.json({
        success: true,
        data: {
          invitations,
          count: invitations.length,
        },
      });

    } catch (error) {
      logger.error('Error getting pending invitations:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get pending invitations',
      });
    }
  }

  /**
   * Get game details by ID
   * GET /api/v1/games/two-truths-lie/:gameId
   */
  async getGame(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;

      const gameDetails = await twoTruthsLieService.getGameDetails(gameId, userId);

      if (!gameDetails) {
        return res.status(404).json({
          success: false,
          message: 'Game not found',
        });
      }

      res.json({
        success: true,
        data: {
          game: gameDetails,
        },
      });

    } catch (error) {
      logger.error('Error getting game:', error);

      if (error.message.includes('not a participant')) {
        return res.status(403).json({
          success: false,
          message: 'You are not a participant in this game',
        });
      }

      if (error.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          message: 'Game not found',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to get game details',
      });
    }
  }

  /**
   * Accept game invitation
   * POST /api/v1/games/two-truths-lie/:gameId/accept
   */
  async acceptInvitation(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;

      const game = await twoTruthsLieService.acceptInvitation(gameId, userId);

      logger.info('Game invitation accepted', {
        gameId,
        acceptedBy: userId,
      });

      res.json({
        success: true,
        message: 'Game accepted! Start writing your statements.',
        data: {
          game: await twoTruthsLieService.getGameDetails(gameId, userId),
        },
      });

    } catch (error) {
      logger.error('Error accepting invitation:', error);

      if (error.message.includes('Only the partner') || error.message.includes('Only the invited')) {
        return res.status(403).json({
          success: false,
          message: 'Only the invited player can accept',
        });
      }

      if (error.message.includes('pending_acceptance') || error.message.includes('not pending')) {
        return res.status(400).json({
          success: false,
          message: 'This invitation is no longer pending',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to accept invitation',
      });
    }
  }

  /**
   * Decline game invitation
   * POST /api/v1/games/two-truths-lie/:gameId/decline
   */
  async declineInvitation(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;

      await twoTruthsLieService.declineInvitation(gameId, userId);

      logger.info('Game invitation declined', {
        gameId,
        declinedBy: userId,
      });

      res.json({
        success: true,
        message: 'Game invitation declined',
      });

    } catch (error) {
      logger.error('Error declining invitation:', error);

      if (error.message.includes('Only the partner') || error.message.includes('Only the invited')) {
        return res.status(403).json({
          success: false,
          message: 'Only the invited player can decline',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to decline invitation',
      });
    }
  }

  // ==================== STATEMENTS ====================

  /**
   * Submit all 10 rounds of statements
   * POST /api/v1/games/two-truths-lie/:gameId/statements
   */
  async submitStatements(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;
      const { rounds } = req.body;

      // Validation
      if (!rounds || !Array.isArray(rounds)) {
        return res.status(400).json({
          success: false,
          message: 'rounds array is required',
        });
      }

      if (rounds.length !== 10) {
        return res.status(400).json({
          success: false,
          message: 'Exactly 10 rounds are required',
        });
      }

      // Validate each round
      for (let i = 0; i < rounds.length; i++) {
        const round = rounds[i];
        
        if (!round.statements || !Array.isArray(round.statements) || round.statements.length !== 3) {
          return res.status(400).json({
            success: false,
            message: `Round ${i + 1}: Exactly 3 statements required`,
          });
        }

        const lies = round.statements.filter(s => s.isLie === true);
        if (lies.length !== 1) {
          return res.status(400).json({
            success: false,
            message: `Round ${i + 1}: Exactly 1 statement must be marked as lie`,
          });
        }

        for (let j = 0; j < round.statements.length; j++) {
          const stmt = round.statements[j];
          if (!stmt.text || typeof stmt.text !== 'string') {
            return res.status(400).json({
              success: false,
              message: `Round ${i + 1}, Statement ${j + 1}: text is required`,
            });
          }
          if (stmt.text.trim().length === 0) {
            return res.status(400).json({
              success: false,
              message: `Round ${i + 1}, Statement ${j + 1}: text cannot be empty`,
            });
          }
          if (stmt.text.length > 200) {
            return res.status(400).json({
              success: false,
              message: `Round ${i + 1}, Statement ${j + 1}: text must be 200 characters or less`,
            });
          }
        }
      }

      const result = await twoTruthsLieService.submitStatements(gameId, userId, rounds);

      logger.info('Statements submitted', {
        gameId,
        userId,
        transitionedToAnswering: result.bothSubmitted,
      });

      res.json({
        success: true,
        message: result.bothSubmitted
          ? 'Both players ready! Time to guess.'
          : 'Statements submitted. Waiting for partner.',
        data: {
          game: await twoTruthsLieService.getGameDetails(gameId, userId),
        },
      });

    } catch (error) {
      logger.error('Error submitting statements:', error);

      if (error.message.includes('writing_phase') || error.message.includes('not in writing')) {
        return res.status(400).json({
          success: false,
          message: 'Cannot submit statements in current game phase',
        });
      }

      if (error.message.includes('already submitted')) {
        return res.status(409).json({
          success: false,
          message: 'You have already submitted your statements',
        });
      }

      if (error.message.includes('not a participant')) {
        return res.status(403).json({
          success: false,
          message: 'You are not a participant in this game',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to submit statements',
      });
    }
  }

  /**
   * Get user's own statements
   * GET /api/v1/games/two-truths-lie/:gameId/my-statements
   */
  async getMyStatements(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;

      const statements = await twoTruthsLieService.getMyStatements(gameId, userId);

      res.json({
        success: true,
        data: {
          statements,
        },
      });

    } catch (error) {
      logger.error('Error getting my statements:', error);

      if (error.message.includes('not found') || error.message.includes('not a participant')) {
        return res.status(404).json({
          success: false,
          message: error.message,
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to get statements',
      });
    }
  }

  // ==================== ANSWERING ====================

  /**
   * Get questions to answer (partner's statements)
   * GET /api/v1/games/two-truths-lie/:gameId/questions
   */
  async getQuestions(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;

      const questions = await twoTruthsLieService.getQuestionsToAnswer(gameId, userId);

      res.json({
        success: true,
        data: {
          questions,
        },
      });

    } catch (error) {
      logger.error('Error getting questions:', error);

      if (error.message.includes('answering_phase')) {
        return res.status(400).json({
          success: false,
          message: 'Questions are not available yet. Both players must submit statements first.',
        });
      }

      if (error.message.includes('not submitted')) {
        return res.status(400).json({
          success: false,
          message: 'Partner has not submitted their statements yet',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to get questions',
      });
    }
  }

  /**
   * Submit answers for all rounds
   * POST /api/v1/games/two-truths-lie/:gameId/answers
   */
  async submitAnswers(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;
      const { answers } = req.body;

      // Validation
      if (!answers || !Array.isArray(answers)) {
        return res.status(400).json({
          success: false,
          message: 'answers array is required',
        });
      }

      if (answers.length !== 10) {
        return res.status(400).json({
          success: false,
          message: 'Exactly 10 answers are required',
        });
      }

      for (let i = 0; i < answers.length; i++) {
        const answer = answers[i];
        
        if (answer.roundNumber === undefined || answer.roundNumber < 1 || answer.roundNumber > 10) {
          return res.status(400).json({
            success: false,
            message: `Answer ${i + 1}: roundNumber must be between 1 and 10`,
          });
        }

        if (answer.selectedIndex === undefined || ![0, 1, 2].includes(answer.selectedIndex)) {
          return res.status(400).json({
            success: false,
            message: `Answer ${i + 1}: selectedIndex must be 0, 1, or 2`,
          });
        }
      }

      // Check for duplicate round numbers
      const roundNumbers = answers.map(a => a.roundNumber);
      const uniqueRounds = new Set(roundNumbers);
      if (uniqueRounds.size !== 10) {
        return res.status(400).json({
          success: false,
          message: 'Each round must be answered exactly once',
        });
      }

      const result = await twoTruthsLieService.submitAnswers(gameId, userId, answers);

      logger.info('Answers submitted', {
        gameId,
        userId,
        score: result.score,
        gameCompleted: result.gameCompleted,
      });

      res.json({
        success: true,
        message: result.gameCompleted
          ? 'Game complete! Check out your results.'
          : 'Answers submitted. Waiting for partner to finish.',
        data: {
          score: result.score,
          gameCompleted: result.gameCompleted,
          game: await twoTruthsLieService.getGameDetails(gameId, userId),
        },
      });

    } catch (error) {
      logger.error('Error submitting answers:', error);

      if (error.message.includes('answering_phase')) {
        return res.status(400).json({
          success: false,
          message: 'Cannot submit answers in current game phase',
        });
      }

      if (error.message.includes('already answered') || error.message.includes('already submitted')) {
        return res.status(409).json({
          success: false,
          message: 'You have already submitted your answers',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to submit answers',
      });
    }
  }

  // ==================== RESULTS ====================

  /**
   * Get game results
   * GET /api/v1/games/two-truths-lie/:gameId/results
   */
  async getResults(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;

      const results = await twoTruthsLieService.getResults(gameId, userId);

      res.json({
        success: true,
        data: results,
      });

    } catch (error) {
      logger.error('Error getting results:', error);

      if (error.message.includes('not completed')) {
        return res.status(400).json({
          success: false,
          message: 'Game is not yet completed',
        });
      }

      if (error.message.includes('not a participant')) {
        return res.status(403).json({
          success: false,
          message: 'You are not a participant in this game',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to get results',
      });
    }
  }

  /**
   * Regenerate AI insights
   * POST /api/v1/games/two-truths-lie/:gameId/regenerate-insights
   */
  async regenerateInsights(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;

      // First verify user is participant
      const gameDetails = await twoTruthsLieService.getGameDetails(gameId, userId);
      if (!gameDetails) {
        return res.status(404).json({
          success: false,
          message: 'Game not found',
        });
      }

      if (gameDetails.game.status !== 'completed') {
        return res.status(400).json({
          success: false,
          message: 'Game must be completed to regenerate insights',
        });
      }

      const insights = await twoTruthsLieService.regenerateInsights(gameId);

      logger.info('Insights regenerated', {
        gameId,
        requestedBy: userId,
      });

      res.json({
        success: true,
        message: 'Insights regenerated',
        data: {
          insights,
        },
      });

    } catch (error) {
      logger.error('Error regenerating insights:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to regenerate insights',
      });
    }
  }

  // ==================== VOICE NOTES ====================

  /**
   * Send voice note
   * POST /api/v1/games/two-truths-lie/:gameId/voice-notes
   */
  async sendVoiceNote(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;
      const { duration, relatedRoundNumber } = req.body;

      // Validation
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Audio file is required',
        });
      }

      const parsedDuration = parseFloat(duration);
      if (!duration || isNaN(parsedDuration) || parsedDuration <= 0) {
        return res.status(400).json({
          success: false,
          message: 'duration is required and must be a positive number',
        });
      }

      if (parsedDuration > 60) {
        return res.status(400).json({
          success: false,
          message: 'Voice note cannot exceed 60 seconds',
        });
      }

      let roundNum = null;
      if (relatedRoundNumber !== undefined && relatedRoundNumber !== null && relatedRoundNumber !== '') {
        roundNum = parseInt(relatedRoundNumber);
        if (isNaN(roundNum) || roundNum < 1 || roundNum > 10) {
          return res.status(400).json({
            success: false,
            message: 'relatedRoundNumber must be between 1 and 10',
          });
        }
      }

      const voiceNote = await twoTruthsLieService.sendVoiceNote(
        gameId,
        userId,
        req.file,
        parsedDuration,
        roundNum
      );

      logger.info('Voice note sent', {
        gameId,
        voiceNoteId: voiceNote._id,
        senderId: userId,
        duration: parsedDuration,
      });

      res.status(201).json({
        success: true,
        message: 'Voice note sent',
        data: {
          voiceNote,
        },
      });

    } catch (error) {
      logger.error('Error sending voice note:', error);

      if (error.message.includes('completed')) {
        return res.status(400).json({
          success: false,
          message: 'Voice notes can only be sent after game completion',
        });
      }

      if (error.message.includes('Invalid audio')) {
        return res.status(400).json({
          success: false,
          message: 'Invalid audio format. Supported: mp3, m4a, wav, webm, ogg',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to send voice note',
      });
    }
  }

  /**
   * Get voice notes for game
   * GET /api/v1/games/two-truths-lie/:gameId/voice-notes
   */
  async getVoiceNotes(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;

      const voiceNotes = await twoTruthsLieService.getVoiceNotes(gameId, userId);

      res.json({
        success: true,
        data: {
          voiceNotes,
          count: voiceNotes.length,
        },
      });

    } catch (error) {
      logger.error('Error getting voice notes:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get voice notes',
      });
    }
  }

  /**
   * Mark voice note as listened
   * POST /api/v1/games/two-truths-lie/:gameId/voice-notes/:voiceNoteId/listened
   */
  async markVoiceNoteListened(req, res) {
    try {
      const userId = req.user._id;
      const { voiceNoteId } = req.params;

      await twoTruthsLieService.markVoiceNoteListened(voiceNoteId, userId);

      res.json({
        success: true,
        message: 'Voice note marked as listened',
      });

    } catch (error) {
      logger.error('Error marking voice note listened:', error);

      if (error.message.includes('Only the receiver')) {
        return res.status(403).json({
          success: false,
          message: 'Only the receiver can mark voice note as listened',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to mark voice note as listened',
      });
    }
  }

  // ==================== RESTART ====================

  /**
   * Request restart
   * POST /api/v1/games/two-truths-lie/:gameId/restart-request
   */
  async requestRestart(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;

      const game = await twoTruthsLieService.requestRestart(gameId, userId);

      logger.info('Restart requested', {
        gameId,
        requestedBy: userId,
      });

      res.json({
        success: true,
        message: 'Restart request sent to partner',
        data: {
          game: await twoTruthsLieService.getGameDetails(gameId, userId),
        },
      });

    } catch (error) {
      logger.error('Error requesting restart:', error);

      if (error.message.includes('not completed')) {
        return res.status(400).json({
          success: false,
          message: 'Can only request restart after game completion',
        });
      }

      if (error.message.includes('already pending')) {
        return res.status(409).json({
          success: false,
          message: 'A restart request is already pending',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to request restart',
      });
    }
  }

  /**
   * Accept restart
   * POST /api/v1/games/two-truths-lie/:gameId/restart-accept
   */
  async acceptRestart(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;

      const newGame = await twoTruthsLieService.acceptRestart(gameId, userId);

      logger.info('Restart accepted, new game created', {
        oldGameId: gameId,
        newGameId: newGame._id,
        acceptedBy: userId,
      });

      res.json({
        success: true,
        message: 'New game started!',
        data: {
          game: await twoTruthsLieService.getGameDetails(newGame._id, userId),
        },
      });

    } catch (error) {
      logger.error('Error accepting restart:', error);

      if (error.message.includes('No restart request') || error.message.includes('no pending')) {
        return res.status(400).json({
          success: false,
          message: 'No restart request to accept',
        });
      }

      if (error.message.includes('cannot accept your own')) {
        return res.status(403).json({
          success: false,
          message: 'Cannot accept your own restart request',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to accept restart',
      });
    }
  }

  /**
   * Decline restart
   * POST /api/v1/games/two-truths-lie/:gameId/restart-decline
   */
  async declineRestart(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;

      await twoTruthsLieService.declineRestart(gameId, userId);

      logger.info('Restart declined', {
        gameId,
        declinedBy: userId,
      });

      res.json({
        success: true,
        message: 'Restart declined',
      });

    } catch (error) {
      logger.error('Error declining restart:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to decline restart',
      });
    }
  }

  // ==================== CANCEL ====================

  /**
   * Cancel game
   * DELETE /api/v1/games/two-truths-lie/:gameId
   */
  async cancelGame(req, res) {
    try {
      const userId = req.user._id;
      const { gameId } = req.params;
      const { reason } = req.body;

      await twoTruthsLieService.cancelGame(gameId, userId, reason);

      logger.info('Game cancelled', {
        gameId,
        cancelledBy: userId,
        reason,
      });

      res.json({
        success: true,
        message: 'Game cancelled',
      });

    } catch (error) {
      logger.error('Error cancelling game:', error);

      if (error.message.includes('Cannot cancel') || error.message.includes('cannot be cancelled')) {
        return res.status(400).json({
          success: false,
          message: 'This game cannot be cancelled',
        });
      }

      res.status(500).json({
        success: false,
        message: 'Failed to cancel game',
      });
    }
  }

  // ==================== HISTORY & STATS ====================

  /**
   * Get game history
   * GET /api/v1/games/two-truths-lie/history
   */
  async getHistory(req, res) {
    try {
      const userId = req.user._id;
      const { page = 1, limit = 10, partnerId } = req.query;

      const result = await twoTruthsLieService.getGameHistory(userId, {
        page: parseInt(page),
        limit: Math.min(parseInt(limit), 50), // Cap at 50
        partnerId,
      });

      res.json({
        success: true,
        data: result,
      });

    } catch (error) {
      logger.error('Error getting game history:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get game history',
      });
    }
  }

  /**
   * Get user stats
   * GET /api/v1/games/two-truths-lie/stats
   */
  async getStats(req, res) {
    try {
      const userId = req.user._id;
      const stats = await twoTruthsLieService.getUserStats(userId);

      res.json({
        success: true,
        data: {
          stats,
        },
      });

    } catch (error) {
      logger.error('Error getting stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get stats',
      });
    }
  }
}

module.exports = new TwoTruthsLieController();