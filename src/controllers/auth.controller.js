const AuthService = require('../services/auth.service');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/errorHandler');

/**
 * Auth Controller
 * Handles HTTP requests for authentication
 */
class AuthController {
  /**
   * @route   POST /api/v1/auth/send-otp
   * @desc    Send OTP to phone number
   * @access  Public
   */
  static sendOTP = asyncHandler(async (req, res) => {
    const { phone } = req.body;

    const result = await AuthService.sendOTP(phone);

    return ApiResponse.success(res, 200, result.message, {
      phone: result.phone,
      expiresIn: result.expiresIn,
    });
  });

  /**
   * @route   POST /api/v1/auth/verify-otp
   * @desc    Verify OTP and login/register user
   * @access  Public
   */
  static verifyOTP = asyncHandler(async (req, res) => {
    const { phone, otp } = req.body;

    const result = await AuthService.verifyOTP(phone, otp);

    const message = result.isNewUser 
      ? 'Account created successfully' 
      : 'Logged in successfully';

    return ApiResponse.success(res, result.isNewUser ? 201 : 200, message, {
      user: result.user,
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      isNewUser: result.isNewUser,
    });
  });

  /**
   * @route   POST /api/v1/auth/refresh-token
   * @desc    Refresh access token
   * @access  Public
   */
  static refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken } = req.body;

    const result = await AuthService.refreshAccessToken(refreshToken);

    return ApiResponse.success(res, 200, 'Token refreshed successfully', {
      accessToken: result.tokens.accessToken,
      refreshToken: result.tokens.refreshToken,
      user: result.user,
    });
  });

  /**
   * @route   POST /api/v1/auth/logout
   * @desc    Logout user (invalidate refresh token)
   * @access  Private
   */
  static logout = asyncHandler(async (req, res) => {
    const userId = req.user.id;

    const result = await AuthService.logout(userId);

    return ApiResponse.success(res, 200, result.message);
  });

  /**
   * @route   GET /api/v1/auth/me
   * @desc    Get current user profile
   * @access  Private
   */
  static getCurrentUser = asyncHandler(async (req, res) => {
    return ApiResponse.success(res, 200, 'User profile retrieved', {
      user: req.user,
    });
  });
}

module.exports = AuthController;