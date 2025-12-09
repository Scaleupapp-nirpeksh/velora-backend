// src/models/CoupleCompatibility.js

const mongoose = require('mongoose');

/**
 * COUPLE COMPATIBILITY MODEL
 * 
 * Stores cached compatibility insights for a matched couple.
 * 
 * Design Philosophy:
 * - Generated on-demand (not auto-triggered when games complete)
 * - User can refresh anytime to pull latest game data
 * - Stores snapshot of which games were included
 * - Service compares snapshot vs current games to detect "update available"
 * - Multiple game instances: always uses latest completed session
 * 
 * Flow:
 * 1. User opens compatibility dashboard
 * 2. If no document exists → Show "Generate Compatibility" button
 * 3. If document exists → Show cached data + check for updates
 * 4. If new games completed since last generation → Show "Update Available" banner
 * 5. User clicks refresh → Regenerate with latest data
 * 
 * Minimum 3 games required for full AI insights.
 */

// =====================================================
// SUB-SCHEMAS
// =====================================================

/**
 * Game snapshot - tracks which game session was included
 * Used to detect if new games have been played since last generation
 */
const gameSnapshotSchema = new mongoose.Schema({
  included: {
    type: Boolean,
    default: false
  },
  sessionId: {
    type: String,  // The game's sessionId or _id
    default: null
  },
  completedAt: {
    type: Date,
    default: null
  },
  score: {
    type: Number,  // The compatibility/alignment score from that game
    min: 0,
    max: 100,
    default: null
  },
  // Quick summary from the game (for history list view)
  quickSummary: {
    type: String,
    maxlength: 200,
    default: null
  }
}, { _id: false });

/**
 * Dimension score - each of the 6 compatibility dimensions
 */
const dimensionScoreSchema = new mongoose.Schema({
  score: {
    type: Number,
    min: 0,
    max: 100,
    default: null
  },
  available: {
    type: Boolean,
    default: false
  },
  sourceGame: {
    type: String,
    enum: ['two_truths_lie', 'would_you_rather', 'intimacy_spectrum', 
           'never_have_i_ever', 'what_would_you_do', 'dream_board', null],
    default: null
  }
}, { _id: false });

/**
 * Strength/discussion area schema
 */
const insightItemSchema = new mongoose.Schema({
  area: {
    type: String,
    required: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    maxlength: 300
  },
  sourceGame: {
    type: String,
    enum: ['two_truths_lie', 'would_you_rather', 'intimacy_spectrum', 
           'never_have_i_ever', 'what_would_you_do', 'dream_board'],
    required: true
  },
  importance: {
    type: String,
    enum: ['minor', 'moderate', 'significant'],
    default: 'moderate'
  }
}, { _id: false });

/**
 * Conversation starter schema
 */
const conversationStarterSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
    maxlength: 300
  },
  context: {
    type: String,  // Brief context: "From your Dream Board responses..."
    maxlength: 200,
    default: null
  },
  sourceGame: {
    type: String,
    enum: ['two_truths_lie', 'would_you_rather', 'intimacy_spectrum', 
           'never_have_i_ever', 'what_would_you_do', 'dream_board'],
    required: true
  }
}, { _id: false });

/**
 * AI-generated full insights (requires 3+ games)
 */
const aiInsightsSchema = new mongoose.Schema({
  // Executive Summary - 3-4 sentences
  executiveSummary: {
    type: String,
    maxlength: 1000
  },
  
  // Detailed narrative - the full story
  compatibilityNarrative: {
    type: String,
    maxlength: 3000
  },
  
  // Relationship dynamic analysis
  relationshipDynamic: {
    type: String,
    maxlength: 1500
  },
  
  // Communication style analysis
  communicationAnalysis: {
    type: String,
    maxlength: 1000
  },
  
  // Long-term potential
  longTermPotential: {
    score: {
      type: Number,
      min: 0,
      max: 100
    },
    assessment: {
      type: String,
      maxlength: 500
    },
    factors: [{
      type: String,
      maxlength: 200
    }]
  },
  
  // Recommendations
  recommendations: {
    dateIdeas: [{
      type: String,
      maxlength: 200
    }],
    conversationTopics: [{
      type: String,
      maxlength: 200
    }],
    areasToExplore: [{
      type: String,
      maxlength: 200
    }],
    watchOutFor: [{
      type: String,
      maxlength: 200
    }]
  },
  
  // The verdict
  verdict: {
    headline: {
      type: String,  // "A Promising Match" / "Strong Foundation" etc.
      maxlength: 100
    },
    summary: {
      type: String,  // 2-3 sentences final assessment
      maxlength: 500
    },
    confidence: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: 'medium'
    }
  },
  
  generatedAt: {
    type: Date,
    default: null
  }
}, { _id: false });

