// src/models/games/IntimacySpectrumQuestion.js

const mongoose = require('mongoose');

/**
 * INTIMACY SPECTRUM QUESTION MODEL
 * 
 * Stores the 30 pre-seeded slider questions for the "Intimacy Spectrum" game.
 * Questions progress from mild to spicy, helping couples assess sexual compatibility.
 * 
 * Unlike binary Would You Rather, these use a 0-100 slider scale with
 * labeled endpoints for nuanced responses.
 * 
 * Categories (5 questions each):
 * - desire_drive (Q1-5)       - Frequency, libido, timing 🔥
 * - initiation_power (Q6-10)  - Who leads, dominance dynamics 🔥
 * - turn_ons (Q11-15)         - What ignites the spark 🔥🔥
 * - communication (Q16-20)    - Dirty talk, sounds, verbal 🔥🔥
 * - fantasy_roleplay (Q21-25) - Scenarios, imagination 🔥🔥🔥
 * - kinks_intensity (Q26-30)  - Specific preferences, boundaries 🔥🔥🔥
 */

const intimacySpectrumQuestionSchema = new mongoose.Schema(
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
        'desire_drive',
        'initiation_power',
        'turn_ons',
        'communication',
        'fantasy_roleplay',
        'kinks_intensity'
      ]
    },

    // The question text
    questionText: {
      type: String,
      required: true,
      maxlength: 200
    },

    // Left end of slider (0)
    leftLabel: {
      type: String,
      required: true,
      maxlength: 100
    },

    // Right end of slider (100)
    rightLabel: {
      type: String,
      required: true,
      maxlength: 100
    },

    // What this question reveals about compatibility
    insight: {
      type: String,
      required: true,
      maxlength: 300
    },

    // Spice level (1-3)
    // 1 = Warming up 🔥
    // 2 = Getting hot 🔥🔥
    // 3 = On fire 🔥🔥🔥
    spiceLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 3,
      default: 1
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

// Fast lookup by question number
intimacySpectrumQuestionSchema.index({ questionNumber: 1 });

// Filter by category
intimacySpectrumQuestionSchema.index({ category: 1 });

// Filter by spice level
intimacySpectrumQuestionSchema.index({ spiceLevel: 1 });

// Get active questions
intimacySpectrumQuestionSchema.index({ isActive: 1 });

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Get all active questions sorted by question number
 * @returns {Promise<Array>} Array of active questions
 */
intimacySpectrumQuestionSchema.statics.getAllActive = function () {
  return this.find({ isActive: true }).sort({ questionNumber: 1 });
};

/**
 * Get questions by category
 * @param {String} category - Category name
 * @returns {Promise<Array>} Array of questions in that category
 */
intimacySpectrumQuestionSchema.statics.getByCategory = function (category) {
  return this.find({ category, isActive: true }).sort({ questionNumber: 1 });
};

/**
 * Get questions by spice level
 * @param {Number} level - Spice level (1, 2, or 3)
 * @returns {Promise<Array>} Array of questions at that spice level
 */
intimacySpectrumQuestionSchema.statics.getBySpiceLevel = function (level) {
  return this.find({ spiceLevel: level, isActive: true }).sort({ questionNumber: 1 });
};

/**
 * Get question by number
 * @param {Number} num - Question number (1-30)
 * @returns {Promise<Object>} Single question
 */
intimacySpectrumQuestionSchema.statics.getByNumber = function (num) {
  return this.findOne({ questionNumber: num, isActive: true });
};

/**
 * Get multiple questions by their numbers
 * @param {Array<Number>} numbers - Array of question numbers
 * @returns {Promise<Array>} Array of questions
 */
intimacySpectrumQuestionSchema.statics.getByNumbers = function (numbers) {
  return this.find({
    questionNumber: { $in: numbers },
    isActive: true
  }).sort({ questionNumber: 1 });
};

/**
 * Get the default question set (all 30 in order for fixed progression)
 * @returns {Promise<Array>} Array of question numbers [1, 2, 3, ..., 30]
 */
