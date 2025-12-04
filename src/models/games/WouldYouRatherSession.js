// src/models/games/WouldYouRatherSession.js

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * WOULD YOU RATHER SESSION MODEL
 * 
 * Tracks a complete game session between two matched players.
 * 
 * Game Flow:
 * 1. Player 1 invites Player 2 (status: pending)
 * 2. Player 2 accepts (status: starting → playing)
 * 3. Both answer 50 questions with 15s timer each
 * 4. Game completes (status: completed)
 * 5. AI generates insights
 * 6. Players can exchange voice notes (status: discussion)
 * 
 * Key Features:
 * - Real-time synchronization via Socket.io
 * - 15-second timer per question (server-authoritative)
 * - Randomized question order per session
 * - Category-wise compatibility breakdown
 * - AI-powered relationship insights
 */

// =====================================================
// SUB-SCHEMAS
// =====================================================

/**
 * Individual answer schema
 * Tracks each player's answer per question
 */
const answerSchema = new mongoose.Schema(
  {
    questionNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 50
    },
    answer: {
      type: String,
      enum: ['A', 'B', null], // null = timed out / didn't answer
      default: null
    },
    answeredAt: {
      type: Date,
      default: null
    },
    responseTimeMs: {
      type: Number, // How fast they answered (in milliseconds)
      default: null
    }
  },
  { _id: false }
);

/**
 * Player schema
 * Tracks each player's participation and answers
 */
const playerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    answers: [answerSchema],
    // Stats
    totalAnswered: {
      type: Number,
      default: 0
    },
    totalTimedOut: {
      type: Number,
      default: 0
    },
    averageResponseTimeMs: {
      type: Number,
      default: null
    },
    // Connection status
    isConnected: {
      type: Boolean,
      default: false
    },
    lastSeenAt: {
      type: Date,
      default: null
    },
    // Ready status (for game start)
    isReady: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

/**
 * Category breakdown schema
 * Tracks compatibility per question category
 */
const categoryBreakdownSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true
    },
    totalQuestions: {
      type: Number,
      required: true
    },
    matchedAnswers: {
      type: Number,
      default: 0
    },
    differentAnswers: {
      type: Number,
      default: 0
    },
    bothTimedOut: {
      type: Number,
      default: 0
    },
    compatibilityPercent: {
      type: Number,
      default: 0
    }
  },
  { _id: false }
);

/**
 * Voice note schema
 * For post-game discussions
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
      type: Number, // Duration in seconds
      required: true,
      max: 60 // Max 60 seconds per voice note
    },
    sentAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

/**
 * AI Insights schema
 * Generated after game completion
 */
const aiInsightsSchema = new mongoose.Schema(
  {
    summary: {
      type: String, // 2-3 sentence overview
      maxlength: 500
    },
    compatibilityHighlights: [{
      type: String,
      maxlength: 200
    }],
    interestingDifferences: [{
      type: String,
      maxlength: 200
    }],
    relationshipTip: {
      type: String,
      maxlength: 300
    },
    strongestCategory: {
      type: String
    },
    weakestCategory: {
      type: String
    },
    generatedAt: {
      type: Date,
      default: null
    }
  },
  { _id: false }
);

// =====================================================
// MAIN SESSION SCHEMA
// =====================================================

const wouldYouRatherSessionSchema = new mongoose.Schema(
  {
    // Unique session identifier
    sessionId: {
      type: String,
      default: () => uuidv4(),
      unique: true,
      index: true
    },

    // Reference to the match between players
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
      index: true
    },

    // The two players
    player1: {
      type: playerSchema,
      required: true
    },
    player2: {
      type: playerSchema,
      required: true
    },

    // Who initiated the game
    initiatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },

    // ==================== GAME STATE ====================
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
        'completed',  // All 50 questions answered
        'discussion'  // Post-game voice note phase
      ],
      default: 'pending',
      index: true
    },

    // ==================== QUESTION MANAGEMENT ====================
    
    // Randomized order of questions for this session
    questionOrder: [{
      type: Number,
      min: 1,
      max: 50
    }],

    // Current question index (0-49)
    currentQuestionIndex: {
      type: Number,
      default: 0,
      min: 0,
      max: 49
    },

    // Timestamp when current question started
    currentQuestionStartedAt: {
      type: Date,
      default: null
    },

    // Timestamp when current question expires (startedAt + 15s)
    currentQuestionExpiresAt: {
      type: Date,
      default: null
    },

    // ==================== RESULTS ====================
    results: {
      totalQuestions: {
        type: Number,
        default: 50
      },
      bothAnswered: {
        type: Number,
        default: 0
      },
      matchedAnswers: {
        type: Number,
        default: 0
      },
      differentAnswers: {
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
      compatibilityScore: {
        type: Number, // 0-100 percentage
        default: null,
        min: 0,
        max: 100
      },
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
      default: function () {
        // Invitation expires in 5 minutes
        return new Date(Date.now() + 5 * 60 * 1000);
      }
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
    timestamps: true // Adds createdAt, updatedAt
  }
);

