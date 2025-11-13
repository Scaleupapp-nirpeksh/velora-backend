// src/controllers/message.controller.js

const MessageService = require('../services/message.service');
const ConversationService = require('../services/conversation.service');
const MatchingService = require('../services/matching.service');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');
const ApiResponse = require('../utils/apiResponse');

class MessageController {
  /**
   * Send first message with match (creates conversation)
   * POST /api/v1/messages/first
   */
  static async sendFirstMessage(req, res, next) {
    try {
      const senderId = req.user._id;
      const { 
        matchId,
        text,
        clientMessageId 
      } = req.body;

      // Verify match exists and is mutual
      const match = await MatchingService.getMatch(matchId, senderId);
      
      if (!match) {
        throw new ApiError('Match not found', 404);
      }

      if (match.status !== 'mutual_like') {
        throw new ApiError('Can only message mutual matches', 403);
      }

      const conversation = await ConversationService.startConversation(
        senderId,
        matchId
      );

      // Send the message
      const message = await MessageService.sendTextMessage(
        conversation._id,
        senderId,
        text,
        clientMessageId
      );

      res.status(201).json(
        new ApiResponse(
          201,
          { 
            message,
            conversationId: conversation._id,
            isFirstMessage: true
          },
          'First message sent successfully'
        )
      );

    } catch (error) {
      logger.error('Error sending first message:', error);
      next(error);
    }
  }

  /**
   * Get message by ID
   * GET /api/v1/messages/:messageId
   */
  static async getMessage(req, res, next) {
    try {
      const userId = req.user._id;
      const { messageId } = req.params;

      const message = await MessageService.getMessage(messageId);

      if (!message) {
        throw new ApiError('Message not found', 404);
      }

      // Verify user is participant in conversation
      const conversation = await ConversationService.getConversation(
        message.conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError('Unauthorized to view this message', 403);
      }

      res.status(200).json(
        new ApiResponse(
          200,
          { message },
          'Message fetched successfully'
        )
      );

    } catch (error) {
      logger.error('Error fetching message:', error);
      next(error);
    }
  }

  /**
   * Edit message (within 5 minutes)
   * PUT /api/v1/messages/:messageId
   */
  static async editMessage(req, res, next) {
    try {
      const userId = req.user._id;
      const { messageId } = req.params;
      const { text } = req.body;

      if (!text || text.trim().length === 0) {
        throw new ApiError('Message text required', 400);
      }

      const message = await MessageService.getMessage(messageId);

      if (!message) {
        throw new ApiError('Message not found', 404);
      }

      if (message.senderId.toString() !== userId.toString()) {
        throw new ApiError('Can only edit your own messages', 403);
      }

      // Check 5-minute window
      const fiveMinutes = 5 * 60 * 1000;
      const messageAge = Date.now() - new Date(message.createdAt).getTime();
      
      if (messageAge > fiveMinutes) {
        throw new ApiError('Can only edit messages within 5 minutes', 403);
      }

      const updatedMessage = await MessageService.editMessage(
        messageId,
        text
      );

      res.status(200).json(
        new ApiResponse(
          200,
          { message: updatedMessage },
          'Message edited successfully'
        )
      );

    } catch (error) {
      logger.error('Error editing message:', error);
      next(error);
    }
  }

  /**
   * React to a message
   * POST /api/v1/messages/:messageId/react
   */
  static async reactToMessage(req, res, next) {
    try {
      const userId = req.user._id;
      const { messageId } = req.params;
      const { emoji } = req.body;

      // Validate emoji (basic check)
      const allowedEmojis = ['❤️', '😊', '😂', '😍', '👍', '🔥', '😮', '😢'];
      if (!allowedEmojis.includes(emoji)) {
        throw new ApiError('Invalid emoji reaction', 400);
      }

      const message = await MessageService.getMessage(messageId);

      if (!message) {
        throw new ApiError('Message not found', 404);
      }

      // Verify user is participant
      const conversation = await ConversationService.getConversation(
        message.conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError('Unauthorized to react to this message', 403);
      }

      await MessageService.addReaction(messageId, userId, emoji);

      res.status(200).json(
        new ApiResponse(
          200,
          { emoji },
          'Reaction added successfully'
        )
      );

    } catch (error) {
      logger.error('Error reacting to message:', error);
      next(error);
    }
  }

  /**
   * Remove reaction from message
   * DELETE /api/v1/messages/:messageId/react
   */
  static async removeReaction(req, res, next) {
    try {
      const userId = req.user._id;
      const { messageId } = req.params;

      await MessageService.removeReaction(messageId, userId);

      res.status(200).json(
        new ApiResponse(
          200,
          null,
          'Reaction removed successfully'
        )
      );

    } catch (error) {
      logger.error('Error removing reaction:', error);
      next(error);
    }
  }

