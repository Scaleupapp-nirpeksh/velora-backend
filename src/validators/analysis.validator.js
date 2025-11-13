const { body, param, validationResult } = require('express-validator');
const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Analysis Validators
 * 
 * Input validation for analysis endpoints using express-validator.
 * 
 * Validates:
 * - Request body parameters
 * - URL parameters
 * - MongoDB ObjectId formats
 * 
 * Returns 400 Bad Request with validation errors if validation fails
 */

class AnalysisValidator {
  /**
   * Validate analysis request
   * Used for POST /api/v1/analysis/analyze
   * 
   * Body params:
   * - forceReanalysis: boolean (optional)
   */
  analyzeRequest = [
    body('forceReanalysis')
      .optional()
      .isBoolean()
      .withMessage('forceReanalysis must be a boolean')
      .toBoolean(),
    
    // Validation result handler
    this._handleValidationErrors
  ];

  /**
   * Validate compatibility preview request
   * Used for GET /api/v1/analysis/compatibility-preview/:userId
   * 
   * URL params:
   * - userId: MongoDB ObjectId
   */
  compatibilityPreview = [
    param('userId')
      .trim()
      .notEmpty()
      .withMessage('User ID is required')
      .custom((value) => {
        // Check if valid MongoDB ObjectId
        if (!mongoose.Types.ObjectId.isValid(value)) {
          throw new Error('Invalid user ID format');
        }
        return true;
      }),
    
    // Validation result handler
    this._handleValidationErrors
  ];

  /**
   * Handle validation errors middleware
   * 
   * Checks for validation errors and returns 400 response if any exist
   * If no errors, passes control to next middleware
   * 
   * @param {Object} req - Express request
   * @param {Object} res - Express response
   * @param {Function} next - Express next function
   * @private
   */
  _handleValidationErrors(req, res, next) {
    const errors = validationResult(req);
    
    if (!errors.isEmpty()) {
      const errorMessages = errors.array().map(err => ({
        field: err.path || err.param,
        message: err.msg,
        value: err.value
      }));

      logger.warn('Validation failed', {
        endpoint: req.originalUrl,
        method: req.method,
        errors: errorMessages,
        userId: req.user?._id
      });

      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        error: 'VALIDATION_ERROR',
        errors: errorMessages
      });
    }

    next();
  }
}

module.exports = new AnalysisValidator();