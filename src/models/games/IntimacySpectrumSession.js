// src/models/games/IntimacySpectrumSession.js

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * INTIMACY SPECTRUM SESSION MODEL
 * 
 * Stores game sessions for the "Intimacy Spectrum" slider game.
 * Both players answer 30 questions on a 0-100 scale, revealing
 * nuanced sexual compatibility.
 * 
 * Game Flow:
 * 1. Player 1 invites Player 2 → status: 'pending'
 * 2. Player 2 accepts → status: 'starting' (3s countdown)
 * 3. Game begins → status: 'playing'
 * 4. 30 questions, 20s each, fixed order (easy → spicy)
 * 5. Both answer → reveal positions → next question
 * 6. After Q30 → status: 'completed', calculate results
 * 7. AI insights generated → voice notes available
 */

// =====================================================
// SUB-SCHEMAS
// =====================================================

/**
 * Individual answer schema
 * Stores a player's slider position (0-100) for a question
 */
const answerSchema = new mongoose.Schema(
  {
    questionNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 30
    },
    // Slider position (0-100)
    position: {
      type: Number,
      min: 0,
      max: 100,
      default: null // null means timed out
    },
    // When the answer was submitted
    answeredAt: {
      type: Date,
      default: null
    },
    // Time taken to answer (ms)
    responseTime: {
      type: Number,
      default: null
    }
  },
  { _id: false }
);

/**
 * Player schema - tracks each player's state and answers
 */
const playerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    // Array of answers (0-100 positions)
    answers: [answerSchema],
    // Connection status for real-time
    isConnected: {
      type: Boolean,
      default: false
    },
    // Ready status (for game start)
    isReady: {
      type: Boolean,
      default: false
    },
    // Stats
    totalAnswered: {
      type: Number,
      default: 0
    },
    totalTimedOut: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

/**
 * Category breakdown for results
 */
const categoryBreakdownSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      enum: [
        'desire_drive',
        'initiation_power',
        'turn_ons',
        'communication',
        'fantasy_roleplay',
        'kinks_intensity'
      ]
    },
    totalQuestions: {
      type: Number,
      default: 5
    },
    bothAnswered: {
      type: Number,
      default: 0
    },
    totalGap: {
      type: Number,
      default: 0
    },
    averageGap: {
      type: Number,
      default: 0
    },
    compatibilityPercent: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  { _id: false }
);

/**
 * AI-generated insights schema
 */
