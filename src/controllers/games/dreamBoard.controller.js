// src/controllers/games/dreamBoard.controller.js

const dreamBoardService = require('../../services/games/dreamBoard.service');
const DreamBoardCategory = require('../../models/games/DreamBoardCategory');
const DreamBoardSession = require('../../models/games/DreamBoardSession');
const logger = require('../../utils/logger');

/**
 * DREAM BOARD - GAME CONTROLLER
 * 
 * HTTP endpoints for the async vision board compatibility game.
 * 
 * Endpoints:
 * - GET    /info                                    - Game information
 * - GET    /categories                              - Get all categories & cards
 * - POST   /invite                                  - Create game invitation
 * - POST   /accept/:sessionId                       - Accept invitation
 * - POST   /decline/:sessionId                      - Decline invitation
 * - GET    /pending                                 - Get pending invitation
 * - GET    /active                                  - Get active game
 * - GET    /session/:sessionId                      - Get session state
 * - GET    /category/:sessionId/:categoryNumber     - Get specific category
 * - POST   /select/:sessionId                       - Submit card selection
 * 
 * VOICE ELABORATION (NEW):
 * - POST   /elaborate/:sessionId/:categoryNumber    - Add voice elaboration
 * - GET    /elaborate/:sessionId/:categoryNumber    - Get elaboration
 * - DELETE /elaborate/:sessionId/:categoryNumber    - Delete elaboration
 * 
 * RESULTS & DISCUSSION:
 * - GET    /results/:sessionId                      - Get game results
 * - GET    /history                                 - Get completed games
 * - POST   /discussion/:sessionId                   - Add discussion voice note
 * - GET    /discussion/:sessionId                   - Get discussion notes
 * - POST   /discussion/:sessionId/listened/:noteIndex - Mark note listened
 * - POST   /abandon/:sessionId                      - Abandon game
 */

class DreamBoardController {

  // =====================================================
  // GAME INFO & CATEGORIES
  // =====================================================

