const mongoose = require('mongoose');

/**
 * AnswerAnalysis Schema
 * 
 * Stores AI-powered analysis of user's 50 question answers.
 * This is the core of Velora's matching intelligence.
 * 
 * One document per user - contains:
 * - Dimension scores (0-100 for each of 6 psychological dimensions)
 * - Personality profiling (attachment style, love languages, Big Five traits)
 * - Red flags (toxic patterns, dishonesty indicators)
 * - Dealbreakers (incompatibilities like kids, religion, lifestyle)
 * - AI-generated summary and compatibility vector
 */

const answerAnalysisSchema = new mongoose.Schema(
  {
    // ==================== USER REFERENCE ====================
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // One analysis document per user
      index: true
    },

    // ==================== DIMENSION SCORES ====================
    // Each dimension scored 0-100 with AI-extracted insights
    dimensionScores: {
      // Dimension 1: Emotional Intimacy & Vulnerability (Q1-8)
      emotional_intimacy: {
        score: {
          type: Number,
          min: 0,
          max: 100,
          default: null
        },
        insights: [String], // Key insights extracted by AI
        strengths: [String], // Positive patterns detected
        concerns: [String]   // Areas of concern or growth
      },

      // Dimension 2: Life Vision & Values (Q9-18)
      life_vision: {
        score: { type: Number, min: 0, max: 100, default: null },
        insights: [String],
        strengths: [String],
        concerns: [String]
      },

      // Dimension 3: Conflict & Communication (Q19-25)
      conflict_communication: {
        score: { type: Number, min: 0, max: 100, default: null },
        insights: [String],
        strengths: [String],
        concerns: [String]
      },

      // Dimension 4: Love Languages & Affection (Q26-31)
      love_languages: {
        score: { type: Number, min: 0, max: 100, default: null },
        insights: [String],
        strengths: [String],
        concerns: [String]
      },

      // Dimension 5: Physical & Sexual Compatibility (Q32-39)
      physical_sexual: {
        score: { type: Number, min: 0, max: 100, default: null },
        insights: [String],
        strengths: [String],
        concerns: [String]
      },

      // Dimension 6: Lifestyle & Daily Rhythms (Q40-50)
      lifestyle: {
        score: { type: Number, min: 0, max: 100, default: null },
        insights: [String],
        strengths: [String],
        concerns: [String]
      }
    },

    // ==================== OVERALL SCORES ====================
    overallScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
      // Weighted average of all dimension scores
      // Will be calculated by analysis service
    },

    authenticityScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
      // How honest/consistent are the answers?
      // Low score = contradictions detected across answers
    },

    // ==================== PERSONALITY PROFILE ====================
    personalityProfile: {
      // Attachment Theory: How they bond in relationships
      attachment_style: {
        type: String,
        enum: ['secure', 'anxious', 'avoidant', 'fearful-avoidant', 'unknown'],
        default: 'unknown'
      },

      // How they handle conflict
      conflict_style: {
        type: String,
        enum: ['direct', 'passive', 'aggressive', 'passive-aggressive', 'avoidant', 'collaborative', 'unknown'],
        default: 'unknown'
      },

      // Gary Chapman's 5 Love Languages
      dominant_love_language: {
        type: String,
        enum: ['physical_touch', 'words_of_affirmation', 'quality_time', 'acts_of_service', 'receiving_gifts', 'unknown'],
        default: 'unknown'
      },

      secondary_love_language: {
        type: String,
        enum: ['physical_touch', 'words_of_affirmation', 'quality_time', 'acts_of_service', 'receiving_gifts', 'unknown'],
        default: 'unknown'
      },

      // Big Five Personality Traits (0-100 scale)
      introversion_score: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
        // 0 = extreme extrovert, 50 = ambivert, 100 = extreme introvert
      },

      emotional_intelligence: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
        // Self-awareness, empathy, emotional regulation
      },

      communication_style: {
        type: String,
        enum: ['expressive', 'reserved', 'balanced', 'analytical', 'emotional', 'unknown'],
        default: 'unknown'
      },

      openness: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
        // Openness to new experiences, ideas, change
      },

      conscientiousness: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
        // Organization, reliability, goal-oriented behavior
      }
    },

    // ==================== RED FLAGS ====================
    // Warning signs detected by AI analysis
    redFlags: [
      {
        category: {
          type: String,
          enum: [
            'toxic_behavior',        // Blame-shifting, manipulation, control
            'emotional_unavailability', // Avoidance, detachment
            'dishonesty',            // Contradictions, vague answers
            'commitment_issues',     // Inconsistent relationship goals
            'communication_issues',  // Poor conflict resolution
            'boundary_issues',       // Lack of healthy boundaries
            'insecurity',            // Excessive jealousy, low self-esteem
            'other'
          ],
          required: true
        },

        severity: {
          type: Number,
          min: 1,
          max: 5,
          required: true,
          // 1 = minor concern
          // 2 = worth noting
          // 3 = moderate issue
          // 4 = serious concern
          // 5 = critical dealbreaker
        },

        description: {
          type: String,
          required: true,
          maxlength: 500
          // AI-generated description of the red flag
        },

        questionNumbers: {
          type: [Number],
          required: true,
          // Which questions triggered this red flag
          // Example: [4, 11] for apology + receipt keeping = grudge holding pattern
        },

        detectedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],

    // ==================== DEALBREAKERS ====================
    // Fundamental incompatibilities that prevent matching
    dealbreakers: [
      {
        type: {
          type: String,
          enum: [
            'kids',              // Wants kids vs doesn't want kids
            'religion',          // Religious vs non-religious
            'location',          // City preferences, relocation
            'lifestyle',         // Party vs homebody, active vs sedentary
            'values',            // Core value misalignment
            'family_involvement', // Family enmeshment vs independence
            'intimacy_pace',     // Physical intimacy timeline
            'career_priority',   // Career-first vs relationship-first
            'other'
          ],
          required: true
        },

        value: {
          type: String,
          required: true,
          maxlength: 200,
          // User's position on this dealbreaker
          // Example: "Definitely wants kids within 3-5 years"
        },

        incompatibleWith: {
          type: [String],
          required: true,
          // What values are incompatible with this
          // Example: ["Definitely doesn't want kids", "Unsure about kids"]
        },

        questionNumber: {
          type: Number,
          required: true,
          // Which question revealed this dealbreaker
          // Example: 15 for the kids question
        }
      }
    ],

    // ==================== AI-GENERATED SUMMARY ====================
    aiSummary: {
      shortBio: {
        type: String,
        maxlength: 200,
        default: null,
        // 100-150 char AI-generated bio
        // Example: "Thoughtful introvert seeking deep connection. Values family, honest communication, and quiet intimacy."
      },

      strengths: {
        type: [String],
        default: [],
        // Top 3-5 strengths extracted by AI
        // Example: ["Emotionally intelligent", "Strong communicator", "Secure attachment", "Clear life goals"]
      },

      compatibilityNotes: {
        type: String,
        maxlength: 500,
        default: null,
        // What they're looking for, who they'd match well with
        // Generated by AI based on answers
      },

      generatedAt: {
        type: Date,
        default: null
      }
    },

    // ==================== COMPATIBILITY VECTOR ====================
    // Multi-dimensional vector for ML-based matching (Module 5)
    compatibilityVector: {
      values: {
        type: [Number],
        default: [],
        // 50-dimensional vector representing user's personality
        // Used for cosine similarity matching in Module 5
        // Each dimension represents a trait or preference
      },

      version: {
        type: String,
        default: 'v1.0',
        // Track which algorithm version generated this vector
        // Important for when we update the matching algorithm
      },

      generatedAt: {
        type: Date,
        default: null
      }
    },

    // ==================== ANALYSIS METADATA ====================
    questionsAnalyzed: {
      type: Number,
      min: 0,
      max: 50,
      default: 0,
      // How many questions were analyzed
      // Minimum 15 required for analysis
    },

    lastAnalyzedAt: {
      type: Date,
      default: null,
      index: true
      // When was the last analysis run
    },

    analysisVersion: {
      type: String,
      default: 'v1.0',
      // Track which AI model/prompts were used
      // Example: "gpt-4-turbo-preview-v1.0"
      // Helps with future re-analysis if we improve prompts
    },

    needsReanalysis: {
      type: Boolean,
      default: false,
      index: true,
      // Set to true when user answers more questions
      // Background job or manual trigger will re-analyze
    }
  },
  {
    timestamps: true, // Automatically adds createdAt and updatedAt
    collection: 'answeranalyses'
  }
);

