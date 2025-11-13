// src/controllers/user.controller.js

const userService = require('../services/user.service');
const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const asyncHandler = require('../middleware/errorHandler').asyncHandler;

/**
 * User Controller
 * 
 * HTTP request handlers for user profile management.
 * All methods use asyncHandler to catch async errors.
 */

/**
 * @route   GET /api/v1/users/me
 * @desc    Get current user's profile
 * @access  Private
 */
const getMyProfile = asyncHandler(async (req, res) => {
  const result = await userService.getMyProfile(req.user._id);

  res.status(200).json(
    new ApiResponse(200, result, 'Profile retrieved successfully')
  );
});

/**
 * @route   GET /api/v1/users/:userId
 * @desc    Get public profile of another user
 * @access  Private
 */
const getPublicProfile = asyncHandler(async (req, res) => {
  const { userId } = req.params;
  const viewerId = req.user._id;

  const user = await userService.getPublicProfile(userId, viewerId);

  res.status(200).json(
    new ApiResponse(200, { user }, 'Profile retrieved successfully')
  );
});

/**
 * @route   PATCH /api/v1/users/profile
 * @desc    Update user profile
 * @access  Private
 */
const updateProfile = asyncHandler(async (req, res) => {
  const updateData = req.body;
  const userId = req.user._id;

  const user = await userService.updateProfile(userId, updateData);

  res.status(200).json(
    new ApiResponse(200, { user }, 'Profile updated successfully')
  );
});

/**
 * @route   POST /api/v1/users/profile-photo
 * @desc    Upload or update profile photo
 * @access  Private
 */
const uploadProfilePhoto = asyncHandler(async (req, res) => {
  // File is available in req.file (from upload middleware)
  if (!req.file) {
    throw new ApiError(400, 'Please upload a photo');
  }

  const user = await userService.uploadProfilePhoto(
    req.user._id,
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype
  );

  res.status(200).json(
    new ApiResponse(200, { user }, 'Profile photo uploaded successfully')
  );
});

/**
 * @route   DELETE /api/v1/users/profile-photo
 * @desc    Delete profile photo
 * @access  Private
 */
const deleteProfilePhoto = asyncHandler(async (req, res) => {
  const user = await userService.deleteProfilePhoto(req.user._id);

  res.status(200).json(
    new ApiResponse(200, { user }, 'Profile photo deleted successfully')
  );
});

/**
 * @route   POST /api/v1/users/photos
 * @desc    Upload gallery photos (max 6 total)
 * @access  Private
 */
const uploadGalleryPhotos = asyncHandler(async (req, res) => {
  // Files are available in req.files (from upload middleware)
  if (!req.files || req.files.length === 0) {
    throw new ApiError(400, 'Please upload at least one photo');
  }

  const user = await userService.uploadGalleryPhotos(req.user._id, req.files);

  res.status(200).json(
    new ApiResponse(
      200,
      { user, uploadedCount: req.files.length },
      `${req.files.length} photo(s) uploaded successfully`
    )
  );
});

/**
 * @route   DELETE /api/v1/users/photos/:index
 * @desc    Delete a gallery photo by index
 * @access  Private
 */
const deleteGalleryPhoto = asyncHandler(async (req, res) => {
  const { index } = req.params;
  const photoIndex = parseInt(index, 10);

  const user = await userService.deleteGalleryPhoto(req.user._id, photoIndex);

  res.status(200).json(
    new ApiResponse(200, { user }, 'Photo deleted successfully')
  );
});

/**
 * @route   POST /api/v1/users/voice-bio
 * @desc    Upload voice bio
 * @access  Private
 */
const uploadVoiceBio = asyncHandler(async (req, res) => {
  // File is available in req.file (from upload middleware)
  if (!req.file) {
    throw new ApiError(400, 'Please upload an audio file');
  }

  // Duration should be sent by client (in seconds)
  const duration = req.body.duration ? parseInt(req.body.duration, 10) : 0;

  const user = await userService.uploadVoiceBio(
    req.user._id,
    req.file.buffer,
    req.file.originalname,
    req.file.mimetype,
    duration
  );

  res.status(200).json(
    new ApiResponse(200, { user }, 'Voice bio uploaded successfully')
  );
});

/**
 * @route   DELETE /api/v1/users/voice-bio
 * @desc    Delete voice bio
 * @access  Private
 */
const deleteVoiceBio = asyncHandler(async (req, res) => {
  const user = await userService.deleteVoiceBio(req.user._id);

  res.status(200).json(
    new ApiResponse(200, { user }, 'Voice bio deleted successfully')
  );
});

/**
 * @route   PATCH /api/v1/users/username
 * @desc    Update username
 * @access  Private
 */
const updateUsername = asyncHandler(async (req, res) => {
  const { username } = req.body;

  const user = await userService.updateUsername(req.user._id, username);

  res.status(200).json(
    new ApiResponse(200, { user }, 'Username updated successfully')
  );
});

/**
 * @route   PATCH /api/v1/users/bio
 * @desc    Update bio text
 * @access  Private
 */
const updateBio = asyncHandler(async (req, res) => {
  const { text } = req.body;

  const user = await userService.updateBio(req.user._id, text);

  res.status(200).json(
    new ApiResponse(200, { user }, 'Bio updated successfully')
  );
});

/**
 * @route   PATCH /api/v1/users/location
 * @desc    Update location
 * @access  Private
 */
const updateLocation = asyncHandler(async (req, res) => {
  const { city, coordinates } = req.body;

  const user = await userService.updateLocation(req.user._id, city, coordinates);

  res.status(200).json(
    new ApiResponse(200, { user }, 'Location updated successfully')
  );
});

module.exports = {
  getMyProfile,
  getPublicProfile,
  updateProfile,
  uploadProfilePhoto,
  deleteProfilePhoto,
  uploadGalleryPhotos,
  deleteGalleryPhoto,
  uploadVoiceBio,
  deleteVoiceBio,
  updateUsername,
  updateBio,
  updateLocation
};