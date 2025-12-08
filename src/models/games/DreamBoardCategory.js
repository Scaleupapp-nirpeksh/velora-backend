// src/models/games/DreamBoardCategory.js

const mongoose = require('mongoose');

/**
 * DREAM BOARD - CATEGORY MODEL
 * 
 * 10 life categories, each with 4 vision cards.
 * Players pick one card per category + priority + timeline.
 * 
 * Categories:
 * - our_home: Where we live
 * - our_family: Kids & family size
 * - our_careers: Work-life balance
 * - our_money: Financial philosophy
 * - our_weekends: Social & recharge style
 * - our_adventures: Travel & exploration
 * - our_roots: Family involvement
 * - our_intimacy: Physical connection
 * - our_growth: Personal development
 * - our_someday: Long-term dreams
 */

// =====================================================
// CARD SUB-SCHEMA
// =====================================================

const cardSchema = new mongoose.Schema({
  cardId: {
    type: String,
    required: true,
    enum: ['A', 'B', 'C', 'D']
  },
  emoji: {
    type: String,
    required: true
  },
  title: {
    type: String,
    required: true,
    maxlength: 50
  },
  subtitle: {
    type: String,
    required: true,
    maxlength: 100
  }
}, { _id: false });

// =====================================================
// MAIN CATEGORY SCHEMA
// =====================================================

const dreamBoardCategorySchema = new mongoose.Schema({
  categoryNumber: {
    type: Number,
    required: true,
    unique: true,
    min: 1,
    max: 10
  },

  categoryId: {
    type: String,
    required: true,
    unique: true,
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

  emoji: {
    type: String,
    required: true
  },

  title: {
    type: String,
    required: true,
    maxlength: 50
  },

  question: {
    type: String,
    required: true,
    maxlength: 200
  },

  // What this category reveals about compatibility
  insight: {
    type: String,
    required: true,
    maxlength: 300
  },

  // The 4 vision cards for this category
  cards: {
    type: [cardSchema],
    required: true,
    validate: {
      validator: function(v) {
        return v.length === 4;
      },
      message: 'Each category must have exactly 4 cards'
    }
  },

  // For AI analysis - key themes to compare
  analysisHints: [{
    type: String
  }],

  isActive: {
    type: Boolean,
    default: true
  }

}, {
  timestamps: true
});

// =====================================================
// INDEXES
// =====================================================

dreamBoardCategorySchema.index({ categoryNumber: 1 });
dreamBoardCategorySchema.index({ categoryId: 1 });
dreamBoardCategorySchema.index({ isActive: 1 });

// =====================================================
// STATIC METHODS
// =====================================================

/**
 * Get all active categories sorted by number
 */
dreamBoardCategorySchema.statics.getAllCategories = function() {
  return this.find({ isActive: true })
    .sort({ categoryNumber: 1 })
    .lean();
};

/**
 * Get a specific category by number
 */
dreamBoardCategorySchema.statics.getByNumber = function(categoryNumber) {
  return this.findOne({ 
    categoryNumber, 
    isActive: true 
  }).lean();
};

/**
 * Get a specific category by ID
 */
dreamBoardCategorySchema.statics.getByCategoryId = function(categoryId) {
  return this.findOne({ 
    categoryId, 
    isActive: true 
  }).lean();
};

/**
 * Get category info (for display)
 */
dreamBoardCategorySchema.statics.getCategoryInfo = function() {
  return {
    our_home: {
      name: 'Our Home',
      emoji: '🏠',
      description: 'Where we build our life together',
      color: '#4CAF50'
    },
    our_family: {
      name: 'Our Family',
      emoji: '👨‍👩‍👧‍👦',
      description: 'Kids and family size dreams',
      color: '#E91E63'
    },
    our_careers: {
      name: 'Our Careers',
      emoji: '💼',
      description: 'Work-life balance and ambitions',
      color: '#2196F3'
    },
    our_money: {
      name: 'Our Money',
      emoji: '💰',
      description: 'Financial philosophy and goals',
      color: '#FF9800'
    },
    our_weekends: {
      name: 'Our Weekends',
      emoji: '🛋️',
      description: 'How we recharge together',
      color: '#9C27B0'
    },
    our_adventures: {
      name: 'Our Adventures',
      emoji: '✈️',
      description: 'Travel and exploration dreams',
      color: '#00BCD4'
    },
    our_roots: {
      name: 'Our Roots',
      emoji: '👪',
      description: 'Family involvement and traditions',
      color: '#795548'
    },
    our_intimacy: {
      name: 'Our Intimacy',
      emoji: '🔥',
      description: 'Physical and emotional connection',
      color: '#F44336'
    },
    our_growth: {
      name: 'Our Growth',
      emoji: '🌱',
      description: 'Personal development together',
      color: '#8BC34A'
    },
    our_someday: {
      name: 'Our Someday',
      emoji: '🌅',
      description: 'Long-term dreams and legacy',
      color: '#FF5722'
    }
  };
};

/**
 * Get priority bucket info
 */
dreamBoardCategorySchema.statics.getPriorityInfo = function() {
  return {
    heart_set: {
      label: 'My heart is set',
      emoji: '❤️',
      description: 'Non-negotiable, this is essential',
      weight: 3
    },
    dream: {
      label: 'I dream of this',
      emoji: '✨',
      description: 'Want this, but can discuss',
      weight: 2
    },
    flow: {
      label: "I'll flow with life",
      emoji: '🌊',
      description: "Flexible, open to partner's vision",
      weight: 1
    }
  };
};

/**
 * Get timeline info
 */
dreamBoardCategorySchema.statics.getTimelineInfo = function() {
  return {
    cant_wait: {
      label: "Can't wait",
      emoji: '🔥',
      description: '1-2 years',
      years: '1-2'
    },
    when_right: {
      label: 'When it feels right',
      emoji: '🌸',
      description: '3-5 years',
      years: '3-5'
    },
    someday: {
      label: 'Someday',
      emoji: '🌙',
      description: '5+ years / No rush',
      years: '5+'
    }
  };
};

module.exports = mongoose.model('DreamBoardCategory', dreamBoardCategorySchema);