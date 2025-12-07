// src/models/games/WhatWouldYouDoSession.js

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * WHAT WOULD YOU DO - SESSION MODEL
 * 
 * Async scenario-based compatibility game with voice note responses.
 * 
 * Flow:
 * 1. Player 1 invites Player 2
 * 2. Player 2 accepts (status: active)
 * 3. Both answer 15 questions via voice notes (async, any order)
 * 4. When both complete → AI analyzes (status: analyzing)
 * 5. Results ready (status: completed)
 * 6. Discussion phase - can exchange voice notes about answers
 * 
 * Key Features:
 * - Voice note storage (S3 URL) + Whisper transcription
 * - Per-question AI analysis comparing both answers
 * - Overall compatibility assessment
 * - Post-game discussion voice notes
 */

// =====================================================
// SUB-SCHEMAS
// =====================================================

/**
 * Individual answer schema - voice note + transcription
 */
const answerSchema = new mongoose.Schema({
  questionNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 15
  },
  voiceNoteUrl: {
    type: String,
    required: true
  },
  voiceNoteDuration: {
    type: Number, // seconds
    required: true
  },
  transcription: {
    type: String,
    default: null
  },
  transcribedAt: {
    type: Date,
    default: null
  },
  answeredAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

/**
 * Player schema - tracks each player's progress
 */
const playerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  answers: [answerSchema],
  completedAt: {
    type: Date,
    default: null
  },
  totalAnswered: {
    type: Number,
    default: 0
  },
  isComplete: {
    type: Boolean,
    default: false
  },
  lastActivityAt: {
    type: Date,
    default: null
  }
}, { _id: false });

/**
 * Per-question analysis schema - AI comparison of both answers
 */
const questionAnalysisSchema = new mongoose.Schema({
  questionNumber: {
    type: Number,
    required: true
  },
  alignmentScore: {
    type: Number, // 0-100
    min: 0,
    max: 100
  },
  alignmentLevel: {
    type: String,
    enum: ['strong_alignment', 'moderate_alignment', 'different_approaches', 'potential_conflict']
  },
  player1Summary: {
    type: String // Brief summary of player 1's approach
  },
  player2Summary: {
    type: String // Brief summary of player 2's approach
  },
  comparisonInsight: {
    type: String // How their answers compare
  },
  discussionPrompt: {
    type: String // Suggested talking point
  }
}, { _id: false });

/**
 * Discussion voice note schema - post-game conversation
 */
const discussionNoteSchema = new mongoose.Schema({
  oduserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  questionNumber: {
    type: Number, // Which question this relates to (null for general)
    default: null
  },
  voiceNoteUrl: {
    type: String,
    required: true
  },
  duration: {
    type: Number,
    required: true
  },
  transcription: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  listenedBy: [{
    oduserId: mongoose.Schema.Types.ObjectId,
    listenedAt: Date
  }]
}, { _id: false });

// =====================================================
// MAIN SESSION SCHEMA
// =====================================================

const whatWouldYouDoSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    default: () => uuidv4(),
    unique: true,
    index: true
  },

  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true
  },

  // Players
  player1: playerSchema, // Initiator
  player2: playerSchema, // Invited

  // Game status
  status: {
    type: String,
    enum: [
      'pending',    // Invitation sent, waiting for accept
      'active',     // Accepted, players are answering
      'waiting',    // One player done, waiting for other
      'analyzing',  // Both done, AI processing
      'completed',  // Results ready
      'discussion', // In discussion phase
      'expired',    // 72hrs passed without completion
      'declined',   // Invitation declined
      'abandoned'   // One player quit
    ],
    default: 'pending'
  },

  // Question order (1-15, can be shuffled per session if desired)
  questionOrder: [{
    type: Number
  }],

  // Timestamps
  invitedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    default: () => new Date(Date.now() + 72 * 60 * 60 * 1000) // 72 hours
  },
  completedAt: {
    type: Date,
    default: null
  },

  // Results (populated after both complete)
  results: {
    overallCompatibility: {
      type: Number, // 0-100
      default: null
    },
    compatibilityLevel: {
      type: String,
      enum: ['highly_compatible', 'compatible', 'needs_discussion', 'significant_differences'],
      default: null
    },
    questionAnalyses: [questionAnalysisSchema],
    
    // Category breakdowns
    categoryScores: {
      trust_honesty: { type: Number, default: null },
      communication: { type: Number, default: null },
      respect: { type: Number, default: null },
      values: { type: Number, default: null },
      intimacy: { type: Number, default: null },
      control_flags: { type: Number, default: null }
    },

    // Highlights
    strongestAreas: [{
      category: String,
      insight: String
    }],
    areasToDiscuss: [{
      category: String,
      insight: String,
      questionNumber: Number
    }],

    // Top conversation starters from the game
    conversationStarters: [{
      questionNumber: Number,
      prompt: String
    }]
  },

  // AI Insights (generated once after analysis)
  aiInsights: {
    generated: {
      type: Boolean,
      default: false
    },
    generatedAt: {
      type: Date,
      default: null
    },
    overallSummary: {
      type: String,
      default: null
    },
    compatibilityAnalysis: {
      type: String,
      default: null
    },
    communicationStyles: {
      type: String,
      default: null
    },
    valuesAlignment: {
      type: String,
      default: null
    },
    potentialChallenges: {
      type: String,
      default: null
    },
    strengthsAsCouple: {
      type: String,
      default: null
    },
    adviceForward: {
      type: String,
      default: null
    }
  },

  // Post-game discussion
  discussionNotes: [discussionNoteSchema],

  // Result visibility tracking
  resultsViewedBy: [{
    oduserId: mongoose.Schema.Types.ObjectId,
    viewedAt: Date
  }]

}, {
  timestamps: true
});

// =====================================================
// INDEXES
// =====================================================

whatWouldYouDoSessionSchema.index({ 'player1.userId': 1, status: 1 });
whatWouldYouDoSessionSchema.index({ 'player2.userId': 1, status: 1 });
whatWouldYouDoSessionSchema.index({ matchId: 1 });
whatWouldYouDoSessionSchema.index({ expiresAt: 1 });
whatWouldYouDoSessionSchema.index({ status: 1, createdAt: -1 });

// =====================================================
// INSTANCE METHODS
// =====================================================

/**
 * Initialize question order (sequential 1-15)
 */
whatWouldYouDoSessionSchema.methods.initializeQuestions = function() {
  this.questionOrder = Array.from({ length: 15 }, (_, i) => i + 1);
};

/**
 * Record a player's voice note answer
 */
whatWouldYouDoSessionSchema.methods.recordAnswer = function(userId, questionNumber, voiceNoteUrl, duration, transcription = null) {
  const userIdStr = userId.toString();
  const p1Id = this.player1.userId._id?.toString() || this.player1.userId.toString();
  const p2Id = this.player2.userId._id?.toString() || this.player2.userId.toString();

  let player;
  if (userIdStr === p1Id) {
    player = this.player1;
  } else if (userIdStr === p2Id) {
    player = this.player2;
  } else {
    throw new Error('User is not a player in this game');
  }

  // Check if already answered this question
  const existingAnswer = player.answers.find(a => a.questionNumber === questionNumber);
  if (existingAnswer) {
    throw new Error('Question already answered');
  }

  // Add answer
  player.answers.push({
    questionNumber,
    voiceNoteUrl,
    voiceNoteDuration: duration,
    transcription,
    transcribedAt: transcription ? new Date() : null,
    answeredAt: new Date()
  });

  player.totalAnswered = player.answers.length;
  player.lastActivityAt = new Date();

  // Check if player completed all questions
  if (player.answers.length >= 15) {
    player.isComplete = true;
    player.completedAt = new Date();
  }

  return player;
};

/**
 * Update transcription for an answer
 */
whatWouldYouDoSessionSchema.methods.updateTranscription = function(userId, questionNumber, transcription) {
  const userIdStr = userId.toString();
  const p1Id = this.player1.userId._id?.toString() || this.player1.userId.toString();
  const p2Id = this.player2.userId._id?.toString() || this.player2.userId.toString();

  let player;
  if (userIdStr === p1Id) {
    player = this.player1;
  } else if (userIdStr === p2Id) {
    player = this.player2;
  } else {
    throw new Error('User is not a player in this game');
  }

  const answer = player.answers.find(a => a.questionNumber === questionNumber);
  if (!answer) {
    throw new Error('Answer not found');
  }

  answer.transcription = transcription;
  answer.transcribedAt = new Date();

  return answer;
};