// =====================================================
// MAIN SCHEMA
// =====================================================

const coupleCompatibilitySchema = new mongoose.Schema({
  // ==================== REFERENCES ====================
  
  matchId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Match',
    required: true,
    unique: true,
    index: true
  },
  
  // Denormalized for quick access (avoid joins)
  player1Id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  player2Id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  // ==================== GAMES SNAPSHOT ====================
  // Which games were included in this compatibility calculation
  
  gamesSnapshot: {
    two_truths_lie: {
      type: gameSnapshotSchema,
      default: () => ({})
    },
    would_you_rather: {
      type: gameSnapshotSchema,
      default: () => ({})
    },
    intimacy_spectrum: {
      type: gameSnapshotSchema,
      default: () => ({})
    },
    never_have_i_ever: {
      type: gameSnapshotSchema,
      default: () => ({})
    },
    what_would_you_do: {
      type: gameSnapshotSchema,
      default: () => ({})
    },
    dream_board: {
      type: gameSnapshotSchema,
      default: () => ({})
    }
  },
  
  // Count of games included in this calculation
  totalGamesIncluded: {
    type: Number,
    default: 0,
    min: 0,
    max: 6
  },

  // ==================== DIMENSION SCORES ====================
  // 6 dimensions mapped from the 6 games
  
  dimensionScores: {
    // Two Truths & A Lie → How well they know each other
    intuition: {
      type: dimensionScoreSchema,
      default: () => ({})
    },
    
    // Would You Rather → Daily life preferences
    lifestyle: {
      type: dimensionScoreSchema,
      default: () => ({})
    },
    
    // Intimacy Spectrum → Sexual compatibility
    physical: {
      type: dimensionScoreSchema,
      default: () => ({})
    },
    
    // Never Have I Ever → Past experiences alignment
    experience: {
      type: dimensionScoreSchema,
      default: () => ({})
    },
    
    // What Would You Do → Character & values
    character: {
      type: dimensionScoreSchema,
      default: () => ({})
    },
    
    // Dream Board → Future vision alignment
    future: {
      type: dimensionScoreSchema,
      default: () => ({})
    }
  },

  // ==================== OVERALL COMPATIBILITY ====================
  
  overallCompatibility: {
    score: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    level: {
      type: String,
      enum: ['exploring', 'promising', 'strong', 'exceptional', null],
      default: null
    },
    confidence: {
      type: String,
      enum: ['minimal', 'partial', 'good', 'comprehensive'],
      default: 'minimal'
    }
  },

  // ==================== AGGREGATED INSIGHTS ====================
  // Pulled from individual games
  
  strengths: {
    type: [insightItemSchema],
    default: []
  },
  
  discussionAreas: {
    type: [insightItemSchema],
    default: []
  },
  
  conversationStarters: {
    type: [conversationStarterSchema],
    default: []
  },
  
  // Red flags (primarily from What Would You Do)
  redFlags: [{
    flag: {
      type: String,
      maxlength: 200
    },
    severity: {
      type: String,
      enum: ['mild', 'moderate', 'serious']
    },
    sourceGame: {
      type: String
    }
  }],
  
  // Hidden alignments (primarily from Dream Board voice analysis)
  hiddenAlignments: [{
    description: {
      type: String,
      maxlength: 300
    },
    sourceGame: {
      type: String
    }
  }],

  // ==================== AI INSIGHTS ====================
  // Full AI-generated narrative (requires 3+ games)
  
  aiInsights: {
    type: aiInsightsSchema,
    default: null
  },
  
  // Is AI insights available?
  aiInsightsAvailable: {
    type: Boolean,
    default: false
  },

  // ==================== METADATA ====================
  
  // When was this compatibility last generated/refreshed
  lastGeneratedAt: {
    type: Date,
    default: null
  },
  
  // Version tracking (for future migrations)
  version: {
    type: Number,
    default: 1
  }

}, {
  timestamps: true
});

// =====================================================
// INDEXES
// =====================================================

