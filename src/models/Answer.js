const mongoose = require('mongoose');

/**
 * ANSWER MODEL
 * 
 * Stores user answers to the 50 questions.
 * Supports multiple answer formats:
 * - Text answers (typed or voice note with transcription)
 * - Single choice answers (A, B, C, etc.)
 * - Multiple choice answers (select exactly 2)
 * - Follow-up answers
 * 
 * Features:
 * - Voice note support with OpenAI Whisper transcription
 * - Immutable answers (cannot edit once submitted)
 * - Time tracking (how long user took to answer)
 * - Fast lookups via compound index on userId + questionNumber
 */

const answerSchema = new mongoose.Schema(
  {
    // User who answered
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User ID is required'],
      index: true
    },

    // Question being answered
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: [true, 'Question ID is required'],
      index: true
    },

    // Question number for easy reference (1-50)
    questionNumber: {
      type: Number,
      required: [true, 'Question number is required'],
      min: [1, 'Question number must be between 1 and 50'],
      max: [50, 'Question number must be between 1 and 50']
    },

    // =====================================
    // ANSWER CONTENT (Only one will be filled based on question type)
    // =====================================

    // For text questions (typed answer)
    textAnswer: {
      type: String,
      trim: true,
      default: null,
      maxlength: [500, 'Text answer cannot exceed 500 characters']
    },

    // For text questions (voice note answer)
    isVoiceAnswer: {
      type: Boolean,
      default: false
    },

    audioUrl: {
      type: String,
      default: null,
      trim: true
    },

    audioDuration: {
      type: Number, // Duration in seconds
      default: null,
      min: [1, 'Audio duration must be at least 1 second'],
      max: [180, 'Audio duration cannot exceed 180 seconds (3 minutes)']
    },

    transcribedText: {
      type: String,
      default: null,
      trim: true,
      maxlength: [1000, 'Transcribed text cannot exceed 1000 characters']
    },

    transcriptionStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed'],
      default: null
    },

    // For single choice questions (A, B, C, D, E, etc.)
    selectedOption: {
      type: String,
      default: null,
      trim: true,
      uppercase: true,
      match: [/^[A-Z]$/, 'Selected option must be a single uppercase letter']
    },

    // For multiple choice questions (select exactly 2)
    selectedOptions: {
      type: [String],
      default: [],
      validate: {
        validator: function (arr) {
          if (arr.length === 0) return true; // Not a multiple choice question
          if (arr.length !== 2) return false; // Must select exactly 2
          return arr.every(opt => /^[A-Z]$/.test(opt)); // Each must be A-Z
        },
        message: 'Multiple choice questions must have exactly 2 options selected (A-Z)'
      }
    },

    // =====================================
    // FOLLOW-UP ANSWER
    // =====================================

    followUpAnswer: {
      type: String,
      default: null,
      trim: true,
      uppercase: true
    },

    // =====================================
    // METADATA
    // =====================================

    // Time spent answering (in seconds)
    timeSpent: {
      type: Number,
      default: 0,
      min: [0, 'Time spent cannot be negative']
    },

    // Edit tracking (currently answers are immutable)
    isEdited: {
      type: Boolean,
      default: false
    },

    editedAt: {
      type: Date,
      default: null
    },

    // Submission metadata
    submittedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true, // Adds createdAt and updatedAt
    collection: 'answers'
  }
);

// =====================================
// INDEXES
// =====================================

// Compound unique index: One answer per user per question
answerSchema.index({ userId: 1, questionNumber: 1 }, { unique: true });

// Compound index for efficient querying
answerSchema.index({ userId: 1, questionId: 1 });

// Index for finding all answers by a user
answerSchema.index({ userId: 1, submittedAt: -1 });

// =====================================
// VALIDATION MIDDLEWARE
// =====================================

// Validate that exactly one answer type is provided
answerSchema.pre('save', function (next) {
  const answerTypes = [
    this.textAnswer,
    this.isVoiceAnswer && (this.audioUrl || this.transcribedText),
    this.selectedOption,
    this.selectedOptions && this.selectedOptions.length > 0
  ].filter(Boolean);

  if (answerTypes.length === 0) {
    return next(new Error('At least one answer type must be provided'));
  }

  if (answerTypes.length > 1) {
    // Exception: voice answers can have both audioUrl and transcribedText
    if (
      this.isVoiceAnswer &&
      this.audioUrl &&
      this.transcribedText &&
      !this.textAnswer &&
      !this.selectedOption &&
      (!this.selectedOptions || this.selectedOptions.length === 0)
    ) {
      return next(); // Valid voice answer
    }
    return next(new Error('Only one answer type should be provided'));
  }

  next();
});

// Validate voice answer fields
answerSchema.pre('save', function (next) {
  if (this.isVoiceAnswer) {
    if (!this.audioUrl) {
      return next(new Error('Voice answers must have an audio URL'));
    }
    if (!this.audioDuration) {
      return next(new Error('Voice answers must have audio duration'));
    }
    // transcribedText can be null if transcription is still pending
  }

  // Non-voice answers shouldn't have audio fields
  if (!this.isVoiceAnswer && (this.audioUrl || this.audioDuration || this.transcribedText)) {
    return next(new Error('Non-voice answers should not have audio fields'));
  }

  next();
});