// ==================== INDEXES ====================
// Performance optimization for common queries

// Primary index: userId (unique, already defined above)
answerAnalysisSchema.index({ userId: 1 }, { unique: true });

// Query users who need re-analysis
answerAnalysisSchema.index({ needsReanalysis: 1 });

// Query by dealbreaker type (for filtering incompatible matches)
answerAnalysisSchema.index({ 'dealbreakers.type': 1 });

// Query by red flag severity (for admin dashboard or filtering)
answerAnalysisSchema.index({ 'redFlags.severity': 1 });

// ==================== INSTANCE METHODS ====================

/**
 * Check if analysis is complete
 * @returns {Boolean} - True if user has been analyzed
 */
answerAnalysisSchema.methods.isAnalysisComplete = function() {
  return this.questionsAnalyzed >= 15 && this.overallScore !== null;
};

/**
 * Get high severity red flags (4 or 5)
 * @returns {Array} - Array of serious red flags
 */
answerAnalysisSchema.methods.getCriticalRedFlags = function() {
  return this.redFlags.filter(flag => flag.severity >= 4);
};

/**
 * Check if user has specific dealbreaker
 * @param {String} type - Dealbreaker type to check
 * @returns {Boolean} - True if dealbreaker exists
 */
answerAnalysisSchema.methods.hasDealbreaker = function(type) {
  return this.dealbreakers.some(db => db.type === type);
};

