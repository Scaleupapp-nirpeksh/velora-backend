// src/models/games/DreamBoardSession.js

const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

/**
 * DREAM BOARD - SESSION MODEL
 * 
 * Async vision board compatibility game.
 * 
 * Flow:
 * 1. Player 1 invites Player 2
 * 2. Player 2 accepts (status: active)
 * 3. Both select cards for 10 categories (async, any order)
 *    - Each selection can have optional voice elaboration
 * 4. When both complete → AI analyzes (status: analyzing)
 *    - AI considers both card selections AND voice transcripts
 * 5. Results ready (status: completed)
 * 6. Discussion phase - voice notes about different dreams
 * 
 * Key Features:
 * - Card selection + priority bucket + timeline
 * - Optional voice elaboration per category (transcribed by Whisper)
 * - Per-category alignment scoring (enhanced by voice context)
 * - Overall dream compatibility assessment
 * - Post-game discussion voice notes
 */

// =====================================================
// SUB-SCHEMAS
// =====================================================

/**
 * Voice elaboration schema - optional context for each selection
 * Allows users to explain their choice in their own words
 */
const elaborationSchema = new mongoose.Schema({
  voiceNoteUrl: {
    type: String,
    required: true
  },
  duration: {
    type: Number, // seconds
    required: true,
    min: 1,
    max: 120 // max 2 minutes per elaboration
  },
  transcript: {
    type: String, // Whisper transcription
    default: null
  },
  transcribedAt: {
    type: Date,
    default: null
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

/**
 * Individual card selection schema
 */
const selectionSchema = new mongoose.Schema({
  categoryNumber: {
    type: Number,
    required: true,
    min: 1,
    max: 10
  },
  categoryId: {
    type: String,
    required: true,
    enum: [
      'our_home',
      'our_family',
      'our_careers',
      'our_money',
      'our_weekends',
      'our_adventures',
      'our_roots',
      'our_intimacy',
      'our_growth',
      'our_someday'
    ]
  },
  cardId: {
    type: String,
    required: true,
    enum: ['A', 'B', 'C', 'D']
  },
  priority: {
    type: String,
    required: true,
    enum: ['heart_set', 'dream', 'flow']
  },
  timeline: {
    type: String,
    required: true,
    enum: ['cant_wait', 'when_right', 'someday']
  },
  selectedAt: {
    type: Date,
    default: Date.now
  },
  
  // NEW: Optional voice elaboration
  // "I picked City, but what I really mean is..."
  elaboration: {
    type: elaborationSchema,
    default: null
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
  selections: [selectionSchema],
  completedAt: {
    type: Date,
    default: null
  },
  totalSelected: {
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
  },
  // NEW: Track how many elaborations added (for UI hints)
  elaborationCount: {
    type: Number,
    default: 0
  }
}, { _id: false });

/**
 * Per-category analysis schema - AI comparison
 */
const categoryAnalysisSchema = new mongoose.Schema({
  categoryNumber: {
    type: Number,
    required: true
  },
  categoryId: {
    type: String,
    required: true
  },
  alignmentScore: {
    type: Number, // 0-100
    min: 0,
    max: 100
  },
  alignmentLevel: {
    type: String,
    enum: ['aligned', 'close', 'different', 'needs_conversation']
  },
  player1Card: {
    cardId: String,
    title: String,
    priority: String,
    timeline: String,
    // NEW: Include elaboration context in results
    hasElaboration: { type: Boolean, default: false },
    elaborationSummary: { type: String, default: null } // AI-summarized key points
  },
  player2Card: {
    cardId: String,
    title: String,
    priority: String,
    timeline: String,
    hasElaboration: { type: Boolean, default: false },
    elaborationSummary: { type: String, default: null }
  },
  insight: {
    type: String // AI-generated insight for this category
  },
  // NEW: Did voice elaborations reveal hidden alignment/misalignment?
  elaborationInsight: {
    type: String, // "Despite different cards, both described wanting..."
    default: null
  }
}, { _id: false });

/**
 * Overall results schema
 */
const resultsSchema = new mongoose.Schema({
  overallAlignment: {
    type: Number, // 0-100 percentage
    min: 0,
    max: 100
  },
  alignedCount: {
    type: Number, // Categories with aligned dreams
    default: 0
  },
  closeCount: {
    type: Number, // Categories that are close
    default: 0
  },
  differentCount: {
    type: Number, // Categories needing discussion
    default: 0
  },
  categoryAnalysis: [categoryAnalysisSchema],
  
  // AI-generated summary sections
  alignedDreamsSummary: {
    type: String // "You both dream of..."
  },
  closeEnoughSummary: {
    type: String // "You're close on..."
  },
  conversationStartersSummary: {
    type: String // "Talk about..."
  },
  overallInsight: {
    type: String // Final AI summary
  },
  
  // NEW: Elaboration-specific insights
  hiddenAlignments: {
    type: String, // "Your voice notes revealed you both actually want..."
    default: null
  },
  hiddenConcerns: {
    type: String, // "Worth discussing: Player mentioned X as dealbreaker..."
    default: null
  }
}, { _id: false });

/**
 * Discussion voice note schema (post-game)
 */
const discussionNoteSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  categoryNumber: {
    type: Number,
    min: 1,
    max: 10,
    default: null // null = general discussion, number = specific category
  },
  voiceNoteUrl: {
    type: String,
    required: true
  },
  duration: {
    type: Number, // seconds
    required: true
  },
  listenedBy: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

// =====================================================
// MAIN SESSION SCHEMA
// =====================================================

const dreamBoardSessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    default: uuidv4
  },

  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true
  },

  player1: {
    type: playerSchema,
    required: true
  },

  player2: {
    type: playerSchema,
    required: true
  },

  status: {
    type: String,
    enum: ['pending', 'active', 'analyzing', 'completed', 'expired', 'declined', 'abandoned'],
    default: 'pending'
  },

  results: {
    type: resultsSchema,
    default: null
  },

  discussionNotes: [discussionNoteSchema],

  // Timestamps
  invitedAt: {
    type: Date,
    default: Date.now
  },
  acceptedAt: {
    type: Date,
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours
  },
  lastActivityAt: {
    type: Date,
    default: Date.now
  }

}, {
  timestamps: true
});

