// src/routes/message.routes.js

const express = require('express');
const router = express.Router();



const MessageController = require('../controllers/message.controller');
const { authenticate } = require('../middleware/auth.middleware');
const upload = require('../middleware/upload.middleware');
const messageValidator = require('../validators/message.validator');

/**
 * Message Routes
 * All routes require authentication
 * Base path: /api/v1/messages
 */

// Apply authentication middleware to all routes
router.use(authenticate);

/**
 * @route   POST /api/v1/messages/first
 * @desc    Send first message to a match (creates conversation)
 * @access  Private
 * @body    matchId - The match ID (required)
 * @body    text - Message content (required)
 * @body    clientMessageId - Unique ID to prevent duplicates
 */
router.post(
  '/first',
  messageValidator.validateFirstMessage,
  MessageController.sendFirstMessage
);

/**
 * @route   GET /api/v1/messages/saved
 * @desc    Get user's saved messages
 * @access  Private
 * @query   page (default: 1)
 * @query   limit (default: 20)
 */
router.get(
  '/saved',
  messageValidator.validatePagination,
  MessageController.getSavedMessages
);

/**
 * @route   GET /api/v1/messages/media/:conversationId
 * @desc    Get media messages in a conversation
 * @access  Private
 * @param   conversationId - The conversation ID
 * @query   type - 'photo', 'voice', or 'all' (default: 'all')
 * @query   page (default: 1)
 * @query   limit (default: 20)
 */
router.get(
  '/media/:conversationId',
  [
    messageValidator.validateConversationId,
    messageValidator.validateMediaType,
    messageValidator.validatePagination
  ],
  MessageController.getMediaMessages
);

/**
 * @route   GET /api/v1/messages/:messageId
 * @desc    Get specific message by ID
 * @access  Private
 * @param   messageId - The message ID
 */
router.get(
  '/:messageId',
  messageValidator.validateMessageId,
  MessageController.getMessage
);

/**
 * @route   PUT /api/v1/messages/:messageId
 * @desc    Edit a message (within 5 minutes)
 * @access  Private
 * @param   messageId - The message ID
 * @body    text - New message content
 */
router.put(
  '/:messageId',
  [
    messageValidator.validateMessageId,
    messageValidator.validateEditMessage
  ],
  MessageController.editMessage
);

/**
 * @route   GET /api/v1/messages/:messageId/receipts
 * @desc    Get read receipts for a message
 * @access  Private (only sender can view)
 * @param   messageId - The message ID
 */
router.get(
  '/:messageId/receipts',
  messageValidator.validateMessageId,
  MessageController.getReadReceipts
);

/**
 * @route   POST /api/v1/messages/:messageId/react
 * @desc    Add emoji reaction to message
 * @access  Private
 * @param   messageId - The message ID
 * @body    emoji - The emoji reaction
 */
router.post(
  '/:messageId/react',
  [
    messageValidator.validateMessageId,
    messageValidator.validateReaction
  ],
  MessageController.reactToMessage
);

/**
 * @route   DELETE /api/v1/messages/:messageId/react
 * @desc    Remove reaction from message
 * @access  Private
 * @param   messageId - The message ID
 */
router.delete(
  '/:messageId/react',
  messageValidator.validateMessageId,
  MessageController.removeReaction
);

/**
 * @route   POST /api/v1/messages/:messageId/forward
 * @desc    Forward message to other conversations
 * @access  Private
 * @param   messageId - The message ID
 * @body    conversationIds - Array of conversation IDs (max 5)
 */
router.post(
  '/:messageId/forward',
  [
    messageValidator.validateMessageId,
    messageValidator.validateForward
  ],
  MessageController.forwardMessage
);

/**
 * @route   PUT /api/v1/messages/:messageId/save
 * @desc    Save or unsave a message
 * @access  Private
 * @param   messageId - The message ID
 */
router.put(
  '/:messageId/save',
  messageValidator.validateMessageId,
  MessageController.toggleSaveMessage
);

module.exports = router;