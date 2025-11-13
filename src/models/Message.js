const mongoose = require('mongoose');

/**
 * Message Model
 * Represents individual messages in conversations
 */
const messageSchema = new mongoose.Schema(
  {
    // Conversation this message belongs to
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },

    // Message sender
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Message type
    type: {
      type: String,
      enum: ['text', 'photo', 'voice', 'system', 'ice_breaker'],
      required: true,
      default: 'text',
    },

    // ==================== MESSAGE CONTENT ====================
    
    // Text content (for text, system, and ice_breaker messages)
    text: {
      type: String,
      maxlength: 1000,
      default: null,
    },

    // Media content (for photo and voice messages)
    media: {
      url: {
        type: String,
        default: null,
      },
      thumbnailUrl: {
        type: String,
        default: null,
      },
      s3Key: {
        type: String,
        default: null,
      },
      s3ThumbnailKey: {
        type: String,
        default: null,
      },
      duration: {
        type: Number, // Duration in seconds for voice messages
        default: null,
        max: 60,
      },
      size: {
        type: Number, // File size in bytes
        default: null,
        max: 5242880, // 5MB max
      },
      width: {
        type: Number, // Image width
        default: null,
      },
      height: {
        type: Number, // Image height
        default: null,
      },
      mimeType: {
        type: String,
        default: null,
      },
      originalName: {
        type: String,
        default: null,
      },
    },

    // System message metadata
    systemMessageType: {
      type: String,
      enum: [
        'conversation_started',
        'match_created',
        'user_blocked',
        'user_unblocked',
        'message_deleted',
        'media_expired',
        'safety_warning',
      ],
      default: null,
    },

    // Ice breaker metadata
    iceBreakerId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    // ==================== DELIVERY STATUS ====================
    
    // Message status
    status: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'read', 'failed'],
      default: 'sending',
      index: true,
    },

    // Delivery timestamps
    sentAt: {
      type: Date,
      default: Date.now,
    },
    
    deliveredAt: {
      type: Date,
      default: null,
    },
    
    readAt: {
      type: Date,
      default: null,
    },

    // Failed message info
    failureReason: {
      type: String,
      default: null,
    },
    
    retryCount: {
      type: Number,
      default: 0,
      max: 3,
    },

    // ==================== EDIT/DELETE ====================
    
    // Edit history
    isEdited: {
      type: Boolean,
      default: false,
    },
    
    editedAt: {
      type: Date,
      default: null,
    },
    
    originalText: {
      type: String,
      default: null,
    },

    // Soft delete (within 5 minutes)
    isDeleted: {
      type: Boolean,
      default: false,
    },
    
    deletedAt: {
      type: Date,
      default: null,
    },
    
    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    deleteForEveryone: {
      type: Boolean,
      default: false,
    },

    // ==================== REPLY FEATURE (PHASE 2) ====================
    
    // Reply to another message
    replyTo: {
      messageId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Message',
        default: null,
      },
      text: {
        type: String, // Cached text of original message
        default: null,
      },
      type: {
        type: String,
        default: null,
      },
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
    },

    // ==================== REACTIONS (PHASE 2) ====================
    
    reactions: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        emoji: {
          type: String,
          required: true,
          enum: ['❤️', '😂', '😮', '😢', '😡', '👍'],
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // ==================== SAFETY & MODERATION ====================
    
    // Content moderation
    isReported: {
      type: Boolean,
      default: false,
      index: true,
    },
    
    reportCount: {
      type: Number,
      default: 0,
    },
    
    reportReasons: [
      {
        type: String,
        enum: ['spam', 'inappropriate', 'harassment', 'fake', 'other'],
      },
    ],
    
    isFlagged: {
      type: Boolean,
      default: false,
    },
    
    flagReason: {
      type: String,
      default: null,
    },
    
    moderationStatus: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'auto_flagged'],
      default: 'approved',
    },

    // ==================== METADATA ====================
    
    // Client-side message ID (for deduplication)
    clientMessageId: {
      type: String,
      default: null,
      index: true,
    },

    // IP and device info for security
    senderInfo: {
      ipAddress: {
        type: String,
        default: null,
      },
      deviceType: {
        type: String,
        enum: ['ios', 'android', 'web'],
        default: null,
      },
      appVersion: {
        type: String,
        default: null,
      },
    },

    // Message encryption (for future)
    isEncrypted: {
      type: Boolean,
      default: false,
    },
    
    encryptionKeyId: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ==================== INDEXES ====================

// Index for fetching conversation messages
messageSchema.index({ conversationId: 1, createdAt: -1 });

// Index for finding unread messages
messageSchema.index({ conversationId: 1, status: 1 });

// Index for reported messages
messageSchema.index({ isReported: 1, moderationStatus: 1 });

// Index for deleting old messages
messageSchema.index({ createdAt: 1, isDeleted: 1 });

// ==================== VIRTUAL FIELDS ====================

// Check if message can be deleted
messageSchema.virtual('canBeDeleted').get(function () {
  const fiveMinutes = 5 * 60 * 1000;
  const messageAge = Date.now() - this.createdAt.getTime();
  return messageAge <= fiveMinutes && !this.isDeleted;
});

