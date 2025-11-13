const User = require('../models/User');
const OTP = require('../models/OTP');
const TwilioService = require('./twilio.service');
const JWTService = require('./jwt.service');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

/**
 * Authentication Service
 * Handles all authentication-related business logic
 */
class AuthService {
  /**
   * Send OTP to phone number
   * @param {String} phone - Phone number
   * @returns {Promise<Object>} - Success response
   */
  static async sendOTP(phone) {
    try {
      // Format phone number
      const formattedPhone = TwilioService.formatPhoneNumber(phone);

      // Validate phone number
      if (!TwilioService.validatePhoneNumber(formattedPhone)) {
        throw ApiError.badRequest('Invalid phone number format');
      }

      // Check for recent OTP (rate limiting)
      const recentOTP = await OTP.findOne({
        phone: formattedPhone,
        createdAt: { $gte: new Date(Date.now() - 60 * 1000) }, // Within last 1 minute
      });

      if (recentOTP) {
        throw ApiError.tooManyRequests('Please wait before requesting a new OTP');
      }

      // Generate OTP
      const otpCode = TwilioService.generateOTP();
      
      // Calculate expiry
      const expiryMinutes = parseInt(process.env.OTP_EXPIRY_MINUTES) || 10;
      const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

      // Save OTP to database
      const otp = await OTP.create({
        phone: formattedPhone,
        otp: otpCode,
        expiresAt,
      });

      // Send OTP via Twilio
      await TwilioService.sendOTP(formattedPhone, otpCode);

      logger.info(`OTP sent successfully to ${formattedPhone}`);

      return {
        message: 'OTP sent successfully',
        phone: formattedPhone,
        expiresIn: expiryMinutes * 60, // seconds
      };
    } catch (error) {
      logger.error('Error in sendOTP:', error);
      throw error;
    }
  }

  /**
   * Verify OTP and create/login user
   * @param {String} phone - Phone number
   * @param {String} otpCode - OTP code
   * @returns {Promise<Object>} - User and tokens
   */
  static async verifyOTP(phone, otpCode) {
    try {
      // Format phone number
      const formattedPhone = TwilioService.formatPhoneNumber(phone);

      // Find the most recent OTP for this phone
      const otpRecord = await OTP.findOne({
        phone: formattedPhone,
        verified: false,
      }).sort({ createdAt: -1 });

      if (!otpRecord) {
        throw ApiError.badRequest('OTP not found or already verified');
      }

      // Check if OTP is expired
      if (otpRecord.isExpired()) {
        throw ApiError.badRequest('OTP has expired. Please request a new one.');
      }

      // Check max attempts
      const maxAttempts = parseInt(process.env.MAX_OTP_ATTEMPTS) || 3;
      if (otpRecord.attempts >= maxAttempts) {
        throw ApiError.badRequest('Maximum OTP attempts exceeded. Please request a new OTP.');
      }

      // Verify OTP
      if (otpRecord.otp !== otpCode) {
        await otpRecord.incrementAttempts();
        throw ApiError.badRequest('Invalid OTP');
      }

      // Mark OTP as verified
      otpRecord.verified = true;
      await otpRecord.save();

      // Find or create user
      let user = await User.findOne({ phone: formattedPhone });
      let isNewUser = false;

      if (!user) {
        // Create new user
        user = await User.create({
          phone: formattedPhone,
          phoneVerified: true,
          username: this.generateUsername(),
        });
        isNewUser = true;
        logger.info(`New user created: ${user._id}`);
      } else {
        // Update existing user
        user.phoneVerified = true;
        await user.updateLastActive();
        await user.save();
        logger.info(`User logged in: ${user._id}`);
      }

      // Generate tokens
      const tokens = JWTService.generateTokens(user);

      // Store hashed refresh token in user document
      user.refreshToken = tokens.refreshToken;
      await user.save();

      return {
        user,
        tokens,
        isNewUser,
      };
    } catch (error) {
      logger.error('Error in verifyOTP:', error);
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   * @param {String} refreshToken - Refresh token
   * @returns {Promise<Object>} - New tokens
   */
  static async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = JWTService.verifyRefreshToken(refreshToken);

      // Find user
      const user = await User.findById(decoded.id);

      if (!user || !user.isActive || user.isBanned) {
        throw ApiError.unauthorized('User not found or inactive');
      }

      // Verify refresh token matches stored token
      const isValidToken = await user.compareRefreshToken(refreshToken);
      if (!isValidToken) {
        throw ApiError.unauthorized('Invalid refresh token');
      }

      // Generate new tokens
      const tokens = JWTService.generateTokens(user);

      // Update stored refresh token
      user.refreshToken = tokens.refreshToken;
      await user.save();

      logger.info(`Tokens refreshed for user: ${user._id}`);

      return {
        tokens,
        user,
      };
    } catch (error) {
      logger.error('Error in refreshAccessToken:', error);
      throw error;
    }
  }

  /**
   * Logout user (invalidate refresh token)
   * @param {String} userId - User ID
   * @returns {Promise<Object>} - Success response
   */
  static async logout(userId) {
    try {
      const user = await User.findById(userId);

      if (!user) {
        throw ApiError.notFound('User not found');
      }

      // Clear refresh token
      user.refreshToken = null;
      await user.save();

      logger.info(`User logged out: ${userId}`);

      return {
        message: 'Logged out successfully',
      };
    } catch (error) {
      logger.error('Error in logout:', error);
      throw error;
    }
  }

  /**
   * Generate random username
   * @returns {String} - Random username
   */
  static generateUsername() {
    const adjectives = ['happy', 'sunny', 'clever', 'bright', 'swift', 'gentle', 'brave', 'kind'];
    const nouns = ['panda', 'tiger', 'eagle', 'dolphin', 'fox', 'wolf', 'bear', 'lion'];
    const randomNum = Math.floor(Math.random() * 1000);
    
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    
    return `${adj}_${noun}_${randomNum}`;
  }
}

module.exports = AuthService;