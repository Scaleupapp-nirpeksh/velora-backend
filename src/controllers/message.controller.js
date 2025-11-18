// src/controllers/message.controller.js

const MessageService = require('../services/message.service');
const ConversationService = require('../services/conversation.service');
const MatchingService = require('../services/matching.service');
const logger = require('../utils/logger');
const ApiError = require('../utils/apiError');
const ApiResponse = require('../utils/apiResponse');
const socketManager = require('../config/socket'); // ✅ ADD THIS

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
        throw new ApiError(404, 'Match not found');
      }

      if (match.status !== 'mutual_like') {
        throw new ApiError(403, 'Can only message mutual matches');
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

      // ✅ EMIT SOCKET EVENT
      socketManager.emitToConversation(conversation._id.toString(), 'message:new', {
        message,
        conversationId: conversation._id.toString()
      });

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
        throw new ApiError(404, 'Message not found');
      }

      // Verify user is participant in conversation
      const conversation = await ConversationService.getConversation(
        message.conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError(403, 'Unauthorized to view this message');
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
        throw new ApiError(400, 'Message text required');
      }

      const message = await MessageService.getMessage(messageId);

      if (!message) {
        throw new ApiError(404, 'Message not found');
      }

      if (message.senderId.toString() !== userId.toString()) {
        throw new ApiError(403, 'Can only edit your own messages');
      }

      // Check 5-minute window
      const fiveMinutes = 5 * 60 * 1000;
      const messageAge = Date.now() - new Date(message.createdAt).getTime();
      
      if (messageAge > fiveMinutes) {
        throw new ApiError(403, 'Can only edit messages within 5 minutes');
      }

      const updatedMessage = await MessageService.editMessage(
        messageId,
        text
      );

      // ✅ EMIT SOCKET EVENT
      socketManager.emitToConversation(
        message.conversationId.toString(),
        'message:edited',
        {
          message: updatedMessage,
          conversationId: message.conversationId.toString(),
          editedBy: userId.toString()
        }
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
        throw new ApiError(400, 'Invalid emoji reaction');
      }

      const message = await MessageService.getMessage(messageId);

      if (!message) {
        throw new ApiError(404, 'Message not found');
      }

      // Verify user is participant
      const conversation = await ConversationService.getConversation(
        message.conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError(403, 'Unauthorized to react to this message');
      }

      await MessageService.addReaction(messageId, userId, emoji);

      // ✅ EMIT SOCKET EVENT
      socketManager.emitToConversation(
        message.conversationId.toString(),
        'message:reaction',
        {
          messageId,
          conversationId: message.conversationId.toString(),
          userId: userId.toString(),
          emoji,
          action: 'add'
        }
      );

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

      const message = await MessageService.getMessage(messageId);

      if (!message) {
        throw new ApiError(404, 'Message not found');
      }

      await MessageService.removeReaction(messageId, userId);

      // ✅ EMIT SOCKET EVENT
      socketManager.emitToConversation(
        message.conversationId.toString(),
        'message:reaction',
        {
          messageId,
          conversationId: message.conversationId.toString(),
          userId: userId.toString(),
          action: 'remove'
        }
      );

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
        throw new ApiError(404, 'Conversation not found');
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
        throw new ApiError(400, 'Conversation IDs required');
      }

      if (conversationIds.length > 5) {
        throw new ApiError(400, 'Can forward to maximum 5 conversations');
      }

      const message = await MessageService.getMessage(messageId);

      if (!message) {
        throw new ApiError(404, 'Message not found');
      }

      // Verify user is participant in source conversation
      const sourceConversation = await ConversationService.getConversation(
        message.conversationId,
        userId
      );

      if (!sourceConversation) {
        throw new ApiError(403, 'Unauthorized to forward this message');
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
          
          // ✅ EMIT SOCKET EVENT for each forwarded message
          socketManager.emitToConversation(
            convId,
            'message:new',
            {
              message: forwardedMessage,
              conversationId: convId
            }
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
        throw new ApiError(404, 'Message not found');
      }
  
      // Only sender can see read receipts
      if (message.senderId.toString() !== userId.toString()) {
        throw new ApiError(403, 'Only message sender can view receipts');
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
        throw new ApiError(404, 'Message not found');
      }

      // Verify user is participant
      const conversation = await ConversationService.getConversation(
        message.conversationId,
        userId
      );

      if (!conversation) {
        throw new ApiError(403, 'Unauthorized to save this message');
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