// =====================================
// STATIC METHODS
// =====================================

/**
 * Get all answers by a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Array>} Array of answers
 */
answerSchema.statics.getUserAnswers = function (userId) {
  return this.find({ userId })
    .populate('questionId', 'questionNumber dimension questionText questionType')
    .sort({ questionNumber: 1 })
    .select('-__v');
};

/**
 * Get a specific answer by user and question number
 * @param {ObjectId} userId - User ID
 * @param {Number} questionNumber - Question number (1-50)
 * @returns {Promise<Object>} Answer object or null
 */
answerSchema.statics.getUserAnswerByQuestionNumber = function (userId, questionNumber) {
  return this.findOne({ userId, questionNumber })
    .populate('questionId', 'questionNumber dimension questionText questionType options followUpQuestion followUpOptions')
    .select('-__v');
};

/**
 * Get count of answered questions by user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Number>} Count of answers
 */
answerSchema.statics.getAnswerCountByUser = function (userId) {
  return this.countDocuments({ userId });
};

/**
 * Get answers by dimension for a user
 * @param {ObjectId} userId - User ID
 * @param {String} dimension - Dimension name
 * @returns {Promise<Array>} Array of answers
 */
answerSchema.statics.getAnswersByDimension = async function (userId, dimension) {
  return this.find({ userId })
    .populate({
      path: 'questionId',
      match: { dimension },
      select: 'questionNumber dimension questionText questionType'
    })
    .sort({ questionNumber: 1 })
    .select('-__v')
    .then(answers => answers.filter(a => a.questionId)); // Filter out non-matching
};

/**
 * Check if user has answered a specific question
 * @param {ObjectId} userId - User ID
 * @param {Number} questionNumber - Question number
 * @returns {Promise<Boolean>} True if answered
 */
answerSchema.statics.hasUserAnswered = async function (userId, questionNumber) {
  const count = await this.countDocuments({ userId, questionNumber });
  return count > 0;
};

/**
 * Get highest question number answered by user (for sequential validation)
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Number>} Highest question number answered (0 if none)
 */
answerSchema.statics.getHighestAnsweredQuestion = async function (userId) {
  const result = await this.findOne({ userId }).sort({ questionNumber: -1 }).select('questionNumber');
  return result ? result.questionNumber : 0;
};

/**
 * Get dimension-wise progress for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Object>} Progress breakdown by dimension
 */
answerSchema.statics.getDimensionProgress = async function (userId) {
  const dimensionTotals = {
    emotional_intimacy: 8,
    life_vision: 10,
    conflict_communication: 7,
    love_languages: 6,
    physical_sexual: 8,
    lifestyle: 11
  };

  const answers = await this.find({ userId }).populate('questionId', 'dimension');

  const progress = {};
  Object.keys(dimensionTotals).forEach(dim => {
    const answeredCount = answers.filter(a => a.questionId && a.questionId.dimension === dim).length;
    progress[dim] = {
      answered: answeredCount,
      total: dimensionTotals[dim],
      percentage: Math.round((answeredCount / dimensionTotals[dim]) * 100)
    };
  });

  return progress;
};

// =====================================
// INSTANCE METHODS
// =====================================

/**
 * Get sanitized answer (hide sensitive data for API responses)
 * @returns {Object} Sanitized answer object
 */
answerSchema.methods.toClientJSON = function () {
  const obj = {
    questionNumber: this.questionNumber,
    submittedAt: this.submittedAt,
    timeSpent: this.timeSpent
  };

  // Include answer based on type
  if (this.isVoiceAnswer) {
    obj.isVoiceAnswer = true;
    obj.audioUrl = this.audioUrl;
    obj.audioDuration = this.audioDuration;
    obj.transcribedText = this.transcribedText;
    obj.transcriptionStatus = this.transcriptionStatus;
  } else if (this.textAnswer) {
    obj.textAnswer = this.textAnswer;
  } else if (this.selectedOption) {
    obj.selectedOption = this.selectedOption;
  } else if (this.selectedOptions && this.selectedOptions.length > 0) {
    obj.selectedOptions = this.selectedOptions;
  }

  if (this.followUpAnswer) {
    obj.followUpAnswer = this.followUpAnswer;
  }

  if (this.isEdited) {
    obj.isEdited = true;
    obj.editedAt = this.editedAt;
  }

  return obj;
};

/**
 * Check if answer can be edited (business rule: immutable)
 * @returns {Boolean} False (answers are immutable)
 */
answerSchema.methods.canEdit = function () {
  // Business rule: Answers are immutable once submitted
  // This can be changed if needed in the future
  return false;
};

/**
 * Update transcription status and text
 * @param {String} status - Transcription status
 * @param {String} text - Transcribed text
 */
answerSchema.methods.updateTranscription = function (status, text = null) {
  this.transcriptionStatus = status;
  if (text) {
    this.transcribedText = text;
  }
  return this.save();
};

// =====================================
// EXPORT MODEL
// =====================================

const Answer = mongoose.model('Answer', answerSchema);

module.exports = Answer;