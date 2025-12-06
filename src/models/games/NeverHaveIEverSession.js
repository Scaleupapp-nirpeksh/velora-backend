// src/models/games/NeverHaveIEverSession.js

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * NEVER HAVE I EVER SESSION MODEL
 * 
 * Stores game sessions for the "Never Have I Ever" discovery game.
 * Both players answer "I Have" or "I Haven't" to 30 statements,
 * revealing past experiences and hidden depths.
 * 
 * Game Flow:
 * 1. Player 1 invites Player 2 → status: 'pending'
 * 2. Player 2 accepts → status: 'starting' (3s countdown)
 * 3. Game begins → status: 'playing'
 * 4. 30 questions, 15s each, sequential order (mild → spicy)
 * 5. Both answer → reveal answers → show discovery message → next
 * 6. After Q30 → status: 'completed', calculate results
 * 7. AI insights generated → voice notes available
 * 
 * Scoring (Discovery Points):
 * - Both "I Have": +3 each (Shared Experience)
 * - Both "I Haven't": +1 each (Innocent Together)
 * - One has, one hasn't: +5 to revealer (Secret Unlocked)
 */

// =====================================================
// SUB-SCHEMAS
// =====================================================

/**
 * Individual answer schema
 * Stores a player's answer (true = "I Have", false = "I Haven't")
 */
const answerSchema = new mongoose.Schema(
  {
    questionNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 30
    },
    // true = "I Have", false = "I Haven't", null = timed out
    answer: {
      type: Boolean,
      default: null
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
    // Array of answers
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
    },
    // "I Have" count
    totalIHave: {
      type: Number,
      default: 0
    },
    // "I Haven't" count
    totalIHavent: {
      type: Number,
      default: 0
    },
    // Discovery points earned
    discoveryPoints: {
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
        'past_patterns',
        'secrets_honesty',
        'emotional_depths',
        'physical_intimacy',
        'desires_fantasies',
        'dark_confessions'
      ]
    },
    totalQuestions: {
      type: Number,
      default: 5
    },
    // Both answered "I Have"
    bothHave: {
      type: Number,
      default: 0
    },
    // Both answered "I Haven't"
    bothHavent: {
      type: Number,
      default: 0
    },
    // Different answers (discovery moments)
    different: {
      type: Number,
      default: 0
    },
    // At least one timed out
    timedOut: {
      type: Number,
      default: 0
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
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    listenedByPartner: {
      type: Boolean,
      default: false
    }
  },
  { _id: false }
);

// =====================================================
// MAIN SESSION SCHEMA
// =====================================================