/**
 * Get weighted overall score
 * Used when calculating with custom weights
 * @param {Object} weights - Custom weights for dimensions
 * @returns {Number} - Weighted score (0-100)
 */
answerAnalysisSchema.methods.getWeightedScore = function(weights = {}) {
  const defaultWeights = {
    emotional_intimacy: 0.25,      // 25%
    life_vision: 0.20,              // 20%
    conflict_communication: 0.15,   // 15%
    love_languages: 0.15,           // 15%
    physical_sexual: 0.15,          // 15%
    lifestyle: 0.10                 // 10%
  };

  const w = { ...defaultWeights, ...weights };
  const scores = this.dimensionScores;

  let totalScore = 0;
  let totalWeight = 0;

  for (const dimension in w) {
    if (scores[dimension] && scores[dimension].score !== null) {
      totalScore += scores[dimension].score * w[dimension];
      totalWeight += w[dimension];
    }
  }

  return totalWeight > 0 ? Math.round(totalScore / totalWeight) : null;
};

// ==================== STATIC METHODS ====================

/**
 * Find users who need re-analysis
 * @returns {Promise<Array>} - Array of user IDs that need analysis
 */
answerAnalysisSchema.statics.findUsersNeedingReanalysis = function() {
  return this.find({ needsReanalysis: true }).select('userId').lean();
};

/**
 * Get analysis by user ID
 * @param {ObjectId} userId - User's ID
 * @returns {Promise<Object>} - Analysis document
 */
answerAnalysisSchema.statics.getByUserId = function(userId) {
  return this.findOne({ userId }).lean();
};

// ==================== MIDDLEWARE ====================

// Before saving, calculate overall score if not already set
answerAnalysisSchema.pre('save', function(next) {
  // If overallScore is not set, calculate it
  if (this.overallScore === null && this.questionsAnalyzed >= 15) {
    this.overallScore = this.getWeightedScore();
  }
  next();
});

// ==================== MODEL EXPORT ====================
const AnswerAnalysis = mongoose.model('AnswerAnalysis', answerAnalysisSchema);

module.exports = AnswerAnalysis;