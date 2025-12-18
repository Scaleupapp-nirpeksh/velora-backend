// src/models/DateDecision.js

const mongoose = require('mongoose');

/**
 * DATE DECISION MODEL
 * 
 * Stores the "Should this couple meet?" assessment and date planning data.
 * Aggregates insights from CoupleCompatibility, AnswerAnalysis, and game sessions
 * to make an informed recommendation.
 * 
 * Decision Framework:
 * - Readiness Score = Compatibility (35%) + Engagement (20%) + Red Flag Assessment (25%) + Mutual Interest (20%)
 * 
 * Decision Matrix:
 * - 🟢 READY (≥75%): Show full date plan
 * - 🟡 ALMOST READY (60-74%): Suggest 1-2 more games, show partial plan
 * - 🟠 CAUTION (45-59%): Highlight concerns, suggest specific games
 * - 🔴 NOT YET (<45%): More games needed, no date plan
 * - ⛔ BLOCKED: Critical red flags override score
 */

// =====================================================
// SUB-SCHEMAS
// =====================================================

/**
 * Individual score component breakdown
 */
const scoreBreakdownSchema = new mongoose.Schema({
  compatibility: {
    score: { type: Number, min: 0, max: 100, default: 0 },
    weight: { type: Number, default: 0.35 },
    weighted: { type: Number, default: 0 },
    source: { type: String, default: 'CoupleCompatibility' }
  },
  engagement: {
    score: { type: Number, min: 0, max: 100, default: 0 },
    weight: { type: Number, default: 0.20 },
    weighted: { type: Number, default: 0 },
    gamesPlayed: { type: Number, default: 0 },
    gamesTotal: { type: Number, default: 6 }
  },
  redFlagAssessment: {
    score: { type: Number, min: 0, max: 100, default: 100 }, // Starts at 100, deducted for flags
    weight: { type: Number, default: 0.25 },
    weighted: { type: Number, default: 0 },
    flagsFound: { type: Number, default: 0 },
    criticalFlags: { type: Number, default: 0 }
  },
  mutualInterest: {
    score: { type: Number, min: 0, max: 100, default: 0 },
    weight: { type: Number, default: 0.20 },
    weighted: { type: Number, default: 0 },
    factors: [{ type: String }] // e.g., "both_liked", "active_messaging", "game_initiations"
  }
}, { _id: false });

/**
 * Blocker schema - critical issues that override the score
 */
const blockerSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'dealbreaker_conflict',    // Kids, religion, location mismatch
      'severe_red_flag',         // Severity 4-5 red flags
      'authenticity_concern',    // Very low authenticity score
      'blocked_user',            // One user blocked the other
      'reported_user'            // Active report against user
    ],
    required: true
  },
  severity: {
    type: String,
    enum: ['critical', 'high'],
    default: 'critical'
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  category: {
    type: String // e.g., "kids", "religion", "toxic_behavior"
  },
  sourceGame: {
    type: String // Which game revealed this, if applicable
  }
}, { _id: false });

/**
 * Caution schema - moderate concerns to be aware of
 */
const cautionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: [
      'moderate_red_flag',       // Severity 2-3 red flags
      'low_dimension_score',     // One dimension significantly low
      'timeline_mismatch',       // Different relationship timelines
      'communication_gap',       // Potential communication issues
      'value_difference',        // Notable value differences
      'incomplete_assessment'    // Not enough data in key areas
    ],
    required: true
  },
  severity: {
    type: String,
    enum: ['medium', 'low'],
    default: 'medium'
  },
  description: {
    type: String,
    required: true,
    maxlength: 500
  },
  suggestion: {
    type: String, // How to address this
    maxlength: 300
  },
  relatedDimension: {
    type: String // Which compatibility dimension this relates to
  }
}, { _id: false });

/**
 * Venue suggestion schema
 */
const venueSuggestionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    maxlength: 200
  },
  type: {
    type: String,
    enum: ['restaurant', 'cafe', 'bar', 'activity', 'outdoor', 'cultural', 'entertainment'],
    required: true
  },
  description: {
    type: String,
    maxlength: 500
  },
  whyRecommended: {
    type: String, // Why this suits them based on their preferences
    maxlength: 300
  },
  priceRange: {
    type: String,
    enum: ['$', '$$', '$$$', '$$$$']
  },
  atmosphere: {
    type: String // e.g., "intimate", "casual", "energetic", "quiet"
  },
  bestFor: {
    type: String // e.g., "deep conversation", "fun activity", "romantic dinner"
  },
  location: {
    area: { type: String }, // e.g., "Koramangala", "Indiranagar"
    city: { type: String, default: 'Bangalore' }
  },
  // Extracted from their game responses
  alignedPreferences: [{ type: String }] // e.g., ["both love Italian", "shared interest in art"]
}, { _id: false });

/**
 * Conversation starter for the date
 */
const dateConversationStarterSchema = new mongoose.Schema({
  topic: {
    type: String,
    required: true,
    maxlength: 200
  },
  prompt: {
    type: String,
    required: true,
    maxlength: 500
  },
  source: {
    type: String // Which game/insight this came from
  },
  depth: {
    type: String,
    enum: ['light', 'medium', 'deep'],
    default: 'medium'
  }
}, { _id: false });

/**
 * Topics to avoid/approach carefully
 */
const sensitiveTopicSchema = new mongoose.Schema({
  topic: {
    type: String,
    required: true,
    maxlength: 200
  },
  reason: {
    type: String,
    maxlength: 300
  },
  approach: {
    type: String, // How to approach if needed
    maxlength: 300
  }
}, { _id: false });

/**
 * Date plan schema - generated for ready/almost_ready couples
 */
const datePlanSchema = new mongoose.Schema({
  // Primary recommendation
  primaryVenue: venueSuggestionSchema,
  
  // Alternative options
  alternatives: [venueSuggestionSchema],
  
  // Suggested activities
  activities: [{
    name: { type: String },
    description: { type: String },
    duration: { type: String }, // e.g., "1-2 hours"
    whyGood: { type: String }
  }],
  
  // Conversation starters
  conversationStarters: [dateConversationStarterSchema],
  
  // Topics to be careful with
  sensitiveTopics: [sensitiveTopicSchema],
  
  // Timing suggestions
  timing: {
    suggestedDuration: { type: String }, // e.g., "2-3 hours"
    bestTimeOfDay: { type: String }, // e.g., "evening", "afternoon"
    reasoning: { type: String }
  },
  
  // Preferences extracted from games
  extractedPreferences: {
    sharedInterests: [{ type: String }],
    preferredPace: { type: String }, // From IntimacySpectrum
    communicationStyle: { type: String }, // From WhatWouldYouDo
    adventureLevel: { type: String }, // From DreamBoard
    budgetAlignment: { type: String } // From DreamBoard our_money
  }
}, { _id: false });

/**
 * AI narrative schema
 */
const aiNarrativeSchema = new mongoose.Schema({
  headline: {
    type: String, // e.g., "You two are ready for that first date! 🎉"
    maxlength: 200
  },
  summary: {
    type: String, // 2-3 sentence overview
    maxlength: 1000
  },
  readinessExplanation: {
    type: String, // Why they got this decision
    maxlength: 500
  },
  strengthsHighlight: {
    type: String, // What's working well
    maxlength: 500
  },
  areasToWatch: {
    type: String, // What to be mindful of
    maxlength: 500
  },
  dateAdvice: {
    type: String, // Specific advice for their date
    maxlength: 500
  },
  generatedAt: {
    type: Date
  }
}, { _id: false });

/**
 * Games suggested to improve readiness
 */