const neverHaveIEverSessionSchema = new mongoose.Schema(
  {
    // Unique session identifier (UUID)
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
      required: true
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
        'pending',    // Waiting for player 2 to accept
        'starting',   // Both ready, countdown in progress
        'playing',    // Game in progress
        'completed',  // Game finished
        'discussion', // Viewing results, voice notes available
        'abandoned',  // Game abandoned mid-way
        'declined',   // Invitation declined
        'expired'     // Invitation expired
      ],
      default: 'pending',
      index: true
    },

    // Question order (array of question numbers 1-30)
    questionOrder: {
      type: [Number],
      default: []
    },

    // Current question index (0-29)
    currentQuestionIndex: {
      type: Number,
      default: 0
    },

    // Timer tracking
    currentQuestionStartedAt: {
      type: Date,
      default: null
    },
    currentQuestionExpiresAt: {
      type: Date,
      default: null
    },

    // Results (calculated after completion)
    results: {
      // Total discovery points for each player
      player1Points: {
        type: Number,
        default: 0
      },
      player2Points: {
        type: Number,
        default: 0
      },
      // Matching statistics
      totalSharedExperiences: {
        type: Number,
        default: 0
      },
      totalInnocentTogether: {
        type: Number,
        default: 0
      },
      totalSecretsUnlocked: {
        type: Number,
        default: 0
      },
      // Category breakdown
      categoryBreakdown: [categoryBreakdownSchema],
      // Badges earned
      player1Badges: [{
        type: String
      }],
      player2Badges: [{
        type: String
      }],
      // Questions where answers differed (conversation starters)
      conversationStarters: [{
        questionNumber: Number,
        statementText: String,
        player1Answer: Boolean,
        player2Answer: Boolean
      }]
    },

    // AI-generated insights
    aiInsights: {
      generated: {
        type: Boolean,
        default: false
      },
      generatedAt: {
        type: Date,
        default: null
      },
      trustPatterns: {
        type: String,
        default: null
      },
      experienceAlignment: {
        type: String,
        default: null
      },
      conversationPrompts: {
        type: String,
        default: null
      },
      greenFlags: {
        type: String,
        default: null
      },
      areasToDiscuss: {
        type: String,
        default: null
      }
    },

    // Voice notes for discussion phase
    voiceNotes: [voiceNoteSchema],

    // Timestamps
    invitedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      default: () => new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    },
    acceptedAt: {
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

neverHaveIEverSessionSchema.index({ 'player1.userId': 1, status: 1 });
neverHaveIEverSessionSchema.index({ 'player2.userId': 1, status: 1 });
neverHaveIEverSessionSchema.index({ matchId: 1 });
neverHaveIEverSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// =====================================================
// VIRTUAL PROPERTIES
// =====================================================

neverHaveIEverSessionSchema.virtual('progressPercent').get(function () {
  return Math.round((this.currentQuestionIndex / 30) * 100);
});

neverHaveIEverSessionSchema.virtual('isComplete').get(function () {
  return this.status === 'completed' || this.status === 'discussion';
});

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Find session by sessionId
 */
neverHaveIEverSessionSchema.statics.findBySessionId = function (sessionId) {
  return this.findOne({ sessionId })
    .populate('player1.userId', 'firstName lastName profilePhoto')
    .populate('player2.userId', 'firstName lastName profilePhoto');
};

/**
 * Find active session for a user
 */
neverHaveIEverSessionSchema.statics.findActiveForUser = function (userId) {
  return this.findOne({
    $or: [
      { 'player1.userId': userId },
      { 'player2.userId': userId }
    ],
    status: { $in: ['pending', 'starting', 'playing'] }
  })
    .populate('player1.userId', 'firstName lastName profilePhoto')
    .populate('player2.userId', 'firstName lastName profilePhoto');
};

/**
 * Find pending invitation for a user (where they are player2)
 */
neverHaveIEverSessionSchema.statics.findPendingInvitation = function (userId) {
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
neverHaveIEverSessionSchema.statics.findCompletedForUser = function (userId, limit = 10) {
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
 * Check if users have an active game
 */
neverHaveIEverSessionSchema.statics.hasActiveGame = async function (userId1, oduserId2) {
  const session = await this.findOne({
    $or: [
      { 'player1.userId': userId1, 'player2.userId': oduserId2 },
      { 'player1.userId': oduserId2, 'player2.userId': userId1 }
    ],
    status: { $in: ['pending', 'starting', 'playing'] }
  });
  return !!session;
};

// =====================================================
// INSTANCE METHODS
// =====================================================

/**
 * Initialize question order (sequential 1-30 for progressive spice)
 */
neverHaveIEverSessionSchema.methods.initializeQuestions = function () {
  // Questions are played in order 1-30 (already sorted by category/spice)
  this.questionOrder = Array.from({ length: 30 }, (_, i) => i + 1);
};

/**
 * Record a player's answer
 */
neverHaveIEverSessionSchema.methods.recordAnswer = async function (userId, questionNumber, answer) {
  const userIdStr = userId.toString();
  const p1Id = this.player1.userId._id?.toString() || this.player1.userId.toString();
  
  const player = p1Id === userIdStr ? this.player1 : this.player2;
  
  // Check if already answered this question
  const existingAnswer = player.answers.find(a => a.questionNumber === questionNumber);
  if (existingAnswer && existingAnswer.answer !== null) {
    throw new Error('Already answered this question');
  }

  const now = new Date();
  const responseTime = this.currentQuestionStartedAt 
    ? now - this.currentQuestionStartedAt 
    : null;

  if (existingAnswer) {
    existingAnswer.answer = answer;
    existingAnswer.answeredAt = now;
    existingAnswer.responseTime = responseTime;
  } else {
    player.answers.push({
      questionNumber,
      answer,
      answeredAt: now,
      responseTime
    });
  }

  player.totalAnswered++;
  if (answer === true) {
    player.totalIHave++;
  } else {
    player.totalIHavent++;
  }

  this.lastActivityAt = now;
  await this.save();

  return {
    questionNumber,
    answer,
    responseTime
  };
};

/**
 * Record timeout for a player
 */
neverHaveIEverSessionSchema.methods.recordTimeout = async function (userId, questionNumber) {
  const userIdStr = userId.toString();
  const p1Id = this.player1.userId._id?.toString() || this.player1.userId.toString();
  
  const player = p1Id === userIdStr ? this.player1 : this.player2;
  
  const existing = player.answers.find(a => a.questionNumber === questionNumber);
  if (!existing) {
    player.answers.push({
      questionNumber,
      answer: null,
      answeredAt: null,
      responseTime: null
    });
    player.totalTimedOut++;
  } else if (existing.answer === null) {
    player.totalTimedOut++;
  }

  this.lastActivityAt = new Date();
  await this.save();
};

/**
 * Check if both players have answered current question
 */
neverHaveIEverSessionSchema.methods.bothAnswered = function () {
  const currentQ = this.questionOrder[this.currentQuestionIndex];
  
  const p1Answer = this.player1.answers.find(a => a.questionNumber === currentQ);
  const p2Answer = this.player2.answers.find(a => a.questionNumber === currentQ);
  
  return (p1Answer?.answer !== undefined && p1Answer?.answer !== null) &&
         (p2Answer?.answer !== undefined && p2Answer?.answer !== null);
};

/**
 * Get both players' answers for current question
 */
neverHaveIEverSessionSchema.methods.getCurrentAnswers = function () {
  const currentQ = this.questionOrder[this.currentQuestionIndex];
  
  const p1Answer = this.player1.answers.find(a => a.questionNumber === currentQ);
  const p2Answer = this.player2.answers.find(a => a.questionNumber === currentQ);
  
  return {
    questionNumber: currentQ,
    player1: p1Answer?.answer,
    player2: p2Answer?.answer,
    player1Answered: p1Answer?.answer !== null && p1Answer?.answer !== undefined,
    player2Answered: p2Answer?.answer !== null && p2Answer?.answer !== undefined
  };
};

/**
 * Calculate discovery points for current question
 */
neverHaveIEverSessionSchema.methods.calculateQuestionPoints = function () {
  const answers = this.getCurrentAnswers();
  
  let p1Points = 0;
  let p2Points = 0;
  let outcome = 'timedOut';

  if (answers.player1 === null || answers.player2 === null) {
    // At least one timed out
    outcome = 'timedOut';
  } else if (answers.player1 === true && answers.player2 === true) {
    // Both "I Have" - Shared Experience
    p1Points = 3;
    p2Points = 3;
    outcome = 'sharedExperience';
  } else if (answers.player1 === false && answers.player2 === false) {
    // Both "I Haven't" - Innocent Together
    p1Points = 1;
    p2Points = 1;
    outcome = 'innocentTogether';
  } else {
    // One has, one hasn't - Secret Unlocked
    if (answers.player1 === true) {
      p1Points = 5; // Player 1 revealed something
    } else {
      p2Points = 5; // Player 2 revealed something
    }
    outcome = 'secretUnlocked';
  }

  return {
    player1Points: p1Points,
    player2Points: p2Points,
    outcome,
    player1Answer: answers.player1,
    player2Answer: answers.player2
  };
};

/**
 * Move to next question
 */
neverHaveIEverSessionSchema.methods.nextQuestion = async function () {
  if (this.status !== 'playing') {
    throw new Error('Game is not in playing state');
  }

  // Check if game is complete
  if (this.currentQuestionIndex >= 29) {
    return this.completeGame();
  }

  this.currentQuestionIndex++;

  // Set timer for next question (15 seconds)
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
neverHaveIEverSessionSchema.methods.completeGame = async function () {
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
neverHaveIEverSessionSchema.methods.calculateResults = async function () {
  const NeverHaveIEverQuestion = mongoose.model('NeverHaveIEverQuestion');

  // Get all questions for category mapping
  const questions = await NeverHaveIEverQuestion.find({
    questionNumber: { $in: this.questionOrder }
  }).lean();

  const questionMap = {};
  questions.forEach(q => {
    questionMap[q.questionNumber] = q;
  });

  // Initialize category stats
  const categoryStats = {};
  const categories = [
    'past_patterns',
    'secrets_honesty',
    'emotional_depths',
    'physical_intimacy',
    'desires_fantasies',
    'dark_confessions'
  ];

  categories.forEach(cat => {
    categoryStats[cat] = {
      category: cat,
      totalQuestions: 0,
      bothHave: 0,
      bothHavent: 0,
      different: 0,
      timedOut: 0
    };
  });

  // Analyze each question
  let totalP1Points = 0;
  let totalP2Points = 0;
  let sharedExperiences = 0;
  let innocentTogether = 0;
  let secretsUnlocked = 0;
  const conversationStarters = [];

  for (const questionNumber of this.questionOrder) {
    const question = questionMap[questionNumber];
    if (!question) continue;

    const category = question.category;
    categoryStats[category].totalQuestions++;

    const p1Answer = this.player1.answers.find(a => a.questionNumber === questionNumber);
    const p2Answer = this.player2.answers.find(a => a.questionNumber === questionNumber);

    const p1Val = p1Answer?.answer;
    const p2Val = p2Answer?.answer;

    if (p1Val === null || p1Val === undefined || p2Val === null || p2Val === undefined) {
      // At least one timed out
      categoryStats[category].timedOut++;
    } else if (p1Val === true && p2Val === true) {
      // Both "I Have"
      categoryStats[category].bothHave++;
      totalP1Points += 3;
      totalP2Points += 3;
      sharedExperiences++;
    } else if (p1Val === false && p2Val === false) {
      // Both "I Haven't"
      categoryStats[category].bothHavent++;
      totalP1Points += 1;
      totalP2Points += 1;
      innocentTogether++;
    } else {
      // Different answers - conversation starter!
      categoryStats[category].different++;
      secretsUnlocked++;
      
      if (p1Val === true) {
        totalP1Points += 5;
      } else {
        totalP2Points += 5;
      }

      conversationStarters.push({
        questionNumber,
        statementText: question.statementText,
        player1Answer: p1Val,
        player2Answer: p2Val
      });
    }
  }

  // Calculate badges
  const p1Badges = this.calculateBadges(this.player1, categoryStats, 'player1');
  const p2Badges = this.calculateBadges(this.player2, categoryStats, 'player2');

  // Update player points
  this.player1.discoveryPoints = totalP1Points;
  this.player2.discoveryPoints = totalP2Points;

  // Set results
  this.results = {
    player1Points: totalP1Points,
    player2Points: totalP2Points,
    totalSharedExperiences: sharedExperiences,
    totalInnocentTogether: innocentTogether,
    totalSecretsUnlocked: secretsUnlocked,
    categoryBreakdown: Object.values(categoryStats),
    player1Badges: p1Badges,
    player2Badges: p2Badges,
    conversationStarters: conversationStarters.slice(0, 10) // Top 10
  };
};

/**
 * Calculate badges for a player
 */
neverHaveIEverSessionSchema.methods.calculateBadges = function (player, categoryStats, playerKey) {
  const badges = [];

  // Most "I Have" answers overall
  if (player.totalIHave >= 20) {
    badges.push('experienced'); // "Lived & Learned"
  }

  // Most "I Haven't" answers overall
  if (player.totalIHavent >= 20) {
    badges.push('pure_soul'); // "Pure Soul"
  }

  // Opened up in dark confessions
  const darkAnswers = this.getPlayerCategoryAnswers(player, 'dark_confessions');
  if (darkAnswers.filter(a => a === true).length >= 3) {
    badges.push('open_book'); // "Open Book"
  }

  // Spicy category revelations
  const intimacyAnswers = this.getPlayerCategoryAnswers(player, 'physical_intimacy');
  if (intimacyAnswers.filter(a => a === true).length >= 3) {
    badges.push('spicy_past'); // "Spicy Past"
  }

  // Answered quickly (average < 5 seconds)
  const answeredQuestions = player.answers.filter(a => a.responseTime);
  if (answeredQuestions.length > 0) {
    const avgTime = answeredQuestions.reduce((sum, a) => sum + a.responseTime, 0) / answeredQuestions.length;
    if (avgTime < 5000) {
      badges.push('quick_draw'); // "Quick & Honest"
    }
  }

  // No timeouts
  if (player.totalTimedOut === 0) {
    badges.push('committed'); // "Fully Present"
  }

  return badges;
};

/**
 * Get player's answers for a specific category
 */
neverHaveIEverSessionSchema.methods.getPlayerCategoryAnswers = function (player, category) {
  // Category to question number mapping
  const categoryRanges = {
    past_patterns: [1, 2, 3, 4, 5],
    secrets_honesty: [6, 7, 8, 9, 10],
    emotional_depths: [11, 12, 13, 14, 15],
    physical_intimacy: [16, 17, 18, 19, 20],
    desires_fantasies: [21, 22, 23, 24, 25],
    dark_confessions: [26, 27, 28, 29, 30]
  };

  const questionNumbers = categoryRanges[category] || [];
  return questionNumbers.map(qNum => {
    const answer = player.answers.find(a => a.questionNumber === qNum);
    return answer?.answer;
  });
};

/**
 * Add voice note
 */
neverHaveIEverSessionSchema.methods.addVoiceNote = async function (userId, audioUrl, duration) {
  this.voiceNotes.push({
    oduserId: userId,
    audioUrl,
    duration,
    createdAt: new Date()
  });

  if (this.status === 'completed') {
    this.status = 'discussion';
  }

  this.lastActivityAt = new Date();
  return this.save();
};

/**
 * Mark voice note as listened
 */
neverHaveIEverSessionSchema.methods.markVoiceNoteListened = async function (oduserId, odlistenerId) {
  const note = this.voiceNotes.find(
    n => n.oduserId.toString() === oduserId.toString()
  );

  if (note && oduserId.toString() !== odlistenerId.toString()) {
    note.listenedByPartner = true;
    this.lastActivityAt = new Date();
    await this.save();
  }

  return note;
};

// =====================================================
// CREATE MODEL
// =====================================================

const NeverHaveIEverSession = mongoose.model(
  'NeverHaveIEverSession',
  neverHaveIEverSessionSchema
);

module.exports = NeverHaveIEverSession;