// =====================================================
// INDEXES
// =====================================================

dreamBoardSessionSchema.index({ sessionId: 1 }, { unique: true });
dreamBoardSessionSchema.index({ matchId: 1 });
dreamBoardSessionSchema.index({ 'player1.userId': 1 });
dreamBoardSessionSchema.index({ 'player2.userId': 1 });
dreamBoardSessionSchema.index({ status: 1 });
dreamBoardSessionSchema.index({ expiresAt: 1 });
dreamBoardSessionSchema.index({ createdAt: -1 });

// Compound indexes for common queries
dreamBoardSessionSchema.index({ 'player1.userId': 1, status: 1 });
dreamBoardSessionSchema.index({ 'player2.userId': 1, status: 1 });

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Find session by UUID
 */
dreamBoardSessionSchema.statics.findBySessionId = function(sessionId) {
  return this.findOne({ sessionId })
    .populate('player1.userId', 'firstName lastName username profilePhoto')
    .populate('player2.userId', 'firstName lastName username profilePhoto')
    .populate('matchId');
};

/**
 * Find active session for a user
 */
dreamBoardSessionSchema.statics.findActiveForUser = function(userId) {
  return this.findOne({
    $or: [
      { 'player1.userId': userId },
      { 'player2.userId': userId }
    ],
    status: { $in: ['pending', 'active', 'analyzing'] },
    expiresAt: { $gt: new Date() }
  })
  .populate('player1.userId', 'firstName lastName username profilePhoto')
  .populate('player2.userId', 'firstName lastName username profilePhoto');
};

/**
 * Find pending invitation for a user (where they are player2)
 */