const aiInsightsSchema = new mongoose.Schema(
  {
    summary: {
      type: String,
      maxlength: 1000
    },
    hottestAlignments: [{
      type: String,
      maxlength: 200
    }],
    worthDiscussing: [{
      type: String,
      maxlength: 200
    }],
    firstTimePrediction: {
      type: String,
      maxlength: 500
    },
    suggestionToTry: {
      type: String,
      maxlength: 300
    },
    generatedAt: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

/**
 * Voice note schema for post-game discussion
 */
const voiceNoteSchema = new mongoose.Schema(
  {
    oduserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    audioUrl: {
      type: String,
      required: true
    },
    duration: {
      type: Number, // seconds
      required: true,
      max: 60 // 60 second max
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

// =====================================================
// MAIN SESSION SCHEMA
// =====================================================

const intimacySpectrumSessionSchema = new mongoose.Schema(
  {
    // Unique session identifier (UUID)
    sessionId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
      index: true
    },

    // The match this game belongs to
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
      index: true
    },

    // Player 1 (initiator)
    player1: {
      type: playerSchema,
      required: true
    },

    // Player 2 (invited)
    player2: {
      type: playerSchema,
      required: true
    },

    // Game status
    status: {
      type: String,
      enum: [
        'pending',    // Invitation sent, waiting for acceptance
        'declined',   // Invitation was declined
        'expired',    // Invitation expired (5 min timeout)
        'starting',   // Both ready, 3s countdown
        'playing',    // Game in progress
        'paused',     // Game paused (disconnection)
        'abandoned',  // Game abandoned mid-way
        'completed',  // All 30 questions answered
        'discussion'  // Post-game voice note phase
      ],
      default: 'pending',
      index: true
    },

    // ==================== QUESTION MANAGEMENT ====================

    // Fixed order of questions (1-30, easy to spicy)
    questionOrder: [{
      type: Number,
      min: 1,
      max: 30
    }],

    // Current question index (0-29)
    currentQuestionIndex: {
      type: Number,
      default: 0,
      min: 0,
      max: 29
    },

    // Timestamp when current question started
    currentQuestionStartedAt: {
      type: Date,
      default: null
    },

    // Timestamp when current question expires (startedAt + 20s)
    currentQuestionExpiresAt: {
      type: Date,
      default: null
    },

    // ==================== RESULTS ====================
    results: {
      totalQuestions: {
        type: Number,
        default: 30
      },
      bothAnswered: {
        type: Number,
        default: 0
      },
      player1TimedOut: {
        type: Number,
        default: 0
      },
      player2TimedOut: {
        type: Number,
        default: 0
      },
      bothTimedOut: {
        type: Number,
        default: 0
      },
      // Overall compatibility score (0-100)
      compatibilityScore: {
        type: Number,
        default: null,
        min: 0,
        max: 100
      },
      // Average gap across all questions
      averageGap: {
        type: Number,
        default: null
      },
      // Breakdown by category
      categoryBreakdown: [categoryBreakdownSchema]
    },

    // AI-generated insights
    aiInsights: aiInsightsSchema,

    // ==================== VOICE NOTES ====================
    voiceNotes: {
      type: [voiceNoteSchema],
      validate: [
        {
          validator: function (v) {
            return v.length <= 10; // Max 10 voice notes total
          },
          message: 'Maximum 10 voice notes allowed per session'
        }
      ]
    },

    // ==================== TIMESTAMPS ====================
    invitedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 5 * 60 * 1000) // 5 min expiry
    },
    acceptedAt: {
      type: Date,
      default: null
    },
    declinedAt: {
      type: Date,
      default: null
    },
    startedAt: {
      type: Date,
      default: null
    },
    completedAt: {
      type: Date,
      default: null
    },
    lastActivityAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// =====================================================
// INDEXES
// =====================================================

// Find sessions by player
intimacySpectrumSessionSchema.index({ 'player1.userId': 1, status: 1 });
intimacySpectrumSessionSchema.index({ 'player2.userId': 1, status: 1 });

// Find active sessions
intimacySpectrumSessionSchema.index({ status: 1, lastActivityAt: -1 });

// Find by match
intimacySpectrumSessionSchema.index({ matchId: 1, status: 1 });

// Cleanup expired invitations
intimacySpectrumSessionSchema.index({ status: 1, expiresAt: 1 });

// =====================================================
// VIRTUALS
// =====================================================

/**
 * Get current question number (1-30)
 */
intimacySpectrumSessionSchema.virtual('currentQuestionNumber').get(function () {
  if (this.questionOrder && this.questionOrder.length > 0) {
    return this.questionOrder[this.currentQuestionIndex];
  }
  return this.currentQuestionIndex + 1;
});

/**
 * Get game progress percentage
 */
intimacySpectrumSessionSchema.virtual('progressPercent').get(function () {
  return Math.round((this.currentQuestionIndex / 30) * 100);
});

/**
 * Check if game is active
 */
intimacySpectrumSessionSchema.virtual('isActive').get(function () {
  return ['pending', 'starting', 'playing', 'paused'].includes(this.status);
});

// =====================================================
// INSTANCE METHODS
// =====================================================

/**
 * Accept the game invitation
 */
intimacySpectrumSessionSchema.methods.accept = async function () {
  if (this.status !== 'pending') {
    throw new Error(`Cannot accept game in ${this.status} status`);
  }

  if (new Date() > this.expiresAt) {
    this.status = 'expired';
    await this.save();
    throw new Error('Game invitation has expired');
  }

  this.status = 'starting';
  this.acceptedAt = new Date();
  this.player2.isReady = true;
  this.lastActivityAt = new Date();

  return this.save();
};

/**
 * Decline the game invitation
 */
intimacySpectrumSessionSchema.methods.decline = async function () {
  if (this.status !== 'pending') {
    throw new Error(`Cannot decline game in ${this.status} status`);
  }

  this.status = 'declined';
  this.declinedAt = new Date();
  this.lastActivityAt = new Date();

  return this.save();
};

/**
 * Start the game (after countdown)
 */
intimacySpectrumSessionSchema.methods.startGame = async function () {
  if (this.status !== 'starting') {
    throw new Error(`Cannot start game in ${this.status} status`);
  }

  this.status = 'playing';
  this.startedAt = new Date();
  this.currentQuestionIndex = 0;
  this.lastActivityAt = new Date();

  // Set timer for first question (20 seconds)
  this.currentQuestionStartedAt = new Date();
  this.currentQuestionExpiresAt = new Date(Date.now() + 20 * 1000);

  return this.save();
};

/**
 * Record a player's slider answer
 * @param {ObjectId} userId - The player's user ID
 * @param {Number} questionIndex - The question index (0-29)
 * @param {Number} position - Slider position (0-100)
 */
intimacySpectrumSessionSchema.methods.recordAnswer = async function (
  userId,
  questionIndex,
  position
) {
  if (this.status !== 'playing') {
    throw new Error('Game is not in playing state');
  }

  if (questionIndex !== this.currentQuestionIndex) {
    throw new Error('Answer is for wrong question');
  }

  // Validate position
  if (position < 0 || position > 100) {
    throw new Error('Position must be between 0 and 100');
  }

  // Determine which player (handle both populated and non-populated cases)
  const p1Id = this.player1.userId._id 
    ? this.player1.userId._id.toString() 
    : this.player1.userId.toString();
  const p2Id = this.player2.userId._id 
    ? this.player2.userId._id.toString() 
    : this.player2.userId.toString();
  const userIdStr = userId.toString();

  const isPlayer1 = p1Id === userIdStr;
  const isPlayer2 = p2Id === userIdStr;

  if (!isPlayer1 && !isPlayer2) {
    throw new Error('User is not a player in this game');
  }

  const player = isPlayer1 ? this.player1 : this.player2;
  const questionNumber = this.questionOrder[questionIndex];

  // Check if already answered this question
  const existingAnswer = player.answers.find(
    a => a.questionNumber === questionNumber
  );
  if (existingAnswer && existingAnswer.position !== null) {
    throw new Error('Already answered this question');
  }

  // Calculate response time
  const responseTime = this.currentQuestionStartedAt
    ? Date.now() - this.currentQuestionStartedAt.getTime()
    : null;

  // Record the answer
  if (existingAnswer) {
    existingAnswer.position = position;
    existingAnswer.answeredAt = new Date();
    existingAnswer.responseTime = responseTime;
  } else {
    player.answers.push({
      questionNumber,
      position,
      answeredAt: new Date(),
      responseTime
    });
  }

  player.totalAnswered++;
  this.lastActivityAt = new Date();

  await this.save();

  // Check if both players have answered
  const otherPlayer = isPlayer1 ? this.player2 : this.player1;
  const otherAnswer = otherPlayer.answers.find(
    a => a.questionNumber === questionNumber
  );

  return {
    bothAnswered: otherAnswer && otherAnswer.position !== null,
    playerPosition: position
  };
};

/**
 * Record a timeout for current question
 * @param {ObjectId} userId - The player who timed out (or null for both)
 */
intimacySpectrumSessionSchema.methods.recordTimeout = async function (userId = null) {
  if (this.status !== 'playing') {
    return;
  }

  const questionNumber = this.questionOrder[this.currentQuestionIndex];

  if (userId === null) {
    // Both timed out
    [this.player1, this.player2].forEach(player => {
      const existing = player.answers.find(
        a => a.questionNumber === questionNumber
      );
      if (!existing) {
        player.answers.push({
          questionNumber,
          position: null,
          answeredAt: null,
          responseTime: null
        });
        player.totalTimedOut++;
      } else if (existing.position === null) {
        player.totalTimedOut++;
      }
    });
  } else {
    // Single player timed out
    const userIdStr = userId.toString();
    const p1Id = this.player1.userId._id 
      ? this.player1.userId._id.toString() 
      : this.player1.userId.toString();
    
    const player = p1Id === userIdStr ? this.player1 : this.player2;
    
    const existing = player.answers.find(
      a => a.questionNumber === questionNumber
    );
    if (!existing) {
      player.answers.push({
        questionNumber,
        position: null,
        answeredAt: null,
        responseTime: null
      });
      player.totalTimedOut++;
    } else if (existing.position === null) {
      player.totalTimedOut++;
    }
  }

  this.lastActivityAt = new Date();
  await this.save();
};

/**
 * Move to the next question
 */
intimacySpectrumSessionSchema.methods.nextQuestion = async function () {
  if (this.status !== 'playing') {
    throw new Error('Game is not in playing state');
  }

  // Check if game is complete BEFORE incrementing
  if (this.currentQuestionIndex >= 29) {
    return this.completeGame();
  }

  this.currentQuestionIndex++;

  // Set timer for next question (20 seconds)
  this.currentQuestionStartedAt = new Date();
  this.currentQuestionExpiresAt = new Date(Date.now() + 20 * 1000);
  this.lastActivityAt = new Date();

  await this.save();

  return {
    questionIndex: this.currentQuestionIndex,
    questionNumber: this.questionOrder[this.currentQuestionIndex],
    isComplete: false
  };
};

/**
 * Complete the game and calculate results
 */
intimacySpectrumSessionSchema.methods.completeGame = async function () {
  this.status = 'completed';
  this.completedAt = new Date();
  this.lastActivityAt = new Date();

  // Calculate results
  await this.calculateResults();

  return this.save();
};

/**
 * Calculate final results and category breakdown
 */
intimacySpectrumSessionSchema.methods.calculateResults = async function () {
  const IntimacySpectrumQuestion = mongoose.model('IntimacySpectrumQuestion');

  // Get all questions for category mapping
  const questions = await IntimacySpectrumQuestion.find({
    questionNumber: { $in: this.questionOrder }
  }).lean();

  const questionMap = {};
  questions.forEach(q => {
    questionMap[q.questionNumber] = q;
  });

  // Initialize category stats
  const categoryStats = {};
  const categories = [
    'desire_drive',
    'initiation_power',
    'turn_ons',
    'communication',
    'fantasy_roleplay',
    'kinks_intensity'
  ];

  categories.forEach(cat => {
    categoryStats[cat] = {
      category: cat,
      totalQuestions: 0,
      bothAnswered: 0,
      totalGap: 0,
      averageGap: 0,
      compatibilityPercent: 0
    };
  });

  // Analyze each question
  let totalBothAnswered = 0;
  let totalGap = 0;
  let player1TimedOut = 0;
  let player2TimedOut = 0;
  let bothTimedOut = 0;

  for (const questionNumber of this.questionOrder) {
    const question = questionMap[questionNumber];
    if (!question) continue;

    const category = question.category;
    categoryStats[category].totalQuestions++;

    const p1Answer = this.player1.answers.find(
      a => a.questionNumber === questionNumber
    );
    const p2Answer = this.player2.answers.find(
      a => a.questionNumber === questionNumber
    );

    const p1Answered = p1Answer && p1Answer.position !== null;
    const p2Answered = p2Answer && p2Answer.position !== null;

    if (p1Answered && p2Answered) {
      totalBothAnswered++;
      categoryStats[category].bothAnswered++;

      // Calculate gap
      const gap = Math.abs(p1Answer.position - p2Answer.position);
      totalGap += gap;
      categoryStats[category].totalGap += gap;
    } else if (!p1Answered && !p2Answered) {
      bothTimedOut++;
    } else if (!p1Answered) {
      player1TimedOut++;
    } else {
      player2TimedOut++;
    }
  }

  // Calculate category compatibility percentages
  categories.forEach(cat => {
    const stats = categoryStats[cat];
    if (stats.bothAnswered > 0) {
      stats.averageGap = Math.round(stats.totalGap / stats.bothAnswered);
      // Compatibility = 100 - averageGap
      stats.compatibilityPercent = Math.max(0, 100 - stats.averageGap);
    }
  });

  // Calculate overall compatibility with weighted scoring
  // Spicier categories (fantasy, kinks) weighted more heavily
  const weights = {
    desire_drive: 0.10,
    initiation_power: 0.15,
    turn_ons: 0.15,
    communication: 0.15,
    fantasy_roleplay: 0.20,
    kinks_intensity: 0.25
  };

  let weightedScore = 0;
  let totalWeight = 0;

  categories.forEach(cat => {
    const stats = categoryStats[cat];
    if (stats.bothAnswered > 0) {
      weightedScore += stats.compatibilityPercent * weights[cat];
      totalWeight += weights[cat];
    }
  });

  const compatibilityScore = totalWeight > 0
    ? Math.round(weightedScore / totalWeight)
    : 0;

  const averageGap = totalBothAnswered > 0
    ? Math.round(totalGap / totalBothAnswered)
    : 0;

  // Save results
  this.results = {
    totalQuestions: 30,
    bothAnswered: totalBothAnswered,
    player1TimedOut,
    player2TimedOut,
    bothTimedOut,
    compatibilityScore,
    averageGap,
    categoryBreakdown: categories.map(cat => categoryStats[cat])
  };
};

/**
 * Add a voice note
 * @param {ObjectId} userId - User sending the voice note
 * @param {String} audioUrl - S3 URL of the audio
 * @param {Number} duration - Duration in seconds
 */
intimacySpectrumSessionSchema.methods.addVoiceNote = async function (
  userId,
  audioUrl,
  duration
) {
  if (!['completed', 'discussion'].includes(this.status)) {
    throw new Error('Voice notes only available after game completion');
  }

  if (this.voiceNotes.length >= 10) {
    throw new Error('Maximum voice notes reached');
  }

  if (duration > 60) {
    throw new Error('Voice note too long (max 60 seconds)');
  }

  this.voiceNotes.push({
    oduserId: userId,
    audioUrl,
    duration
  });

  if (this.status === 'completed') {
    this.status = 'discussion';
  }

  this.lastActivityAt = new Date();
  return this.save();
};

/**
 * Set AI-generated insights
 * @param {Object} insights - The generated insights
 */
intimacySpectrumSessionSchema.methods.setAiInsights = async function (insights) {
  this.aiInsights = {
    ...insights,
    generatedAt: new Date()
  };
  return this.save();
};

/**
 * Get alignment label based on gap
 * @param {Number} gap - The gap between positions
 * @returns {Object} Label and emoji
 */
intimacySpectrumSessionSchema.methods.getAlignmentLabel = function (gap) {
  if (gap <= 10) return { label: 'Perfect match', emoji: '🔥' };
  if (gap <= 20) return { label: 'Hot compatibility', emoji: '💋' };
  if (gap <= 35) return { label: 'Good chemistry', emoji: '✨' };
  if (gap <= 50) return { label: 'Worth a conversation', emoji: '💬' };
  if (gap <= 70) return { label: 'Different wavelengths', emoji: '🤔' };
  return { label: 'Opposite desires', emoji: '↔️' };
};

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Find active session for a user
 */
intimacySpectrumSessionSchema.statics.findActiveForUser = function (userId) {
  const userIdStr = userId.toString();
  return this.findOne({
    $or: [
      { 'player1.userId': userId },
      { 'player2.userId': userId }
    ],
    status: { $in: ['pending', 'starting', 'playing', 'paused'] }
  })
    .populate('player1.userId', 'firstName lastName profilePhoto')
    .populate('player2.userId', 'firstName lastName profilePhoto');
};

/**
 * Find session by sessionId
 */
intimacySpectrumSessionSchema.statics.findBySessionId = function (sessionId) {
  return this.findOne({ sessionId })
    .populate('player1.userId', 'firstName lastName profilePhoto')
    .populate('player2.userId', 'firstName lastName profilePhoto');
};

/**
 * Find pending invitation for a user (as player2)
 */
intimacySpectrumSessionSchema.statics.findPendingInvitation = function (userId) {
  return this.findOne({
    'player2.userId': userId,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  })
    .populate('player1.userId', 'firstName lastName profilePhoto')
    .populate('player2.userId', 'firstName lastName profilePhoto');
};

/**
 * Find completed sessions for a user
 */
intimacySpectrumSessionSchema.statics.findCompletedForUser = function (
  userId,
  limit = 10
) {
  return this.find({
    $or: [
      { 'player1.userId': userId },
      { 'player2.userId': userId }
    ],
    status: { $in: ['completed', 'discussion'] }
  })
    .sort({ completedAt: -1 })
    .limit(limit)
    .populate('player1.userId', 'firstName lastName profilePhoto')
    .populate('player2.userId', 'firstName lastName profilePhoto');
};

/**
 * Find sessions between two users
 */
intimacySpectrumSessionSchema.statics.findBetweenUsers = function (
  userId1,
  userId2
) {
  return this.find({
    $or: [
      { 'player1.userId': userId1, 'player2.userId': userId2 },
      { 'player1.userId': userId2, 'player2.userId': userId1 }
    ]
  })
    .sort({ createdAt: -1 })
    .populate('player1.userId', 'firstName lastName profilePhoto')
    .populate('player2.userId', 'firstName lastName profilePhoto');
};

/**
 * Clean up expired invitations
 */
intimacySpectrumSessionSchema.statics.cleanupExpired = function () {
  return this.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );
};

const IntimacySpectrumSession = mongoose.model(
  'IntimacySpectrumSession',
  intimacySpectrumSessionSchema
);

module.exports = IntimacySpectrumSession;