const mongoose = require('mongoose');

/**
 * Conversation Model
 * Represents a chat session between two matched users
 */
const conversationSchema = new mongoose.Schema(
  {
    // Participants in the conversation (always 2 for 1-on-1 chat)
    participants: [
      {
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
        lastReadAt: {
          type: Date,
          default: null,
        },
        lastSeenMessageId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Message',
          default: null,
        },
        unreadCount: {
          type: Number,
          default: 0,
        },
        isBlocked: {
          type: Boolean,
          default: false,
        },
        blockedAt: {
          type: Date,
          default: null,
        },
        isMuted: {
          type: Boolean,
          default: false,
        },
        mutedUntil: {
          type: Date,
          default: null,
        },
        hasDeleted: {
          type: Boolean,
          default: false,
        },
        deletedAt: {
          type: Date,
          default: null,
        },
      },
    ],

    // Link to the original match that created this conversation
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
      unique: true, // One conversation per match
    },

    // Last message preview (for conversation list)
    lastMessage: {
      text: {
        type: String,
        default: null,
      },
      type: {
        type: String,
        enum: ['text', 'photo', 'voice', 'system', 'ice_breaker'],
        default: 'text',
      },
      senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
      },
      sentAt: {
        type: Date,
        default: null,
      },
    },

    // Conversation metadata
    messageCount: {
      type: Number,
      default: 0,
    },
    
    lastMessageAt: {
      type: Date,
      default: Date.now,
      index: true, // For sorting conversations
    },

    // AI-generated ice breakers
    iceBreakers: [
      {
        text: {
          type: String,
          required: true,
        },
        category: {
          type: String,
          enum: ['fun', 'deep', 'hobby', 'travel', 'food', 'creative'],
          default: 'fun',
        },
        used: {
          type: Boolean,
          default: false,
        },
        usedAt: {
          type: Date,
          default: null,
        },
        usedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          default: null,
        },
      },
    ],

    // Conversation status
    status: {
      type: String,
      enum: ['active', 'blocked', 'deleted', 'archived'],
      default: 'active',
      index: true,
    },

    // Track who started the conversation
    startedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    // First message timestamp (for analytics)
    firstMessageAt: {
      type: Date,
      default: null,
    },

    // Blocking information
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    
    blockedAt: {
      type: Date,
      default: null,
    },
    
    blockReason: {
      type: String,
      default: null,
    },

    // Soft delete support
    isDeleted: {
      type: Boolean,
      default: false,
    },
    
    deletedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
);

// ==================== INDEXES ====================

// Compound index for finding conversations between users
conversationSchema.index({ 'participants.userId': 1, status: 1 });

// Index for sorting by last message
conversationSchema.index({ lastMessageAt: -1 });

// Index for finding conversations by match
conversationSchema.index({ matchId: 1 });

// Index for finding active conversations
conversationSchema.index({ status: 1, lastMessageAt: -1 });

// ==================== VIRTUAL FIELDS ====================

// Virtual for checking if conversation is muted
conversationSchema.virtual('isMuted').get(function () {
  const now = new Date();
  return this.participants.some(
    p => p.isMuted && (!p.mutedUntil || p.mutedUntil > now)
  );
});

// ==================== STATIC METHODS ====================

/**
 * Find or create conversation between two users
 */
conversationSchema.statics.findOrCreateByMatchId = async function (
  matchId,
  startedByUserId
) {
  let conversation = await this.findOne({ matchId });

  if (!conversation) {
    // Get match details to create participants
    const Match = mongoose.model('Match');
    const match = await Match.findById(matchId)
      .populate('userId matchedUserId');

    if (!match) {
      throw new Error('Match not found');
    }

    // Create new conversation
    conversation = await this.create({
      matchId,
      participants: [
        { userId: match.userId._id },
        { userId: match.matchedUserId._id },
      ],
      startedBy: startedByUserId,
      iceBreakers: [], // Will be populated by service
    });
  }

  return conversation;
};