/**
 * Check if both players have completed
 */
whatWouldYouDoSessionSchema.methods.bothCompleted = function() {
  return this.player1.isComplete && this.player2.isComplete;
};

/**
 * Get player's progress
 */
whatWouldYouDoSessionSchema.methods.getPlayerProgress = function(userId) {
  const userIdStr = userId.toString();
  const p1Id = this.player1.userId._id?.toString() || this.player1.userId.toString();
  const p2Id = this.player2.userId._id?.toString() || this.player2.userId.toString();

  if (userIdStr === p1Id) {
    return {
      you: {
        answered: this.player1.totalAnswered,
        isComplete: this.player1.isComplete,
        completedAt: this.player1.completedAt
      },
      partner: {
        answered: this.player2.totalAnswered,
        isComplete: this.player2.isComplete,
        completedAt: this.player2.completedAt
      }
    };
  } else if (userIdStr === p2Id) {
    return {
      you: {
        answered: this.player2.totalAnswered,
        isComplete: this.player2.isComplete,
        completedAt: this.player2.completedAt
      },
      partner: {
        answered: this.player1.totalAnswered,
        isComplete: this.player1.isComplete,
        completedAt: this.player1.completedAt
      }
    };
  }

  return null;
};

/**
 * Get answered question numbers for a player
 */
whatWouldYouDoSessionSchema.methods.getAnsweredQuestions = function(userId) {
  const userIdStr = userId.toString();
  const p1Id = this.player1.userId._id?.toString() || this.player1.userId.toString();
  const p2Id = this.player2.userId._id?.toString() || this.player2.userId.toString();

  let player;
  if (userIdStr === p1Id) {
    player = this.player1;
  } else if (userIdStr === p2Id) {
    player = this.player2;
  } else {
    return [];
  }

  return player.answers.map(a => a.questionNumber);
};

/**
 * Get next unanswered question for a player
 */
whatWouldYouDoSessionSchema.methods.getNextQuestion = function(userId) {
  const answeredNumbers = this.getAnsweredQuestions(userId);
  
  for (const qNum of this.questionOrder) {
    if (!answeredNumbers.includes(qNum)) {
      return qNum;
    }
  }
  
  return null; // All answered
};

/**
 * Add discussion voice note
 */
whatWouldYouDoSessionSchema.methods.addDiscussionNote = function(userId, voiceNoteUrl, duration, questionNumber = null, transcription = null) {
  this.discussionNotes.push({
    oduserId: userId,
    questionNumber,
    voiceNoteUrl,
    duration,
    transcription,
    createdAt: new Date(),
    listenedBy: []
  });

  return this.discussionNotes[this.discussionNotes.length - 1];
};

/**
 * Mark discussion note as listened
 */
whatWouldYouDoSessionSchema.methods.markDiscussionNoteListened = function(noteIndex, listenerId) {
  const note = this.discussionNotes[noteIndex];
  if (!note) return;

  const alreadyListened = note.listenedBy.some(
    l => l.oduserId.toString() === listenerId.toString()
  );

  if (!alreadyListened) {
    note.listenedBy.push({
      oduserId: listenerId,
      listenedAt: new Date()
    });
  }
};

/**
 * Mark results as viewed by a user
 */
whatWouldYouDoSessionSchema.methods.markResultsViewed = function(userId) {
  const alreadyViewed = this.resultsViewedBy.some(
    v => v.oduserId.toString() === userId.toString()
  );

  if (!alreadyViewed) {
    this.resultsViewedBy.push({
      oduserId: userId,
      viewedAt: new Date()
    });
  }
};

/**
 * Check if user has viewed results
 */
whatWouldYouDoSessionSchema.methods.hasViewedResults = function(userId) {
  return this.resultsViewedBy.some(
    v => v.oduserId.toString() === userId.toString()
  );
};

/**
 * Get both players' answers for a specific question (for results display)
 */
