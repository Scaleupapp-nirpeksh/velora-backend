const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const Block = require('../models/Block');
const User = require('../models/User');
const MessageReport = require('../models/MessageReport');
const s3Service = require('./s3.service');
const openaiService = require('./openai.service');
const logger = require('../utils/logger');
const sharp = require('sharp');
const BadWordsFilter = require('bad-words-plus');

const filter = new BadWordsFilter();

/**
 * Message Service
 * Handles all message-related business logic
 */
class MessageService {
  /**
   * Send a text message
   */
  static async sendTextMessage(conversationId, senderId, text, clientMessageId = null) {
    try {
      // Validate conversation access
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': senderId,
        status: 'active',
      });

      if (!conversation) {
        throw new Error('Conversation not found or inactive');
      }

      // Check if sender is blocked
      const otherParticipant = conversation.getOtherParticipant(senderId);
      const isBlocked = await Block.isEitherBlocked(senderId, otherParticipant.userId);
      
      if (isBlocked) {
        throw new Error('Cannot send message - user is blocked');
      }

      // Check for duplicate (idempotency)
      if (clientMessageId) {
        const existing = await Message.findOne({
          conversationId,
          clientMessageId,
          senderId,
        });
        if (existing) {
          return existing;
        }
      }

      // Content moderation
      const moderationResult = await this.moderateContent(text);
      
      // Create message
      const message = await Message.create({
        conversationId,
        senderId,
        type: 'text',
        text: text.trim(),
        clientMessageId,
        status: 'sent',
        isFlagged: moderationResult.isFlagged,
        flagReason: moderationResult.reason,
        moderationStatus: moderationResult.isFlagged ? 'auto_flagged' : 'approved',
      });

      // Auto-report if severely inappropriate
      if (moderationResult.severity === 'high') {
        await message.report(senderId, 'inappropriate_content');
      }

      // Update conversation's last message
      await conversation.updateLastMessage(message);

      // Populate sender info for response
      await message.populate('senderId', 'firstName lastName profilePhoto username');

      logger.info(`Message sent in conversation ${conversationId}`);