dreamBoardSessionSchema.statics.findPendingInvitation = function(userId) {
  return this.findOne({
    'player2.userId': userId,
    status: 'pending',
    expiresAt: { $gt: new Date() }
  })
  .populate('player1.userId', 'firstName lastName username profilePhoto')
  .populate('player2.userId', 'firstName lastName username profilePhoto');
};

/**
 * Find completed games for a user
 */
dreamBoardSessionSchema.statics.findCompletedForUser = function(userId, limit = 10) {
  return this.find({
    $or: [
      { 'player1.userId': userId },
      { 'player2.userId': userId }
    ],
    status: 'completed'
  })
  .sort({ completedAt: -1 })
  .limit(limit)
  .populate('player1.userId', 'firstName lastName username profilePhoto')
  .populate('player2.userId', 'firstName lastName username profilePhoto');
};

/**
 * Check if two users have an active game
 */
dreamBoardSessionSchema.statics.hasActiveGame = function(user1Id, user2Id) {
  return this.findOne({
    $or: [
      { 'player1.userId': user1Id, 'player2.userId': user2Id },
      { 'player1.userId': user2Id, 'player2.userId': user1Id }
    ],
    status: { $in: ['pending', 'active', 'analyzing'] },
    expiresAt: { $gt: new Date() }
  });
};

// =====================================================
// INSTANCE METHODS
// =====================================================

/**
 * Check if a user is a participant
 */
dreamBoardSessionSchema.methods.isParticipant = function(userId) {
  const userIdStr = userId.toString();
  const p1Id = this.player1.userId._id?.toString() || this.player1.userId.toString();
  const p2Id = this.player2.userId._id?.toString() || this.player2.userId.toString();
  return userIdStr === p1Id || userIdStr === p2Id;
};

/**
 * Get player info for a user
 */
dreamBoardSessionSchema.methods.getPlayerInfo = function(userId) {
  const userIdStr = userId.toString();
  const p1Id = this.player1.userId._id?.toString() || this.player1.userId.toString();
  const p2Id = this.player2.userId._id?.toString() || this.player2.userId.toString();
  
  if (userIdStr === p1Id) {
    return { isPlayer1: true, player: this.player1, partner: this.player2 };
  }
  if (userIdStr === p2Id) {
    return { isPlayer1: false, player: this.player2, partner: this.player1 };
  }
  return null;
};

/**
 * Add a card selection for a player
 */
dreamBoardSessionSchema.methods.addSelection = function(userId, selection) {
  const playerInfo = this.getPlayerInfo(userId);
  if (!playerInfo) {
    throw new Error('User is not a participant');
  }

  const { player } = playerInfo;
  
  // Check if already selected this category
  const existingIndex = player.selections.findIndex(
    s => s.categoryNumber === selection.categoryNumber
  );
  
  if (existingIndex >= 0) {
    // Update existing selection (preserve elaboration if exists)
    const existingElaboration = player.selections[existingIndex].elaboration;
    player.selections[existingIndex] = {
      ...selection,
      elaboration: existingElaboration, // Keep existing elaboration
      selectedAt: new Date()
    };
  } else {
    // Add new selection
    player.selections.push({
      ...selection,
      elaboration: null,
      selectedAt: new Date()
    });
    player.totalSelected = player.selections.length;
  }
  
  player.lastActivityAt = new Date();
  this.lastActivityAt = new Date();
  
  // Check if player completed all 10
  if (player.selections.length >= 10) {
    player.isComplete = true;
    player.completedAt = new Date();
  }
  
  return player;
};

/**
 * Add voice elaboration to a selection
 */
dreamBoardSessionSchema.methods.addElaboration = function(userId, categoryNumber, elaborationData) {
  const playerInfo = this.getPlayerInfo(userId);
  if (!playerInfo) {
    throw new Error('User is not a participant');
  }

  const { player } = playerInfo;
  
  // Find the selection for this category
  const selectionIndex = player.selections.findIndex(
    s => s.categoryNumber === categoryNumber
  );
  
  if (selectionIndex < 0) {
    throw new Error('Must select a card before adding elaboration');
  }
  
  // Add or update elaboration
  player.selections[selectionIndex].elaboration = {
    voiceNoteUrl: elaborationData.voiceNoteUrl,
    duration: elaborationData.duration,
    transcript: elaborationData.transcript || null,
    transcribedAt: elaborationData.transcript ? new Date() : null,
    addedAt: new Date()
  };
  
  // Update elaboration count
  player.elaborationCount = player.selections.filter(s => s.elaboration).length;
  
  player.lastActivityAt = new Date();
  this.lastActivityAt = new Date();
  
  return player.selections[selectionIndex];
};

