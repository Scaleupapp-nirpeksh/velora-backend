const mongoose = require('mongoose');

/**
 * Block Model
 * Tracks blocking relationships between users
 */
const blockSchema = new mongoose.Schema(
  {
    // User who initiated the block
    blockerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // User who was blocked
    blockedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Associated conversation (if block happened from chat)
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      default: null,
    },

    // Associated match (to prevent re-matching)
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      default: null,
    },

    // Block reason
    reason: {
      type: String,
      enum: [
        'inappropriate_messages',
        'harassment',
        'spam',
        'fake_profile',
        'not_interested',
        'safety_concern',
        'other',
      ],
      required: true,
      default: 'not_interested',
    },

    // Additional details about the block
    details: {
      type: String,
      maxlength: 500,
      default: null,
    },

    // Whether this was an automatic block (by system)
    isAutomatic: {
      type: Boolean,
      default: false,
    },

    // System reason for automatic blocks
    automaticReason: {
      type: String,
      enum: [
        'multiple_reports',
        'spam_detection',
        'harassment_detection',
        'safety_violation',
      ],
      default: null,
    },

    // Block metadata
    blockedFromScreen: {
      type: String,
      enum: ['chat', 'profile', 'match_list', 'report'],
      default: 'chat',
    },

    // Whether the blocked user was notified
    notificationSent: {
      type: Boolean,
      default: false,
    },

    // Timestamp when block expires (for temporary blocks)
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },

    // Whether this is a mutual block (both users blocked each other)
    isMutual: {
      type: Boolean,
      default: false,
    },

    // Admin review status
    reviewStatus: {
      type: String,
      enum: ['pending', 'reviewed', 'upheld', 'reversed'],
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Admin user
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewNotes: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ==================== INDEXES ====================

// Unique compound index to prevent duplicate blocks
blockSchema.index({ blockerId: 1, blockedUserId: 1 }, { unique: true });

// Index for finding all blocks by a user
blockSchema.index({ blockerId: 1, createdAt: -1 });

// Index for finding if user is blocked
blockSchema.index({ blockedUserId: 1 });

// Index for expired blocks (for cleanup)
blockSchema.index({ expiresAt: 1 }, { sparse: true });

// Index for admin review
blockSchema.index({ reviewStatus: 1, createdAt: -1 });

// ==================== STATIC METHODS ====================

/**
 * Check if user1 has blocked user2
 */
blockSchema.statics.isBlocked = async function (blockerId, blockedUserId) {
  const block = await this.findOne({
    blockerId,
    blockedUserId,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  });
  return !!block;
};

/**
 * Check if users have blocked each other (mutual block)
 */
blockSchema.statics.isMutualBlock = async function (userId1, userId2) {
  const blocks = await this.find({
    $or: [
      { blockerId: userId1, blockedUserId: userId2 },
      { blockerId: userId2, blockedUserId: userId1 },
    ],
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  });
  return blocks.length === 2;
};

/**
 * Check if either user has blocked the other
 */
blockSchema.statics.isEitherBlocked = async function (userId1, userId2) {
  const block = await this.findOne({
    $or: [
      { blockerId: userId1, blockedUserId: userId2 },
      { blockerId: userId2, blockedUserId: userId1 },
    ],
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  });
  return !!block;
};

/**
 * Create a block with side effects
 */
blockSchema.statics.createBlock = async function ({
  blockerId,
  blockedUserId,
  conversationId = null,
  matchId = null,
  reason = 'not_interested',
  details = null,
  blockedFromScreen = 'chat',
}) {
  // Check if already blocked
  const existingBlock = await this.isBlocked(blockerId, blockedUserId);
  if (existingBlock) {
    throw new Error('User is already blocked');
  }

  // Create the block
  const block = await this.create({
    blockerId,
    blockedUserId,
    conversationId,
    matchId,
    reason,
    details,
    blockedFromScreen,
  });

  // Check if mutual block
  const reverseBlock = await this.findOne({
    blockerId: blockedUserId,
    blockedUserId: blockerId,
  });

  if (reverseBlock) {
    // Update both blocks as mutual
    block.isMutual = true;
    reverseBlock.isMutual = true;
    await block.save();
    await reverseBlock.save();
  }

  // Update conversation status if exists
  if (conversationId) {
    const Conversation = mongoose.model('Conversation');
    const conversation = await Conversation.findById(conversationId);
    if (conversation) {
      await conversation.block(blockerId, reason);
    }
  }

  // Update match status if exists
  if (matchId) {
    const Match = mongoose.model('Match');
    await Match.findByIdAndUpdate(matchId, {
      status: 'blocked',
      blockedBy: blockerId,
      blockedAt: new Date(),
    });
  }

  return block;
};

/**
 * Remove a block
 */
blockSchema.statics.removeBlock = async function (blockerId, blockedUserId) {
  const block = await this.findOne({
    blockerId,
    blockedUserId,
  });

  if (!block) {
    throw new Error('Block not found');
  }

  // Update conversation if exists
  if (block.conversationId) {
    const Conversation = mongoose.model('Conversation');
    const conversation = await Conversation.findById(block.conversationId);
    if (conversation) {
      await conversation.unblock(blockerId);
    }
  }

  // Update match if exists
  if (block.matchId) {
    const Match = mongoose.model('Match');
    await Match.findByIdAndUpdate(block.matchId, {
      status: 'unblocked',
      blockedBy: null,
      blockedAt: null,
    });
  }

  // Remove the block
  await block.deleteOne();

  // Update mutual status if needed
  const reverseBlock = await this.findOne({
    blockerId: blockedUserId,
    blockedUserId: blockerId,
  });

  if (reverseBlock && reverseBlock.isMutual) {
    reverseBlock.isMutual = false;
    await reverseBlock.save();
  }

  return true;
};

/**
 * Get all users blocked by a specific user
 */
blockSchema.statics.getBlockedUsers = async function (blockerId, options = {}) {
  const {
    page = 1,
    limit = 20,
    includeExpired = false,
  } = options;

  const skip = (page - 1) * limit;

  const query = { blockerId };
  
  if (!includeExpired) {
    query.$or = [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ];
  }

  const blocks = await this.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .populate('blockedUserId', 'firstName lastName profilePhoto username')
    .lean();

  const total = await this.countDocuments(query);

  return {
    blocks,
    total,
    page,
    totalPages: Math.ceil(total / limit),
    hasMore: skip + blocks.length < total,
  };
};

/**
 * Get all users who have blocked a specific user
 */
blockSchema.statics.getBlockers = async function (blockedUserId) {
  const blocks = await this.find({
    blockedUserId,
    $or: [
      { expiresAt: null },
      { expiresAt: { $gt: new Date() } },
    ],
  }).select('blockerId');

  return blocks.map(block => block.blockerId);
};

/**
 * Clean up expired blocks (for cron job)
 */
blockSchema.statics.cleanupExpiredBlocks = async function () {
  const expiredBlocks = await this.find({
    expiresAt: { $lte: new Date() },
  });

  for (const block of expiredBlocks) {
    await this.removeBlock(block.blockerId, block.blockedUserId);
  }

  return expiredBlocks.length;
};

// ==================== INSTANCE METHODS ====================

/**
 * Check if block is active
 */
blockSchema.methods.isActive = function () {
  if (!this.expiresAt) return true;
  return this.expiresAt > new Date();
};

/**
 * Extend block duration
 */
blockSchema.methods.extend = async function (days = 30) {
  const newExpiry = new Date();
  newExpiry.setDate(newExpiry.getDate() + days);
  this.expiresAt = newExpiry;
  await this.save();
  return this;
};

/**
 * Convert to permanent block
 */
blockSchema.methods.makePermanent = async function () {
  this.expiresAt = null;
  await this.save();
  return this;
};

/**
 * Add review notes (for admin)
 */
blockSchema.methods.addReview = async function (adminId, status, notes) {
  this.reviewStatus = status;
  this.reviewedBy = adminId;
  this.reviewedAt = new Date();
  this.reviewNotes = notes;
  await this.save();
  return this;
};

module.exports = mongoose.model('Block', blockSchema);