// =====================================================
// INDEXES
// =====================================================

// Find sessions by match
wouldYouRatherSessionSchema.index({ matchId: 1, status: 1 });

// Find sessions by player
wouldYouRatherSessionSchema.index({ 'player1.userId': 1, status: 1 });
wouldYouRatherSessionSchema.index({ 'player2.userId': 1, status: 1 });

// Find pending invitations that are expiring
wouldYouRatherSessionSchema.index({ status: 1, expiresAt: 1 });

// Find active games
wouldYouRatherSessionSchema.index({ status: 1, lastActivityAt: 1 });

// =====================================================
// VIRTUAL PROPERTIES
// =====================================================

/**
 * Get current question number (1-50) based on randomized order
 */
wouldYouRatherSessionSchema.virtual('currentQuestionNumber').get(function () {
  if (!this.questionOrder || this.questionOrder.length === 0) {
    return null;
  }
  return this.questionOrder[this.currentQuestionIndex];
});

/**
 * Check if game is in an active state
 */
wouldYouRatherSessionSchema.virtual('isActive').get(function () {
  return ['starting', 'playing'].includes(this.status);
});

/**
 * Check if game can receive answers
 */
wouldYouRatherSessionSchema.virtual('canAnswer').get(function () {
  return this.status === 'playing' && this.currentQuestionIndex < 50;
});

/**
 * Get progress percentage
 */
wouldYouRatherSessionSchema.virtual('progressPercent').get(function () {
  return Math.round((this.currentQuestionIndex / 50) * 100);
});

// =====================================================
// INSTANCE METHODS
// =====================================================

/**
 * Accept the game invitation
 */
