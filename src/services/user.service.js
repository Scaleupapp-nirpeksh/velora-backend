// src/services/user.service.js

const User = require('../models/User');
const s3Service = require('./s3.service');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

/**
 * User Service
 * 
 * Business logic for user profile management.
 * Handles profile updates, photo uploads, and profile retrieval.
 */

class UserService {
  /**
   * Update user profile
   * @param {String} userId - User ID
   * @param {Object} updateData - Fields to update
   * @returns {Promise<Object>} - Updated user
   */
  async updateProfile(userId, updateData) {
    try {
      // Find user
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      // Update fields
      const allowedUpdates = [
        'firstName',
        'lastName',
        'email',
        'gender',
        'interestedIn',
        'dateOfBirth'
      ];

      allowedUpdates.forEach(field => {
        if (updateData[field] !== undefined) {
          user[field] = updateData[field];
        }
      });

      // Handle nested location update
      if (updateData.location) {
        user.location = {
          city: updateData.location.city || user.location?.city,
          coordinates: updateData.location.coordinates || user.location?.coordinates
        };
      }

      // Handle nested bio update
      if (updateData.bio) {
        user.bio = {
          text: updateData.bio.text || user.bio?.text,
          audioUrl: updateData.bio.audioUrl || user.bio?.audioUrl,
          audioDuration: updateData.bio.audioDuration || user.bio?.audioDuration
        };
      }

      await user.save();

      logger.info('User profile updated', { userId, updatedFields: Object.keys(updateData) });

      return user;
    } catch (error) {
      logger.error('Update profile failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Upload profile photo
   * @param {String} userId - User ID
   * @param {Buffer} fileBuffer - Image buffer
   * @param {String} originalName - Original filename
   * @param {String} mimeType - Image MIME type
   * @returns {Promise<Object>} - Updated user
   */
  async uploadProfilePhoto(userId, fileBuffer, originalName, mimeType) {
    try {
      // Find user
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      // Delete old profile photo from S3 if exists
      if (user.profilePhoto) {
        const oldKey = s3Service.extractKeyFromUrl(user.profilePhoto);
        if (oldKey) {
          await s3Service.deleteFile(oldKey).catch(err => {
            logger.warn('Failed to delete old profile photo', { oldKey, error: err.message });
          });
        }
      }

      // Upload new photo to S3
      const uploadResult = await s3Service.uploadProfilePhoto(
        fileBuffer,
        originalName,
        mimeType
      );

      // Update user profile photo URL
      user.profilePhoto = uploadResult.url;
      await user.save();

      logger.info('Profile photo uploaded', { userId, url: uploadResult.url });

      return user;
    } catch (error) {
      logger.error('Upload profile photo failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Upload gallery photos (max 6 total)
   * @param {String} userId - User ID
   * @param {Array} files - Array of file objects from multer
   * @returns {Promise<Object>} - Updated user
   */
  async uploadGalleryPhotos(userId, files) {
    try {
      // Find user
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      // Check current photo count
      const currentPhotoCount = user.photos ? user.photos.length : 0;
      const newPhotoCount = files.length;
      const totalPhotos = currentPhotoCount + newPhotoCount;

      if (totalPhotos > 6) {
        throw new ApiError(
          400,
          `Cannot upload ${newPhotoCount} photos. You have ${currentPhotoCount} photos. Maximum is 6 total.`
        );
      }

      // Upload all photos to S3
      const uploadPromises = files.map(file =>
        s3Service.uploadGalleryPhoto(file.buffer, file.originalname, file.mimetype)
      );

      const uploadResults = await Promise.all(uploadPromises);

      // Add new photo URLs to user's photos array
      const newPhotoUrls = uploadResults.map(result => result.url);
      user.photos = [...(user.photos || []), ...newPhotoUrls];

      await user.save();

      logger.info('Gallery photos uploaded', {
        userId,
        count: newPhotoCount,
        totalPhotos: user.photos.length
      });

      return user;
    } catch (error) {
      logger.error('Upload gallery photos failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete a gallery photo by index
   * @param {String} userId - User ID
   * @param {Number} photoIndex - Index of photo to delete (0-5)
   * @returns {Promise<Object>} - Updated user
   */
  async deleteGalleryPhoto(userId, photoIndex) {
    try {
      // Find user
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      // Check if photo exists at index
      if (!user.photos || !user.photos[photoIndex]) {
        throw new ApiError(404, 'Photo not found at this index');
      }

      // Get photo URL
      const photoUrl = user.photos[photoIndex];

      // Delete from S3
      const key = s3Service.extractKeyFromUrl(photoUrl);
      if (key) {
        await s3Service.deleteFile(key).catch(err => {
          logger.warn('Failed to delete photo from S3', { key, error: err.message });
        });
      }

      // Remove from array
      user.photos.splice(photoIndex, 1);
      await user.save();

      logger.info('Gallery photo deleted', { userId, photoIndex, remainingPhotos: user.photos.length });

      return user;
    } catch (error) {
      logger.error('Delete gallery photo failed', { userId, photoIndex, error: error.message });
      throw error;
    }
  }

  /**
   * Delete profile photo
   * @param {String} userId - User ID
   * @returns {Promise<Object>} - Updated user
   */
  async deleteProfilePhoto(userId) {
    try {
      // Find user
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      if (!user.profilePhoto) {
        throw new ApiError(404, 'No profile photo to delete');
      }

      // Delete from S3
      const key = s3Service.extractKeyFromUrl(user.profilePhoto);
      if (key) {
        await s3Service.deleteFile(key).catch(err => {
          logger.warn('Failed to delete profile photo from S3', { key, error: err.message });
        });
      }

      // Remove from user
      user.profilePhoto = undefined;
      await user.save();

      logger.info('Profile photo deleted', { userId });

      return user;
    } catch (error) {
      logger.error('Delete profile photo failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Upload voice bio
   * @param {String} userId - User ID
   * @param {Buffer} fileBuffer - Audio buffer
   * @param {String} originalName - Original filename
   * @param {String} mimeType - Audio MIME type
   * @param {Number} duration - Audio duration in seconds (client-provided)
   * @returns {Promise<Object>} - Updated user
   */
  async uploadVoiceBio(userId, fileBuffer, originalName, mimeType, duration) {
    try {
      // Find user
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      // Delete old voice bio from S3 if exists
      if (user.bio && user.bio.audioUrl) {
        const oldKey = s3Service.extractKeyFromUrl(user.bio.audioUrl);
        if (oldKey) {
          await s3Service.deleteFile(oldKey).catch(err => {
            logger.warn('Failed to delete old voice bio', { oldKey, error: err.message });
          });
        }
      }

      // Upload new voice bio to S3
      const uploadResult = await s3Service.uploadVoiceBio(
        fileBuffer,
        originalName,
        mimeType
      );

      // Update user bio with audio URL and duration
      user.bio = {
        text: user.bio?.text || '',
        audioUrl: uploadResult.url,
        audioDuration: duration || 0
      };

      await user.save();

      logger.info('Voice bio uploaded', { userId, url: uploadResult.url, duration });

      return user;
    } catch (error) {
      logger.error('Upload voice bio failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Delete voice bio
   * @param {String} userId - User ID
   * @returns {Promise<Object>} - Updated user
   */
  async deleteVoiceBio(userId) {
    try {
      // Find user
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      if (!user.bio || !user.bio.audioUrl) {
        throw new ApiError(404, 'No voice bio to delete');
      }

      // Delete from S3
      const key = s3Service.extractKeyFromUrl(user.bio.audioUrl);
      if (key) {
        await s3Service.deleteFile(key).catch(err => {
          logger.warn('Failed to delete voice bio from S3', { key, error: err.message });
        });
      }

      // Remove audio but keep text
      user.bio.audioUrl = undefined;
      user.bio.audioDuration = undefined;
      await user.save();

      logger.info('Voice bio deleted', { userId });

      return user;
    } catch (error) {
      logger.error('Delete voice bio failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Update username
   * @param {String} userId - User ID
   * @param {String} newUsername - New username
   * @returns {Promise<Object>} - Updated user
   */
  async updateUsername(userId, newUsername) {
    try {
      // Check if username is already taken
      const existingUser = await User.findOne({ username: newUsername });
      if (existingUser && existingUser._id.toString() !== userId) {
        throw new ApiError(400, 'Username is already taken');
      }

      // Find and update user
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      user.username = newUsername;
      await user.save();

      logger.info('Username updated', { userId, newUsername });

      return user;
    } catch (error) {
      logger.error('Update username failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get user's own profile
   * @param {String} userId - User ID
   * @returns {Promise<Object>} - User profile
   */
  async getMyProfile(userId) {
    try {
      const user = await User.findById(userId).select('-refreshToken');
      
      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      // Calculate profile completion
      const completion = this.calculateProfileCompletion(user);

      logger.info('Profile retrieved', { userId });

      return {
        user,
        profileCompletion: completion
      };
    } catch (error) {
      logger.error('Get profile failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get public profile of another user
   * @param {String} userId - ID of user to view
   * @param {String} viewerId - ID of user viewing the profile
   * @returns {Promise<Object>} - Public profile
   */
  async getPublicProfile(userId, viewerId) {
    try {
      const user = await User.findById(userId).select(
        'firstName lastName username profilePhoto photos bio gender location questionsAnswered isPremium createdAt dateOfBirth isActive isBanned' // ← Added here
      );
  
      if (!user) {
        throw new ApiError(404, 'User not found');
      }
  
      if (!user.isActive) {
        throw new ApiError(403, 'This profile is not available');
      }
  
      if (user.isBanned) {
        throw new ApiError(403, 'This profile has been removed');
      }
  
      // Remove the fields before returning (since they shouldn't be visible to other users)
      const publicProfile = user.toObject();
      delete publicProfile.isActive;
      delete publicProfile.isBanned;
  
      logger.info('Public profile viewed', { userId, viewerId });
  
      return publicProfile;
    } catch (error) {
      logger.error('Get public profile failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Calculate profile completion percentage
   * @param {Object} user - User document
   * @returns {Object} - Completion data
   */
  calculateProfileCompletion(user) {
    const fields = {
      firstName: !!user.firstName,
      lastName: !!user.lastName,
      email: !!user.email,
      gender: !!user.gender,
      interestedIn: !!user.interestedIn,
      location: !!(user.location && user.location.city),
      profilePhoto: !!user.profilePhoto,
      bio: !!(user.bio && user.bio.text && user.bio.text.length >= 10),
      photos: !!(user.photos && user.photos.length >= 3), // At least 3 photos
      questionsAnswered: user.questionsAnswered >= 15 // At least 15 questions
    };

    const completedFields = Object.values(fields).filter(Boolean).length;
    const totalFields = Object.keys(fields).length;
    const percentage = Math.round((completedFields / totalFields) * 100);

    const missingFields = Object.keys(fields).filter(key => !fields[key]);

    return {
      percentage,
      completedFields,
      totalFields,
      missingFields,
      isComplete: percentage === 100
    };
  }

  /**
   * Update bio text
   * @param {String} userId - User ID
   * @param {String} text - Bio text
   * @returns {Promise<Object>} - Updated user
   */
  async updateBio(userId, text) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      user.bio = {
        text: text,
        audioUrl: user.bio?.audioUrl,
        audioDuration: user.bio?.audioDuration
      };

      await user.save();

      logger.info('Bio updated', { userId, length: text.length });

      return user;
    } catch (error) {
      logger.error('Update bio failed', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Update location
   * @param {String} userId - User ID
   * @param {String} city - City name
   * @param {Array} coordinates - [longitude, latitude]
   * @returns {Promise<Object>} - Updated user
   */
  async updateLocation(userId, city, coordinates) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new ApiError(404, 'User not found');
      }

      user.location = {
        city,
        coordinates
      };

      await user.save();

      logger.info('Location updated', { userId, city });

      return user;
    } catch (error) {
      logger.error('Update location failed', { userId, error: error.message });
      throw error;
    }
  }
}

module.exports = new UserService();