  /**
   * Get media messages in conversation
   * GET /api/v1/messages/media/:conversationId
   */
  static async getMediaMessages(req, res, next) {
    try {
      const userId = req.user._id;
      const { conversationId } = req.params;
      const { 
        type = 'all', // 'photo', 'voice', 'all'
        page = 1,
        limit = 20 
      } = req.query;

      // Verify user is participant
      const conversation = await ConversationService.getConversation(
        conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError('Conversation not found', 404);
      }

      const media = await MessageService.getMediaMessages(
        conversationId,
        type,
        parseInt(page),
        parseInt(limit)
      );

      res.status(200).json(
        new ApiResponse(
          200,
          media,
          'Media messages fetched successfully'
        )
      );

    } catch (error) {
      logger.error('Error fetching media messages:', error);
      next(error);
    }
  }

  /**
   * Forward a message to another conversation
   * POST /api/v1/messages/:messageId/forward
   */
  static async forwardMessage(req, res, next) {
    try {
      const userId = req.user._id;
      const { messageId } = req.params;
      const { conversationIds } = req.body;

      if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
        throw new ApiError('Conversation IDs required', 400);
      }

      if (conversationIds.length > 5) {
        throw new ApiError('Can forward to maximum 5 conversations', 400);
      }

      const message = await MessageService.getMessage(messageId);

      if (!message) {
        throw new ApiError('Message not found', 404);
      }

      // Verify user is participant in source conversation
      const sourceConversation = await ConversationService.getConversation(
        message.conversationId,
        userId
      );

      if (!sourceConversation) {
        throw new ApiError('Unauthorized to forward this message', 403);
      }

      // Forward to each conversation
      const forwarded = [];
      for (const convId of conversationIds) {
        const targetConversation = await ConversationService.getConversation(
          convId,
          userId
        );

        if (targetConversation && !targetConversation.isBlocked) {
          const forwardedMessage = await MessageService.forwardMessage(
            messageId,
            convId,
            userId
          );
          forwarded.push({
            conversationId: convId,
            messageId: forwardedMessage._id
          });
        }
      }

      res.status(200).json(
        new ApiResponse(
          200,
          { forwarded },
          'Message forwarded successfully'
        )
      );

    } catch (error) {
      logger.error('Error forwarding message:', error);
      next(error);
    }
  }

  /**
   * Get message read receipts
   * GET /api/v1/messages/:messageId/receipts
   */
  static async getReadReceipts(req, res, next) {
    try {
      const userId = req.user._id;
      const { messageId } = req.params;
  
      const message = await MessageService.getMessage(messageId);
  
      if (!message) {
        throw new ApiError('Message not found', 404);
      }
  
      // Only sender can see read receipts
      if (message.senderId.toString() !== userId.toString()) {
        throw new ApiError('Only message sender can view receipts', 403);
      }
  
      // Check if readBy exists, otherwise return empty array
      const receipts = message.readBy ? 
        message.readBy.map(r => ({
          userId: r.userId,
          readAt: r.readAt
        })) : [];
  
      res.status(200).json(
        new ApiResponse(
          200,
          { receipts },
          'Read receipts fetched successfully'
        )
      );
  
    } catch (error) {
      logger.error('Error fetching read receipts:', error);
      next(error);
    }
  }

  /**
   * Save/unsave a message
   * PUT /api/v1/messages/:messageId/save
   */
  static async toggleSaveMessage(req, res, next) {
    try {
      const userId = req.user._id;
      const { messageId } = req.params;

      const message = await MessageService.getMessage(messageId);

      if (!message) {
        throw new ApiError('Message not found', 404);
      }

      // Verify user is participant
      const conversation = await ConversationService.getConversation(
        message.conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError('Unauthorized to save this message', 403);
      }

      const isSaved = await MessageService.toggleSaveMessage(
        messageId,
        userId
      );

      res.status(200).json(
        new ApiResponse(
          200,
          { saved: isSaved },
          `Message ${isSaved ? 'saved' : 'unsaved'} successfully`
        )
      );

    } catch (error) {
      logger.error('Error toggling save message:', error);
      next(error);
    }
  }

  /**
   * Get saved messages
   * GET /api/v1/messages/saved
   */
  static async getSavedMessages(req, res, next) {
    try {
      const userId = req.user._id;
      const { 
        page = 1,
        limit = 20 
      } = req.query;

      const savedMessages = await MessageService.getSavedMessages(
        userId,
        parseInt(page),
        parseInt(limit)
      );

      res.status(200).json(
        new ApiResponse(
          200,
          savedMessages,
          'Saved messages fetched successfully'
        )
      );

    } catch (error) {
      logger.error('Error fetching saved messages:', error);
      next(error);
    }
  }
}

module.exports = MessageController;