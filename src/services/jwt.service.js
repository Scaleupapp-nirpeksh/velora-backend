const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

/**
 * JWT Service for token operations
 */
class JWTService {
  /**
   * Generate access token
   * @param {Object} payload - User data to encode
   * @returns {String} - JWT token
   */
  static generateAccessToken(payload) {
    try {
      return jwt.sign(
        { 
          id: payload.id,
          phone: payload.phone,
          type: 'access'
        },
        process.env.JWT_SECRET,
        {
          expiresIn: process.env.JWT_EXPIRES_IN || '7d',
          issuer: 'velora-api',
          audience: 'velora-app',
        }
      );
    } catch (error) {
      logger.error('Error generating access token:', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate refresh token
   * @param {Object} payload - User data to encode
   * @returns {String} - JWT refresh token
   */
  static generateRefreshToken(payload) {
    try {
      return jwt.sign(
        {
          id: payload.id,
          phone: payload.phone,
          type: 'refresh',
          jti: uuidv4(), // Unique token ID
        },
        process.env.JWT_REFRESH_SECRET,
        {
          expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
          issuer: 'velora-api',
          audience: 'velora-app',
        }
      );
    } catch (error) {
      logger.error('Error generating refresh token:', error);
      throw new Error('Token generation failed');
    }
  }

  /**
   * Generate both access and refresh tokens
   * @param {Object} user - User object
   * @returns {Object} - { accessToken, refreshToken }
   */
  static generateTokens(user) {
    const payload = {
      id: user._id.toString(),
      phone: user.phone,
    };

    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  /**
   * Verify access token
   * @param {String} token - JWT token
   * @returns {Object} - Decoded payload
   */
  static verifyAccessToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'velora-api',
        audience: 'velora-app',
      });

      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid token');
      }
      throw error;
    }
  }

  /**
   * Verify refresh token
   * @param {String} token - JWT refresh token
   * @returns {Object} - Decoded payload
   */
  static verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
        issuer: 'velora-api',
        audience: 'velora-app',
      });

      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Refresh token expired');
      }
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid refresh token');
      }
      throw error;
    }
  }

  /**
   * Decode token without verification (for debugging)
   * @param {String} token - JWT token
   * @returns {Object} - Decoded payload
   */
  static decodeToken(token) {
    return jwt.decode(token);
  }
}

module.exports = JWTService;