intimacySpectrumQuestionSchema.statics.getDefaultQuestionOrder = function () {
  // Fixed order: easy to spicy (Q1-30 in order)
  return Array.from({ length: 30 }, (_, i) => i + 1);
};

/**
 * Get category display info
 * @returns {Object} Category metadata
 */
intimacySpectrumQuestionSchema.statics.getCategoryInfo = function () {
  return {
    desire_drive: {
      name: 'Desire & Drive',
      emoji: '🔥',
      spiceLevel: 1,
      description: 'Frequency, libido, timing'
    },
    initiation_power: {
      name: 'Initiation & Power',
      emoji: '🔥',
      spiceLevel: 1,
      description: 'Who leads, dominance dynamics'
    },
    turn_ons: {
      name: 'Turn-ons & Chemistry',
      emoji: '🔥🔥',
      spiceLevel: 2,
      description: 'What ignites the spark'
    },
    communication: {
      name: 'Communication & Vocal',
      emoji: '🔥🔥',
      spiceLevel: 2,
      description: 'Dirty talk, sounds, verbal expression'
    },
    fantasy_roleplay: {
      name: 'Fantasy & Roleplay',
      emoji: '🔥🔥🔥',
      spiceLevel: 3,
      description: 'Scenarios, imagination, exploration'
    },
    kinks_intensity: {
      name: 'Kinks & Intensity',
      emoji: '🔥🔥🔥',
      spiceLevel: 3,
      description: 'Specific preferences, boundaries'
    }
  };
};

/**
 * Get the seed data for all 30 questions
 * Used by the seeding script
 * @returns {Array} Array of question objects
 */
