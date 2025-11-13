const { body, validationResult } = require('express-validator');
const ApiResponse = require('../utils/apiResponse');

/**
 * Validation Middleware
 * Process validation results and return errors if any
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map(err => ({
      field: err.path || err.param,
      message: err.msg,
    }));
    
    return ApiResponse.validationError(res, formattedErrors);
  }
  
  next();
};

/**
 * Auth Validation Rules
 */
const authValidation = {
  // Send OTP validation
  sendOTP: [
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Phone number is required')
      .matches(/^[\+]?[(]?[0-9]{1,4}[)]?[-\s\.]?[(]?[0-9]{1,4}[)]?[-\s\.]?[0-9]{1,9}$/)
      .withMessage('Please provide a valid phone number'),
    validate,
  ],

  // Verify OTP validation
  verifyOTP: [
    body('phone')
      .trim()
      .notEmpty()
      .withMessage('Phone number is required'),
    body('otp')
      .trim()
      .notEmpty()
      .withMessage('OTP is required')
      .isLength({ min: 6, max: 6 })
      .withMessage('OTP must be 6 digits')
      .isNumeric()
      .withMessage('OTP must contain only numbers'),
    validate,
  ],

  // Refresh token validation
  refreshToken: [
    body('refreshToken')
      .trim()
      .notEmpty()
      .withMessage('Refresh token is required'),
    validate,
  ],
};

module.exports = { validate, authValidation };