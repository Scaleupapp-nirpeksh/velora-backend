// src/middleware/upload.middleware.js

const multer = require('multer');
const ApiError = require('../utils/apiError');
const logger = require('../utils/logger');

/**
 * Upload Middleware
 * 
 * Handles file uploads using Multer.
 * Validates file types and sizes before processing.
 * Stores files in memory (not disk) for direct S3 upload.
 */

// File size limits
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_AUDIO_SIZE = 10 * 1024 * 1024; // 10MB

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
];

const ALLOWED_AUDIO_TYPES = [
  'audio/mpeg',       // .mp3
  'audio/mp4',        // .m4a
  'audio/x-m4a',      // iPhone sometimes sends this
  'audio/wav',        // .wav
  'audio/x-wav',      // iPhone Safari uses this
  'audio/webm',       // .webm
  'audio/ogg',        // .ogg
  'audio/opus',       // WhatsApp/IG voice notes
  'audio/x-caf'       // .caf (iPhone recordings)
];


/**
 * Multer configuration for memory storage
 * Files are stored in memory as Buffer objects
 */
const storage = multer.memoryStorage();

/**
 * File filter for images
 * @param {Object} req - Express request
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback
 */
const imageFileFilter = (req, file, cb) => {
  if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        400,
        `Invalid file type. Only ${ALLOWED_IMAGE_TYPES.join(', ')} are allowed`
      ),
      false
    );
  }
};

/**
 * File filter for audio
 * @param {Object} req - Express request
 * @param {Object} file - Multer file object
 * @param {Function} cb - Callback
 */
const audioFileFilter = (req, file, cb) => {
  if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(
      new ApiError(
        400,
        `Invalid audio type. Only ${ALLOWED_AUDIO_TYPES.join(', ')} are allowed`
      ),
      false
    );
  }
};

/**
 * Multer instance for image uploads
 */
const imageUpload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_IMAGE_SIZE
  },
  fileFilter: imageFileFilter
});

/**
 * Multer instance for audio uploads
 */
const audioUpload = multer({
  storage: storage,
  limits: {
    fileSize: MAX_AUDIO_SIZE
  },
  fileFilter: audioFileFilter
});

/**
 * Middleware: Upload single profile photo
 */
const uploadProfilePhoto = (req, res, next) => {
  const upload = imageUpload.single('profilePhoto');
  
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer-specific errors
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(400, `File too large. Maximum size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB`));
      }
      return next(new ApiError(400, `Upload error: ${err.message}`));
    } else if (err) {
      // Custom errors (from fileFilter)
      return next(err);
    }
    
    // Check if file was uploaded
    if (!req.file) {
      return next(new ApiError(400, 'Please upload a profile photo'));
    }
    
    logger.info('Profile photo received', {
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    });
    
    next();
  });
};

/**
 * Middleware: Upload multiple gallery photos (max 6)
 */
const uploadGalleryPhotos = (req, res, next) => {
  const upload = imageUpload.array('photos', 6);
  
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(400, `File too large. Maximum size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB per file`));
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return next(new ApiError(400, 'Maximum 6 photos allowed'));
      }
      return next(new ApiError(400, `Upload error: ${err.message}`));
    } else if (err) {
      return next(err);
    }
    
    // Check if files were uploaded
    if (!req.files || req.files.length === 0) {
      return next(new ApiError(400, 'Please upload at least one photo'));
    }
    
    logger.info('Gallery photos received', {
      count: req.files.length,
      totalSize: req.files.reduce((sum, file) => sum + file.size, 0)
    });
    
    next();
  });
};

/**
 * Middleware: Upload single voice bio
 */
const uploadVoiceBio = (req, res, next) => {
  const upload = audioUpload.single('voiceBio');
  
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(400, `Audio file too large. Maximum size is ${MAX_AUDIO_SIZE / 1024 / 1024}MB`));
      }
      return next(new ApiError(400, `Upload error: ${err.message}`));
    } else if (err) {
      return next(err);
    }
    
    // File is optional for voice bio
    if (req.file) {
      logger.info('Voice bio received', {
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      });
    }
    
    next();
  });
};

/**
 * Middleware: Upload single photo (generic - used for profile or gallery)
 */
const uploadSinglePhoto = (req, res, next) => {
  const upload = imageUpload.single('photo');
  
  upload(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return next(new ApiError(400, `File too large. Maximum size is ${MAX_IMAGE_SIZE / 1024 / 1024}MB`));
      }
      return next(new ApiError(400, `Upload error: ${err.message}`));
    } else if (err) {
      return next(err);
    }
    
    if (!req.file) {
      return next(new ApiError(400, 'Please upload a photo'));
    }
    
    next();
  });
};

/**
 * Generic multer instance for messaging
 * Supports both photo and voice uploads
 */
const messageUpload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'photo') {
      if (ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new ApiError(400, 'Invalid image format'), false);
      }
    } else if (file.fieldname === 'voice') {
      if (ALLOWED_AUDIO_TYPES.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new ApiError(400, 'Invalid audio format'), false);
      }
    } else {
      cb(new ApiError(400, 'Invalid field name'), false);
    }
  }
});

module.exports = {
  uploadProfilePhoto,
  uploadGalleryPhotos,
  uploadVoiceBio,
  uploadSinglePhoto,
  messageUpload
};