intimacySpectrumQuestionSchema.statics.getSeedData = function () {
  return [
    // =====================================================
    // 🔥 CATEGORY 1: DESIRE & DRIVE (Q1-5)
    // Warming up - understanding baseline sexual energy
    // =====================================================
    {
      questionNumber: 1,
      category: 'desire_drive',
      questionText: "How often does your ideal sex life look like?",
      leftLabel: "A few times a month is perfect",
      rightLabel: "Multiple times a day if possible",
      insight: "Reveals baseline libido and frequency expectations",
      spiceLevel: 1
    },
    {
      questionNumber: 2,
      category: 'desire_drive',
      questionText: "When do you feel most sexually charged?",
      leftLabel: "Slow morning intimacy",
      rightLabel: "Late night passion",
      insight: "Reveals timing preferences for intimacy",
      spiceLevel: 1
    },
    {
      questionNumber: 3,
      category: 'desire_drive',
      questionText: "How strong is your sex drive typically?",
      leftLabel: "I can take it or leave it",
      rightLabel: "It's constantly on my mind",
      insight: "Reveals overall sexual appetite and priority",
      spiceLevel: 1
    },
    {
      questionNumber: 4,
      category: 'desire_drive',
      questionText: "Quickies vs marathon sessions?",
      leftLabel: "Love a fast, intense quickie",
      rightLabel: "Hours of building pleasure",
      insight: "Reveals preferred duration and pacing",
      spiceLevel: 1
    },
    {
      questionNumber: 5,
      category: 'desire_drive',
      questionText: "When stressed, does sex help you?",
      leftLabel: "I need space, not sex",
      rightLabel: "Best stress relief there is",
      insight: "Reveals role of sex in emotional regulation",
      spiceLevel: 1
    },

    // =====================================================
    // 🔥 CATEGORY 2: INITIATION & POWER (Q6-10)
    // Who takes charge, dominance dynamics
    // =====================================================
    {
      questionNumber: 6,
      category: 'initiation_power',
      questionText: "Who should initiate sex more often?",
      leftLabel: "I want to be pursued and seduced",
      rightLabel: "I love being the one to start it",
      insight: "Reveals initiation preferences and pursuit dynamics",
      spiceLevel: 1
    },
    {
      questionNumber: 7,
      category: 'initiation_power',
      questionText: "In the bedroom, do you prefer to lead or follow?",
      leftLabel: "I want them to take control",
      rightLabel: "I want to be in charge",
      insight: "Reveals dominant vs submissive tendencies",
      spiceLevel: 1
    },
    {
      questionNumber: 8,
      category: 'initiation_power',
      questionText: "How do you feel about being 'used' for your partner's pleasure?",
      leftLabel: "Not into that dynamic",
      rightLabel: "Huge turn-on for me",
      insight: "Reveals comfort with objectification play",
      spiceLevel: 1
    },
    {
      questionNumber: 9,
      category: 'initiation_power',
      questionText: "Power play and dominance/submission dynamics?",
      leftLabel: "Keep it equal and vanilla",
      rightLabel: "Love exploring power exchange",
      insight: "Reveals interest in D/s dynamics",
      spiceLevel: 1
    },
    {
      questionNumber: 10,
      category: 'initiation_power',
      questionText: "Being pinned down, held, or physically controlled?",
      leftLabel: "Too intense for me",
      rightLabel: "Yes please",
      insight: "Reveals comfort with physical restraint",
      spiceLevel: 1
    },

    // =====================================================
    // 🔥🔥 CATEGORY 3: TURN-ONS & CHEMISTRY (Q11-15)
    // What ignites the spark
    // =====================================================
    {
      questionNumber: 11,
      category: 'turn_ons',
      questionText: "How important is foreplay to you?",
      leftLabel: "Can skip straight to the main event",
      rightLabel: "Extended foreplay is essential",
      insight: "Reveals foreplay needs and buildup preferences",
      spiceLevel: 2
    },
    {
      questionNumber: 12,
      category: 'turn_ons',
      questionText: "Teasing and denial - being made to wait?",
      leftLabel: "Don't make me wait",
      rightLabel: "The anticipation drives me wild",
      insight: "Reveals edging and denial preferences",
      spiceLevel: 2
    },
    {
      questionNumber: 13,
      category: 'turn_ons',
      questionText: "How much does your partner's scent and taste turn you on?",
      leftLabel: "Not something I focus on",
      rightLabel: "Intoxicating - huge part of attraction",
      insight: "Reveals sensory and primal attraction factors",
      spiceLevel: 2
    },
    {
      questionNumber: 14,
      category: 'turn_ons',
      questionText: "Sexting and building tension throughout the day?",
      leftLabel: "Prefer to keep it in person",
      rightLabel: "Love staying heated all day",
      insight: "Reveals digital intimacy and anticipation building",
      spiceLevel: 2
    },
    {
      questionNumber: 15,
      category: 'turn_ons',
      questionText: "How turned on are you by your partner finishing?",
      leftLabel: "Nice but not a focus",
      rightLabel: "Their pleasure is my biggest turn-on",
      insight: "Reveals partner-pleasure orientation",
      spiceLevel: 2
    },

    // =====================================================
    // 🔥🔥 CATEGORY 4: COMMUNICATION & VOCAL (Q16-20)
    // Dirty talk, sounds, verbal expression
    // =====================================================
    {
      questionNumber: 16,
      category: 'communication',
      questionText: "How vocal are you during sex?",
      leftLabel: "Quiet and subtle",
      rightLabel: "Loud and expressive",
      insight: "Reveals vocal expression during intimacy",
      spiceLevel: 2
    },
    {
      questionNumber: 17,
      category: 'communication',
      questionText: "Dirty talk during sex?",
      leftLabel: "Prefer silence or soft words",
      rightLabel: "The filthier the better",
      insight: "Reveals dirty talk preferences and comfort",
      spiceLevel: 2
    },
    {
      questionNumber: 18,
      category: 'communication',
      questionText: "Being told exactly what to do in bed?",
      leftLabel: "I like to figure it out naturally",
      rightLabel: "Command me - it's so hot",
      insight: "Reveals receptiveness to sexual instruction",
      spiceLevel: 2
    },
    {
      questionNumber: 19,
      category: 'communication',
      questionText: "Verbal degradation or praise during sex?",
      leftLabel: "Only sweet and romantic words",
      rightLabel: "Call me names - I love it",
      insight: "Reveals praise vs degradation preferences",
      spiceLevel: 2
    },
    {
      questionNumber: 20,
      category: 'communication',
      questionText: "Talking about sex openly outside the bedroom?",
      leftLabel: "Awkward - I avoid it",
      rightLabel: "Love detailed discussions about desires",
      insight: "Reveals sexual communication comfort",
      spiceLevel: 2
    },

    // =====================================================
    // 🔥🔥🔥 CATEGORY 5: FANTASY & ROLEPLAY (Q21-25)
    // Scenarios, imagination, exploration
    // =====================================================
    {
      questionNumber: 21,
      category: 'fantasy_roleplay',
      questionText: "How active is your sexual imagination and fantasy life?",
      leftLabel: "Pretty straightforward desires",
      rightLabel: "Constantly having elaborate fantasies",
      insight: "Reveals fantasy richness and imagination",
      spiceLevel: 3
    },
    {
      questionNumber: 22,
      category: 'fantasy_roleplay',
      questionText: "Roleplay scenarios (strangers meeting, boss/employee, etc.)?",
      leftLabel: "Too awkward for me",
      rightLabel: "Love becoming different characters",
      insight: "Reveals roleplay interest and creativity",
      spiceLevel: 3
    },
    {
      questionNumber: 23,
      category: 'fantasy_roleplay',
      questionText: "Watching or being watched (voyeurism/exhibitionism)?",
      leftLabel: "Strictly private always",
      rightLabel: "The idea really excites me",
      insight: "Reveals exhibitionist/voyeur tendencies",
      spiceLevel: 3
    },
    {
      questionNumber: 24,
      category: 'fantasy_roleplay',
      questionText: "Bringing a third person into the bedroom?",
      leftLabel: "Absolutely not for me",
      rightLabel: "Open to exploring that",
      insight: "Reveals openness to non-monogamous play",
      spiceLevel: 3
    },
    {
      questionNumber: 25,
      category: 'fantasy_roleplay',
      questionText: "Making intimate videos or photos together?",
      leftLabel: "Never - too risky",
      rightLabel: "Hot - with the right trust",
      insight: "Reveals comfort with intimate content creation",
      spiceLevel: 3
    },

    // =====================================================
    // 🔥🔥🔥 CATEGORY 6: KINKS & INTENSITY (Q26-30)
    // Specific preferences, boundaries
    // =====================================================
    {
      questionNumber: 26,
      category: 'kinks_intensity',
      questionText: "How do you feel about incorporating toys?",
      leftLabel: "Don't need them at all",
      rightLabel: "The more the better",
      insight: "Reveals openness to sex toys",
      spiceLevel: 3
    },
    {
      questionNumber: 27,
      category: 'kinks_intensity',
      questionText: "Light pain play (biting, scratching, spanking)?",
      leftLabel: "Keep it gentle always",
      rightLabel: "Leave marks on me",
      insight: "Reveals pain/pleasure threshold",
      spiceLevel: 3
    },
    {
      questionNumber: 28,
      category: 'kinks_intensity',
      questionText: "Bondage and restraints?",
      leftLabel: "Not my thing at all",
      rightLabel: "Tie me up or let me tie you",
      insight: "Reveals bondage interest",
      spiceLevel: 3
    },
    {
      questionNumber: 29,
      category: 'kinks_intensity',
      questionText: "How adventurous are you with locations?",
      leftLabel: "Bedroom only please",
      rightLabel: "Anywhere we might get caught",
      insight: "Reveals location adventurousness and exhibitionism",
      spiceLevel: 3
    },
    {
      questionNumber: 30,
      category: 'kinks_intensity',
      questionText: "Overall, how kinky do you consider yourself?",
      leftLabel: "Vanilla and loving it",
      rightLabel: "The kinkier the better",
      insight: "Reveals overall kink identity and openness",
      spiceLevel: 3
    }
  ];
};

const IntimacySpectrumQuestion = mongoose.model(
  'IntimacySpectrumQuestion',
  intimacySpectrumQuestionSchema
);

module.exports = IntimacySpectrumQuestion;