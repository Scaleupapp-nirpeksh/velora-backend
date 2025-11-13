const mongoose = require('mongoose');

/**
 * QUESTION MODEL
 * 
 * Stores the 50 questions that power the compatibility matching system.
 * Questions are categorized by 6 dimensions and unlock progressively over 8 days.
 * 
 * Features:
 * - Support for text, single choice, and multiple choice questions
 * - Optional follow-up questions
 * - Progressive unlock tracking (day 1-8)
 * - Weight for matching algorithm importance
 * - Character limits for text answers
 */

const questionSchema = new mongoose.Schema(
  {
    // Question identification
    questionNumber: {
      type: Number,
      required: [true, 'Question number is required'],
      unique: true,
      min: [1, 'Question number must be between 1 and 50'],
      max: [50, 'Question number must be between 1 and 50'],
      index: true // Fast lookup by question number
    },

    // Dimension categorization
    dimension: {
      type: String,
      required: [true, 'Dimension is required'],
      enum: {
        values: [
          'emotional_intimacy',
          'life_vision',
          'conflict_communication',
          'love_languages',
          'physical_sexual',
          'lifestyle'
        ],
        message: '{VALUE} is not a valid dimension'
      },
      index: true // Enable querying by dimension
    },

    // Main question content
    questionText: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
      minlength: [10, 'Question text must be at least 10 characters'],
      maxlength: [1000, 'Question text cannot exceed 1000 characters']
    },

    // Question type
    questionType: {
      type: String,
      required: [true, 'Question type is required'],
      enum: {
        values: ['text', 'single_choice', 'multiple_choice'],
        message: '{VALUE} is not a valid question type'
      }
    },

    // Options for choice-based questions (A, B, C, D, E, etc.)
    options: [
      {
        key: {
          type: String,
          required: true,
          trim: true,
          uppercase: true,
          match: [/^[A-Z]$/, 'Option key must be a single uppercase letter']
        },
        text: {
          type: String,
          required: true,
          trim: true,
          minlength: [1, 'Option text cannot be empty'],
          maxlength: [500, 'Option text cannot exceed 500 characters']
        },
        _id: false // Don't create _id for subdocuments
      }
    ],

    // Follow-up question (optional)
    followUpQuestion: {
      type: String,
      trim: true,
      maxlength: [1000, 'Follow-up question cannot exceed 1000 characters'],
      default: null
    },

    // Follow-up options (if follow-up is a choice question)
    followUpOptions: [
      {
        key: {
          type: String,
          required: true,
          trim: true,
          uppercase: true,
          match: [/^[A-Z]$/, 'Option key must be a single uppercase letter']
        },
        text: {
          type: String,
          required: true,
          trim: true,
          minlength: [1, 'Option text cannot be empty'],
          maxlength: [500, 'Option text cannot exceed 500 characters']
        },
        _id: false
      }
    ],

    // Character limit for text answers
    characterLimit: {
      type: Number,
      default: 200,
      min: [20, 'Character limit must be at least 20'],
      max: [500, 'Character limit cannot exceed 500']
    },

    // Is this a core question? (First 15 questions shown on Day 1)
    isCore: {
      type: Boolean,
      default: false,
      index: true
    },

    // Which day does this question unlock? (1-8)
    dayUnlocked: {
      type: Number,
      required: [true, 'Day unlocked is required'],
      min: [1, 'Day unlocked must be between 1 and 8'],
      max: [8, 'Day unlocked must be between 1 and 8'],
      index: true // Enable querying by unlock day
    },

    // Importance weight for matching algorithm (1-10)
    weight: {
      type: Number,
      default: 5,
      min: [1, 'Weight must be between 1 and 10'],
      max: [10, 'Weight must be between 1 and 10']
    },

    // Metadata
    isActive: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    collection: 'questions'
  }
);

// =====================================
// INDEXES
// =====================================

// Compound index for efficient querying
questionSchema.index({ dimension: 1, questionNumber: 1 });
questionSchema.index({ isCore: 1, dayUnlocked: 1 });