      return message;

    } catch (error) {
      logger.error('Error sending text message:', error);
      throw error;
    }
  }

  static async sendPhotoMessage(
    conversationId,
    senderId,
    photoFile,
    clientMessageId = null
  ) {
    try {
      // Validate conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': senderId,
        status: 'active',
      });
  
      if (!conversation) {
        throw new Error('Conversation not found or inactive');
      }
  
      // Check file size (max 5MB)
      if (photoFile.size > 5 * 1024 * 1024) {
        throw new Error('Photo size exceeds 5MB limit');
      }
  
      // Check file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(photoFile.mimetype)) {
        throw new Error('Invalid file type. Only JPEG, PNG, and WebP allowed');
      }
  
      // Process image
      const processedImage = await sharp(photoFile.buffer)
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 85 })
        .toBuffer();
  
      // Create thumbnail
      const thumbnail = await sharp(photoFile.buffer)
        .resize(200, 200, {
          fit: 'cover',
        })
        .jpeg({ quality: 70 })
        .toBuffer();
  
      // Get image metadata
      const metadata = await sharp(photoFile.buffer).metadata();
  
      // Upload to S3
      const s3Key = `messages/photos/${conversationId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
      const thumbnailKey = `messages/thumbnails/${conversationId}/${Date.now()}_thumb.jpg`;
  
      // Upload and get results
      const [photoUploadResult, thumbnailUploadResult] = await Promise.all([
        s3Service.uploadFile(processedImage, s3Key, 'image/jpeg'),
        s3Service.uploadFile(thumbnail, thumbnailKey, 'image/jpeg'),
      ]);
  
      // Check for inappropriate content
      const isSafe = await this.moderateImage(photoUploadResult.url); // ← Use .url
      
      // Create message with proper string URLs
      const message = await Message.create({
        conversationId,
        senderId,
        type: 'photo',
        media: {
          url: photoUploadResult.url,  // ← String, not object
          thumbnailUrl: thumbnailUploadResult.url,  // ← String, not object
          s3Key: photoUploadResult.key || s3Key,  // Store original key
          s3ThumbnailKey: thumbnailUploadResult.key || thumbnailKey,
          size: processedImage.length,
          width: metadata.width,
          height: metadata.height,
          mimeType: 'image/jpeg',
          originalName: photoFile.originalname,
        },
        clientMessageId,
        status: 'sent',
        isFlagged: !isSafe,
        flagReason: !isSafe ? 'inappropriate_image' : null,
        moderationStatus: isSafe ? 'approved' : 'auto_flagged',
      });
  
      // Update conversation
      await conversation.updateLastMessage(message);
  
      // Populate sender
      await message.populate('senderId', 'firstName lastName profilePhoto username');
  
      logger.info(`Photo message sent in conversation ${conversationId}`);
  
      return message;
  
    } catch (error) {
      logger.error('Error sending photo message:', error);
      throw error;
    }
  }

 /**
 * Send a voice message
 */
static async sendVoiceMessage(
    conversationId,
    senderId,
    audioFile,
    duration,
    clientMessageId = null
  ) {
    try {
      // Validate conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': senderId,
        status: 'active',
      });
  
      if (!conversation) {
        throw new Error('Conversation not found or inactive');
      }
  
      // Validate duration (max 60 seconds)
      if (duration > 60) {
        throw new Error('Voice message exceeds 60 second limit');
      }
  
      // Check file type
      const allowedTypes = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/wav'];
      if (!allowedTypes.includes(audioFile.mimetype)) {
        throw new Error('Invalid audio format');
      }
  
      // Upload to S3
      const s3Key = `messages/voice/${conversationId}/${Date.now()}_${Math.random().toString(36).substr(2, 9)}.m4a`;
      
      // Upload and get the result object
      const audioUploadResult = await s3Service.uploadFile(
        audioFile.buffer,
        s3Key,
        audioFile.mimetype
      );
  
      // Extract the URL string from the result
      const audioUrl = audioUploadResult.url || audioUploadResult;  // Handle both object and string returns
  
      // Transcribe with Whisper (optional)
      let transcribedText = null;
      try {
        transcribedText = await openaiService.transcribeAudio(audioFile.buffer);
        
        // Moderate transcribed content
        if (transcribedText) {
          const moderationResult = await this.moderateContent(transcribedText);
          if (moderationResult.severity === 'high') {
            logger.warn(`Inappropriate voice message detected: ${conversationId}`);
          }
        }
      } catch (transcribeError) {
        logger.error('Error transcribing voice message:', transcribeError);
        // Continue without transcription
      }
  
      // Create message with proper string URL
      const message = await Message.create({
        conversationId,
        senderId,
        type: 'voice',
        text: transcribedText, // Store transcription if available
        media: {
          url: audioUrl,  // This is now a string, not an object
          s3Key: audioUploadResult.key || s3Key,  // Store the S3 key for deletion
          duration,
          size: audioFile.size,
          mimeType: audioFile.mimetype,
          originalName: audioFile.originalname,
        },
        clientMessageId,
        status: 'sent',
      });
  
      // Update conversation
      await conversation.updateLastMessage(message);
  
      // Populate sender
      await message.populate('senderId', 'firstName lastName profilePhoto username');
  
      logger.info(`Voice message sent in conversation ${conversationId}`);
  
      return message;
  
    } catch (error) {
      logger.error('Error sending voice message:', error);
      throw error;
    }
  }

  /**
   * Get conversation messages with pagination
   */
  static async getMessages(conversationId, userId, options = {}) {
    try {
      const {
        cursor = null,
        limit = 20,
      } = options;

      // Validate user has access
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId,
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Get messages
      const result = await Message.getConversationMessages(
        conversationId,
        { cursor, limit, userId }
      );

      // Mark messages as delivered
      const unreadMessages = result.messages.filter(
        m => m.senderId.toString() !== userId.toString() && 
             m.status !== 'read'
      );

      if (unreadMessages.length > 0) {
        // Mark as delivered (not read yet)
        await Message.updateMany(
          {
            _id: { $in: unreadMessages.map(m => m._id) },
            status: { $ne: 'read' },
          },
          {
            status: 'delivered',
            deliveredAt: new Date(),
          }
        );
      }

      return result;

    } catch (error) {
      logger.error('Error getting messages:', error);
      throw error;
    }
  }

  /**
   * Mark messages as read
   */
  static async markAsRead(conversationId, userId, messageIds) {
    try {
      // Validate conversation access
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId,
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Update messages
      const result = await Message.updateMany(
        {
          _id: { $in: messageIds },
          conversationId,
          senderId: { $ne: userId }, // Only mark others' messages as read
          status: { $ne: 'read' },
        },
        {
          status: 'read',
          readAt: new Date(),
        }
      );

      // Update conversation's last read
      if (result.modifiedCount > 0) {
        const lastMessageId = messageIds[messageIds.length - 1];
        await conversation.markAsRead(userId, lastMessageId);
      }

      logger.info(`Marked ${result.modifiedCount} messages as read`);

      return {
        success: true,
        markedCount: result.modifiedCount,
      };

    } catch (error) {
      logger.error('Error marking messages as read:', error);
      throw error;
    }
  }

  /**
   * Delete a message
   */
  static async deleteMessage(messageId, userId, deleteForEveryone = false) {
    try {
      const message = await Message.findById(messageId);

      if (!message) {
        throw new Error('Message not found');
      }

      // Check if user is sender
      if (message.senderId.toString() !== userId.toString()) {
        throw new Error('You can only delete your own messages');
      }

      // Check 5-minute window
      const fiveMinutes = 5 * 60 * 1000;
      const messageAge = Date.now() - message.createdAt.getTime();
      
      if (messageAge > fiveMinutes) {
        throw new Error('Messages can only be deleted within 5 minutes');
      }

      // Soft delete
      await message.softDelete(userId, deleteForEveryone);

      // Delete media from S3 if needed
      if (deleteForEveryone && message.media?.s3Key) {
        try {
          await s3Service.deleteFile(message.media.s3Key);
          if (message.media.s3ThumbnailKey) {
            await s3Service.deleteFile(message.media.s3ThumbnailKey);
          }
        } catch (s3Error) {
          logger.error('Error deleting media from S3:', s3Error);
        }
      }

      logger.info(`Message ${messageId} deleted by ${userId}`);

      return {
        success: true,
        deletedForEveryone: deleteForEveryone,
      };

    } catch (error) {
      logger.error('Error deleting message:', error);
      throw error;
    }
  }

  /**
   * Report a message
   */
  static async reportMessage(messageId, reporterId, reason, description = null) {
    try {
      const message = await Message.findById(messageId)
        .populate('conversationId');

      if (!message) {
        throw new Error('Message not found');
      }

      // Verify reporter is in conversation
      const conversation = message.conversationId;
      const isParticipant = conversation.participants.some(
        p => p.userId.toString() === reporterId.toString()
      );

      if (!isParticipant) {
        throw new Error('You are not part of this conversation');
      }

      // Create report
      const report = await MessageReport.createReport({
        messageId,
        conversationId: conversation._id,
        reportedBy: reporterId,
        reportedUser: message.senderId,
        reason,
        description,
      });

      logger.info(`Message ${messageId} reported by ${reporterId}`);

      return report;

    } catch (error) {
      logger.error('Error reporting message:', error);
      throw error;
    }
  }

  /**
   * Moderate text content
   */
  static async moderateContent(text) {
    try {
      // Basic profanity check
      const isProfane = filter.isProfane(text);

      // Check for dangerous patterns
      const dangerousPatterns = [
        /\b(?:kill|murder|suicide|die)\b/i,
        /\b(?:rape|assault)\b/i,
        /\b(?:drugs|cocaine|heroin|meth)\b/i,
        /\b\d{10,}\b/, // Phone numbers
        /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/, // Emails
      ];

      let isFlagged = isProfane;
      let reason = isProfane ? 'profanity' : null;
      let severity = isProfane ? 'low' : 'none';

      for (const pattern of dangerousPatterns) {
        if (pattern.test(text)) {
          isFlagged = true;
          severity = 'high';
          if (pattern.source.includes('kill|murder')) {
            reason = 'violence';
          } else if (pattern.source.includes('\\d{10,}')) {
            reason = 'personal_info';
            severity = 'medium';
          } else if (pattern.source.includes('@')) {
            reason = 'personal_info';
            severity = 'medium';
          }
          break;
        }
      }

      return {
        isFlagged,
        reason,
        severity,
      };

    } catch (error) {
      logger.error('Error moderating content:', error);
      return { isFlagged: false, reason: null, severity: 'none' };
    }
  }

  /**
   * Moderate image content (placeholder for actual implementation)
   */
  static async moderateImage(imageUrl) {
    try {
      // Here you would integrate with image moderation API
      // (AWS Rekognition, Google Vision API, etc.)
      
      // For now, return true (safe)
      return true;

    } catch (error) {
      logger.error('Error moderating image:', error);
      return true; // Default to safe on error
    }
  }

  /**
 * Get a message by ID
 */
static async getMessage(messageId) {
    try {
      const message = await Message.findById(messageId);
      return message;
    } catch (error) {
      logger.error('Error getting message:', error);
      throw error;
    }
  }
  
  /**
   * Edit message
   */
  static async editMessage(messageId, text) {
    try {
      const message = await Message.findByIdAndUpdate(
        messageId,
        { 
          text: text.trim(),
          isEdited: true,
          editedAt: new Date()
        },
        { new: true }
      );
      
      return message;
    } catch (error) {
      logger.error('Error editing message:', error);
      throw error;
    }
  }
  
  /**
   * Add reaction to message
   */
  static async addReaction(messageId, userId, emoji) {
    try {
      // First, remove any existing reaction from this user
      await Message.findByIdAndUpdate(messageId, {
        $pull: { reactions: { userId } }
      });
      
      // Then add the new reaction
      await Message.findByIdAndUpdate(messageId, {
        $push: { reactions: { userId, emoji, createdAt: new Date() } }
      });
      
    } catch (error) {
      logger.error('Error adding reaction:', error);
      throw error;
    }
  }
  
  /**
   * Remove reaction from message
   */
  static async removeReaction(messageId, userId) {
    try {
      await Message.findByIdAndUpdate(messageId, {
        $pull: { reactions: { userId } }
      });
    } catch (error) {
      logger.error('Error removing reaction:', error);
      throw error;
    }
  }
  
  /**
   * Get media messages
   */
  static async getMediaMessages(conversationId, type, page, limit) {
    try {
      const query = { conversationId };
      
      if (type !== 'all') {
        query.type = type;
      } else {
        query.type = { $in: ['photo', 'voice'] };
      }
      
      const messages = await Message.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('senderId', 'firstName lastName profilePhoto');
      
      const total = await Message.countDocuments(query);
      
      return {
        messages,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Error getting media messages:', error);
      throw error;
    }
  }
  
 /**
 * Toggle save message
 */
static async toggleSaveMessage(messageId, userId) {
    try {
      const message = await Message.findById(messageId);
      
      if (!message) {
        throw new Error('Message not found');
      }
      
      // Initialize savedBy array if it doesn't exist
      if (!message.savedBy) {
        message.savedBy = [];
      }
      
      // Check if user has already saved the message
      const isSaved = message.savedBy.includes(userId);
      
      if (isSaved) {
        // Remove from saved
        await Message.findByIdAndUpdate(messageId, {
          $pull: { savedBy: userId }
        });
        return false;
      } else {
        // Add to saved
        await Message.findByIdAndUpdate(messageId, {
          $addToSet: { savedBy: userId }  // $addToSet prevents duplicates
        });
        return true;
      }
    } catch (error) {
      logger.error('Error toggling save message:', error);
      throw error;
    }
  }
  
  /**
   * Get saved messages
   */
  static async getSavedMessages(userId, page, limit) {
    try {
      const messages = await Message.find({
        savedBy: userId
      })
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('senderId', 'firstName lastName profilePhoto')
        .populate('conversationId', 'participants');
      
      const total = await Message.countDocuments({ savedBy: userId });
      
      return {
        messages,
        total,
        page,
        totalPages: Math.ceil(total / limit)
      };
    } catch (error) {
      logger.error('Error getting saved messages:', error);
      throw error;
    }
  }
  
  /**
   * Forward message (missing method)
   */
  static async forwardMessage(messageId, targetConversationId, forwardedBy) {
    try {
      const originalMessage = await Message.findById(messageId);
      
      const forwardedMessage = await Message.create({
        conversationId: targetConversationId,
        senderId: forwardedBy,
        type: originalMessage.type,
        text: originalMessage.text,
        media: originalMessage.media,
        isForwarded: true,
        forwardedFrom: messageId,
        status: 'sent'
      });
      
      return forwardedMessage;
    } catch (error) {
      logger.error('Error forwarding message:', error);
      throw error;
    }
  }
  
  /**
   * Search messages
   */
  static async searchMessages(userId, query, conversationId = null) {
    try {
      const searchQuery = {
        text: { $regex: query, $options: 'i' }
      };
      
      if (conversationId) {
        searchQuery.conversationId = conversationId;
      } else {
        // Get all user's conversations first
        const conversations = await Conversation.find({
          'participants.userId': userId
        });
        searchQuery.conversationId = { 
          $in: conversations.map(c => c._id) 
        };
      }
      
      const results = await Message.find(searchQuery)
        .limit(50)
        .populate('senderId', 'firstName lastName')
        .sort({ createdAt: -1 });
      
      return results;
    } catch (error) {
      logger.error('Error searching messages:', error);
      throw error;
    }
  }

}

module.exports = MessageService;