whatWouldYouDoSessionSchema.methods.getAnswersForQuestion = function(questionNumber) {
  const p1Answer = this.player1.answers.find(a => a.questionNumber === questionNumber);
  const p2Answer = this.player2.answers.find(a => a.questionNumber === questionNumber);

  return {
    player1: p1Answer ? {
      oduserId: this.player1.userId._id || this.player1.userId,
      voiceNoteUrl: p1Answer.voiceNoteUrl,
      duration: p1Answer.voiceNoteDuration,
      transcription: p1Answer.transcription,
      answeredAt: p1Answer.answeredAt
    } : null,
    player2: p2Answer ? {
      oduserId: this.player2.userId._id || this.player2.userId,
      voiceNoteUrl: p2Answer.voiceNoteUrl,
      duration: p2Answer.voiceNoteDuration,
      transcription: p2Answer.transcription,
      answeredAt: p2Answer.answeredAt
    } : null
  };
};

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Find session by sessionId with populated users
 */
whatWouldYouDoSessionSchema.statics.findBySessionId = function(sessionId) {
  return this.findOne({ sessionId })
    .populate('player1.userId', 'firstName lastName profilePhoto')
    .populate('player2.userId', 'firstName lastName profilePhoto')
    .populate('matchId');
};

/**
 * Find active session for a user
 */
whatWouldYouDoSessionSchema.statics.findActiveForUser = function(userId) {
  const userIdObj = new mongoose.Types.ObjectId(userId);
  
  return this.findOne({
    $or: [
      { 'player1.userId': userIdObj },
      { 'player2.userId': userIdObj }
    ],
    status: { $in: ['pending', 'active', 'waiting', 'analyzing'] }
  })
  .populate('player1.userId', 'firstName lastName profilePhoto')
  .populate('player2.userId', 'firstName lastName profilePhoto');
};

/**
 * Find pending invitation for user (where they are player2)
 */
whatWouldYouDoSessionSchema.statics.findPendingInvitation = function(userId) {
  const userIdObj = new mongoose.Types.ObjectId(userId);
  
  return this.findOne({
    'player2.userId': userIdObj,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  })
  .populate('player1.userId', 'firstName lastName profilePhoto')
  .populate('player2.userId', 'firstName lastName profilePhoto');
};

/**
 * Find completed games for a user (for history)
 */
whatWouldYouDoSessionSchema.statics.findCompletedForUser = function(userId, limit = 10) {
  const userIdObj = new mongoose.Types.ObjectId(userId);
  
  return this.find({
    $or: [
      { 'player1.userId': userIdObj },
      { 'player2.userId': userIdObj }
    ],
    status: { $in: ['completed', 'discussion'] }
  })
  .populate('player1.userId', 'firstName lastName profilePhoto')
  .populate('player2.userId', 'firstName lastName profilePhoto')
  .sort({ completedAt: -1 })
  .limit(limit);
};

/**
 * Check if two users have an active game
 */
whatWouldYouDoSessionSchema.statics.hasActiveGame = function(userId1, userId2) {
  const user1Obj = new mongoose.Types.ObjectId(userId1);
  const user2Obj = new mongoose.Types.ObjectId(userId2);

  return this.findOne({
    $or: [
      { 'player1.userId': user1Obj, 'player2.userId': user2Obj },
      { 'player1.userId': user2Obj, 'player2.userId': user1Obj }
    ],
    status: { $in: ['pending', 'active', 'waiting', 'analyzing'] }
  });
};

/**
 * Find sessions that need expiry check
 */
whatWouldYouDoSessionSchema.statics.findExpiredSessions = function() {
  return this.find({
    status: { $in: ['pending', 'active', 'waiting'] },
    expiresAt: { $lt: new Date() }
  });
};

/**
 * Get sessions ready for analysis (both completed, not yet analyzed)
 */
whatWouldYouDoSessionSchema.statics.findReadyForAnalysis = function() {
  return this.find({
    'player1.isComplete': true,
    'player2.isComplete': true,
    status: { $in: ['active', 'waiting'] }
  })
  .populate('player1.userId', 'firstName lastName')
  .populate('player2.userId', 'firstName lastName');
};

// =====================================================
// MODEL EXPORT
// =====================================================

const WhatWouldYouDoSession = mongoose.model('WhatWouldYouDoSession', whatWouldYouDoSessionSchema);

module.exports = WhatWouldYouDoSession;