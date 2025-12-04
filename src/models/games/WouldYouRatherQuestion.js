// src/models/games/WouldYouRatherQuestion.js

const mongoose = require('mongoose');

/**
 * WOULD YOU RATHER QUESTION MODEL
 * 
 * Stores the 50 pre-seeded questions for the "Would You Rather" game.
 * Questions are categorized across different life areas to test
 * compatibility between matched couples.
 * 
 * Categories:
 * - lifestyle (6 questions) - Daily habits, routines
 * - money (5 questions) - Financial values, career
 * - family (6 questions) - Family dynamics, children
 * - love (5 questions) - Romance, affection style
 * - intimacy (5 questions) - Physical connection 🌶️
 * - conflict (4 questions) - Communication, fights
 * - travel (4 questions) - Adventure, exploration
 * - philosophy (5 questions) - Values, worldview
 * - friendship (4 questions) - Social preferences
 * - hobbies (3 questions) - Leisure, fun
 * - future (3 questions) - Life goals, ambitions
 */

const wouldYouRatherQuestionSchema = new mongoose.Schema(
  {
    // Question number (1-50)
    questionNumber: {
      type: Number,
      required: true,
      unique: true,
      min: 1,
      max: 50
    },

    // Category of the question
    category: {
      type: String,
      required: true,
      enum: [
        'lifestyle',
        'money',
        'family',
        'love',
        'intimacy',
        'conflict',
        'travel',
        'philosophy',
        'friendship',
        'hobbies',
        'future'
      ]
    },

    // Option A text
    optionA: {
      type: String,
      required: true,
      maxlength: 200
    },

    // Option B text
    optionB: {
      type: String,
      required: true,
      maxlength: 200
    },

    // Insight for AI analysis - what this question reveals
    insight: {
      type: String,
      required: true,
      maxlength: 300
    },

    // Spice level (1-5) - how provocative/intimate the question is
    // 1 = Very tame, 5 = Very spicy 🌶️
    spiceLevel: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
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
wouldYouRatherQuestionSchema.index({ questionNumber: 1 });

// Filter by category
wouldYouRatherQuestionSchema.index({ category: 1 });

// Get active questions
wouldYouRatherQuestionSchema.index({ isActive: 1 });

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Get all active questions
 * @returns {Promise<Array>} Array of active questions
 */
wouldYouRatherQuestionSchema.statics.getAllActive = function () {
  return this.find({ isActive: true }).sort({ questionNumber: 1 });
};

/**
 * Get questions by category
 * @param {String} category - Category name
 * @returns {Promise<Array>} Array of questions in category
 */
wouldYouRatherQuestionSchema.statics.getByCategory = function (category) {
  return this.find({ category, isActive: true }).sort({ questionNumber: 1 });
};

/**
 * Get randomized question order for a game session
 * @returns {Promise<Array>} Array of question numbers in random order
 */
wouldYouRatherQuestionSchema.statics.getRandomizedOrder = async function () {
  const questions = await this.find({ isActive: true }).select('questionNumber');
  const numbers = questions.map(q => q.questionNumber);
  
  // Fisher-Yates shuffle
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  
  return numbers;
};

/**
 * Seed the database with all 50 questions
 * @returns {Promise<Object>} Result of seeding operation
 */
wouldYouRatherQuestionSchema.statics.seedQuestions = async function () {
  const questions = getWouldYouRatherQuestions();
  
  let created = 0;
  let updated = 0;
  let errors = 0;

  for (const question of questions) {
    try {
      const existing = await this.findOne({ questionNumber: question.questionNumber });
      
      if (existing) {
        // Update existing question
        await this.updateOne(
          { questionNumber: question.questionNumber },
          { $set: question }
        );
        updated++;
      } else {
        // Create new question
        await this.create(question);
        created++;
      }
    } catch (error) {
      console.error(`Error seeding question ${question.questionNumber}:`, error.message);
      errors++;
    }
  }

  return {
    total: questions.length,
    created,
    updated,
    errors
  };
};

// =====================================================
// THE 50 QUESTIONS
// =====================================================

function getWouldYouRatherQuestions() {
  return [
    // =========================================
    // LIFESTYLE & DAILY LIFE (6 questions)
    // =========================================
    {
      questionNumber: 1,
      category: 'lifestyle',
      optionA: 'Be a morning person forever',
      optionB: 'Be a night owl forever',
      insight: 'Reveals daily rhythm and schedule compatibility',
      spiceLevel: 1
    },
    {
      questionNumber: 2,
      category: 'lifestyle',
      optionA: 'Cook every meal at home',
      optionB: 'Eat out or order in for every meal',
      insight: 'Reveals domestic preferences and food habits',
      spiceLevel: 1
    },
    {
      questionNumber: 3,
      category: 'lifestyle',
      optionA: 'Live in a messy home with relaxed vibes',
      optionB: 'Live in a spotless home with strict cleaning rules',
      insight: 'Reveals cleanliness standards and flexibility',
      spiceLevel: 1
    },
    {
      questionNumber: 4,
      category: 'lifestyle',
      optionA: 'Follow a strict daily routine',
      optionB: 'Go with the flow and be spontaneous',
      insight: 'Reveals need for structure vs flexibility',
      spiceLevel: 1
    },
    {
      questionNumber: 5,
      category: 'lifestyle',
      optionA: 'Work from home forever',
      optionB: 'Work from office forever',
      insight: 'Reveals work style and space preferences',
      spiceLevel: 1
    },
    {
      questionNumber: 6,
      category: 'lifestyle',
      optionA: 'Live in a big city apartment',
      optionB: 'Live in a peaceful countryside house',
      insight: 'Reveals environment and pace of life preferences',
      spiceLevel: 1
    },

    // =========================================
    // MONEY & CAREER (5 questions)
    // =========================================
    {
      questionNumber: 7,
      category: 'money',
      optionA: 'Retire at 40 with modest savings',
      optionB: 'Retire at 60 with luxury savings',
      insight: 'Reveals financial planning and life priorities',
      spiceLevel: 1
    },
    {
      questionNumber: 8,
      category: 'money',
      optionA: 'Have a high-paying job you dislike',
      optionB: 'Have a low-paying job you absolutely love',
      insight: 'Reveals values around money vs fulfillment',
      spiceLevel: 1
    },
    {
      questionNumber: 9,
      category: 'money',
      optionA: 'Spend money on experiences (travel, dining)',
      optionB: 'Spend money on things (gadgets, clothes, home)',
      insight: 'Reveals spending philosophy and what brings joy',
      spiceLevel: 1
    },
    {
      questionNumber: 10,
      category: 'money',
      optionA: 'Split all finances 50/50 in marriage',
      optionB: 'Pool everything together in a joint account',
      insight: 'Reveals financial trust and partnership style',
      spiceLevel: 2
    },
    {
      questionNumber: 11,
      category: 'money',
      optionA: 'Take big financial risks for potential big rewards',
      optionB: 'Always play it safe with money',
      insight: 'Reveals risk tolerance and financial security needs',
      spiceLevel: 1
    },

    // =========================================
    // FAMILY & RELATIONSHIPS (6 questions)
    // =========================================
    {
      questionNumber: 12,
      category: 'family',
      optionA: 'Live close to family (same city)',
      optionB: 'Live far from family (different city/country)',
      insight: 'Reveals family attachment and independence',
      spiceLevel: 2
    },
    {
      questionNumber: 13,
      category: 'family',
      optionA: 'Have 1 child and give them everything',
      optionB: 'Have 3+ children with a full house',
      insight: 'Reveals family size preferences and parenting approach',
      spiceLevel: 2
    },
    {
      questionNumber: 14,
      category: 'family',
      optionA: 'Spend every festival/holiday with extended family',
      optionB: 'Create your own traditions as a couple',
      insight: 'Reveals family involvement vs couple independence',
      spiceLevel: 2
    },
    {
      questionNumber: 15,
      category: 'family',
      optionA: 'Have a partner who is very close to their parents',
      optionB: 'Have a partner who is independent from their parents',
      insight: 'Reveals expectations about in-law relationships',
      spiceLevel: 2
    },
    {
      questionNumber: 16,
      category: 'family',
      optionA: 'Raise kids with clear rules and discipline',
      optionB: 'Raise kids with freedom and let them learn naturally',
      insight: 'Reveals parenting philosophy and values',
      spiceLevel: 2
    },
    {
      questionNumber: 17,
      category: 'family',
      optionA: 'Be the fun, adventurous parent',
      optionB: 'Be the responsible, stable parent',
      insight: 'Reveals parenting role preferences',
      spiceLevel: 1
    },

    // =========================================
    // LOVE & ROMANCE (5 questions)
    // =========================================
    {
      questionNumber: 18,
      category: 'love',
      optionA: 'Receive small surprise gifts frequently',
      optionB: 'Receive one big planned gift on special occasions',
      insight: 'Reveals love language and appreciation style',
      spiceLevel: 1
    },
    {
      questionNumber: 19,
      category: 'love',
      optionA: 'Constant small affection (texts, touches, check-ins)',
      optionB: 'Occasional grand romantic gestures',
      insight: 'Reveals affection frequency preferences',
      spiceLevel: 2
    },
    {
      questionNumber: 20,
      category: 'love',
      optionA: 'Hear "I love you" said out loud every day',
      optionB: 'Feel loved through actions without the words',
      insight: 'Reveals verbal vs action-based love expression',
      spiceLevel: 2
    },
    {
      questionNumber: 21,
      category: 'love',
      optionA: 'Always know exactly what your partner is thinking',
      optionB: 'Keep some mystery and surprise alive',
      insight: 'Reveals need for transparency vs excitement',
      spiceLevel: 2
    },
    {
      questionNumber: 22,
      category: 'love',
      optionA: 'Never argue but sometimes feel emotionally distant',
      optionB: 'Argue often but always feel deeply connected',
      insight: 'Reveals conflict tolerance and emotional intimacy needs',
      spiceLevel: 2
    },

    // =========================================
    // INTIMACY & SPICE 🌶️ (5 questions)
    // =========================================
    {
      questionNumber: 23,
      category: 'intimacy',
      optionA: 'Slow, planned romantic evenings',
      optionB: 'Spontaneous passionate moments anytime',
      insight: 'Reveals intimacy style and spontaneity preferences',
      spiceLevel: 4
    },
    {
      questionNumber: 24,
      category: 'intimacy',
      optionA: 'Usually initiate intimacy yourself',
      optionB: 'Usually be pursued and desired',
      insight: 'Reveals intimacy dynamics and role preferences',
      spiceLevel: 4
    },
    {
      questionNumber: 25,
      category: 'intimacy',
      optionA: 'Try new things and experiment frequently',
      optionB: 'Perfect and deepen what you already know works',
      insight: 'Reveals openness to exploration vs comfort zone',
      spiceLevel: 5
    },
    {
      questionNumber: 26,
      category: 'intimacy',
      optionA: 'Talk openly and explicitly about desires',
      optionB: 'Let actions and body language speak instead',
      insight: 'Reveals communication style around intimacy',
      spiceLevel: 4
    },
    {
      questionNumber: 27,
      category: 'intimacy',
      optionA: 'Emotional connection must come before physical',
      optionB: 'Physical attraction can spark emotional connection',
      insight: 'Reveals intimacy sequencing and what builds connection',
      spiceLevel: 3
    },

    // =========================================
    // CONFLICT & COMMUNICATION (4 questions)
    // =========================================
    {
      questionNumber: 28,
      category: 'conflict',
      optionA: 'Address issues and conflicts immediately',
      optionB: 'Take time to cool off before discussing',
      insight: 'Reveals conflict resolution timing preferences',
      spiceLevel: 2
    },
    {
      questionNumber: 29,
      category: 'conflict',
      optionA: 'Always speak your mind, even if it hurts',
      optionB: 'Sometimes stay quiet to keep the peace',
      insight: 'Reveals honesty vs harmony preferences',
      spiceLevel: 2
    },
    {
      questionNumber: 30,
      category: 'conflict',
      optionA: 'Fight passionately and resolve quickly',
      optionB: 'Stay calm but take longer to fully resolve',
      insight: 'Reveals emotional expression during conflict',
      spiceLevel: 2
    },
    {
      questionNumber: 31,
      category: 'conflict',
      optionA: 'Forgive AND forget completely',
      optionB: 'Forgive but never fully forget',
      insight: 'Reveals forgiveness style and memory of hurts',
      spiceLevel: 2
    },

    // =========================================
    // TRAVEL & ADVENTURE (4 questions)
    // =========================================
    {
      questionNumber: 32,
      category: 'travel',
      optionA: 'Travel to 30 new countries in your lifetime',
      optionB: 'Revisit 5 favorite places over and over',
      insight: 'Reveals exploration vs familiarity preferences',
      spiceLevel: 1
    },
    {
      questionNumber: 33,
      category: 'travel',
      optionA: 'Plan every detail of a trip in advance',
      optionB: 'Book a flight and figure it out when you land',
      insight: 'Reveals planning style and comfort with uncertainty',
      spiceLevel: 1
    },
    {
      questionNumber: 34,
      category: 'travel',
      optionA: 'Adventure travel (trekking, backpacking, camping)',
      optionB: 'Luxury travel (resorts, spas, fine dining)',
      insight: 'Reveals travel style and comfort needs',
      spiceLevel: 1
    },
    {
      questionNumber: 35,
      category: 'travel',
      optionA: 'Take a solo trip once a year for yourself',
      optionB: 'Never travel without your partner',
      insight: 'Reveals independence needs and togetherness',
      spiceLevel: 2
    },

    // =========================================
    // PHILOSOPHY & VALUES (5 questions)
    // =========================================
    {
      questionNumber: 36,
      category: 'philosophy',
      optionA: 'Know exactly how you will die',
      optionB: 'Know exactly when you will die',
      insight: 'Reveals relationship with mortality and control',
      spiceLevel: 2
    },
    {
      questionNumber: 37,
      category: 'philosophy',
      optionA: 'Be widely respected but not deeply loved',
      optionB: 'Be deeply loved by few but not widely known',
      insight: 'Reveals what matters more - status or connection',
      spiceLevel: 2
    },
    {
      questionNumber: 38,
      category: 'philosophy',
      optionA: 'Have all the money but no free time',
      optionB: 'Have all the free time but limited money',
      insight: 'Reveals values around wealth vs freedom',
      spiceLevel: 1
    },
    {
      questionNumber: 39,
      category: 'philosophy',
      optionA: 'Always tell the complete truth, no matter what',
      optionB: 'Tell white lies when it protects someone',
      insight: 'Reveals honesty philosophy and situational ethics',
      spiceLevel: 2
    },
    {
      questionNumber: 40,
      category: 'philosophy',
      optionA: 'Live a short life full of adventure and excitement',
      optionB: 'Live a long life that is peaceful and stable',
      insight: 'Reveals life philosophy and risk orientation',
      spiceLevel: 2
    },

    // =========================================
    // FRIENDSHIP & SOCIAL (4 questions)
    // =========================================
    {
      questionNumber: 41,
      category: 'friendship',
      optionA: 'Have 2-3 extremely close best friends',
      optionB: 'Have a large circle of good friends',
      insight: 'Reveals social depth vs breadth preferences',
      spiceLevel: 1
    },
    {
      questionNumber: 42,
      category: 'friendship',
      optionA: 'Go out and party every weekend',
      optionB: 'Stay in with cozy quiet nights',
      insight: 'Reveals social energy and weekend preferences',
      spiceLevel: 1
    },
    {
      questionNumber: 43,
      category: 'friendship',
      optionA: 'Your partner has mostly same-gender friendships',
      optionB: 'Your partner has close opposite-gender friendships',
      insight: 'Reveals trust and boundaries around friendships',
      spiceLevel: 3
    },
    {
      questionNumber: 44,
      category: 'friendship',
      optionA: 'Always be the one hosting gatherings',
      optionB: 'Always be the guest at others\' places',
      insight: 'Reveals social role and hospitality preferences',
      spiceLevel: 1
    },

    // =========================================
    // HOBBIES & FUN (3 questions)
    // =========================================
    {
      questionNumber: 45,
      category: 'hobbies',
      optionA: 'Binge an entire TV series together',
      optionB: 'Watch different movies together',
      insight: 'Reveals entertainment commitment style',
      spiceLevel: 1
    },
    {
      questionNumber: 46,
      category: 'hobbies',
      optionA: 'Play video games together on date night',
      optionB: 'Play board games or cards together',
      insight: 'Reveals gaming and interactive play preferences',
      spiceLevel: 1
    },
    {
      questionNumber: 47,
      category: 'hobbies',
      optionA: 'Learn a new skill/hobby together as a couple',
      optionB: 'Have completely separate individual hobbies',
      insight: 'Reveals togetherness in interests vs independence',
      spiceLevel: 1
    },

    // =========================================
    // FUTURE & LIFE GOALS (3 questions)
    // =========================================
    {
      questionNumber: 48,
      category: 'future',
      optionA: 'Build your own business/startup',
      optionB: 'Climb the corporate ladder to the top',
      insight: 'Reveals entrepreneurial spirit vs stability preference',
      spiceLevel: 1
    },
    {
      questionNumber: 49,
      category: 'future',
      optionA: 'Be famous and always in the spotlight',
      optionB: 'Be anonymous and live peacefully',
      insight: 'Reveals relationship with fame and privacy',
      spiceLevel: 1
    },
    {
      questionNumber: 50,
      category: 'future',
      optionA: 'Leave a legacy through your career/work',
      optionB: 'Leave a legacy through your family/children',
      insight: 'Reveals what matters most for long-term meaning',
      spiceLevel: 2
    }
  ];
}

// =====================================================
// CREATE MODEL
// =====================================================

const WouldYouRatherQuestion = mongoose.model(
  'WouldYouRatherQuestion',
  wouldYouRatherQuestionSchema
);

module.exports = WouldYouRatherQuestion;