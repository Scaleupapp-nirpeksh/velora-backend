// src/validators/message.validator.js

const { body, param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');

/**
 * Validation middleware for message-related endpoints
 */
class MessageValidator {
  /**
   * Helper to check validation results
   */
  static validate(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        errors: errors.array().map(err => ({
          field: err.param,
          message: err.msg,
          value: err.value
        }))
      });
    }
    next();
  }

  /**
   * Validate conversation ID parameter
   */
  static validateConversationId = [
    param('conversationId')
      .notEmpty()
      .withMessage('Conversation ID is required')
      .custom((value) => mongoose.Types.ObjectId.isValid(value))
      .withMessage('Invalid conversation ID format'),
    this.validate
  ];

  /**
   * Validate message ID parameter
   */
  static validateMessageId = [
    param('messageId')
      .notEmpty()
      .withMessage('Message ID is required')
      .custom((value) => mongoose.Types.ObjectId.isValid(value))
      .withMessage('Invalid message ID format'),
    this.validate
  ];

  /**
   * Validate match ID parameter
   */
  static validateMatchId = [
    param('matchId')
      .notEmpty()
      .withMessage('Match ID is required')
      .custom((value) => mongoose.Types.ObjectId.isValid(value))
      .withMessage('Invalid match ID format'),
    this.validate
  ];

  /**
   * Validate sending a message
   */
  static validateSendMessage = [
    body('text')
      .optional()
      .isString()
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Message text must be between 1 and 5000 characters'),
    
    body('clientMessageId')
      .optional()
      .isString()
      .isLength({ max: 100 })
      .withMessage('Client message ID must not exceed 100 characters'),
    
    body('replyToMessageId')
      .optional()
      .custom((value) => mongoose.Types.ObjectId.isValid(value))
      .withMessage('Invalid reply message ID format'),
    
    body('caption')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Photo caption must not exceed 500 characters'),
    
    // Custom validation to ensure at least text or file is present
    body().custom((body, { req }) => {
      const hasText = body.text && body.text.trim().length > 0;
      const hasPhoto = req.files && req.files.photo;
      const hasVoice = req.files && req.files.voice;
      
      if (!hasText && !hasPhoto && !hasVoice) {
        throw new Error('Message must contain text, photo, or voice note');
      }
      
      // Can't send both photo and voice in same message
      if (hasPhoto && hasVoice) {
        throw new Error('Cannot send photo and voice note in same message');
      }
      
      return true;
    }),
    
    this.validate
  ];

  /**
   * Validate first message to match
   */
  static validateFirstMessage = [
    body('matchId')
      .notEmpty()
      .withMessage('Match ID is required')
      .custom((value) => mongoose.Types.ObjectId.isValid(value))
      .withMessage('Invalid match ID format'),
    
    body('text')
      .notEmpty()
      .withMessage('Message text is required')
      .isString()
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Message text must be between 1 and 5000 characters'),
    
    body('clientMessageId')
      .optional()
      .isString()
      .isLength({ max: 100 })
      .withMessage('Client message ID must not exceed 100 characters'),
    
    this.validate
  ];

  /**
   * Validate pagination parameters
   */
  static validatePagination = [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer'),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100'),
    
    query('cursor')
      .optional()
      .custom((value) => mongoose.Types.ObjectId.isValid(value))
      .withMessage('Invalid cursor format'),
    
    this.validate
  ];

  /**
   * Validate search query
   */
  static validateSearch = [
    query('query')
      .notEmpty()
      .withMessage('Search query is required')
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Search query must be between 2 and 100 characters'),
    
    query('conversationId')
      .optional()
      .custom((value) => mongoose.Types.ObjectId.isValid(value))
      .withMessage('Invalid conversation ID format'),
    
    this.validate
  ];

  /**
   * Validate message report
   */
  static validateReport = [
    body('reason')
      .notEmpty()
      .withMessage('Report reason is required')
      .isIn([
        'inappropriate',
        'spam',
        'harassment',
        'hate_speech',
        'scam',
        'other'
      ])
      .withMessage('Invalid report reason'),
    
    body('details')
      .optional()
      .isString()
      .trim()
      .isLength({ max: 500 })
      .withMessage('Report details must not exceed 500 characters'),
    
    this.validate
  ];

  /**
   * Validate block/unblock action
   */
  static validateBlockAction = [
    body('action')
      .notEmpty()
      .withMessage('Action is required')
      .isIn(['block', 'unblock'])
      .withMessage('Action must be either block or unblock'),
    
    this.validate
  ];

  /**
   * Validate mark as read
   */
  static validateMarkRead = [
    body('upToMessageId')
      .notEmpty()
      .withMessage('Message ID is required')
      .custom((value) => mongoose.Types.ObjectId.isValid(value))
      .withMessage('Invalid message ID format'),
    
    this.validate
  ];

  /**
   * Validate edit message
   */
  static validateEditMessage = [
    body('text')
      .notEmpty()
      .withMessage('Message text is required')
      .isString()
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Message text must be between 1 and 5000 characters'),
    
    this.validate
  ];

  /**
   * Validate emoji reaction
   */
  static validateReaction = [
    body('emoji')
      .notEmpty()
      .withMessage('Emoji is required')
      .isIn(['❤️', '😊', '😂', '😍', '👍', '🔥', '😮', '😢'])
      .withMessage('Invalid emoji reaction'),
    
    this.validate
  ];

  /**
   * Validate forward message
   */
  static validateForward = [
    body('conversationIds')
      .notEmpty()
      .withMessage('Conversation IDs are required')
      .isArray({ min: 1, max: 5 })
      .withMessage('Can forward to 1-5 conversations')
      .custom((value) => {
        if (!Array.isArray(value)) return false;
        return value.every(id => mongoose.Types.ObjectId.isValid(id));
      })
      .withMessage('Invalid conversation ID format in array'),
    
    this.validate
  ];

  /**
   * Validate media type query
   */
  static validateMediaType = [
    query('type')
      .optional()
      .isIn(['photo', 'voice', 'all'])
      .withMessage('Media type must be photo, voice, or all'),
    
    this.validate
  ];

  /**
   * Validate voice message file
   */
  static validateVoiceMessage(req, res, next) {
    if (!req.files || !req.files.voice) {
      return next();
    }

    const voiceFile = req.files.voice[0];
    
    // Check file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (voiceFile.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'Voice note must not exceed 5MB'
      });
    }

    // Check file type
    const allowedMimeTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/mp4',
      'audio/m4a',
      'audio/wav',
      'audio/webm',
      'audio/ogg'
    ];

    if (!allowedMimeTypes.includes(voiceFile.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid audio format. Supported: MP3, M4A, WAV, WebM, OGG'
      });
    }

    next();
  }

  /**
   * Validate photo message file
   */
  static validatePhotoMessage(req, res, next) {
    if (!req.files || !req.files.photo) {
      return next();
    }

    const photoFile = req.files.photo[0];
    
    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (photoFile.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: 'Photo must not exceed 10MB'
      });
    }

    // Check file type
    const allowedMimeTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/heif'
    ];

    if (!allowedMimeTypes.includes(photoFile.mimetype)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image format. Supported: JPEG, PNG, WebP, HEIC'
      });
    }

    next();
  }

  /**
   * Combined file validation for send message
   */
  static validateMessageFiles = [
    MessageValidator.validateVoiceMessage,
    MessageValidator.validatePhotoMessage
  ];
}

module.exports = MessageValidator;