/**
 * Get conversation between two users
 */
conversationSchema.statics.findBetweenUsers = async function (userId1, userId2) {
  return this.findOne({
    'participants.userId': { $all: [userId1, userId2] },
    status: 'active',
  });
};

/**
 * Get user's conversations
 */
conversationSchema.statics.getUserConversations = async function (
  userId,
  { page = 1, limit = 20, status = 'active' }
) {
  const skip = (page - 1) * limit;

  const query = {
    'participants.userId': userId,
    status,
  };

  // Exclude deleted conversations for this user
  query[`participants`] = {
    $elemMatch: {
      userId,
      hasDeleted: false,
    },
  };

  const conversations = await this.find(query)
    .sort({ lastMessageAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('participants.userId', 'firstName lastName profilePhoto username')
    .populate('lastMessage.senderId', 'firstName')
    .lean();

  return conversations;
};

// ==================== INSTANCE METHODS ====================

/**
 * Get participant info for a specific user
 */
conversationSchema.methods.getParticipant = function (userId) {
  return this.participants.find(
    p => p.userId.toString() === userId.toString()
  );
};

/**
 * Get the other participant (not the current user)
 */
conversationSchema.methods.getOtherParticipant = function (currentUserId) {
  return this.participants.find(
    p => p.userId.toString() !== currentUserId.toString()
  );
};

/**
 * Update last message
 */
conversationSchema.methods.updateLastMessage = async function (message) {
  this.lastMessage = {
    text: message.type === 'text' ? message.text : `Sent a ${message.type}`,
    type: message.type,
    senderId: message.senderId,
    sentAt: message.createdAt,
  };
  this.lastMessageAt = message.createdAt;
  this.messageCount += 1;

  if (!this.firstMessageAt) {
    this.firstMessageAt = message.createdAt;
  }

  // Update unread count for other participant
  const otherParticipant = this.participants.find(
    p => p.userId.toString() !== message.senderId.toString()
  );
  if (otherParticipant) {
    otherParticipant.unreadCount += 1;
  }

  await this.save();
};

/**
 * Mark messages as read for a user
 */
conversationSchema.methods.markAsRead = async function (userId, lastMessageId) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.lastReadAt = new Date();
    participant.lastSeenMessageId = lastMessageId;
    participant.unreadCount = 0;
    await this.save();
  }
};

/**
 * Block conversation
 */
conversationSchema.methods.block = async function (userId, reason = null) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.isBlocked = true;
    participant.blockedAt = new Date();
  }

  this.status = 'blocked';
  this.blockedBy = userId;
  this.blockedAt = new Date();
  this.blockReason = reason;

  await this.save();
};

/**
 * Unblock conversation
 */
conversationSchema.methods.unblock = async function (userId) {
  const participant = this.getParticipant(userId);
  if (participant && participant.isBlocked) {
    participant.isBlocked = false;
    participant.blockedAt = null;
  }

  // Only unblock if this user was the blocker
  if (this.blockedBy?.toString() === userId.toString()) {
    this.status = 'active';
    this.blockedBy = null;
    this.blockedAt = null;
    this.blockReason = null;
    await this.save();
  }
};

/**
 * Soft delete conversation for a user
 */
conversationSchema.methods.softDelete = async function (userId) {
  const participant = this.getParticipant(userId);
  if (participant) {
    participant.hasDeleted = true;
    participant.deletedAt = new Date();
  }

  if (!this.deletedBy.includes(userId)) {
    this.deletedBy.push(userId);
  }

  // If both users deleted, mark as deleted
  const allDeleted = this.participants.every(p => p.hasDeleted);
  if (allDeleted) {
    this.status = 'deleted';
    this.isDeleted = true;
  }

  await this.save();
};

module.exports = mongoose.model('Conversation', conversationSchema);