wouldYouRatherSessionSchema.methods.accept = async function () {
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
wouldYouRatherSessionSchema.methods.decline = async function () {
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
wouldYouRatherSessionSchema.methods.startGame = async function () {
  if (this.status !== 'starting') {
    throw new Error(`Cannot start game in ${this.status} status`);
  }

  this.status = 'playing';
  this.startedAt = new Date();
  this.currentQuestionIndex = 0;
  this.lastActivityAt = new Date();

  // Set timer for first question
  this.currentQuestionStartedAt = new Date();
  this.currentQuestionExpiresAt = new Date(Date.now() + 15 * 1000);

  return this.save();
};

/**
 * Record a player's answer
 * @param {ObjectId} userId - The player's user ID
 * @param {Number} questionIndex - The question index (0-49)
 * @param {String} answer - 'A' or 'B'
 */
wouldYouRatherSessionSchema.methods.recordAnswer = async function (
  userId,
  questionIndex,
  answer
) {
  if (this.status !== 'playing') {
    throw new Error('Game is not in playing state');
  }

  if (questionIndex !== this.currentQuestionIndex) {
    throw new Error('Answer is for wrong question');
  }

  // Determine which player
// Determine which player (handle both populated and non-populated cases)
const p1Id = this.player1.userId._id ? this.player1.userId._id.toString() : this.player1.userId.toString();
const p2Id = this.player2.userId._id ? this.player2.userId._id.toString() : this.player2.userId.toString();
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

  if (existingAnswer && existingAnswer.answer !== null) {
    throw new Error('Already answered this question');
  }

  // Calculate response time
  const responseTimeMs = this.currentQuestionStartedAt
    ? Date.now() - this.currentQuestionStartedAt.getTime()
    : null;

  // Record the answer
  if (existingAnswer) {
    existingAnswer.answer = answer;
    existingAnswer.answeredAt = new Date();
    existingAnswer.responseTimeMs = responseTimeMs;
  } else {
    player.answers.push({
      questionNumber,
      answer,
      answeredAt: new Date(),
      responseTimeMs
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
    bothAnswered: otherAnswer && otherAnswer.answer !== null,
    yourAnswer: answer,
    partnerAnswer: otherAnswer?.answer || null
  };
};

/**
 * Handle question timeout - move to next question
 * @param {Number} questionIndex - The question that timed out
 */
wouldYouRatherSessionSchema.methods.handleTimeout = async function (questionIndex) {
  if (this.status !== 'playing') {
    return null;
  }

  if (questionIndex !== this.currentQuestionIndex) {
    return null; // Already moved past this question
  }

  const questionNumber = this.questionOrder[questionIndex];

  // Mark unanswered players as timed out
  const p1Answer = this.player1.answers.find(
    a => a.questionNumber === questionNumber
  );
  const p2Answer = this.player2.answers.find(
    a => a.questionNumber === questionNumber
  );

  if (!p1Answer || p1Answer.answer === null) {
    if (!p1Answer) {
      this.player1.answers.push({
        questionNumber,
        answer: null,
        answeredAt: null,
        responseTimeMs: null
      });
    }
    this.player1.totalTimedOut++;
  }

  if (!p2Answer || p2Answer.answer === null) {
    if (!p2Answer) {
      this.player2.answers.push({
        questionNumber,
        answer: null,
        answeredAt: null,
        responseTimeMs: null
      });
    }
    this.player2.totalTimedOut++;
  }

  this.lastActivityAt = new Date();

  // Return both answers for reveal
  return {
    player1Answer: p1Answer?.answer || null,
    player2Answer: p2Answer?.answer || null
  };
};

/**
 * Move to the next question
 */
wouldYouRatherSessionSchema.methods.nextQuestion = async function () {
    if (this.status !== 'playing') {
      throw new Error('Game is not in playing state');
    }
  
    // Check if game is complete BEFORE incrementing
    if (this.currentQuestionIndex >= 49) {
      return this.completeGame();
    }
  
    this.currentQuestionIndex++;

  // Check if game is complete
  if (this.currentQuestionIndex >= 50) {
    return this.completeGame();
  }

  // Set timer for next question
  this.currentQuestionStartedAt = new Date();
  this.currentQuestionExpiresAt = new Date(Date.now() + 15 * 1000);
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
wouldYouRatherSessionSchema.methods.completeGame = async function () {
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
wouldYouRatherSessionSchema.methods.calculateResults = async function () {
  const WouldYouRatherQuestion = mongoose.model('WouldYouRatherQuestion');

  // Get all questions for category mapping
  const questions = await WouldYouRatherQuestion.find({
    questionNumber: { $in: this.questionOrder }
  }).lean();

  const questionMap = {};
  questions.forEach(q => {
    questionMap[q.questionNumber] = q;
  });

  // Initialize category stats
  const categoryStats = {};
  const categories = [
    'lifestyle', 'money', 'family', 'love', 'intimacy',
    'conflict', 'travel', 'philosophy', 'friendship', 'hobbies', 'future'
  ];

  categories.forEach(cat => {
    categoryStats[cat] = {
      category: cat,
      totalQuestions: 0,
      matchedAnswers: 0,
      differentAnswers: 0,
      bothTimedOut: 0,
      compatibilityPercent: 0
    };
  });

  // Analyze each question
  let matchedAnswers = 0;
  let differentAnswers = 0;
  let bothAnswered = 0;
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

    const p1Answered = p1Answer && p1Answer.answer !== null;
    const p2Answered = p2Answer && p2Answer.answer !== null;

    if (p1Answered && p2Answered) {
      bothAnswered++;
      if (p1Answer.answer === p2Answer.answer) {
        matchedAnswers++;
        categoryStats[category].matchedAnswers++;
      } else {
        differentAnswers++;
        categoryStats[category].differentAnswers++;
      }
    } else if (!p1Answered && !p2Answered) {
      bothTimedOut++;
      categoryStats[category].bothTimedOut++;
    } else if (!p1Answered) {
      player1TimedOut++;
    } else {
      player2TimedOut++;
    }
  }

  // Calculate category compatibility percentages
  categories.forEach(cat => {
    const stats = categoryStats[cat];
    const answeredInCategory = stats.matchedAnswers + stats.differentAnswers;
    if (answeredInCategory > 0) {
      stats.compatibilityPercent = Math.round(
        (stats.matchedAnswers / answeredInCategory) * 100
      );
    }
  });

  // Calculate overall compatibility
  const compatibilityScore = bothAnswered > 0
    ? Math.round((matchedAnswers / bothAnswered) * 100)
    : 0;

  // Calculate average response times
  const p1ResponseTimes = this.player1.answers
    .filter(a => a.responseTimeMs !== null)
    .map(a => a.responseTimeMs);

  const p2ResponseTimes = this.player2.answers
    .filter(a => a.responseTimeMs !== null)
    .map(a => a.responseTimeMs);

  if (p1ResponseTimes.length > 0) {
    this.player1.averageResponseTimeMs = Math.round(
      p1ResponseTimes.reduce((a, b) => a + b, 0) / p1ResponseTimes.length
    );
  }

  if (p2ResponseTimes.length > 0) {
    this.player2.averageResponseTimeMs = Math.round(
      p2ResponseTimes.reduce((a, b) => a + b, 0) / p2ResponseTimes.length
    );
  }

  // Store results
  this.results = {
    totalQuestions: 50,
    bothAnswered,
    matchedAnswers,
    differentAnswers,
    player1TimedOut,
    player2TimedOut,
    bothTimedOut,
    compatibilityScore,
    categoryBreakdown: Object.values(categoryStats)
  };
};

/**
 * Add a voice note to the session
 * @param {ObjectId} userId - User sending the voice note
 * @param {String} audioUrl - S3 URL of the audio
 * @param {Number} duration - Duration in seconds
 */
wouldYouRatherSessionSchema.methods.addVoiceNote = async function (
  userId,
  audioUrl,
  duration
) {
  if (!['completed', 'discussion'].includes(this.status)) {
    throw new Error('Can only send voice notes after game completion');
  }

  // Check user is a player
// Check user is a player (handle both populated and non-populated cases)
const p1Id = this.player1.userId._id ? this.player1.userId._id.toString() : this.player1.userId.toString();
const p2Id = this.player2.userId._id ? this.player2.userId._id.toString() : this.player2.userId.toString();
const userIdStr = userId.toString();

const isPlayer = p1Id === userIdStr || p2Id === userIdStr;

  if (!isPlayer) {
    throw new Error('User is not a player in this game');
  }

  // Check voice note limit
  if (this.voiceNotes.length >= 10) {
    throw new Error('Maximum voice notes reached for this session');
  }

  // Check per-user limit (5 each)
  const userVoiceNotes = this.voiceNotes.filter(
    vn => vn.oduserId.toString() === userId.toString()
  );

  if (userVoiceNotes.length >= 5) {
    throw new Error('You have reached your voice note limit for this session');
  }

  this.voiceNotes.push({
    oduserId: userId,
    audioUrl,
    duration,
    sentAt: new Date()
  });

  if (this.status === 'completed') {
    this.status = 'discussion';
  }

  this.lastActivityAt = new Date();

  return this.save();
};

/**
 * Store AI-generated insights
 * @param {Object} insights - AI insights object
 */
wouldYouRatherSessionSchema.methods.setAiInsights = async function (insights) {
  this.aiInsights = {
    summary: insights.summary,
    compatibilityHighlights: insights.compatibilityHighlights || [],
    interestingDifferences: insights.interestingDifferences || [],
    relationshipTip: insights.relationshipTip,
    strongestCategory: insights.strongestCategory,
    weakestCategory: insights.weakestCategory,
    generatedAt: new Date()
  };

  return this.save();
};

/**
 * Update player connection status
 * @param {ObjectId} userId - User ID
 * @param {Boolean} isConnected - Connection status
 */
wouldYouRatherSessionSchema.methods.updateConnectionStatus = async function (
  userId,
  isConnected
) {
// Handle both populated and non-populated cases
const p1Id = this.player1.userId._id ? this.player1.userId._id.toString() : this.player1.userId.toString();
const p2Id = this.player2.userId._id ? this.player2.userId._id.toString() : this.player2.userId.toString();
const userIdStr = userId.toString();

const isPlayer1 = p1Id === userIdStr;
const isPlayer2 = p2Id === userIdStr;

  if (isPlayer1) {
    this.player1.isConnected = isConnected;
    this.player1.lastSeenAt = new Date();
  } else if (isPlayer2) {
    this.player2.isConnected = isConnected;
    this.player2.lastSeenAt = new Date();
  }

  this.lastActivityAt = new Date();

  return this.save();
};

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Create a new game session
 * @param {ObjectId} matchId - The match between players
 * @param {ObjectId} player1Id - Initiating player
 * @param {ObjectId} player2Id - Invited player
 */
wouldYouRatherSessionSchema.statics.createSession = async function (
  matchId,
  player1Id,
  player2Id
) {
  const WouldYouRatherQuestion = mongoose.model('WouldYouRatherQuestion');

  // Check for existing active session
  const existingSession = await this.findOne({
    matchId,
    status: { $in: ['pending', 'starting', 'playing', 'paused'] }
  });

  if (existingSession) {
    throw new Error('An active game session already exists for this match');
  }

  // Get randomized question order
  const questionOrder = await WouldYouRatherQuestion.getRandomizedOrder();

  if (questionOrder.length !== 50) {
    throw new Error('Could not load all 50 questions. Please seed the database first.');
  }

  // Create session
  const session = await this.create({
    matchId,
    player1: {
      userId: player1Id,
      answers: [],
      isReady: true // Initiator is ready
    },
    player2: {
      userId: player2Id,
      answers: [],
      isReady: false
    },
    initiatedBy: player1Id,
    questionOrder,
    status: 'pending'
  });

  return session;
};

/**
 * Find active session for a user
 * @param {ObjectId} userId - User ID
 */
wouldYouRatherSessionSchema.statics.findActiveSession = function (userId) {
  return this.findOne({
    $or: [
      { 'player1.userId': userId },
      { 'player2.userId': userId }
    ],
    status: { $in: ['pending', 'starting', 'playing', 'paused'] }
  }).populate('player1.userId player2.userId', 'firstName lastName username profilePhoto');
};

/**
 * Find pending invitation for a user
 * @param {ObjectId} userId - User ID (the invited player)
 */
wouldYouRatherSessionSchema.statics.findPendingInvitation = function (userId) {
  return this.findOne({
    'player2.userId': userId,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  }).populate('player1.userId', 'firstName lastName username profilePhoto');
};

/**
 * Find session by sessionId
 * @param {String} sessionId - Session UUID
 */
wouldYouRatherSessionSchema.statics.findBySessionId = function (sessionId) {
  return this.findOne({ sessionId })
    .populate('player1.userId player2.userId', 'firstName lastName username profilePhoto');
};

/**
 * Get game history for a match
 * @param {ObjectId} matchId - Match ID
 */
wouldYouRatherSessionSchema.statics.getMatchHistory = function (matchId) {
  return this.find({
    matchId,
    status: { $in: ['completed', 'discussion'] }
  })
    .sort({ completedAt: -1 })
    .select('sessionId results.compatibilityScore completedAt')
    .limit(10);
};

/**
 * Get game history for a user
 * @param {ObjectId} userId - User ID
 */
wouldYouRatherSessionSchema.statics.getUserHistory = function (userId) {
  return this.find({
    $or: [
      { 'player1.userId': userId },
      { 'player2.userId': userId }
    ],
    status: { $in: ['completed', 'discussion'] }
  })
    .sort({ completedAt: -1 })
    .populate('player1.userId player2.userId', 'firstName lastName username profilePhoto')
    .select('sessionId matchId results.compatibilityScore completedAt player1.userId player2.userId')
    .limit(20);
};

/**
 * Cleanup expired invitations
 * Called by a scheduled job
 */
wouldYouRatherSessionSchema.statics.cleanupExpired = async function () {
  const result = await this.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: new Date() }
    },
    {
      $set: { status: 'expired' }
    }
  );

  return result.modifiedCount;
};

// =====================================================
// CREATE MODEL
// =====================================================

const WouldYouRatherSession = mongoose.model(
  'WouldYouRatherSession',
  wouldYouRatherSessionSchema
);

module.exports = WouldYouRatherSession;