const suggestedGameSchema = new mongoose.Schema({
  gameType: {
    type: String,
    enum: [
      'two_truths_lie',
      'would_you_rather',
      'intimacy_spectrum',
      'never_have_i_ever',
      'what_would_you_do',
      'dream_board'
    ],
    required: true
  },
  reason: {
    type: String, // Why this game would help
    maxlength: 300
  },
  priority: {
    type: Number, // 1 = most important
    min: 1,
    max: 6
  },
  dimension: {
    type: String // Which dimension this would improve
  }
}, { _id: false });

// =====================================================
// MAIN SCHEMA
// =====================================================

const dateDecisionSchema = new mongoose.Schema({
  // References
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true,
    index: true
  },
  
  player1Id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  player2Id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Link to CoupleCompatibility used
  coupleCompatibilityId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CoupleCompatibility'
  },

  // ==================== DECISION ====================
  
  decision: {
    type: String,
    enum: ['ready', 'almost_ready', 'caution', 'not_yet', 'blocked'],
    required: true,
    index: true
  },
  
  decisionEmoji: {
    type: String,
    default: function() {
      const emojiMap = {
        'ready': '🟢',
        'almost_ready': '🟡',
        'caution': '🟠',
        'not_yet': '🔴',
        'blocked': '⛔'
      };
      return emojiMap[this.decision] || '❓';
    }
  },
  
  decisionLabel: {
    type: String,
    default: function() {
      const labelMap = {
        'ready': 'Ready for a Date!',
        'almost_ready': 'Almost There',
        'caution': 'Proceed with Caution',
        'not_yet': 'Not Yet Ready',
        'blocked': 'Not Recommended'
      };
      return labelMap[this.decision] || 'Unknown';
    }
  },

  // ==================== SCORES ====================
  
  readinessScore: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  
  scoreBreakdown: scoreBreakdownSchema,
  
  // Confidence in the assessment
  confidence: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium'
  },
  
  confidenceReason: {
    type: String,
    maxlength: 200
  },

  // ==================== ISSUES ====================
  
  blockers: [blockerSchema],
  
  cautions: [cautionSchema],
  
  hasBlockers: {
    type: Boolean,
    default: false
  },
  
  hasCautions: {
    type: Boolean,
    default: false
  },

  // ==================== DATE PLAN ====================
  
  datePlan: datePlanSchema,
  
  datePlanAvailable: {
    type: Boolean,
    default: false
  },

  // ==================== IMPROVEMENT PATH ====================
  
  suggestedGames: [suggestedGameSchema],
  
  improvementTips: [{
    type: String,
    maxlength: 300
  }],
  
  estimatedGamesToReady: {
    type: Number,
    min: 0,
    max: 6
  },

  // ==================== AI NARRATIVE ====================
  
  aiNarrative: aiNarrativeSchema,
  
  aiNarrativeAvailable: {
    type: Boolean,
    default: false
  },

  // ==================== DATA SOURCES ====================
  
  // Track what data was used for this decision
  dataSources: {
    coupleCompatibilityScore: { type: Number },
    coupleCompatibilityConfidence: { type: String },
    gamesIncluded: [{ type: String }],
    totalGamesPlayed: { type: Number },
    answerAnalysisChecked: { type: Boolean, default: false },
    dealbreakersChecked: { type: Boolean, default: false }
  },

  // ==================== TIMESTAMPS ====================
  
  generatedAt: {
    type: Date,
    default: Date.now
  },
  
  lastRefreshedAt: {
    type: Date,
    default: Date.now
  },
  
  // Track if user has seen this decision
  viewedBy: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date }
  }],
  
  // Track if couple proceeded with date
  dateOutcome: {
    proceeded: { type: Boolean, default: null },
    feedbackAt: { type: Date },
    feedback: { type: String, maxlength: 500 }
  }

}, {
  timestamps: true
});

// =====================================================
// INDEXES
// =====================================================

// Find by match
dateDecisionSchema.index({ matchId: 1 });

// Find by players (handles bidirectional)
dateDecisionSchema.index({ player1Id: 1, player2Id: 1 });
dateDecisionSchema.index({ player2Id: 1, player1Id: 1 });