/**
 * Update transcript for an elaboration (after Whisper processing)
 */
dreamBoardSessionSchema.methods.updateTranscript = function(userId, categoryNumber, transcript) {
  const playerInfo = this.getPlayerInfo(userId);
  if (!playerInfo) {
    throw new Error('User is not a participant');
  }

  const { player } = playerInfo;
  
  const selection = player.selections.find(s => s.categoryNumber === categoryNumber);
  
  if (!selection || !selection.elaboration) {
    throw new Error('No elaboration found for this category');
  }
  
  selection.elaboration.transcript = transcript;
  selection.elaboration.transcribedAt = new Date();
  
  return selection;
};

/**
 * Get selection with elaboration for a category
 */
dreamBoardSessionSchema.methods.getSelection = function(userId, categoryNumber) {
  const playerInfo = this.getPlayerInfo(userId);
  if (!playerInfo) return null;
  
  return playerInfo.player.selections.find(s => s.categoryNumber === categoryNumber);
};

/**
 * Check if both players have completed
 */
dreamBoardSessionSchema.methods.isBothComplete = function() {
  return this.player1.isComplete && this.player2.isComplete;
};

/**
 * Get progress for a player
 */
dreamBoardSessionSchema.methods.getProgress = function(userId) {
  const playerInfo = this.getPlayerInfo(userId);
  if (!playerInfo) return null;
  
  const { player, partner } = playerInfo;
  
  return {
    you: {
      selected: player.totalSelected,
      elaborations: player.elaborationCount,
      isComplete: player.isComplete,
      completedAt: player.completedAt
    },
    partner: {
      selected: partner.totalSelected,
      elaborations: partner.elaborationCount,
      isComplete: partner.isComplete,
      completedAt: partner.completedAt
    },
    bothComplete: this.isBothComplete()
  };
};

/**
 * Get all elaborations for AI analysis
 */
dreamBoardSessionSchema.methods.getAllElaborations = function() {
  const elaborations = {
    player1: [],
    player2: []
  };
  
  this.player1.selections.forEach(s => {
    if (s.elaboration && s.elaboration.transcript) {
      elaborations.player1.push({
        categoryNumber: s.categoryNumber,
        categoryId: s.categoryId,
        cardId: s.cardId,
        transcript: s.elaboration.transcript
      });
    }
  });
  
  this.player2.selections.forEach(s => {
    if (s.elaboration && s.elaboration.transcript) {
      elaborations.player2.push({
        categoryNumber: s.categoryNumber,
        categoryId: s.categoryId,
        cardId: s.cardId,
        transcript: s.elaboration.transcript
      });
    }
  });
  
  return elaborations;
};

/**
 * Add discussion voice note (post-game)
 */
dreamBoardSessionSchema.methods.addDiscussionNote = function(userId, voiceNoteUrl, duration, categoryNumber = null) {
  this.discussionNotes.push({
    userId: userId,
    categoryNumber,
    voiceNoteUrl,
    duration,
    listenedBy: [],
    createdAt: new Date()
  });
  
  this.lastActivityAt = new Date();
  return this.discussionNotes[this.discussionNotes.length - 1];
};

/**
 * Mark discussion note as listened
 */
dreamBoardSessionSchema.methods.markNoteListened = function(noteIndex, userId) {
  if (this.discussionNotes[noteIndex]) {
    const note = this.discussionNotes[noteIndex];
    if (!note.listenedBy.includes(userId)) {
      note.listenedBy.push(userId);
    }
  }
  return this;
};

module.exports = mongoose.model('DreamBoardSession', dreamBoardSessionSchema);