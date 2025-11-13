// src/services/s3.service.js

const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { Upload } = require('@aws-sdk/lib-storage');
const { s3Client, bucketName } = require('../config/aws');
const logger = require('../utils/logger');
const crypto = require('crypto');
const path = require('path');

/**
 * S3 Service
 * 
 * Handles all AWS S3 operations for file uploads and management.
 * Supports image uploads (profile photos, gallery) and audio uploads (voice bio).
 */

class S3Service {
  /**
   * Upload a file to S3
   * @param {Buffer} fileBuffer - File content as buffer
   * @param {String} originalName - Original filename
   * @param {String} mimeType - File MIME type
   * @param {String} folder - S3 folder (e.g., 'profile-photos', 'gallery', 'voice-bios')
   * @returns {Promise<Object>} - { key, url }
   */
  async uploadFile(fileBuffer, originalName, mimeType, folder = 'uploads') {
    try {
      // Generate unique filename
      const fileExtension = path.extname(originalName);
      const uniqueId = crypto.randomBytes(16).toString('hex');
      const timestamp = Date.now();
      const fileName = `${uniqueId}-${timestamp}${fileExtension}`;
      const key = `${folder}/${fileName}`;

      // Determine content type
      const contentType = mimeType || 'application/octet-stream';

      // Upload to S3 using multipart upload (handles large files better)
      const upload = new Upload({
        client: s3Client,
        params: {
          Bucket: bucketName,
          Key: key,
          Body: fileBuffer,
          ContentType: contentType,
          // Make files publicly readable
          ACL: 'public-read'
        }
      });

      // Execute upload
      await upload.done();

      // Generate public URL
      const url = `https://${bucketName}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

      logger.info('File uploaded to S3', { key, contentType, size: fileBuffer.length });

      return {
        key,
        url,
        size: fileBuffer.length,
        contentType
      };

    } catch (error) {
      logger.error('S3 upload failed', { error: error.message, folder });
      throw new Error(`Failed to upload file to S3: ${error.message}`);
    }
  }

  /**
   * Delete a file from S3
   * @param {String} key - S3 object key (file path in bucket)
   * @returns {Promise<void>}
   */
  async deleteFile(key) {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: key
      });

      await s3Client.send(command);

      logger.info('File deleted from S3', { key });

    } catch (error) {
      logger.error('S3 delete failed', { error: error.message, key });
      throw new Error(`Failed to delete file from S3: ${error.message}`);
    }
  }

  /**
   * Delete multiple files from S3
   * @param {Array<String>} keys - Array of S3 object keys
   * @returns {Promise<void>}
   */
  async deleteMultipleFiles(keys) {
    try {
      const deletePromises = keys.map(key => this.deleteFile(key));
      await Promise.all(deletePromises);

      logger.info('Multiple files deleted from S3', { count: keys.length });

    } catch (error) {
      logger.error('S3 multiple delete failed', { error: error.message });
      throw new Error(`Failed to delete multiple files: ${error.message}`);
    }
  }

  /**
   * Extract S3 key from full URL
   * @param {String} url - Full S3 URL
   * @returns {String} - S3 key (file path)
   */
  extractKeyFromUrl(url) {
    try {
      // URL format: https://velora.s3.ap-south-1.amazonaws.com/profile-photos/abc123.jpg
      // Extract: profile-photos/abc123.jpg
      const urlObj = new URL(url);
      const key = urlObj.pathname.substring(1); // Remove leading '/'
      return key;
    } catch (error) {
      logger.error('Failed to extract S3 key from URL', { url, error: error.message });
      return null;
    }
  }

  /**
   * Generate a signed URL for private file access (not used now, but useful for premium features)
   * @param {String} key - S3 object key
   * @param {Number} expiresIn - URL expiration in seconds (default: 1 hour)
   * @returns {Promise<String>} - Signed URL
   */
  async getSignedUrl(key, expiresIn = 3600) {
    try {
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: key
      });

      const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });

      logger.info('Generated signed URL', { key, expiresIn });

      return signedUrl;

    } catch (error) {
      logger.error('Failed to generate signed URL', { error: error.message, key });
      throw new Error(`Failed to generate signed URL: ${error.message}`);
    }
  }

  /**
   * Upload profile photo
   * @param {Buffer} fileBuffer - Image buffer
   * @param {String} originalName - Original filename
   * @param {String} mimeType - Image MIME type
   * @returns {Promise<Object>} - { key, url }
   */
  async uploadProfilePhoto(fileBuffer, originalName, mimeType) {
    return this.uploadFile(fileBuffer, originalName, mimeType, 'profile-photos');
  }

  /**
   * Upload gallery photo
   * @param {Buffer} fileBuffer - Image buffer
   * @param {String} originalName - Original filename
   * @param {String} mimeType - Image MIME type
   * @returns {Promise<Object>} - { key, url }
   */
  async uploadGalleryPhoto(fileBuffer, originalName, mimeType) {
    return this.uploadFile(fileBuffer, originalName, mimeType, 'gallery-photos');
  }

  /**
   * Upload voice bio audio
   * @param {Buffer} fileBuffer - Audio buffer
   * @param {String} originalName - Original filename
   * @param {String} mimeType - Audio MIME type
   * @returns {Promise<Object>} - { key, url }
   */
  async uploadVoiceBio(fileBuffer, originalName, mimeType) {
    return this.uploadFile(fileBuffer, originalName, mimeType, 'voice-bios');
  }
}

module.exports = new S3Service();