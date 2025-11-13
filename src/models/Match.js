const mongoose = require('mongoose');

/**
 * Match Model
 * Stores compatibility matches between users with reveal tiers
 */
const matchSchema = new mongoose.Schema(
  {
    // Primary user (the one viewing matches)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Matched user
    matchedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ==================== COMPATIBILITY SCORES ====================
    
    // Overall compatibility (0-100)
    compatibilityScore: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },

    // Dimension-wise compatibility scores
    dimensionScores: {
      emotional_intimacy: { type: Number, min: 0, max: 100 },
      life_vision: { type: Number, min: 0, max: 100 },
      conflict_communication: { type: Number, min: 0, max: 100 },
      love_languages: { type: Number, min: 0, max: 100 },
      physical_sexual: { type: Number, min: 0, max: 100 },
      lifestyle: { type: Number, min: 0, max: 100 },
    },

    // How many dimensions were used in calculation
    dimensionsAnalyzed: {
      type: Number,
      required: true,
      min: 1,
      max: 6,
    },

    // Total possible dimensions (always 6)
    totalDimensions: {
      type: Number,
      default: 6,
    },

    // True if either user hasn't answered all questions
    isPartialAnalysis: {
      type: Boolean,
      default: false,
    },

    // ==================== RANKING & REVEAL TIER ====================
    
    // Rank among all matches (1 = best)
    rank: {
      type: Number,
      required: true,
      min: 1,
    },

    // Which reveal tier this match belongs to
    revealTier: {
      type: String,
      enum: ['fully_revealed', 'partially_revealed', 'premium_locked'],
      required: true,
    },

    // Is this the teaser match from premium tier?
    isTeaser: {
      type: Boolean,
      default: false,
    },

    // ==================== MATCH QUALITY INDICATORS ====================
    
    // Is this a high quality match? (score >= 75)
    isHighQualityMatch: {
      type: Boolean,
      default: false,
    },

    // Is this a mutual match? (both liked each other)
    isMutualMatch: {
      type: Boolean,
      default: false,
      index: true,
    },

    // ==================== FILTERS & CHECKS ====================
    
    // Were there any dealbreaker conflicts?
    hasDealbreakers: {
      type: Boolean,
      default: false,
    },

    // Geographic distance between users (in km)
    distanceKm: {
      type: Number,
      required: true,
    },

    // When dealbreakers were last checked
    dealbreakersCheckedAt: {
      type: Date,
      default: Date.now,
    },

    // When distance was calculated
    distanceCheckedAt: {
      type: Date,
      default: Date.now,
    },

    // ==================== MATCH STATUS ====================
    
    // Current status of the match
    status: {
      type: String,
      enum: [
        'pending',      // Match generated, not revealed to user yet
        'revealed',     // User unlocked/viewed this match
        'liked',        // User liked this match
        'passed',       // User passed on this match
        'mutual_like',  // Both users liked each other (unlock messaging)
        'expired',      // Match expired (e.g., 30 days old, not interacted)
      ],
      default: 'pending',
      required: true,
      index: true,
    },
      // ==================== MESSAGING FIELDS ====================
  
  // Initial message sent with like
  initialMessage: {
    text: {
      type: String,
      maxLength: 500
    },
    voiceUrl: {
      type: String  // S3 URL if voice message
    },
    voiceTranscription: {
      type: String  // Transcribed text from voice
    },
    sentAt: {
      type: Date
    }
  },
  
  // AI-suggested conversation starters (cached)
  conversationStarters: [{
    suggestion: {
      type: String,
      maxLength: 300
    },
    basedOn: {
      type: String  // Which commonality/answer this is based on
    },
    category: {
      type: String,
      enum: ['shared_interest', 'question_based', 'personality_match', 'icebreaker', 'deep_question']
    },
    generatedAt: {
      type: Date,
      default: Date.now
    }
  }],

    // ==================== INTERACTION TRACKING ====================
    
    // When user revealed/unlocked this match
    revealedAt: {
      type: Date,
    },

    // When user liked or passed on this match
    interactedAt: {
      type: Date,
    },

    // Coins spent to reveal this match (future feature)
    coinsSpent: {
      type: Number,
      default: 0,
    },

    // ==================== ALGORITHM METADATA ====================
    
    // Which version of matching algorithm was used
    matchingAlgorithmVersion: {
      type: String,
      default: '1.0',
    },

    // When this match was initially calculated
    generatedAt: {
      type: Date,
      default: Date.now,
      required: true,
    },

    // Last time compatibility score was recalculated
    scoreRecalculatedAt: {
      type: Date,
    },

    // ==================== MUTUAL MATCH TRACKING ====================
    
    // When both users liked each other
    mutualMatchedAt: {
      type: Date,
    },

    // When messaging was unlocked between users
    messagingUnlockedAt: {
      type: Date,
    },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
  }
);



// ==================== INDEXES ====================

// Compound index for querying user's matches by status
matchSchema.index({ userId: 1, status: 1 });