// Find by decision type
dateDecisionSchema.index({ decision: 1, generatedAt: -1 });

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Get or create DateDecision for a match
 */
dateDecisionSchema.statics.getOrCreate = async function(matchId, player1Id, player2Id) {
  let decision = await this.findOne({
    $or: [
      { matchId },
      { player1Id, player2Id },
      { player1Id: player2Id, player2Id: player1Id }
    ]
  });
  
  if (!decision) {
    decision = new this({
      matchId,
      player1Id,
      player2Id,
      decision: 'not_yet',
      readinessScore: 0
    });
  }
  
  return decision;
};

/**
 * Find decision for a couple (handles bidirectional)
 */
dateDecisionSchema.statics.findForCouple = async function(matchId, player1Id, player2Id) {
  return this.findOne({
    $or: [
      { matchId },
      { player1Id, player2Id },
      { player1Id: player2Id, player2Id: player1Id }
    ]
  });
};

/**
 * Get decision display info
 */
dateDecisionSchema.statics.getDecisionInfo = function() {
  return {
    ready: {
      emoji: '🟢',
      label: 'Ready for a Date!',
      description: 'You two have strong compatibility and have explored enough to meet confidently.',
      color: '#22C55E',
      showDatePlan: true
    },
    almost_ready: {
      emoji: '🟡',
      label: 'Almost There',
      description: 'Looking good! Play 1-2 more games to feel fully confident.',
      color: '#EAB308',
      showDatePlan: true
    },
    caution: {
      emoji: '🟠',
      label: 'Proceed with Caution',
      description: 'Some areas need more exploration before meeting.',
      color: '#F97316',
      showDatePlan: false
    },
    not_yet: {
      emoji: '🔴',
      label: 'Not Yet Ready',
      description: 'Keep playing games to discover your compatibility.',
      color: '#EF4444',
      showDatePlan: false
    },
    blocked: {
      emoji: '⛔',
      label: 'Not Recommended',
      description: 'Critical compatibility concerns have been identified.',
      color: '#991B1B',
      showDatePlan: false
    }
  };
};

// =====================================================
// INSTANCE METHODS
// =====================================================

/**
 * Mark as viewed by user
 */
dateDecisionSchema.methods.markViewed = function(userId) {
  const alreadyViewed = this.viewedBy.some(
    v => v.userId.toString() === userId.toString()
  );
  
  if (!alreadyViewed) {
    this.viewedBy.push({
      userId,
      viewedAt: new Date()
    });
  }
  
  return this;
};

/**
 * Check if user has viewed
 */
dateDecisionSchema.methods.hasViewed = function(userId) {
  return this.viewedBy.some(
    v => v.userId.toString() === userId.toString()
  );
};

/**
 * Get summary for dashboard
 */
dateDecisionSchema.methods.getSummary = function() {
  return {
    decision: this.decision,
    decisionEmoji: this.decisionEmoji,
    decisionLabel: this.decisionLabel,
    readinessScore: this.readinessScore,
    confidence: this.confidence,
    hasBlockers: this.hasBlockers,
    hasCautions: this.hasCautions,
    datePlanAvailable: this.datePlanAvailable,
    suggestedGamesCount: this.suggestedGames?.length || 0,
    generatedAt: this.generatedAt
  };
};

/**
 * Clear for regeneration
 */
dateDecisionSchema.methods.clearForRegeneration = function() {
  this.blockers = [];
  this.cautions = [];
  this.hasBlockers = false;
  this.hasCautions = false;
  this.datePlan = undefined;
  this.datePlanAvailable = false;
  this.suggestedGames = [];
  this.improvementTips = [];
  this.aiNarrative = undefined;
  this.aiNarrativeAvailable = false;
  this.lastRefreshedAt = new Date();
};

// =====================================================
// EXPORT
// =====================================================

const DateDecision = mongoose.model('DateDecision', dateDecisionSchema);

module.exports = DateDecision;