coupleCompatibilitySchema.index({ matchId: 1 });
coupleCompatibilitySchema.index({ player1Id: 1, player2Id: 1 });
coupleCompatibilitySchema.index({ 'overallCompatibility.score': -1 });
coupleCompatibilitySchema.index({ totalGamesIncluded: 1 });
coupleCompatibilitySchema.index({ lastGeneratedAt: -1 });

// =====================================================
// VIRTUALS
// =====================================================

/**
 * Get list of included game types
 */
coupleCompatibilitySchema.virtual('includedGames').get(function() {
  const games = [];
  const gameTypes = ['two_truths_lie', 'would_you_rather', 'intimacy_spectrum', 
                     'never_have_i_ever', 'what_would_you_do', 'dream_board'];
  
  for (const gameType of gameTypes) {
    if (this.gamesSnapshot[gameType]?.included) {
      games.push(gameType);
    }
  }
  return games;
});

/**
 * Get list of missing game types
 */
coupleCompatibilitySchema.virtual('missingGames').get(function() {
  const games = [];
  const gameTypes = ['two_truths_lie', 'would_you_rather', 'intimacy_spectrum', 
                     'never_have_i_ever', 'what_would_you_do', 'dream_board'];
  
  for (const gameType of gameTypes) {
    if (!this.gamesSnapshot[gameType]?.included) {
      games.push(gameType);
    }
  }
  return games;
});

/**
 * Get games needed for AI insights
 */
coupleCompatibilitySchema.virtual('gamesNeededForAI').get(function() {
  const MINIMUM_GAMES_FOR_AI = 3;
  const needed = MINIMUM_GAMES_FOR_AI - this.totalGamesIncluded;
  return Math.max(0, needed);
});

/**
 * Check if eligible for AI insights
 */
coupleCompatibilitySchema.virtual('eligibleForAIInsights').get(function() {
  return this.totalGamesIncluded >= 3;
});

// Ensure virtuals are included in JSON/Object output
coupleCompatibilitySchema.set('toJSON', { virtuals: true });
coupleCompatibilitySchema.set('toObject', { virtuals: true });

// =====================================================
// INSTANCE METHODS
// =====================================================

/**
 * Check if a user is a participant in this match
 */
coupleCompatibilitySchema.methods.isParticipant = function(userId) {
  const userIdStr = userId.toString();
  const p1Id = this.player1Id._id?.toString() || this.player1Id.toString();
  const p2Id = this.player2Id._id?.toString() || this.player2Id.toString();
  return userIdStr === p1Id || userIdStr === p2Id;
};

/**
 * Update a game snapshot
 */
coupleCompatibilitySchema.methods.updateGameSnapshot = function(gameType, data) {
  const validGameTypes = ['two_truths_lie', 'would_you_rather', 'intimacy_spectrum', 
                          'never_have_i_ever', 'what_would_you_do', 'dream_board'];
  
  if (!validGameTypes.includes(gameType)) {
    throw new Error(`Invalid game type: ${gameType}`);
  }
  
  this.gamesSnapshot[gameType] = {
    included: true,
    sessionId: data.sessionId,
    completedAt: data.completedAt,
    score: data.score,
    quickSummary: data.quickSummary || null
  };
  
  // Recalculate total games included
  this.totalGamesIncluded = validGameTypes.filter(
    gt => this.gamesSnapshot[gt]?.included
  ).length;
  
  return this;
};

/**
 * Update a dimension score
 */
coupleCompatibilitySchema.methods.updateDimensionScore = function(dimension, score, sourceGame) {
  const validDimensions = ['intuition', 'lifestyle', 'physical', 'experience', 'character', 'future'];
  
  if (!validDimensions.includes(dimension)) {
    throw new Error(`Invalid dimension: ${dimension}`);
  }
  
  this.dimensionScores[dimension] = {
    score: score,
    available: true,
    sourceGame: sourceGame
  };
  
  return this;
};

/**
 * Calculate and update overall compatibility score
 * Uses weighted average of available dimensions
 */
