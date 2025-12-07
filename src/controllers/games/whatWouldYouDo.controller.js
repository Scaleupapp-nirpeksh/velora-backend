// src/controllers/games/whatWouldYouDo.controller.js

const whatWouldYouDoService = require('../../services/games/whatWouldYouDo.service');
const WhatWouldYouDoQuestion = require('../../models/games/WhatWouldYouDoQuestion');
const logger = require('../../utils/logger');

/**
 * WHAT WOULD YOU DO - GAME CONTROLLER
 * 
 * HTTP endpoints for the async scenario-based voice note game.
 * 
 * Endpoints:
 * - POST   /invite              - Create game invitation
 * - POST   /accept/:sessionId   - Accept invitation
 * - POST   /decline/:sessionId  - Decline invitation
 * - GET    /pending             - Get pending invitation
 * - GET    /active              - Get active game
 * - GET    /session/:sessionId  - Get session state
 * - GET    /question/:sessionId/:questionNumber - Get question for answering
 * - POST   /answer/:sessionId   - Submit voice note answer
 * - GET    /results/:sessionId  - Get game results
 * - GET    /history             - Get completed games
 * - POST   /discussion/:sessionId - Add discussion note
 * - GET    /discussion/:sessionId - Get discussion notes
 * - POST   /abandon/:sessionId  - Abandon game
 * - GET    /questions           - Get all questions (admin/debug)
 */

class WhatWouldYouDoController {

  // =====================================================
  // INVITATION ENDPOINTS
  // =====================================================