// Compound index for querying user's matches by rank
matchSchema.index({ userId: 1, rank: 1 });

// Compound index for querying user's matches by compatibility score
matchSchema.index({ userId: 1, compatibilityScore: -1 });

// Unique compound index to prevent duplicate matches
matchSchema.index({ userId: 1, matchedUserId: 1 }, { unique: true });

// Index for finding mutual matches
matchSchema.index({ isMutualMatch: 1 });

// Index for cleanup job (finding expired matches)
matchSchema.index({ status: 1, generatedAt: 1 });

// ==================== INSTANCE METHODS ====================

/**
 * Mark match as revealed
 */
matchSchema.methods.reveal = function () {
  this.status = 'revealed';
  this.revealedAt = new Date();
  return this.save();
};

/**
 * Mark match as liked
 */
matchSchema.methods.like = function () {
  this.status = 'liked';
  this.interactedAt = new Date();
  return this.save();
};

/**
 * Mark match as passed
 */
matchSchema.methods.pass = function () {
  this.status = 'passed';
  this.interactedAt = new Date();
  return this.save();
};

/**
 * Mark match as mutual like
 */
matchSchema.methods.markMutual = function () {
  this.isMutualMatch = true;
  this.status = 'mutual_like';
  this.mutualMatchedAt = new Date();
  return this.save();
};

/**
 * Unlock messaging for mutual match
 */
matchSchema.methods.unlockMessaging = function () {
  this.messagingUnlockedAt = new Date();
  return this.save();
};

/**
 * Check if match is expired (30 days old, not interacted)
 */
matchSchema.methods.isExpired = function () {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  return (
    this.status === 'pending' &&
    this.generatedAt < thirtyDaysAgo
  );
};

// ==================== STATIC METHODS ====================

/**
 * Find matches for a user by status
 */
matchSchema.statics.findByUserAndStatus = function (userId, status) {
  return this.find({ userId, status })
    .populate('matchedUserId', 'firstName lastName username profilePhoto bio location')
    .sort({ rank: 1 }); // Sort by rank (best first)
};

/**
 * Find mutual matches for a user
 */
matchSchema.statics.findMutualMatches = function (userId) {
  return this.find({ userId, isMutualMatch: true })
    .populate('matchedUserId', 'firstName lastName username profilePhoto bio location')
    .sort({ mutualMatchedAt: -1 }); // Most recent first
};

/**
 * Check if two users have already matched
 */
matchSchema.statics.existsBetweenUsers = async function (userId1, userId2) {
  const match = await this.findOne({
    $or: [
      { userId: userId1, matchedUserId: userId2 },
      { userId: userId2, matchedUserId: userId1 },
    ],
  });
  
  return !!match;
};

/**
 * Get match statistics for a user
 */
matchSchema.statics.getStats = async function (userId) {
  const stats = await this.aggregate([
    { $match: { userId: new mongoose.Types.ObjectId(userId) } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        avgScore: { $avg: '$compatibilityScore' },
      },
    },
  ]);

  // Transform to object format
  const result = {
    total: 0,
    pending: 0,
    revealed: 0,
    liked: 0,
    passed: 0,
    mutual: 0,
    avgCompatibility: 0,
  };

  stats.forEach((stat) => {
    result.total += stat.count;
    result[stat._id] = stat.count;
    
    if (stat._id === 'mutual_like') {
      result.mutual = stat.count;
    }
    
    if (stat.avgScore) {
      result.avgCompatibility = Math.round(stat.avgScore);
    }
  });

  return result;
};

/**
 * Find incoming likes for a user (who liked me)
 */
matchSchema.statics.findReceivedLikes = function (userId) {
  return this.find({
    matchedUserId: userId,
    status: { $in: ['liked', 'mutual_like'] } // you can start with just ['liked'] if you want
  })
    .populate('userId', 'firstName lastName username profilePhoto bio location dateOfBirth')
    .sort({ interactedAt: -1 }); // most recent likes first
};


// ==================== VIRTUALS ====================

// Virtual for formatted compatibility message
matchSchema.virtual('compatibilityMessage').get(function () {
  const score = this.compatibilityScore;
  
  if (score >= 80) return 'Excellent compatibility - strong potential match';
  if (score >= 65) return 'Good compatibility - worth exploring';
  if (score >= 50) return 'Moderate compatibility - some alignment';
  if (score >= 35) return 'Low compatibility - significant differences';
  return 'Minimal compatibility - fundamental differences';
});

// Virtual for partial analysis message
matchSchema.virtual('analysisMessage').get(function () {
  if (!this.isPartialAnalysis) {
    return `Based on all ${this.totalDimensions} dimensions`;
  }
  
  return `Based on ${this.dimensionsAnalyzed}/${this.totalDimensions} dimensions - Answer more questions for better accuracy`;
});

// Ensure virtuals are included in JSON
matchSchema.set('toJSON', { virtuals: true });
matchSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Match', matchSchema);