coupleCompatibilitySchema.methods.calculateOverallScore = function() {
  // Dimension weights (total = 100%)
  const weights = {
    intuition: 10,   // Two Truths & A Lie
    lifestyle: 15,   // Would You Rather
    physical: 20,    // Intimacy Spectrum
    experience: 10,  // Never Have I Ever
    character: 25,   // What Would You Do (highest - most predictive)
    future: 20       // Dream Board
  };
  
  let totalWeight = 0;
  let weightedSum = 0;
  
  for (const [dimension, weight] of Object.entries(weights)) {
    if (this.dimensionScores[dimension]?.available && this.dimensionScores[dimension]?.score !== null) {
      weightedSum += this.dimensionScores[dimension].score * weight;
      totalWeight += weight;
    }
  }
  
  if (totalWeight === 0) {
    this.overallCompatibility.score = null;
    this.overallCompatibility.level = null;
    this.overallCompatibility.confidence = 'minimal';
    return this;
  }
  
  const score = Math.round(weightedSum / totalWeight);
  this.overallCompatibility.score = score;
  
  // Determine level based on score
  if (score >= 85) {
    this.overallCompatibility.level = 'exceptional';
  } else if (score >= 70) {
    this.overallCompatibility.level = 'strong';
  } else if (score >= 55) {
    this.overallCompatibility.level = 'promising';
  } else {
    this.overallCompatibility.level = 'exploring';
  }
  
  // Determine confidence based on games included
  if (this.totalGamesIncluded >= 5) {
    this.overallCompatibility.confidence = 'comprehensive';
  } else if (this.totalGamesIncluded >= 3) {
    this.overallCompatibility.confidence = 'good';
  } else if (this.totalGamesIncluded >= 2) {
    this.overallCompatibility.confidence = 'partial';
  } else {
    this.overallCompatibility.confidence = 'minimal';
  }
  
  return this;
};

/**
 * Add a strength insight
 */
coupleCompatibilitySchema.methods.addStrength = function(area, description, sourceGame, importance = 'moderate') {
  this.strengths.push({
    area,
    description,
    sourceGame,
    importance
  });
  return this;
};

/**
 * Add a discussion area
 */
coupleCompatibilitySchema.methods.addDiscussionArea = function(area, description, sourceGame, importance = 'moderate') {
  this.discussionAreas.push({
    area,
    description,
    sourceGame,
    importance
  });
  return this;
};

/**
 * Add a conversation starter
 */
coupleCompatibilitySchema.methods.addConversationStarter = function(question, sourceGame, context = null) {
  this.conversationStarters.push({
    question,
    context,
    sourceGame
  });
  return this;
};

/**
 * Set AI insights
 */
coupleCompatibilitySchema.methods.setAIInsights = function(insights) {
  this.aiInsights = {
    ...insights,
    generatedAt: new Date()
  };
  this.aiInsightsAvailable = true;
  return this;
};

/**
 * Clear all data for regeneration
 */
coupleCompatibilitySchema.methods.clearForRegeneration = function() {
  // Reset games snapshot
  const gameTypes = ['two_truths_lie', 'would_you_rather', 'intimacy_spectrum', 
                     'never_have_i_ever', 'what_would_you_do', 'dream_board'];
  
  for (const gameType of gameTypes) {
    this.gamesSnapshot[gameType] = {
      included: false,
      sessionId: null,
      completedAt: null,
      score: null,
      quickSummary: null
    };
  }
  
  this.totalGamesIncluded = 0;
  
  // Reset dimension scores
  const dimensions = ['intuition', 'lifestyle', 'physical', 'experience', 'character', 'future'];
  for (const dim of dimensions) {
    this.dimensionScores[dim] = {
      score: null,
      available: false,
      sourceGame: null
    };
  }
  
  // Reset overall
  this.overallCompatibility = {
    score: null,
    level: null,
    confidence: 'minimal'
  };
  
  // Reset aggregated insights
  this.strengths = [];
  this.discussionAreas = [];
  this.conversationStarters = [];
  this.redFlags = [];
  this.hiddenAlignments = [];
  
  // Reset AI insights
  this.aiInsights = null;
  this.aiInsightsAvailable = false;
  
  return this;
};

/**
 * Get summary for dashboard
 */
coupleCompatibilitySchema.methods.getDashboardSummary = function() {
  return {
    matchId: this.matchId,
    totalGamesIncluded: this.totalGamesIncluded,
    includedGames: this.includedGames,
    missingGames: this.missingGames,
    overallCompatibility: this.overallCompatibility,
    dimensionScores: this.dimensionScores,
    strengthsCount: this.strengths.length,
    discussionAreasCount: this.discussionAreas.length,
    aiInsightsAvailable: this.aiInsightsAvailable,
    gamesNeededForAI: this.gamesNeededForAI,
    lastGeneratedAt: this.lastGeneratedAt
  };
};

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Find by matchId
 */