// Check if message is a media message
messageSchema.virtual('isMedia').get(function () {
  return ['photo', 'voice'].includes(this.type);
});

// ==================== STATIC METHODS ====================

/**
 * Get paginated messages for a conversation
 */
messageSchema.statics.getConversationMessages = async function (
  conversationId,
  {
    cursor = null,
    limit = 20,
    userId = null,
  }
) {
  const query = {
    conversationId,
    isDeleted: false,
  };

  // If cursor provided, get messages before it
  if (cursor) {
    const cursorMessage = await this.findById(cursor);
    if (cursorMessage) {
      query.createdAt = { $lt: cursorMessage.createdAt };
    }
  }

  const messages = await this.find(query)
    .sort({ createdAt: -1 })
    .limit(limit + 1) // Fetch one extra to check if there's more
    .populate('senderId', 'firstName lastName profilePhoto username')
    .populate('replyTo.senderId', 'firstName username')
    .lean();

  // Check if there are more messages
  const hasMore = messages.length > limit;
  if (hasMore) {
    messages.pop(); // Remove the extra message
  }

  // Mark messages as delivered if not sender
  if (userId) {
    const undeliveredMessages = messages.filter(
      m => m.senderId.toString() !== userId.toString() && 
           m.status === 'sent'
    );
    
    if (undeliveredMessages.length > 0) {
      await this.updateMany(
        {
          _id: { $in: undeliveredMessages.map(m => m._id) },
          status: 'sent',
        },
        {
          status: 'delivered',
          deliveredAt: new Date(),
        }
      );
    }
  }

  return {
    messages: messages.reverse(), // Return in chronological order
    hasMore,
    nextCursor: hasMore ? messages[messages.length - 1]._id : null,
  };
};

/**
 * Create a system message
 */
messageSchema.statics.createSystemMessage = async function (
  conversationId,
  systemMessageType,
  text = null
) {
  const systemMessages = {
    conversation_started: 'Conversation started',
    match_created: 'You matched! Start a conversation 🎉',
    user_blocked: 'User has been blocked',
    user_unblocked: 'User has been unblocked',
    message_deleted: 'Message was deleted',
    media_expired: 'Media has expired',
    safety_warning: 'Please keep conversations respectful',
  };

  return this.create({
    conversationId,
    senderId: null, // System messages have no sender
    type: 'system',
    text: text || systemMessages[systemMessageType],
    systemMessageType,
    status: 'sent',
  });
};

// ==================== INSTANCE METHODS ====================

/**
 * Mark message as delivered
 */
messageSchema.methods.markAsDelivered = async function () {
  if (this.status === 'sent') {
    this.status = 'delivered';
    this.deliveredAt = new Date();
    await this.save();
    return true;
  }
  return false;
};

/**
 * Mark message as read
 */
messageSchema.methods.markAsRead = async function () {
  if (this.status !== 'read') {
    this.status = 'read';
    this.readAt = new Date();
    if (!this.deliveredAt) {
      this.deliveredAt = new Date();
    }
    await this.save();
    return true;
  }
  return false;
};

/**
 * Soft delete message
 */
messageSchema.methods.softDelete = async function (userId, deleteForEveryone = false) {
  // Check if within 5 minute window
  if (!this.canBeDeleted) {
    throw new Error('Message can only be deleted within 5 minutes');
  }

  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  this.deleteForEveryone = deleteForEveryone;

  await this.save();

  // Create system message if deleted for everyone
  if (deleteForEveryone) {
    await this.constructor.createSystemMessage(
      this.conversationId,
      'message_deleted'
    );
  }

  return this;
};

/**
 * Add reaction to message (Phase 2)
 */
messageSchema.methods.addReaction = async function (userId, emoji) {
  // Remove existing reaction from same user
  this.reactions = this.reactions.filter(
    r => r.userId.toString() !== userId.toString()
  );

  // Add new reaction
  this.reactions.push({
    userId,
    emoji,
    createdAt: new Date(),
  });

  await this.save();
  return this;
};

/**
 * Report message
 */
messageSchema.methods.report = async function (userId, reason) {
  if (!this.reportReasons.includes(reason)) {
    this.reportReasons.push(reason);
  }
  
  this.isReported = true;
  this.reportCount += 1;

  // Auto-flag after 3 reports
  if (this.reportCount >= 3) {
    this.isFlagged = true;
    this.moderationStatus = 'auto_flagged';
  }

  await this.save();

  // Create MessageReport document
  const MessageReport = mongoose.model('MessageReport');
  await MessageReport.create({
    messageId: this._id,
    conversationId: this.conversationId,
    reportedBy: userId,
    reportedUser: this.senderId,
    reason,
  });

  return this;
};

// ==================== MIDDLEWARE ====================

// Update conversation's last message after saving
messageSchema.post('save', async function (doc) {
  if (doc.type !== 'system' && !doc.isDeleted) {
    const Conversation = mongoose.model('Conversation');
    const conversation = await Conversation.findById(doc.conversationId);
    if (conversation) {
      await conversation.updateLastMessage(doc);
    }
  }
});

module.exports = mongoose.model('Message', messageSchema);