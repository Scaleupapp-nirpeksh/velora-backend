// src/validators/user.validator.js

const { body, param, validationResult } = require('express-validator');
const ApiError = require('../utils/apiError');

/**
 * User Validators
 * 
 * Validation rules for user profile updates.
 * Uses express-validator for input sanitization and validation.
 */

/**
 * Middleware to check validation results
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(err => err.msg).join(', ');
    return next(new ApiError(400, errorMessages));
  }
  next();
};

/**
 * Validate profile update
 */
const validateProfileUpdate = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('First name can only contain letters and spaces'),

  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s]+$/)
    .withMessage('Last name can only contain letters and spaces'),

  body('email')
    .optional()
    .trim()
    .isEmail()
    .withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('gender')
    .optional()
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female, or other'),

  body('interestedIn')
    .optional()
    .isIn(['men', 'women', 'everyone'])
    .withMessage('Interested in must be men, women, or everyone'),

  body('bio.text')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Bio text cannot exceed 500 characters'),

  body('location.city')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 })
    .withMessage('City name must be between 2 and 100 characters'),

  body('location.coordinates')
    .optional()
    .isArray({ min: 2, max: 2 })
    .withMessage('Coordinates must be an array of [longitude, latitude]'),

  body('location.coordinates.0')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),

  body('location.coordinates.1')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),
  
    body('dateOfBirth')
    .optional()
    .isISO8601()
    .withMessage('dateOfBirth must be a valid date'),  

  validate
];

/**
 * Validate username update
 */
const validateUsernameUpdate = [
  body('username')
    .trim()
    .notEmpty()
    .withMessage('Username is required')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores')
    .custom((value) => {
      // Prevent reserved usernames
      const reserved = ['admin', 'velora', 'support', 'help', 'test'];
      if (reserved.includes(value.toLowerCase())) {
        throw new Error('This username is reserved and cannot be used');
      }
      return true;
    }),

  validate
];

/**
 * Validate bio text update
 */
const validateBioUpdate = [
  body('text')
    .trim()
    .notEmpty()
    .withMessage('Bio text is required')
    .isLength({ min: 10, max: 500 })
    .withMessage('Bio text must be between 10 and 500 characters'),

  validate
];

/**
 * Validate location update
 */
const validateLocationUpdate = [
  body('city')
    .trim()
    .notEmpty()
    .withMessage('City is required')
    .isLength({ min: 2, max: 100 })
    .withMessage('City name must be between 2 and 100 characters'),

  body('coordinates')
    .notEmpty()
    .withMessage('Coordinates are required')
    .isArray({ min: 2, max: 2 })
    .withMessage('Coordinates must be an array of [longitude, latitude]'),

  body('coordinates.0')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitude must be between -180 and 180'),

  body('coordinates.1')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitude must be between -90 and 90'),

  validate
];

/**
 * Validate user ID param
 */
const validateUserId = [
  param('userId')
    .notEmpty()
    .withMessage('User ID is required')
    .isMongoId()
    .withMessage('Invalid user ID format'),

  validate
];

/**
 * Validate photo index for deletion
 */
const validatePhotoIndex = [
  param('index')
    .notEmpty()
    .withMessage('Photo index is required')
    .isInt({ min: 0, max: 5 })
    .withMessage('Photo index must be between 0 and 5'),

  validate
];

/**
 * Validate gender and interestedIn together
 */
const validateGenderPreferences = [
  body('gender')
    .notEmpty()
    .withMessage('Gender is required')
    .isIn(['male', 'female', 'other'])
    .withMessage('Gender must be male, female, or other'),

  body('interestedIn')
    .notEmpty()
    .withMessage('Interested in is required')
    .isIn(['men', 'women', 'everyone'])
    .withMessage('Interested in must be men, women, or everyone'),

  validate
];

module.exports = {
  validateProfileUpdate,
  validateUsernameUpdate,
  validateBioUpdate,
  validateLocationUpdate,
  validateUserId,
  validatePhotoIndex,
  validateGenderPreferences
};