coupleCompatibilitySchema.statics.findByMatchId = function(matchId) {
  return this.findOne({ matchId })
    .populate('player1Id', 'firstName lastName username profilePhoto')
    .populate('player2Id', 'firstName lastName username profilePhoto');
};

/**
 * Find by user (as either player)
 */
coupleCompatibilitySchema.statics.findByUserId = function(userId) {
  return this.find({
    $or: [
      { player1Id: userId },
      { player2Id: userId }
    ]
  })
    .populate('player1Id', 'firstName lastName username profilePhoto')
    .populate('player2Id', 'firstName lastName username profilePhoto')
    .sort({ lastGeneratedAt: -1 });
};

/**
 * Create or get compatibility document for a match
 */
coupleCompatibilitySchema.statics.getOrCreate = async function(matchId, player1Id, player2Id) {
  let compatibility = await this.findOne({ matchId });
  
  if (!compatibility) {
    compatibility = await this.create({
      matchId,
      player1Id,
      player2Id
    });
  }
  
  return compatibility;
};

/**
 * Check if compatibility exists for a match
 */
coupleCompatibilitySchema.statics.exists = async function(matchId) {
  const count = await this.countDocuments({ matchId });
  return count > 0;
};

/**
 * Get game display info
 */
coupleCompatibilitySchema.statics.getGameDisplayInfo = function() {
  return {
    two_truths_lie: {
      displayName: 'Two Truths & A Lie',
      emoji: '🎭',
      dimension: 'intuition',
      dimensionLabel: 'Intuition',
      description: 'How well you read each other'
    },
    would_you_rather: {
      displayName: 'Would You Rather',
      emoji: '⚖️',
      dimension: 'lifestyle',
      dimensionLabel: 'Lifestyle',
      description: 'Daily life preferences'
    },
    intimacy_spectrum: {
      displayName: 'Intimacy Spectrum',
      emoji: '🔥',
      dimension: 'physical',
      dimensionLabel: 'Physical',
      description: 'Sexual compatibility'
    },
    never_have_i_ever: {
      displayName: 'Never Have I Ever',
      emoji: '🙊',
      dimension: 'experience',
      dimensionLabel: 'Experience',
      description: 'Past experiences alignment'
    },
    what_would_you_do: {
      displayName: 'What Would You Do?',
      emoji: '🎯',
      dimension: 'character',
      dimensionLabel: 'Character',
      description: 'Values & integrity'
    },
    dream_board: {
      displayName: 'Dream Board',
      emoji: '🌟',
      dimension: 'future',
      dimensionLabel: 'Future',
      description: 'Vision alignment'
    }
  };
};

/**
 * Get confidence level info
 */
coupleCompatibilitySchema.statics.getConfidenceLevelInfo = function() {
  return {
    minimal: {
      label: 'Just Getting Started',
      description: 'Play more games to build your compatibility picture',
      gamesRange: '0-1'
    },
    partial: {
      label: 'Early Signals',
      description: 'Some patterns emerging, keep exploring',
      gamesRange: '2'
    },
    good: {
      label: 'Good Understanding',
      description: 'Solid compatibility picture forming',
      gamesRange: '3-4'
    },
    comprehensive: {
      label: 'Complete Picture',
      description: 'Full compatibility assessment available',
      gamesRange: '5-6'
    }
  };
};

/**
 * Get compatibility level info
 */
coupleCompatibilitySchema.statics.getCompatibilityLevelInfo = function() {
  return {
    exploring: {
      label: 'Exploring',
      description: 'Some differences to discuss',
      scoreRange: '0-54',
      color: '#F59E0B'
    },
    promising: {
      label: 'Promising',
      description: 'Good foundation with room to grow',
      scoreRange: '55-69',
      color: '#3B82F6'
    },
    strong: {
      label: 'Strong',
      description: 'Great alignment across dimensions',
      scoreRange: '70-84',
      color: '#10B981'
    },
    exceptional: {
      label: 'Exceptional',
      description: 'Remarkable compatibility',
      scoreRange: '85-100',
      color: '#8B5CF6'
    }
  };
};

// =====================================================
// MODEL EXPORT
// =====================================================

const CoupleCompatibility = mongoose.model('CoupleCompatibility', coupleCompatibilitySchema);

module.exports = CoupleCompatibility;