  /**
   * GET /api/games/dream-board/info
   * Get game information and how-it-works
   */
  async getGameInfo(req, res) {
    try {
      const categoryInfo = DreamBoardCategory.getCategoryInfo();
      const priorityInfo = DreamBoardCategory.getPriorityInfo();
      const timelineInfo = DreamBoardCategory.getTimelineInfo();

      res.json({
        success: true,
        data: {
          name: 'Dream Board',
          tagline: 'See if your futures align',
          description: 'Build your dream future across 10 life categories. Pick vision cards, set your priorities, and discover how aligned your dreams are with your partner.',
          totalCategories: 10,
          cardsPerCategory: 4,
          estimatedTime: '10-15 minutes',
          expiryTime: '48 hours from invitation',
          gameType: 'async',
          categories: Object.entries(categoryInfo).map(([key, info]) => ({
            id: key,
            name: info.name,
            emoji: info.emoji,
            description: info.description,
            color: info.color
          })),
          priorities: Object.entries(priorityInfo).map(([key, info]) => ({
            id: key,
            label: info.label,
            emoji: info.emoji,
            description: info.description
          })),
          timelines: Object.entries(timelineInfo).map(([key, info]) => ({
            id: key,
            label: info.label,
            emoji: info.emoji,
            description: info.description
          })),
          howItWorks: [
            'Invite your match to dream together',
            'Each of you picks vision cards for 10 life categories',
            'Set your priority (❤️ Heart Set, ✨ Dream, 🌊 Flow) for each',
            'Choose your timeline (🔥 Soon, 🌸 When Right, 🌙 Someday)',
            'Optionally add voice notes to explain your choices',
            'Complete at your own pace - no timers!',
            'Once both finish, see your dream compatibility revealed',
            'AI analyzes both cards AND voice notes for deeper insights',
            'Discuss any differences via voice notes'
          ],
          whatYouLearn: [
            'Where your life visions align perfectly',
            'Areas where you dream differently',
            'What matters most to each of you',
            'Hidden alignments your voice notes reveal',
            'Conversation starters for important topics',
            'Your overall dream compatibility score'
          ],
          features: {
            voiceElaboration: {
              enabled: true,
              description: 'Add voice notes to explain your card choices',
              maxDuration: 120, // seconds
              optional: true,
              benefit: 'AI analyzes your voice notes to find hidden alignments beyond card selections'
            }
          }
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

  /**
   * GET /api/games/dream-board/categories
   * Get all categories with cards
   */
  async getAllCategories(req, res) {
    try {
      const data = await dreamBoardService.getAllCategories();

      res.json({
        success: true,
        data
      });

    } catch (error) {
      logger.error('Get all categories error:', error);
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to get categories'
      });
    }
  }

  // =====================================================
  // INVITATION ENDPOINTS
  // =====================================================

  /**
   * POST /api/games/dream-board/invite
   * Create a new game invitation
   * Body: { matchId: string }
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

      const result = await dreamBoardService.createInvitation(userId, matchId);

      res.status(201).json({
        success: true,
        message: 'Game invitation sent',
        data: {
          sessionId: result.session.sessionId,
          invitedUser: result.invitedUser,
          expiresAt: result.session.expiresAt,
          gameInfo: {
            name: 'Dream Board',
            tagline: 'See if your futures align',
            categoryCount: 10,
            estimatedTime: '10-15 minutes',
            features: ['Voice elaborations for deeper insights']
          }
        }
      });

    } catch (error) {
      logger.error('Create invitation error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not part of') ? 403
        : error.message.includes('already exists') ? 409
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to create invitation'
      });
    }
  }

  /**
   * POST /api/games/dream-board/accept/:sessionId
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

      const session = await dreamBoardService.acceptInvitation(sessionId, userId);

      res.json({
        success: true,
        message: 'Invitation accepted! Start building your dream board.',
        data: {
          sessionId: session.sessionId,
          status: session.status,
          totalCategories: 10,
          tips: [
            'Take your time with each category',
            'Add voice notes to explain choices that matter most to you',
            'Your partner won\'t see your selections until you both finish'
          ]
        }
      });

    } catch (error) {
      logger.error('Accept invitation error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('Only the invited') ? 403
        : error.message.includes('expired') ? 410
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to accept invitation'
      });
    }
  }

  /**
   * POST /api/games/dream-board/decline/:sessionId
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

      await dreamBoardService.declineInvitation(sessionId, userId);

      res.json({
        success: true,
        message: 'Invitation declined'
      });

    } catch (error) {
      logger.error('Decline invitation error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('Only the invited') ? 403
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to decline invitation'
      });
    }
  }

  /**
   * GET /api/games/dream-board/pending
   * Get pending invitation for current user
   */
  async getPendingInvitation(req, res) {
    try {
      const userId = req.user._id;

      const invitation = await dreamBoardService.getPendingInvitation(userId);

      res.json({
        success: true,
        hasInvitation: !!invitation,
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
   * GET /api/games/dream-board/active
   * Get active game for current user
   */
  async getActiveSession(req, res) {
    try {
      const userId = req.user._id;

      const session = await dreamBoardService.getActiveSession(userId);

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
   * GET /api/games/dream-board/session/:sessionId
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

      const state = await dreamBoardService.getSessionState(sessionId, userId);

      res.json({
        success: true,
        data: state
      });

    } catch (error) {
      logger.error('Get session state error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not a participant') ? 403
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to get session state'
      });
    }
  }

  // =====================================================
  // CATEGORY & SELECTION ENDPOINTS
  // =====================================================

  /**
   * GET /api/games/dream-board/category/:sessionId/:categoryNumber
   * Get a specific category with cards for selection
   */
  async getCategory(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId, categoryNumber } = req.params;

      if (!sessionId || !categoryNumber) {
        return res.status(400).json({
          success: false,
          message: 'Session ID and category number are required'
        });
      }

      const catNum = parseInt(categoryNumber, 10);
      if (isNaN(catNum) || catNum < 1 || catNum > 10) {
        return res.status(400).json({
          success: false,
          message: 'Category number must be between 1 and 10'
        });
      }

      const data = await dreamBoardService.getCategory(sessionId, userId, catNum);

      res.json({
        success: true,
        data
      });

    } catch (error) {
      logger.error('Get category error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not a participant') ? 403
        : error.message.includes('not active') ? 400
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to get category'
      });
    }
  }

  /**
   * POST /api/games/dream-board/select/:sessionId
   * Submit a card selection for a category
   * Body: { categoryNumber, cardId, priority, timeline }
   */
  async submitSelection(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId } = req.params;
      const { categoryNumber, cardId, priority, timeline } = req.body;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      // Validate required fields
      if (!categoryNumber || !cardId || !priority || !timeline) {
        return res.status(400).json({
          success: false,
          message: 'Missing required fields: categoryNumber, cardId, priority, timeline'
        });
      }

      const catNum = parseInt(categoryNumber, 10);
      if (isNaN(catNum) || catNum < 1 || catNum > 10) {
        return res.status(400).json({
          success: false,
          message: 'Category number must be between 1 and 10'
        });
      }

      if (!['A', 'B', 'C', 'D'].includes(cardId)) {
        return res.status(400).json({
          success: false,
          message: 'Card ID must be A, B, C, or D'
        });
      }

      if (!['heart_set', 'dream', 'flow'].includes(priority)) {
        return res.status(400).json({
          success: false,
          message: 'Priority must be heart_set, dream, or flow'
        });
      }

      if (!['cant_wait', 'when_right', 'someday'].includes(timeline)) {
        return res.status(400).json({
          success: false,
          message: 'Timeline must be cant_wait, when_right, or someday'
        });
      }

      const result = await dreamBoardService.submitSelection(sessionId, userId, {
        categoryNumber: catNum,
        cardId,
        priority,
        timeline
      });

      res.json({
        success: true,
        message: result.bothComplete 
          ? 'Both players completed! Generating your dream compatibility...'
          : `Selection saved! ${result.progress.you.selected}/10 categories complete.`,
        data: {
          progress: result.progress,
          status: result.status,
          bothComplete: result.bothComplete,
          nextCategory: result.progress.you.selected < 10
            ? result.progress.you.selected + 1
            : null,
          // Elaboration hint for the category just selected
          canAddElaboration: result.canAddElaboration,
          elaborationHint: result.elaborationHint
        }
      });

    } catch (error) {
      logger.error('Submit selection error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not a participant') ? 403
        : error.message.includes('not active') ? 400
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to submit selection'
      });
    }
  }

  // =====================================================
  // VOICE ELABORATION ENDPOINTS (NEW)
  // =====================================================

  /**
   * POST /api/games/dream-board/elaborate/:sessionId/:categoryNumber
   * Add a voice elaboration to explain a card selection
   * 
   * Multipart form data:
   * - voiceNote: audio file (required)
   * - duration: number in seconds (required)
   */
  async addElaboration(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId, categoryNumber } = req.params;
      const { duration } = req.body;

      // Validate session ID
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      // Validate category number
      if (!categoryNumber) {
        return res.status(400).json({
          success: false,
          message: 'Category number is required'
        });
      }

      const catNum = parseInt(categoryNumber, 10);
      if (isNaN(catNum) || catNum < 1 || catNum > 10) {
        return res.status(400).json({
          success: false,
          message: 'Category number must be between 1 and 10'
        });
      }

      // Validate voice note file
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Voice note file is required'
        });
      }

      // Validate duration
      if (!duration) {
        return res.status(400).json({
          success: false,
          message: 'Duration is required'
        });
      }

      const durationNum = parseInt(duration, 10);
      if (isNaN(durationNum) || durationNum < 1) {
        return res.status(400).json({
          success: false,
          message: 'Duration must be a positive number'
        });
      }

      if (durationNum > 120) {
        return res.status(400).json({
          success: false,
          message: 'Elaboration cannot exceed 2 minutes (120 seconds)'
        });
      }

      const result = await dreamBoardService.addElaboration(
        sessionId,
        userId,
        catNum,
        req.file.buffer,
        req.file.mimetype,
        durationNum
      );

      res.status(201).json({
        success: true,
        message: result.message,
        data: {
          categoryNumber: result.categoryNumber,
          voiceNoteUrl: result.voiceNoteUrl,
          duration: result.duration,
          hasTranscript: result.hasTranscript,
          transcriptPreview: result.transcriptPreview
        }
      });

    } catch (error) {
      logger.error('Add elaboration error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not a participant') ? 403
        : error.message.includes('not active') ? 400
        : error.message.includes('must select') ? 400
        : error.message.includes('exceed') ? 400
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to add elaboration'
      });
    }
  }

  /**
   * GET /api/games/dream-board/elaborate/:sessionId/:categoryNumber
   * Get the elaboration for a specific category
   */
  async getElaboration(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId, categoryNumber } = req.params;

      // Validate session ID
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      // Validate category number
      if (!categoryNumber) {
        return res.status(400).json({
          success: false,
          message: 'Category number is required'
        });
      }

      const catNum = parseInt(categoryNumber, 10);
      if (isNaN(catNum) || catNum < 1 || catNum > 10) {
        return res.status(400).json({
          success: false,
          message: 'Category number must be between 1 and 10'
        });
      }

      const elaboration = await dreamBoardService.getElaboration(sessionId, userId, catNum);

      if (!elaboration) {
        return res.json({
          success: true,
          hasElaboration: false,
          data: null,
          message: 'No elaboration for this category'
        });
      }

      res.json({
        success: true,
        hasElaboration: true,
        data: elaboration
      });

    } catch (error) {
      logger.error('Get elaboration error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not a participant') ? 403
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to get elaboration'
      });
    }
  }

  /**
   * DELETE /api/games/dream-board/elaborate/:sessionId/:categoryNumber
   * Delete an elaboration (to re-record)
   */
  async deleteElaboration(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId, categoryNumber } = req.params;

      // Validate session ID
      if (!sessionId) {
        return res.status(400).json({
          success: false,
          message: 'Session ID is required'
        });
      }

      // Validate category number
      if (!categoryNumber) {
        return res.status(400).json({
          success: false,
          message: 'Category number is required'
        });
      }

      const catNum = parseInt(categoryNumber, 10);
      if (isNaN(catNum) || catNum < 1 || catNum > 10) {
        return res.status(400).json({
          success: false,
          message: 'Category number must be between 1 and 10'
        });
      }

      const result = await dreamBoardService.deleteElaboration(sessionId, userId, catNum);

      res.json({
        success: true,
        message: result.message
      });

    } catch (error) {
      logger.error('Delete elaboration error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not a participant') ? 403
        : error.message.includes('Cannot modify') ? 400
        : error.message.includes('No elaboration') ? 404
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to delete elaboration'
      });
    }
  }

  // =====================================================
  // RESULTS ENDPOINTS
  // =====================================================

  /**
   * GET /api/games/dream-board/results/:sessionId
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

      const results = await dreamBoardService.getResults(sessionId, userId);

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('Get results error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not a participant') ? 403
        : error.message.includes('not yet completed') ? 400
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to get results'
      });
    }
  }

  /**
   * GET /api/games/dream-board/history
   * Get completed games history
   * Query: ?limit=10
   */
  async getGameHistory(req, res) {
    try {
      const userId = req.user._id;
      const limit = parseInt(req.query.limit, 10) || 10;

      const history = await dreamBoardService.getGameHistory(userId, limit);

      res.json({
        success: true,
        count: history.length,
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
  // DISCUSSION VOICE NOTES (POST-GAME)
  // =====================================================

  /**
   * POST /api/games/dream-board/discussion/:sessionId
   * Add a discussion voice note
   * 
   * Multipart form data:
   * - voiceNote: audio file (required)
   * - duration: number in seconds (required)
   * - categoryNumber: number 1-10 (optional, for category-specific discussion)
   */
  async addDiscussionNote(req, res) {
    try {
      const userId = req.user._id;
      const { sessionId } = req.params;
      const { duration, categoryNumber } = req.body;

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

      if (!duration) {
        return res.status(400).json({
          success: false,
          message: 'Duration is required'
        });
      }

      const durationNum = parseInt(duration, 10);
      if (isNaN(durationNum) || durationNum < 1) {
        return res.status(400).json({
          success: false,
          message: 'Duration must be a positive number'
        });
      }

      // Parse category number if provided
      let catNum = null;
      if (categoryNumber) {
        catNum = parseInt(categoryNumber, 10);
        if (isNaN(catNum) || catNum < 1 || catNum > 10) {
          return res.status(400).json({
            success: false,
            message: 'Category number must be between 1 and 10'
          });
        }
      }

      const result = await dreamBoardService.addDiscussionNote(
        sessionId,
        userId,
        req.file.buffer,
        req.file.mimetype,
        durationNum,
        catNum
      );

      res.status(201).json({
        success: true,
        message: catNum 
          ? `Voice note added for category ${catNum}`
          : 'Voice note added to discussion',
        data: result
      });

    } catch (error) {
      logger.error('Add discussion note error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not a participant') ? 403
        : error.message.includes('only available') ? 400
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to add discussion note'
      });
    }
  }

  /**
   * GET /api/games/dream-board/discussion/:sessionId
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

      const notes = await dreamBoardService.getDiscussionNotes(sessionId, userId);

      res.json({
        success: true,
        count: notes.length,
        data: notes
      });

    } catch (error) {
      logger.error('Get discussion notes error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not a participant') ? 403
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to get discussion notes'
      });
    }
  }

  /**
   * POST /api/games/dream-board/discussion/:sessionId/listened/:noteIndex
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

      const noteIdx = parseInt(noteIndex, 10);
      if (isNaN(noteIdx) || noteIdx < 0) {
        return res.status(400).json({
          success: false,
          message: 'Note index must be a non-negative number'
        });
      }

      await dreamBoardService.markNoteListened(sessionId, userId, noteIdx);

      res.json({
        success: true,
        message: 'Note marked as listened'
      });

    } catch (error) {
      logger.error('Mark note listened error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not a participant') ? 403
        : error.message.includes('Invalid note') ? 400
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to mark note as listened'
      });
    }
  }

  // =====================================================
  // GAME MANAGEMENT
  // =====================================================

  /**
   * POST /api/games/dream-board/abandon/:sessionId
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

      await dreamBoardService.abandonGame(sessionId, userId);

      res.json({
        success: true,
        message: 'Game abandoned'
      });

    } catch (error) {
      logger.error('Abandon game error:', error);

      const statusCode = error.message.includes('not found') ? 404
        : error.message.includes('not a participant') ? 403
        : error.message.includes('cannot be abandoned') ? 400
        : 400;

      res.status(statusCode).json({
        success: false,
        message: error.message || 'Failed to abandon game'
      });
    }
  }
}

module.exports = new DreamBoardController();