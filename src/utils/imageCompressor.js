// src/utils/imageCompressor.js

const sharp = require('sharp');
const logger = require('../config/logger');

class ImageCompressor {
  /**
   * Compress image for chat
   */
  static async compressForChat(buffer, mimetype) {
    try {
      const compressed = await sharp(buffer)
        .resize(1200, 1200, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ 
          quality: 85,
          progressive: true 
        })
        .toBuffer();

      return compressed;

    } catch (error) {
      logger.error('Image compression error:', error);
      throw error;
    }
  }

  /**
   * Create thumbnail
   */
  static async createThumbnail(buffer) {
    try {
      const thumbnail = await sharp(buffer)
        .resize(150, 150, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 70 })
        .toBuffer();

      return thumbnail;

    } catch (error) {
      logger.error('Thumbnail creation error:', error);
      throw error;
    }
  }

  /**
   * Get image metadata
   */
  static async getMetadata(buffer) {
    try {
      const metadata = await sharp(buffer).metadata();
      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size
      };

    } catch (error) {
      logger.error('Metadata extraction error:', error);
      return null;
    }
  }
}

module.exports = ImageCompressor;