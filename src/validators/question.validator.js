const { body, param, validationResult } = require('express-validator');

/**
 * QUESTION VALIDATORS
 * 
 * Validation middleware for questions API using express-validator
 * 
 * Validators:
 * - validateQuestionNumber: Validates question number param (1-50)
 * - validateAnswerSubmission: Validates answer data based on type
 * - validateDimension: Validates dimension param
 * - handleValidationErrors: Processes validation results
 */

/**
 * Handle validation errors
 * Returns 400 with error details if validation fails
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
      value: err.value
    }));

    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errorMessages
    });
  }
  
  next();
};

/**
 * Validate question number parameter
 * Question number must be between 1 and 50
 */
const validateQuestionNumber = [
  param('questionNumber')
    .notEmpty()
    .withMessage('Question number is required')
    .isInt({ min: 1, max: 50 })
    .withMessage('Question number must be between 1 and 50')
    .toInt(),
  
  handleValidationErrors
];

/**
 * Validate answer submission
 * Checks for:
 * - At least one answer type provided (textAnswer, selectedOption, selectedOptions, or audio file)
 * - Text answer length (20-500 characters)
 * - Selected options format (uppercase letters)
 * - Multiple choice (exactly 2 options)
 * - Audio duration (1-180 seconds)
 * - Follow-up answer format
 * - Time spent (non-negative number)
 */
const validateAnswerSubmission = [
  // Validate timeSpent (optional but if provided must be valid)
  body('timeSpent')
    .optional()
    .isInt({ min: 0 })
    .withMessage('Time spent must be a non-negative number')
    .toInt(),

  // Validate text answer (if provided)
  body('textAnswer')
    .optional()
    .trim()
    .isLength({ min: 20, max: 500 })
    .withMessage('Text answer must be between 20 and 500 characters'),

  // Validate single choice (if provided)
  body('selectedOption')
    .optional()
    .trim()
    .isLength({ min: 1, max: 1 })
    .withMessage('Selected option must be a single character')
    .matches(/^[A-Za-z]$/)
    .withMessage('Selected option must be a letter (A-Z)')
    .toUpperCase(),

  // Validate multiple choice (if provided)
  body('selectedOptions')
    .optional()
    .custom((value) => {
      // Accept array or comma-separated string
      let options;
      
      if (Array.isArray(value)) {
        options = value;
      } else if (typeof value === 'string') {
        options = value.split(',').map(opt => opt.trim());
      } else {
        throw new Error('Selected options must be an array or comma-separated string');
      }

      // Must have exactly 2 options
      if (options.length !== 2) {
        throw new Error('Multiple choice questions require exactly 2 options');
      }

      // Each option must be a single letter
      options.forEach(opt => {
        if (!/^[A-Za-z]$/.test(opt)) {
          throw new Error('Each option must be a single letter (A-Z)');
        }
      });

      // Options must be different
      if (options[0].toUpperCase() === options[1].toUpperCase()) {
        throw new Error('Selected options must be different');
      }

      return true;
    }),

  // Validate audio duration (if voice answer)
  body('audioDuration')
    .if((value, { req }) => req.file) // Only validate if audio file is uploaded
    .notEmpty()
    .withMessage('Audio duration is required for voice answers')
    .isInt({ min: 1, max: 180 })
    .withMessage('Audio duration must be between 1 and 180 seconds')
    .toInt(),

  // Validate follow-up answer (if provided)
  body('followUpAnswer')
    .optional()
    .trim()
    .isLength({ min: 1, max: 1 })
    .withMessage('Follow-up answer must be a single character')
    .matches(/^[A-Za-z]$/)
    .withMessage('Follow-up answer must be a letter (A-Z)')
    .toUpperCase(),

  // Custom validation: At least one answer type must be provided
  body()
    .custom((value, { req }) => {
      const hasTextAnswer = req.body.textAnswer && req.body.textAnswer.trim().length > 0;
      const hasSelectedOption = req.body.selectedOption && req.body.selectedOption.trim().length > 0;
      const hasSelectedOptions = req.body.selectedOptions && (
        (Array.isArray(req.body.selectedOptions) && req.body.selectedOptions.length > 0) ||
        (typeof req.body.selectedOptions === 'string' && req.body.selectedOptions.trim().length > 0)
      );
      const hasAudioFile = req.file !== undefined;

      if (!hasTextAnswer && !hasSelectedOption && !hasSelectedOptions && !hasAudioFile) {
        throw new Error('Please provide an answer: textAnswer, selectedOption, selectedOptions, or upload an audio file');
      }

      return true;
    }),

  handleValidationErrors
];

/**
 * Validate dimension parameter
 * Dimension must be one of the 6 valid dimensions
 */
const validateDimension = [
  param('dimension')
    .notEmpty()
    .withMessage('Dimension is required')
    .isIn([
      'emotional_intimacy',
      'life_vision',
      'conflict_communication',
      'love_languages',
      'physical_sexual',
      'lifestyle'
    ])
    .withMessage('Invalid dimension. Valid dimensions are: emotional_intimacy, life_vision, conflict_communication, love_languages, physical_sexual, lifestyle'),
  
  handleValidationErrors
];

/**
 * Validate edit answer request (currently not used - answers are immutable)
 * Kept for future if edit functionality is added
 */
const validateEditAnswer = [
  param('questionNumber')
    .notEmpty()
    .withMessage('Question number is required')
    .isInt({ min: 1, max: 50 })
    .withMessage('Question number must be between 1 and 50')
    .toInt(),

  body('textAnswer')
    .optional()
    .trim()
    .isLength({ min: 20, max: 500 })
    .withMessage('Text answer must be between 20 and 500 characters'),

  body('selectedOption')
    .optional()
    .trim()
    .isLength({ min: 1, max: 1 })
    .withMessage('Selected option must be a single character')
    .matches(/^[A-Za-z]$/)
    .withMessage('Selected option must be a letter (A-Z)')
    .toUpperCase(),

  body('followUpAnswer')
    .optional()
    .trim()
    .isLength({ min: 1, max: 1 })
    .withMessage('Follow-up answer must be a single character')
    .matches(/^[A-Za-z]$/)
    .withMessage('Follow-up answer must be a letter (A-Z)')
    .toUpperCase(),

  handleValidationErrors
];

module.exports = {
  validateQuestionNumber,
  validateAnswerSubmission,
  validateDimension,
  validateEditAnswer,
  handleValidationErrors
};