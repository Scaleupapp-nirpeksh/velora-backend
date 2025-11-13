// src/routes/conversation.routes.js

const express = require('express');
const router = express.Router();
const ConversationController = require('../controllers/conversation.controller');
const { authenticate } = require('../middleware/auth.middleware');
const { messageUpload } = require('../middleware/upload.middleware');
const messageValidator = require('../validators/message.validator');

/**
 * Conversation Routes
 * All routes require authentication
 * Base path: /api/v1/conversations
 */

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @route   GET /api/v1/conversations
 * @desc    Get all conversations for current user
 * @access  Private
 * @query   page (default: 1)
 * @query   limit (default: 20)
 * @query   unreadOnly (default: false)
 */
router.get(
  '/',
  ConversationController.getUserConversations
);

/**
 * @route   GET /api/v1/conversations/search
 * @desc    Search messages across conversations
 * @access  Private
 * @query   query (required, min 2 chars)
 * @query   conversationId (optional - to search specific conversation)
 */
router.get(
  '/search',
  messageValidator.validateSearch,
  ConversationController.searchMessages
);

/**
 * @route   GET /api/v1/conversations/match/:matchId
 * @desc    Get conversation by match ID
 * @access  Private
 * @param   matchId - The match ID
 */
router.get(
  '/match/:matchId',
  messageValidator.validateMatchId,
  ConversationController.getConversationByMatch
);

/**
 * @route   GET /api/v1/conversations/:conversationId
 * @desc    Get specific conversation details
 * @access  Private
 * @param   conversationId - The conversation ID
 */
router.get(
  '/:conversationId',
  messageValidator.validateConversationId,
  ConversationController.getConversation
);

/**
 * @route   GET /api/v1/conversations/:conversationId/messages
 * @desc    Get messages in a conversation (paginated)
 * @access  Private
 * @param   conversationId - The conversation ID
 * @query   cursor - Message ID to paginate from
 * @query   limit (default: 50, max: 100)
 */
router.get(
  '/:conversationId/messages',
  [
    messageValidator.validateConversationId,
    messageValidator.validatePagination
  ],
  ConversationController.getMessages
);

/**
 * @route   POST /api/v1/conversations/:conversationId/messages
 * @desc    Send a message in conversation
 * @access  Private
 * @param   conversationId - The conversation ID
 * @body    text - Text message content (required if no media)
 * @body    clientMessageId - Unique ID to prevent duplicates
 * @body    replyToMessageId - ID of message being replied to
 * @file    photo - Photo file (optional, max 10MB)
 * @file    voice - Voice note file (optional, max 5MB, max 3 min)
 */
router.post(
    '/:conversationId/messages',
    [
      messageValidator.validateConversationId,
      messageUpload.fields([
        { name: 'photo', maxCount: 1 },
        { name: 'voice', maxCount: 1 }
      ]),
      messageValidator.validateSendMessage
    ],
    ConversationController.sendMessage
  );

/**
 * @route   PUT /api/v1/conversations/:conversationId/read
 * @desc    Mark messages as read in conversation
 * @access  Private
 * @param   conversationId - The conversation ID
 * @body    upToMessageId - Mark all messages up to this ID as read
 */
router.put(
  '/:conversationId/read',
  [
    messageValidator.validateConversationId,
    messageValidator.validateMarkRead
  ],
  ConversationController.markAsRead
);

/**
 * @route   DELETE /api/v1/conversations/:conversationId/messages/:messageId
 * @desc    Delete a message (within 5 minutes of sending)
 * @access  Private
 * @param   conversationId - The conversation ID
 * @param   messageId - The message ID to delete
 */
router.delete(
  '/:conversationId/messages/:messageId',
  [
    messageValidator.validateConversationId,
    messageValidator.validateMessageId
  ],
  ConversationController.deleteMessage
);

/**
 * @route   POST /api/v1/conversations/:conversationId/messages/:messageId/report
 * @desc    Report a message for inappropriate content
 * @access  Private
 * @param   conversationId - The conversation ID  
 * @param   messageId - The message ID to report
 * @body    reason - Report reason (required)
 * @body    details - Additional details (optional)
 */
router.post(
  '/:conversationId/messages/:messageId/report',
  [
    messageValidator.validateConversationId,
    messageValidator.validateMessageId,
    messageValidator.validateReport
  ],
  ConversationController.reportMessage
);

/**
 * @route   PUT /api/v1/conversations/:conversationId/block
 * @desc    Block or unblock user in conversation
 * @access  Private
 * @param   conversationId - The conversation ID
 * @body    action - Either 'block' or 'unblock'
 */
router.put(
  '/:conversationId/block',
  [
    messageValidator.validateConversationId,
    messageValidator.validateBlockAction
  ],
  ConversationController.toggleBlock
);

/**
 * @route   DELETE /api/v1/conversations/:conversationId
 * @desc    Delete conversation (soft delete for current user)
 * @access  Private
 * @param   conversationId - The conversation ID
 */
router.delete(
  '/:conversationId',
  messageValidator.validateConversationId,
  ConversationController.deleteConversation
);

module.exports = router;