// =====================================
// VALIDATION MIDDLEWARE
// =====================================

// Validate that choice questions have options
questionSchema.pre('save', function (next) {
  if (
    (this.questionType === 'single_choice' || this.questionType === 'multiple_choice') &&
    (!this.options || this.options.length === 0)
  ) {
    return next(new Error('Choice-based questions must have at least one option'));
  }

  // Text questions shouldn't have options
  if (this.questionType === 'text' && this.options && this.options.length > 0) {
    return next(new Error('Text questions should not have options'));
  }

  // Validate isCore matches dayUnlocked (first 15 questions are core)
  if (this.questionNumber <= 15 && !this.isCore) {
    this.isCore = true; // Auto-fix
  }

  if (this.questionNumber > 15 && this.isCore) {
    this.isCore = false; // Auto-fix
  }

  next();
});

// =====================================
// STATIC METHODS
// =====================================

/**
 * Get all questions unlocked for a user based on signup date
 * @param {Date} signupDate - User's signup date
 * @returns {Promise<Array>} Array of question numbers
 */
questionSchema.statics.getUnlockedQuestionNumbers = async function (signupDate) {
  const today = new Date();
  const daysSinceSignup = Math.floor((today - signupDate) / (1000 * 60 * 60 * 24));

  if (daysSinceSignup === 0) {
    // Day 1: Return questions 1-15
    return Array.from({ length: 15 }, (_, i) => i + 1);
  } else {
    // Day 2+: Return 15 + (days * 5), max 50
    const totalUnlocked = Math.min(15 + daysSinceSignup * 5, 50);
    return Array.from({ length: totalUnlocked }, (_, i) => i + 1);
  }
};

/**
 * Get questions by dimension
 * @param {String} dimension - Dimension name
 * @returns {Promise<Array>} Array of questions
 */
questionSchema.statics.getByDimension = function (dimension) {
  return this.find({ dimension, isActive: true })
    .sort({ questionNumber: 1 })
    .select('-__v');
};

/**
 * Get core questions (first 15)
 * @returns {Promise<Array>} Array of core questions
 */
questionSchema.statics.getCoreQuestions = function () {
  return this.find({ isCore: true, isActive: true })
    .sort({ questionNumber: 1 })
    .select('-__v');
};

/**
 * Get question by number
 * @param {Number} questionNumber - Question number (1-50)
 * @returns {Promise<Object>} Question object
 */
questionSchema.statics.getByNumber = function (questionNumber) {
  return this.findOne({ questionNumber, isActive: true }).select('-__v');
};

// =====================================
// INSTANCE METHODS
// =====================================

/**
 * Check if this question is unlocked for a given user
 * @param {Date} signupDate - User's signup date
 * @returns {Boolean} True if unlocked
 */
questionSchema.methods.isUnlockedFor = function (signupDate) {
  const today = new Date();
  const daysSinceSignup = Math.floor((today - signupDate) / (1000 * 60 * 60 * 24));

  if (daysSinceSignup === 0) {
    // Day 1: Only core questions (1-15)
    return this.isCore;
  } else {
    // Day 2+: Check if question number is unlocked
    const totalUnlocked = Math.min(15 + daysSinceSignup * 5, 50);
    return this.questionNumber <= totalUnlocked;
  }
};

/**
 * Get sanitized question (hide sensitive data)
 * @returns {Object} Sanitized question object
 */
questionSchema.methods.toClientJSON = function () {
  return {
    questionNumber: this.questionNumber,
    dimension: this.dimension,
    questionText: this.questionText,
    questionType: this.questionType,
    options: this.options,
    followUpQuestion: this.followUpQuestion,
    followUpOptions: this.followUpOptions,
    characterLimit: this.characterLimit,
    isCore: this.isCore
    // Don't expose: weight, dayUnlocked, isActive, timestamps
  };
};

// =====================================
// EXPORT MODEL
// =====================================

const Question = mongoose.model('Question', questionSchema);

module.exports = Question;