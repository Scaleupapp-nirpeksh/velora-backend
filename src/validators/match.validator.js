const { param, query, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const ApiError = require('../utils/apiError');

/**
 * Match Validator
 * Input validation for match endpoints
 */
class MatchValidator {
  /**
   * Validate matchId parameter
   */
  static matchId = [
    param('matchId')
      .trim()
      .notEmpty()
      .withMessage('Match ID is required')
      .custom((value) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid match ID format');
        }
        return true;
      }),
    
    // Handle validation errors
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        return next(new ApiError(firstError.msg, 400));
      }
      next();
    }
  ];

  /**
   * Validate userId parameter for compatibility preview
   */
  static compatibilityPreview = [
    param('userId')
      .trim()
      .notEmpty()
      .withMessage('User ID is required')
      .custom((value) => {
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid user ID format');
        }
        return true;
      })
      .custom((value, { req }) => {
        // Can't preview compatibility with yourself
        if (value === req.user._id.toString()) {
          throw new Error('Cannot preview compatibility with yourself');
        }
        return true;
      }),
    
    // Handle validation errors
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        return next(new ApiError(firstError.msg, 400));
      }
      next();
    }
  ];

  /**
   * Validate query parameters for get matches
   */
  static getMatches = [
    query('status')
      .optional()
      .trim()
      .isIn(['pending', 'revealed', 'liked', 'passed', 'mutual_like', 'expired'])
      .withMessage('Invalid status. Must be one of: pending, revealed, liked, passed, mutual_like, expired'),
    
    // Handle validation errors
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        return next(new ApiError(firstError.msg, 400));
      }
      next();
    }
  ];

  /**
   * Validate pagination parameters (for future use)
   */
  static pagination = [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Page must be a positive integer')
      .toInt(),
    
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Limit must be between 1 and 100')
      .toInt(),
    
    // Handle validation errors
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        return next(new ApiError(firstError.msg, 400));
      }
      next();
    }
  ];

  /**
   * Validate filters for matching (for future use)
   */
  static matchFilters = [
    query('minCompatibility')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Min compatibility must be between 0 and 100')
      .toInt(),
    
    query('maxCompatibility')
      .optional()
      .isInt({ min: 0, max: 100 })
      .withMessage('Max compatibility must be between 0 and 100')
      .toInt(),
    
    query('minDistance')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Min distance must be a positive number')
      .toFloat(),
    
    query('maxDistance')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Max distance must be a positive number')
      .toFloat(),
    
    // Handle validation errors
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const firstError = errors.array()[0];
        return next(new ApiError(firstError.msg, 400));
      }
      next();
    }
  ];
}

module.exports = MatchValidator;