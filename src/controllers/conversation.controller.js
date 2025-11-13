// src/controllers/conversation.controller.js

const ConversationService = require('../services/conversation.service');
const MessageService = require('../services/message.service');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');
const ApiResponse = require('../utils/apiResponse');
const Message = require('../models/Message');

class ConversationController {
  /**
   * Get all conversations for current user
   * GET /api/v1/conversations
   */
  static async getUserConversations(req, res, next) {
    try {
      const userId = req.user._id;
      const { 
        page = 1, 
        limit = 20, 
        unreadOnly = false 
      } = req.query;

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        unreadOnly: unreadOnly === 'true'
      };

      const result = await ConversationService.getUserConversations(
        userId,
        options
      );

      res.status(200).json(
        new ApiResponse(
          200,
          result,
          'Conversations fetched successfully'
        )
      );

    } catch (error) {
      logger.error('Error fetching conversations:', error);
      next(error);
    }
  }

  /**
   * Get specific conversation
   * GET /api/v1/conversations/:conversationId
   */
  static async getConversation(req, res, next) {
    try {
      const userId = req.user._id;
      const { conversationId } = req.params;

      const conversation = await ConversationService.getConversation(
        conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError('Conversation not found', 404);
      }

      res.status(200).json(
        new ApiResponse(
          200,
          { conversation },
          'Conversation fetched successfully'
        )
      );

    } catch (error) {
      logger.error('Error fetching conversation:', error);
      next(error);
    }
  }

  /**
   * Get messages in a conversation
   * GET /api/v1/conversations/:conversationId/messages
   */
  static async getMessages(req, res, next) {
    try {
      const userId = req.user._id;
      const { conversationId } = req.params;
      const { 
        cursor,
        limit = 50 
      } = req.query;

      // Verify user is participant
      const conversation = await ConversationService.getConversation(
        conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError('Conversation not found', 404);
      }

      const messages = await MessageService.getMessages(
        conversationId,
        userId,  // ✅ Pass userId as second parameter
        {        // ✅ Pass options as third parameter
          cursor: cursor,
          limit: parseInt(limit)
        }
      );

      res.status(200).json(
        new ApiResponse(
          200,
          messages,
          'Messages fetched successfully'
        )
      );

    } catch (error) {
      logger.error('Error fetching messages:', error);
      next(error);
    }
  }

  /**
   * Send a message in conversation
   * POST /api/v1/conversations/:conversationId/messages
   */
  static async sendMessage(req, res, next) {
    try {
      const senderId = req.user._id;
      const { conversationId } = req.params;
      const { 
        text,
        clientMessageId,
        replyToMessageId 
      } = req.body;

      // Handle file uploads (photo or voice)
      const photoFile = req.files?.photo?.[0];
      const voiceFile = req.files?.voice?.[0];

      // Verify user is participant
      const conversation = await ConversationService.getConversation(
        conversationId,
        senderId
      );

      if (!conversation) {
        throw new ApiError('Conversation not found', 404);
      }

      if (conversation.isBlocked) {
        throw new ApiError('This conversation is blocked', 403);
      }

      // Send message based on type
      let message;
      
      if (text) {
        message = await MessageService.sendTextMessage(
          conversationId,
          senderId,
          text,
          clientMessageId,
          replyToMessageId
        );
      } else if (photoFile) {
        message = await MessageService.sendPhotoMessage(
          conversationId,
          senderId,
          photoFile,
          req.body.caption,
          clientMessageId
        );
      } else if (voiceFile) {
        message = await MessageService.sendVoiceMessage(
          conversationId,
          senderId,
          voiceFile,
          clientMessageId
        );
      } else {
        throw new ApiError('Message content required', 400);
      }

      res.status(201).json(
        new ApiResponse(
          201,
          { message },
          'Message sent successfully'
        )
      );

    } catch (error) {
      logger.error('Error sending message:', error);
      next(error);
    }
  }

  /**
   * Mark messages as read
   * PUT /api/v1/conversations/:conversationId/read
   */
  static async markAsRead(req, res, next) {
    try {
      const userId = req.user._id;
      const { conversationId } = req.params;
      const { upToMessageId } = req.body;
  
      const conversation = await ConversationService.getConversation(
        conversationId,
        userId
      );
  
      if (!conversation) {
        throw new ApiError('Conversation not found', 404);
      }
  
      // Get all messages up to the specified message
      const messages = await Message.find({
        conversationId,
        _id: { $lte: upToMessageId },
        senderId: { $ne: userId }
      }).select('_id');
  
      const messageIds = messages.map(m => m._id);
  
      // Call the correct method with correct params
      await MessageService.markAsRead(
        conversationId,
        userId,
        messageIds  // Pass array of message IDs
      );
  
      res.status(200).json(
        new ApiResponse(
          200,
          null,
          'Messages marked as read'
        )
      );
  
    } catch (error) {
      logger.error('Error marking messages as read:', error);
      next(error);
    }
  }

  /**
   * Delete a message
   * DELETE /api/v1/conversations/:conversationId/messages/:messageId
   */
  static async deleteMessage(req, res, next) {
    try {
      const userId = req.user._id;
      const { conversationId, messageId } = req.params;

      const conversation = await ConversationService.getConversation(
        conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError('Conversation not found', 404);
      }

      await MessageService.deleteMessage(
        messageId,
        userId
      );

      res.status(200).json(
        new ApiResponse(
          200,
          null,
          'Message deleted successfully'
        )
      );

    } catch (error) {
      logger.error('Error deleting message:', error);
      next(error);
    }
  }

  /**
   * Report a message
   * POST /api/v1/conversations/:conversationId/messages/:messageId/report
   */
  static async reportMessage(req, res, next) {
    try {
      const reporterId = req.user._id;
      const { messageId } = req.params;
      const { reason, details } = req.body;

      await MessageService.reportMessage(
        messageId,
        reporterId,
        reason,
        details
      );

      res.status(200).json(
        new ApiResponse(
          200,
          null,
          'Message reported successfully'
        )
      );

    } catch (error) {
      logger.error('Error reporting message:', error);
      next(error);
    }
  }

  /**
   * Block/unblock user in conversation
   * PUT /api/v1/conversations/:conversationId/block
   */
  static async toggleBlock(req, res, next) {
    try {
      const userId = req.user._id;
      const { conversationId } = req.params;
      const { action } = req.body; // 'block' or 'unblock'

      if (!['block', 'unblock'].includes(action)) {
        throw new ApiError('Invalid action. Use block or unblock', 400);
      }

      const conversation = await ConversationService.getConversation(
        conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError('Conversation not found', 404);
      }

      const otherUserId = conversation.participants.find(
        p => p.toString() !== userId.toString()
      );

      if (action === 'block') {
        await ConversationService.blockUser(conversationId, userId, otherUserId);
      } else {
        await ConversationService.unblockUser(conversationId, userId, otherUserId);
      }

      res.status(200).json(
        new ApiResponse(
          200,
          { blocked: action === 'block' },
          `User ${action}ed successfully`
        )
      );

    } catch (error) {
      logger.error('Error toggling block:', error);
      next(error);
    }
  }

  /**
   * Delete conversation (soft delete)
   * DELETE /api/v1/conversations/:conversationId
   */
  static async deleteConversation(req, res, next) {
    try {
      const userId = req.user._id;
      const { conversationId } = req.params;

      const conversation = await ConversationService.getConversation(
        conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError('Conversation not found', 404);
      }

      await ConversationService.deleteConversation(conversationId, userId);

      res.status(200).json(
        new ApiResponse(
          200,
          null,
          'Conversation deleted successfully'
        )
      );

    } catch (error) {
      logger.error('Error deleting conversation:', error);
      next(error);
    }
  }

  /**
   * Get conversation by match ID
   * GET /api/v1/conversations/match/:matchId
   */
  static async getConversationByMatch(req, res, next) {
    try {
      const userId = req.user._id;
      const { matchId } = req.params;

      const conversation = await ConversationService.getConversationByMatch(
        matchId,
        userId
      );

      res.status(200).json(
        new ApiResponse(
          200,
          { conversation },
          conversation ? 'Conversation found' : 'No conversation exists'
        )
      );

    } catch (error) {
      logger.error('Error fetching conversation by match:', error);
      next(error);
    }
  }

  /**
   * Search messages in conversations
   * GET /api/v1/conversations/search
   */
  static async searchMessages(req, res, next) {
    try {
      const userId = req.user._id;
      const { query, conversationId } = req.query;

      if (!query || query.length < 2) {
        throw new ApiError('Search query must be at least 2 characters', 400);
      }

      const results = await MessageService.searchMessages(
        userId,
        query,
        conversationId
      );

      res.status(200).json(
        new ApiResponse(
          200,
          { results },
          'Search completed successfully'
        )
      );

    } catch (error) {
      logger.error('Error searching messages:', error);
      next(error);
    }
  }
}

module.exports = ConversationController;