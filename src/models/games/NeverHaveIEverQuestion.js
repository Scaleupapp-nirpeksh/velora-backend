// src/models/games/NeverHaveIEverQuestion.js

const mongoose = require('mongoose');

/**
 * NEVER HAVE I EVER QUESTION MODEL
 * 
 * Stores the 30 pre-seeded questions for the "Never Have I Ever" game.
 * Questions progress from medium to spicy, helping couples discover
 * each other's past experiences, patterns, and hidden depths.
 * 
 * Unlike Would You Rather (binary choice) or Intimacy Spectrum (slider),
 * this game reveals what someone HAS or HASN'T done — biographical discovery.
 * 
 * Categories (5 questions each):
 * - past_patterns (Q1-5)      - Relationship history, behavioral patterns 🌶️🌶️
 * - secrets_honesty (Q6-10)   - Trust, deception, hidden truths 🌶️🌶️
 * - emotional_depths (Q11-15) - Vulnerability, inner world 🌶️🌶️
 * - physical_intimacy (Q16-20) - Experience, boundaries 🌶️🌶️🌶️
 * - desires_fantasies (Q21-25) - Hidden desires, curiosity 🌶️🌶️🌶️
 * - dark_confessions (Q26-30)  - Shadow side, regrets 🌶️🌶️🌶️
 */

