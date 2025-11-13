// src/routes/user.routes.js

const express = require('express');
const router = express.Router();

// Middleware
const { authenticate } = require('../middleware/auth.middleware');
const {
  uploadProfilePhoto,
  uploadGalleryPhotos,
  uploadVoiceBio
} = require('../middleware/upload.middleware');

// Validators
const {
  validateProfileUpdate,
  validateUsernameUpdate,
  validateBioUpdate,
  validateLocationUpdate,
  validateUserId,
  validatePhotoIndex
} = require('../validators/user.validator');

// Controllers
const userController = require('../controllers/user.controller');

/**
 * User Routes
 * 
 * All routes require authentication (JWT token in Authorization header)
 * Base path: /api/v1/users
 */

// ============================================
// PROFILE ROUTES
// ============================================

/**
 * @route   GET /api/v1/users/me
 * @desc    Get current user's profile with completion percentage
 * @access  Private
 */
router.get('/me', authenticate, userController.getMyProfile);

/**
 * @route   GET /api/v1/users/:userId
 * @desc    Get public profile of another user
 * @access  Private
 */
router.get('/:userId', authenticate, validateUserId, userController.getPublicProfile);

/**
 * @route   PATCH /api/v1/users/profile
 * @desc    Update user profile (firstName, lastName, email, gender, interestedIn, location, bio)
 * @access  Private
 * @body    { firstName?, lastName?, email?, gender?, interestedIn?, location?, bio? }
 */
router.patch(
  '/profile',
  authenticate,
  validateProfileUpdate,
  userController.updateProfile
);

// ============================================
// PROFILE PHOTO ROUTES
// ============================================

/**
 * @route   POST /api/v1/users/profile-photo
 * @desc    Upload or update profile photo
 * @access  Private
 * @body    FormData with 'profilePhoto' field (image file)
 */
router.post(
  '/profile-photo',
  authenticate,
  uploadProfilePhoto,
  userController.uploadProfilePhoto
);

/**
 * @route   DELETE /api/v1/users/profile-photo
 * @desc    Delete profile photo
 * @access  Private
 */
router.delete(
  '/profile-photo',
  authenticate,
  userController.deleteProfilePhoto
);

// ============================================
// GALLERY PHOTOS ROUTES
// ============================================

/**
 * @route   POST /api/v1/users/photos
 * @desc    Upload gallery photos (max 6 total)
 * @access  Private
 * @body    FormData with 'photos' field (array of image files, max 6)
 */
router.post(
  '/photos',
  authenticate,
  uploadGalleryPhotos,
  userController.uploadGalleryPhotos
);

/**
 * @route   DELETE /api/v1/users/photos/:index
 * @desc    Delete a gallery photo by index (0-5)
 * @access  Private
 * @params  index (0-5)
 */
router.delete(
  '/photos/:index',
  authenticate,
  validatePhotoIndex,
  userController.deleteGalleryPhoto
);

// ============================================
// VOICE BIO ROUTES
// ============================================

/**
 * @route   POST /api/v1/users/voice-bio
 * @desc    Upload voice bio (audio recording)
 * @access  Private
 * @body    FormData with 'voiceBio' field (audio file) + 'duration' field (number in seconds)
 */
router.post(
  '/voice-bio',
  authenticate,
  uploadVoiceBio,
  userController.uploadVoiceBio
);

/**
 * @route   DELETE /api/v1/users/voice-bio
 * @desc    Delete voice bio
 * @access  Private
 */
router.delete(
  '/voice-bio',
  authenticate,
  userController.deleteVoiceBio
);

// ============================================
// USERNAME ROUTES
// ============================================

/**
 * @route   PATCH /api/v1/users/username
 * @desc    Update username (must be unique)
 * @access  Private
 * @body    { username: string }
 */
router.patch(
  '/username',
  authenticate,
  validateUsernameUpdate,
  userController.updateUsername
);

// ============================================
// BIO ROUTES
// ============================================

/**
 * @route   PATCH /api/v1/users/bio
 * @desc    Update bio text
 * @access  Private
 * @body    { text: string }
 */
router.patch(
  '/bio',
  authenticate,
  validateBioUpdate,
  userController.updateBio
);

// ============================================
// LOCATION ROUTES
// ============================================

/**
 * @route   PATCH /api/v1/users/location
 * @desc    Update location (city + coordinates)
 * @access  Private
 * @body    { city: string, coordinates: [longitude, latitude] }
 */
router.patch(
  '/location',
  authenticate,
  validateLocationUpdate,
  userController.updateLocation
);

module.exports = router;