  /**
   * POST /api/games/what-would-you-do/invite
   * Create a new game invitation
   */
  async createInvitation(req, res) {
    try {
      const userId = req.user._id;
      const { matchId } = req.body;

      if (!matchId) {
        return res.status(400).json({
          success: false,
          message: 'Match ID is required'
        });
      }

      const result = await whatWouldYouDoService.createInvitation(userId, matchId);

      res.status(201).json({
        success: true,
        message: 'Game invitation sent',
        data: {
          sessionId: result.session.sessionId,
          invitedUser: result.invitedUser,
          expiresAt: result.session.expiresAt,
          gameInfo: {
            name: 'What Would You Do?',
            description: '15 real-life scenarios to discover compatibility before commitment',
            questionCount: 15,
            responseType: 'voice',
            estimatedTime: '20-30 minutes'
          }
        }
      });

    } catch (error) {
      logger.error('Create invitation error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to create invitation'
      });
    }
  }

  /**
   * POST /api/games/what-would-you-do/accept/:sessionId
   * Accept a game invitation
   */
  async acceptInvitation(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      const session = await whatWouldYouDoService.acceptInvitation(sessionId, userId);

      res.json({
        success: true,
        message: 'Invitation accepted! Game is now active.',
        data: {
          sessionId: session.sessionId,
          status: session.status,
          expiresAt: session.expiresAt,
          totalQuestions: 15
        }
      });

    } catch (error) {
      logger.error('Accept invitation error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to accept invitation'
      });
    }
  }

  /**
   * POST /api/games/what-would-you-do/decline/:sessionId
   * Decline a game invitation
   */
  async declineInvitation(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      await whatWouldYouDoService.declineInvitation(sessionId, userId);

      res.json({
        success: true,
        message: 'Invitation declined'
      });

    } catch (error) {
      logger.error('Decline invitation error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to decline invitation'
      });
    }
  }

  /**
   * GET /api/games/what-would-you-do/pending
   * Get pending invitation for current user
   */
  async getPendingInvitation(req, res) {
    try {
      const userId = req.user._id;

      const invitation = await whatWouldYouDoService.getPendingInvitation(userId);

      if (!invitation) {
        return res.json({
          success: true,
          data: null,
          message: 'No pending invitations'
        });
      }

      res.json({
        success: true,
        data: invitation
      });

    } catch (error) {
      logger.error('Get pending invitation error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get pending invitation'
      });
    }
  }

  // =====================================================
  // GAME STATE ENDPOINTS
  // =====================================================

  /**
   * GET /api/games/what-would-you-do/active
   * Get active game for current user
   */
  async getActiveSession(req, res) {
    try {
      const userId = req.user._id;

      const session = await whatWouldYouDoService.getActiveSession(userId);

      if (!session) {
        return res.json({
          success: true,
          data: null,
          message: 'No active game'
        });
      }

      res.json({
        success: true,
        data: session
      });

    } catch (error) {
      logger.error('Get active session error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get active session'
      });
    }
  }

  /**
   * GET /api/games/what-would-you-do/session/:sessionId
   * Get specific session state
   */
  async getSessionState(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      const state = await whatWouldYouDoService.getSessionState(sessionId, userId);

      res.json({
        success: true,
        data: state
      });

    } catch (error) {
      logger.error('Get session state error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get session state'
      });
    }
  }

  // =====================================================
  // QUESTION & ANSWER ENDPOINTS
  // =====================================================

  /**
   * GET /api/games/what-would-you-do/question/:sessionId/:questionNumber
   * Get a specific question for answering
   */
  async getQuestion(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId, questionNumber } = req.params;

      if (!sessionId || !questionNumber) {
        return res.status(400).json({
          success: false,
          message: 'Session ID and question number are required'
        });
      }

      const qNum = parseInt(questionNumber, 10);
      if (isNaN(qNum) || qNum < 1 || qNum > 15) {
        return res.status(400).json({
          success: false,
          message: 'Question number must be between 1 and 15'
        });
      }

      const question = await whatWouldYouDoService.getQuestion(sessionId, userId, qNum);

      res.json({
        success: true,
        data: question
      });

    } catch (error) {
      logger.error('Get question error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get question'
      });
    }
  }

  /**
   * POST /api/games/what-would-you-do/answer/:sessionId
   * Submit a voice note answer
   * 
   * Expects multipart form data with:
   * - voiceNote: audio file (m4a, mp3, wav, webm)
   * - questionNumber: number (1-15)
   * - duration: number (seconds)
   */
  async submitAnswer(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId } = req.params;
      const { questionNumber, duration } = req.body;

      // Validate session ID
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      // Validate question number
      const qNum = parseInt(questionNumber, 10);
      if (isNaN(qNum) || qNum < 1 || qNum > 15) {
        return res.status(400).json({
          success: false,
          message: 'Question number must be between 1 and 15'
        });
      }

      // Validate duration
      const durationSec = parseFloat(duration);
      if (isNaN(durationSec) || durationSec < 5 || durationSec > 180) {
        return res.status(400).json({
          success: false,
          message: 'Duration must be between 5 and 180 seconds'
        });
      }

      // Validate file upload
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Voice note file is required'
        });
      }

      const allowedMimeTypes = [
        'audio/mp4',
        'audio/m4a',
        'audio/x-m4a',
        'audio/mpeg',
        'audio/mp3',
        'audio/wav',
        'audio/webm',
        'audio/ogg'
      ];

      if (!allowedMimeTypes.includes(req.file.mimetype)) {
        return res.status(400).json({
          success: false,
          message: 'Invalid audio format. Supported: m4a, mp3, wav, webm, ogg'
        });
      }

      // File size check (max 10MB)
      if (req.file.size > 10 * 1024 * 1024) {
        return res.status(400).json({
          success: false,
          message: 'Voice note must be under 10MB'
        });
      }

      const result = await whatWouldYouDoService.recordAnswer(
        sessionId,
        userId,
        qNum,
        req.file.buffer,
        req.file.mimetype,
        durationSec
      );

      res.json({
        success: true,
        message: 'Answer recorded successfully',
        data: {
          questionNumber: result.questionNumber,
          voiceNoteUrl: result.voiceNoteUrl,
          duration: result.duration,
          hasTranscription: !!result.transcription,
          progress: result.progress,
          status: result.status,
          bothComplete: result.bothComplete,
          nextQuestion: result.progress.you.answered < 15 
            ? result.progress.you.answered + 1 
            : null
        }
      });

    } catch (error) {
      logger.error('Submit answer error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to submit answer'
      });
    }
  }

  /**
   * POST /api/games/what-would-you-do/retry-transcription/:sessionId
   * Retry transcription for a specific answer
   */
  async retryTranscription(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId } = req.params;
      const { questionNumber } = req.body;

      if (!sessionId || !questionNumber) {
        return res.status(400).json({
          success: false,
          message: 'Session ID and question number are required'
        });
      }

      const qNum = parseInt(questionNumber, 10);
      const transcription = await whatWouldYouDoService.retryTranscription(
        sessionId, 
        userId, 
        qNum
      );

      res.json({
        success: true,
        data: { transcription }
      });

    } catch (error) {
      logger.error('Retry transcription error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to retry transcription'
      });
    }
  }

  // =====================================================
  // RESULTS ENDPOINTS
  // =====================================================

  /**
   * GET /api/games/what-would-you-do/results/:sessionId
   * Get full results for a completed game
   */
  async getResults(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      const results = await whatWouldYouDoService.getResults(sessionId, userId);

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('Get results error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get results'
      });
    }
  }

  /**
   * GET /api/games/what-would-you-do/history
   * Get completed games history
   */
  async getGameHistory(req, res) {
    try {
      const userId = req.user._id;
      const limit = parseInt(req.query.limit, 10) || 10;

      const history = await whatWouldYouDoService.getGameHistory(userId, limit);

      res.json({
        success: true,
        data: history
      });

    } catch (error) {
      logger.error('Get game history error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get game history'
      });
    }
  }

  // =====================================================
  // DISCUSSION ENDPOINTS
  // =====================================================

  /**
   * POST /api/games/what-would-you-do/discussion/:sessionId
   * Add a discussion voice note
   * 
   * Expects multipart form data with:
   * - voiceNote: audio file
   * - duration: number (seconds)
   * - questionNumber: (optional) specific question to discuss
   */
  async addDiscussionNote(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId } = req.params;
      const { duration, questionNumber } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Voice note file is required'
        });
      }

      const durationSec = parseFloat(duration);
      if (isNaN(durationSec) || durationSec < 1 || durationSec > 300) {
        return res.status(400).json({
          success: false,
          message: 'Duration must be between 1 and 300 seconds'
        });
      }

      const qNum = questionNumber ? parseInt(questionNumber, 10) : null;
      if (qNum !== null && (qNum < 1 || qNum > 15)) {
        return res.status(400).json({
          success: false,
          message: 'Question number must be between 1 and 15'
        });
      }

      const result = await whatWouldYouDoService.addDiscussionNote(
        sessionId,
        userId,
        req.file.buffer,
        req.file.mimetype,
        durationSec,
        qNum
      );

      res.json({
        success: true,
        message: 'Discussion note added',
        data: result
      });

    } catch (error) {
      logger.error('Add discussion note error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to add discussion note'
      });
    }
  }

  /**
   * GET /api/games/what-would-you-do/discussion/:sessionId
   * Get all discussion notes for a session
   */
  async getDiscussionNotes(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      const notes = await whatWouldYouDoService.getDiscussionNotes(sessionId, userId);

      res.json({
        success: true,
        data: notes
      });

    } catch (error) {
      logger.error('Get discussion notes error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to get discussion notes'
      });
    }
  }

  /**
   * POST /api/games/what-would-you-do/discussion/:sessionId/listened/:noteIndex
   * Mark a discussion note as listened
   */
  async markNoteListened(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId, noteIndex } = req.params;

      if (!sessionId || noteIndex === undefined) {
        return res.status(400).json({
          success: false,
          message: 'Session ID and note index are required'
        });
      }

      await whatWouldYouDoService.markDiscussionNoteListened(
        sessionId,
        parseInt(noteIndex, 10),
        userId
      );

      res.json({
        success: true,
        message: 'Note marked as listened'
      });

    } catch (error) {
      logger.error('Mark note listened error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to mark note as listened'
      });
    }
  }

  // =====================================================
  // GAME MANAGEMENT ENDPOINTS
  // =====================================================

  /**
   * POST /api/games/what-would-you-do/abandon/:sessionId
   * Abandon an active game
   */
  async abandonGame(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId } = req.params;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      await whatWouldYouDoService.abandonGame(sessionId, userId);

      res.json({
        success: true,
        message: 'Game abandoned'
      });

    } catch (error) {
      logger.error('Abandon game error:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Failed to abandon game'
      });
    }
  }

  // =====================================================
  // UTILITY ENDPOINTS
  // =====================================================

  /**
   * GET /api/games/what-would-you-do/questions
   * Get all questions (for admin/debug)
   */
  async getAllQuestions(req, res) {
    try {
      const questions = await WhatWouldYouDoQuestion.getGameQuestions();
      const categoryInfo = WhatWouldYouDoQuestion.getCategoryInfo();

      res.json({
        success: true,
        data: {
          totalQuestions: questions.length,
          categories: categoryInfo,
          questions: questions.map(q => ({
            questionNumber: q.questionNumber,
            category: q.category,
            categoryName: categoryInfo[q.category].name,
            scenarioText: q.scenarioText,
            coreQuestion: q.coreQuestion,
            insight: q.insight,
            intensity: q.intensity,
            suggestedDuration: q.suggestedDuration
          }))
        }
      });

    } catch (error) {
      logger.error('Get all questions error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get questions'
      });
    }
  }

  /**
   * GET /api/games/what-would-you-do/info
   * Get game information
   */
  async getGameInfo(req, res) {
    try {
      const categoryInfo = WhatWouldYouDoQuestion.getCategoryInfo();

      res.json({
        success: true,
        data: {
          name: 'What Would You Do?',
          tagline: 'Before I commit my life to this person, I need to know who they really are.',
          description: '15 real-life scenarios designed to reveal how you and your partner handle relationship challenges. Answer with voice notes to share your authentic thoughts.',
          totalQuestions: 15,
          responseType: 'voice',
          estimatedTime: '20-30 minutes',
          expiryTime: '72 hours from invitation',
          categories: Object.entries(categoryInfo).map(([key, info]) => ({
            id: key,
            name: info.name,
            emoji: info.emoji,
            description: info.description,
            color: info.color
          })),
          howItWorks: [
            'Invite your match to play',
            'Each of you answers 15 scenario questions with voice notes',
            'Answer at your own pace - no timers, async gameplay',
            'Once both complete, AI analyzes your compatibility',
            'View results together and discuss using voice notes'
          ],
          whatYouLearn: [
            'How they handle conflict and difficult conversations',
            'Their values around honesty, trust, and respect',
            'Red flags and green flags before commitment',
            'Communication style compatibility',
            'How they approach intimacy and boundaries'
          ]
        }
      });

    } catch (error) {
      logger.error('Get game info error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get game info'
      });
    }
  }
}

module.exports = new WhatWouldYouDoController();