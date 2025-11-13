const User = require('../models/User');
const JWTService = require('../services/jwt.service');
const ApiError = require('../utils/apiError');
const { asyncHandler } = require('./errorHandler');

/**
 * Authentication Middleware
 * Protect routes that require authentication
 */
const authenticate = asyncHandler(async (req, res, next) => {
  // Get token from header
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('No token provided');
  }

  // Extract token
  const token = authHeader.split(' ')[1];

  if (!token) {
    throw ApiError.unauthorized('No token provided');
  }

  try {
    // Verify token
    const decoded = JWTService.verifyAccessToken(token);

    // Find user
    const user = await User.findById(decoded.id).select('-refreshToken');

    if (!user) {
      throw ApiError.unauthorized('User not found');
    }

    // Check if user is active
    if (!user.isActive) {
      throw ApiError.forbidden('Account is deactivated');
    }

    // Check if user is banned
    if (user.isBanned) {
      throw ApiError.forbidden('Account is banned');
    }

    // Attach user to request
    req.user = user;
    
    // Update last active timestamp (async, don't await)
    user.updateLastActive().catch(err => {
      console.error('Error updating last active:', err);
    });

    next();
  } catch (error) {
    if (error.message === 'Token expired') {
      throw ApiError.unauthorized('Token expired. Please refresh your token.');
    }
    if (error.message === 'Invalid token') {
      throw ApiError.unauthorized('Invalid token');
    }
    throw error;
  }
});

/**
 * Optional Authentication
 * Attach user to request if token is valid, but don't throw error if not
 */
const optionalAuth = asyncHandler(async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return next();
  }

  try {
    const decoded = JWTService.verifyAccessToken(token);
    const user = await User.findById(decoded.id).select('-refreshToken');

    if (user && user.isActive && !user.isBanned) {
      req.user = user;
    }
  } catch (error) {
    // Silent fail - continue without user
  }

  next();
});

/**
 * Check if user has completed profile
 */
const requireCompleteProfile = (req, res, next) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  if (!req.user.isProfileComplete()) {
    throw ApiError.forbidden('Please complete your profile first');
  }

  next();
};

/**
 * Check if user is premium
 */
const requirePremium = (req, res, next) => {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }

  if (!req.user.isPremium || (req.user.premiumExpiry && req.user.premiumExpiry < new Date())) {
    throw ApiError.forbidden('Premium subscription required');
  }

  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  requireCompleteProfile,
  requirePremium,
};