const neverHaveIEverQuestionSchema = new mongoose.Schema(
  {
    // Question number (1-30)
    questionNumber: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
      max: 30
    },

    // Category of the question
    category: {
      type: String,
      required: true,
      enum: [
        'past_patterns',
        'secrets_honesty',
        'emotional_depths',
        'physical_intimacy',
        'desires_fantasies',
        'dark_confessions'
      ]
    },

    // The statement text (without "Never have I ever" prefix)
    statementText: {
      type: String,
      required: true,
      maxlength: 200
    },

    // What this question reveals about the person
    insight: {
      type: String,
      required: true,
      maxlength: 300
    },

    // Spice level (2-3)
    // 2 = Medium 🌶️🌶️
    // 3 = Spicy 🌶️🌶️🌶️
    spiceLevel: {
      type: Number,
      required: true,
      min: 2,
      max: 3,
      default: 2
    },

    // Whether this question is active/enabled
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

// =====================================================
// INDEXES
// =====================================================

neverHaveIEverQuestionSchema.index({ questionNumber: 1 });
neverHaveIEverQuestionSchema.index({ category: 1 });
neverHaveIEverQuestionSchema.index({ spiceLevel: 1 });
neverHaveIEverQuestionSchema.index({ isActive: 1 });

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Get all active questions sorted by question number
 */
neverHaveIEverQuestionSchema.statics.getAllActive = function () {
  return this.find({ isActive: true }).sort({ questionNumber: 1 });
};

/**
 * Get questions by category
 */
neverHaveIEverQuestionSchema.statics.getByCategory = function (category) {
  return this.find({ category, isActive: true }).sort({ questionNumber: 1 });
};

/**
 * Get questions by spice level
 */
neverHaveIEverQuestionSchema.statics.getBySpiceLevel = function (spiceLevel) {
  return this.find({ spiceLevel, isActive: true }).sort({ questionNumber: 1 });
};

/**
 * Get random questions for a game session
 * @param {Number} count - Number of questions to get (default: 30)
 * @returns {Array} Array of question numbers in game order
 */
neverHaveIEverQuestionSchema.statics.getGameQuestions = async function (count = 30) {
  // For this game, we play all 30 in category order (progressive spice)
  // Questions are already numbered 1-30 in progressive order
  const questions = await this.find({ isActive: true })
    .select('questionNumber category')
    .sort({ questionNumber: 1 })
    .limit(count);

  return questions.map(q => q.questionNumber);
};

/**
 * Get category display info
 */
neverHaveIEverQuestionSchema.statics.getCategoryInfo = function () {
  return {
    past_patterns: {
      name: 'Past & Patterns',
      description: 'Relationship history, behavioral patterns',
      emoji: '🔄',
      spiceLevel: 2
    },
    secrets_honesty: {
      name: 'Secrets & Honesty',
      description: 'Trust, deception, hidden truths',
      emoji: '🤫',
      spiceLevel: 2
    },
    emotional_depths: {
      name: 'Emotional Depths',
      description: 'Vulnerability, inner world, attachment',
      emoji: '💔',
      spiceLevel: 2
    },
    physical_intimacy: {
      name: 'Physical & Intimacy',
      description: 'Experience, boundaries, physical compatibility',
      emoji: '🔥',
      spiceLevel: 3
    },
    desires_fantasies: {
      name: 'Desires & Fantasies',
      description: 'Hidden desires, curiosity, unexplored territory',
      emoji: '✨',
      spiceLevel: 3
    },
    dark_confessions: {
      name: 'Dark Confessions',
      description: 'Shadow side, regrets, things not proud of',
      emoji: '🌑',
      spiceLevel: 3
    }
  };
};

// =====================================================
// SEED DATA - 30 QUESTIONS
// =====================================================

/**
 * Get the seed data for all 30 questions
 * Called by the seed script to populate the database
 */
neverHaveIEverQuestionSchema.statics.getSeedData = function () {
  return [
    // =====================================================
    // 🌶️🌶️ CATEGORY 1: PAST & PATTERNS (Q1-5)
    // Relationship history, behavioral patterns
    // =====================================================
    {
      questionNumber: 1,
      category: 'past_patterns',
      statementText: 'cheated on someone',
      insight: 'Reveals loyalty and fidelity patterns',
      spiceLevel: 2
    },
    {
      questionNumber: 2,
      category: 'past_patterns',
      statementText: 'been the other person in someone\'s relationship',
      insight: 'Shows boundaries and moral lines',
      spiceLevel: 2
    },
    {
      questionNumber: 3,
      category: 'past_patterns',
      statementText: 'stayed in a toxic relationship longer than I should have',
      insight: 'Reveals self-worth and red flag recognition',
      spiceLevel: 2
    },
    {
      questionNumber: 4,
      category: 'past_patterns',
      statementText: 'ended a relationship over text or by ghosting',
      insight: 'Shows conflict handling and maturity',
      spiceLevel: 2
    },
    {
      questionNumber: 5,
      category: 'past_patterns',
      statementText: 'gone back to someone who hurt me badly',
      insight: 'Reveals patterns and self-respect',
      spiceLevel: 2
    },

    // =====================================================
    // 🌶️🌶️ CATEGORY 2: SECRETS & HONESTY (Q6-10)
    // Trust patterns, deception, hidden truths
    // =====================================================
    {
      questionNumber: 6,
      category: 'secrets_honesty',
      statementText: 'snooped through a partner\'s phone',
      insight: 'Shows trust issues and insecurity levels',
      spiceLevel: 2
    },
    {
      questionNumber: 7,
      category: 'secrets_honesty',
      statementText: 'hidden something major from someone I was dating',
      insight: 'Reveals honesty patterns in relationships',
      spiceLevel: 2
    },
    {
      questionNumber: 8,
      category: 'secrets_honesty',
      statementText: 'maintained a friendship my partner would be uncomfortable knowing about',
      insight: 'Shows boundaries and transparency',
      spiceLevel: 2
    },
    {
      questionNumber: 9,
      category: 'secrets_honesty',
      statementText: 'lied about my past to someone I was seeing',
      insight: 'Reveals authenticity and acceptance fears',
      spiceLevel: 2
    },
    {
      questionNumber: 10,
      category: 'secrets_honesty',
      statementText: 'kept a dating app active while in a relationship',
      insight: 'Shows commitment readiness',
      spiceLevel: 2
    },

    // =====================================================
    // 🌶️🌶️ CATEGORY 3: EMOTIONAL DEPTHS (Q11-15)
    // Vulnerability, inner world, emotional patterns
    // =====================================================
    {
      questionNumber: 11,
      category: 'emotional_depths',
      statementText: 'said "I love you" without meaning it',
      insight: 'Reveals emotional honesty',
      spiceLevel: 2
    },
    {
      questionNumber: 12,
      category: 'emotional_depths',
      statementText: 'used someone for emotional support without real feelings',
      insight: 'Shows emotional manipulation patterns',
      spiceLevel: 2
    },
    {
      questionNumber: 13,
      category: 'emotional_depths',
      statementText: 'been so attached that I lost myself in a relationship',
      insight: 'Reveals attachment style and codependency',
      spiceLevel: 2
    },
    {
      questionNumber: 14,
      category: 'emotional_depths',
      statementText: 'pushed someone away because I was scared of getting close',
      insight: 'Shows avoidant patterns and emotional walls',
      spiceLevel: 2
    },
    {
      questionNumber: 15,
      category: 'emotional_depths',
      statementText: 'compared my partner to my ex',
      insight: 'Reveals emotional baggage and closure',
      spiceLevel: 2
    },

    // =====================================================
    // 🌶️🌶️🌶️ CATEGORY 4: PHYSICAL & INTIMACY (Q16-20)
    // Experience, boundaries, physical compatibility
    // =====================================================
    {
      questionNumber: 16,
      category: 'physical_intimacy',
      statementText: 'had a one-night stand',
      insight: 'Reveals casual vs emotional intimacy patterns',
      spiceLevel: 3
    },
    {
      questionNumber: 17,
      category: 'physical_intimacy',
      statementText: 'been intimate with someone on the first date',
      insight: 'Shows pace and physical comfort levels',
      spiceLevel: 3
    },
    {
      questionNumber: 18,
      category: 'physical_intimacy',
      statementText: 'regretted being intimate with someone',
      insight: 'Reveals past experiences and standards',
      spiceLevel: 3
    },
    {
      questionNumber: 19,
      category: 'physical_intimacy',
      statementText: 'felt pressured to get physical before I was ready',
      insight: 'Shows boundary experiences and past pressures',
      spiceLevel: 3
    },
    {
      questionNumber: 20,
      category: 'physical_intimacy',
      statementText: 'had a friends-with-benefits situation',
      insight: 'Reveals casual relationship patterns',
      spiceLevel: 3
    },

    // =====================================================
    // 🌶️🌶️🌶️ CATEGORY 5: DESIRES & FANTASIES (Q21-25)
    // Hidden desires, curiosity, unexplored territory
    // =====================================================
    {
      questionNumber: 21,
      category: 'desires_fantasies',
      statementText: 'had a fantasy I\'ve never shared with anyone',
      insight: 'Shows openness and private desires',
      spiceLevel: 3
    },
    {
      questionNumber: 22,
      category: 'desires_fantasies',
      statementText: 'been curious to try something my partner suggested',
      insight: 'Reveals openness to exploration',
      spiceLevel: 3
    },
    {
      questionNumber: 23,
      category: 'desires_fantasies',
      statementText: 'been attracted to someone while in a relationship',
      insight: 'Shows honesty about human nature',
      spiceLevel: 3
    },
    {
      questionNumber: 24,
      category: 'desires_fantasies',
      statementText: 'had a crush on a friend\'s partner or ex',
      insight: 'Reveals forbidden attraction experiences',
      spiceLevel: 3
    },
    {
      questionNumber: 25,
      category: 'desires_fantasies',
      statementText: 'kept a desire to myself because I thought I\'d be judged',
      insight: 'Shows sexual shame and communication barriers',
      spiceLevel: 3
    },

    // =====================================================
    // 🌶️🌶️🌶️ CATEGORY 6: DARK CONFESSIONS (Q26-30)
    // Shadow side, regrets, things not proud of
    // =====================================================
    {
      questionNumber: 26,
      category: 'dark_confessions',
      statementText: 'emotionally manipulated someone to get what I wanted',
      insight: 'Shows self-awareness about toxic behavior',
      spiceLevel: 3
    },
    {
      questionNumber: 27,
      category: 'dark_confessions',
      statementText: 'led someone on knowing I wasn\'t interested',
      insight: 'Reveals empathy and honesty patterns',
      spiceLevel: 3
    },
    {
      questionNumber: 28,
      category: 'dark_confessions',
      statementText: 'said something in anger that I can never take back',
      insight: 'Shows anger patterns and regret capacity',
      spiceLevel: 3
    },
    {
      questionNumber: 29,
      category: 'dark_confessions',
      statementText: 'kept someone as a backup option while pursuing someone else',
      insight: 'Reveals relationship integrity',
      spiceLevel: 3
    },
    {
      questionNumber: 30,
      category: 'dark_confessions',
      statementText: 'done something in a relationship that I\'m not proud of',
      insight: 'Opens conversation about growth and regret',
      spiceLevel: 3
    }
  ];
};

// =====================================================
// CREATE MODEL
// =====================================================

const NeverHaveIEverQuestion = mongoose.model(
  'NeverHaveIEverQuestion',
  neverHaveIEverQuestionSchema
);

module.exports = NeverHaveIEverQuestion;