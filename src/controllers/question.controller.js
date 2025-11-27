const QuestionService = require('../services/question.service');
const logger = require('../utils/logger');
const multer = require('multer');
const path = require('path');
const AWS = require('aws-sdk');
const fs = require('fs-extra');

/**
 * QUESTION CONTROLLER
 * 
 * HTTP handlers for questions API:
 * - Get daily questions
 * - Get specific question
 * - Submit answer (text/choice/voice)
 * - Get user progress
 * - Get user answers
 * - Get questions by dimension
 */

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'ap-south-1'
});

// Configure multer for voice file uploads (in-memory storage)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25MB max (Whisper API limit)
  },
  fileFilter: (req, file, cb) => {
    // Accept audio files only
    const allowedMimes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/m4a',
      'audio/x-m4a',
      'audio/mp4',
      'audio/webm',
      'audio/ogg'
    ];

    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only audio files are allowed.'));
    }
  }
});

class QuestionController {
  /**
   * GET /api/v1/questions/daily
   * Get today's unlocked questions for the user
   * Returns unanswered questions only
   */
  static async getDailyQuestions(req, res) {
    try {
      const userId = req.user.id;

      logger.info(`Getting daily questions for user ${userId}`);

      const result = await QuestionService.getDailyQuestions(userId);

      return res.status(200).json({
        success: true,
        message: 'Daily questions retrieved successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in getDailyQuestions:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get daily questions',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * GET /api/v1/questions/:questionNumber
   * Get a specific question by number
   * Validates that question is unlocked
   */
  static async getQuestionByNumber(req, res) {
    try {
      const userId = req.user.id;
      const questionNumber = parseInt(req.params.questionNumber);

      // Validate question number
      if (isNaN(questionNumber) || questionNumber < 1 || questionNumber > 50) {
        return res.status(400).json({
          success: false,
          message: 'Invalid question number. Must be between 1 and 50.'
        });
      }

      logger.info(`Getting question ${questionNumber} for user ${userId}`);

      const result = await QuestionService.getQuestionByNumber(userId, questionNumber);

      return res.status(200).json({
        success: true,
        message: 'Question retrieved successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in getQuestionByNumber:', error);

      // Handle specific error messages
      if (error.message === 'Question not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      if (error.message === 'Question is not unlocked yet') {
        return res.status(403).json({
          success: false,
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get question',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * GET /api/v1/questions/progress
   * Get user's question answering progress
   * Overall and dimension-wise breakdown
   */
  static async getUserProgress(req, res) {
    try {
      const userId = req.user.id;

      logger.info(`Getting progress for user ${userId}`);

      const result = await QuestionService.getUserProgress(userId);

      return res.status(200).json({
        success: true,
        message: 'Progress retrieved successfully',
        data: result
      });
    } catch (error) {
      logger.error('Error in getUserProgress:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get progress',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

 /**
 * POST /api/v1/questions/:questionNumber/answer
 * Submit an answer to a question
 * Supports: text (typed), voice (audio file), single choice, multiple choice
 */
static async submitAnswer(req, res) {
  try {
    const userId = req.user.id;
    const questionNumber = parseInt(req.params.questionNumber);

    // Validate question number
    if (isNaN(questionNumber) || questionNumber < 1 || questionNumber > 50) {
      return res.status(400).json({
        success: false,
        message: 'Invalid question number. Must be between 1 and 50.'
      });
    }

    // Prepare answer data based on answer type
    const answerData = {
      timeSpent: parseInt(req.body.timeSpent) || 0
    };

    // Handle voice answer (if audio file uploaded)
    if (req.file) {
      logger.info(`Voice answer received for question ${questionNumber}, file size: ${req.file.size} bytes`);

      // FIX: Changed from this.uploadVoiceToS3 to QuestionController.uploadVoiceToS3
      // Because we're in a static method, we need to reference the class directly
      const audioUrl = await QuestionController.uploadVoiceToS3(req.file, userId, questionNumber);

      // Get audio duration from request (client should send this)
      const audioDuration = parseInt(req.body.audioDuration);
      if (!audioDuration || audioDuration < 1 || audioDuration > 180) {
        return res.status(400).json({
          success: false,
          message: 'Invalid audio duration. Must be between 1 and 180 seconds.'
        });
      }

      answerData.answerType = 'voice';
      answerData.audioUrl = audioUrl;
      answerData.audioDuration = audioDuration;
    } 
    // Handle text answer (typed)
    else if (req.body.textAnswer) {
      answerData.textAnswer = req.body.textAnswer.trim();
    } 
    // Handle single choice answer
    else if (req.body.selectedOption) {
      answerData.selectedOption = req.body.selectedOption.toUpperCase();
    } 
    // Handle multiple choice answer
    else if (req.body.selectedOptions) {
      // Accept both array and comma-separated string
      if (Array.isArray(req.body.selectedOptions)) {
        answerData.selectedOptions = req.body.selectedOptions.map(opt => opt.toUpperCase());
      } else if (typeof req.body.selectedOptions === 'string') {
        answerData.selectedOptions = req.body.selectedOptions.split(',').map(opt => opt.trim().toUpperCase());
      }
    } 
    else {
      return res.status(400).json({
        success: false,
        message: 'No answer provided. Please provide textAnswer, selectedOption, selectedOptions, or upload an audio file.'
      });
    }

    // Follow-up answer (optional)
    if (req.body.followUpAnswer) {
      answerData.followUpAnswer = req.body.followUpAnswer.toUpperCase();
    }

    logger.info(`Submitting answer for question ${questionNumber}, user ${userId}`, {
      answerType: answerData.answerType || 'text/choice',
      hasFollowUp: !!answerData.followUpAnswer
    });

    // Submit answer via service
    const result = await QuestionService.submitAnswer(userId, questionNumber, answerData);

    return res.status(201).json({
      success: true,
      message: 'Answer submitted successfully',
      data: result
    });
  } catch (error) {
    logger.error('Error in submitAnswer:', error);

    // Handle specific error messages
    if (error.message.includes('not unlocked yet')) {
      return res.status(403).json({
        success: false,
        message: error.message
      });
    }

    if (error.message.includes('already answered')) {
      return res.status(409).json({
        success: false,
        message: error.message
      });
    }

    if (error.message.includes('answer in order') || error.message.includes('answer question')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.message.includes('required') || error.message.includes('Invalid')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || 'Failed to submit answer',
      error: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

  /**
   * Upload voice note to S3
   * 
   * @param {Object} file - Multer file object
   * @param {String} userId - User ID
   * @param {Number} questionNumber - Question number
   * @returns {Promise<String>} S3 URL
   */
  static async uploadVoiceToS3(file, userId, questionNumber) {
    try {
      const bucketName = process.env.AWS_S3_BUCKET || 'velora';
      
      // Generate unique filename
      const timestamp = Date.now();
      const fileExtension = path.extname(file.originalname) || '.mp3';
      const s3Key = `voice-notes/${userId}-q${questionNumber}-${timestamp}${fileExtension}`;

      logger.info(`Uploading voice note to S3: ${s3Key}`);

      const params = {
        Bucket: bucketName,
        Key: s3Key,
        Body: file.buffer,
        ContentType: file.mimetype,
        ACL: 'private' // Private - only accessible via signed URLs if needed
      };

      await s3.upload(params).promise();

      // Return S3 URL
      const s3Url = `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${s3Key}`;
      
      logger.info(`Voice note uploaded successfully: ${s3Url}`);
      
      return s3Url;
    } catch (error) {
      logger.error('Error uploading voice to S3:', error);
      throw new Error(`Failed to upload voice note: ${error.message}`);
    }
  }

  /**
   * GET /api/v1/answers/my
   * Get all answers submitted by the user
   */
  static async getUserAnswers(req, res) {
    try {
      const userId = req.user.id;

      logger.info(`Getting all answers for user ${userId}`);

      const answers = await QuestionService.getUserAnswers(userId);

      return res.status(200).json({
        success: true,
        message: 'Answers retrieved successfully',
        data: {
          answers,
          count: answers.length
        }
      });
    } catch (error) {
      logger.error('Error in getUserAnswers:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get answers',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * GET /api/v1/answers/:questionNumber
   * Get user's answer to a specific question
   */
  static async getUserAnswerByQuestionNumber(req, res) {
    try {
      const userId = req.user.id;
      const questionNumber = parseInt(req.params.questionNumber);

      // Validate question number
      if (isNaN(questionNumber) || questionNumber < 1 || questionNumber > 50) {
        return res.status(400).json({
          success: false,
          message: 'Invalid question number. Must be between 1 and 50.'
        });
      }

      logger.info(`Getting answer for question ${questionNumber}, user ${userId}`);

      const answer = await QuestionService.getUserAnswerByQuestionNumber(userId, questionNumber);

      return res.status(200).json({
        success: true,
        message: 'Answer retrieved successfully',
        data: answer
      });
    } catch (error) {
      logger.error('Error in getUserAnswerByQuestionNumber:', error);

      if (error.message === 'Answer not found') {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }

      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get answer',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * PATCH /api/v1/answers/:questionNumber
   * Edit an answer (currently not allowed - answers are immutable)
   */
  static async editAnswer(req, res) {
    try {
      // Business rule: Answers are immutable
      return res.status(403).json({
        success: false,
        message: 'Answers cannot be edited once submitted. This ensures authenticity and prevents gaming the matching system.'
      });
    } catch (error) {
      logger.error('Error in editAnswer:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to edit answer',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * GET /api/v1/questions/dimension/:dimension
   * Get questions by dimension
   * Only returns unlocked questions
   */
  static async getQuestionsByDimension(req, res) {
    try {
      const userId = req.user.id;
      const dimension = req.params.dimension;

      // Validate dimension
      const validDimensions = [
        'emotional_intimacy',
        'life_vision',
        'conflict_communication',
        'love_languages',
        'physical_sexual',
        'lifestyle'
      ];

      if (!validDimensions.includes(dimension)) {
        return res.status(400).json({
          success: false,
          message: `Invalid dimension. Valid dimensions are: ${validDimensions.join(', ')}`
        });
      }

      logger.info(`Getting questions for dimension ${dimension}, user ${userId}`);

      const questions = await QuestionService.getQuestionsByDimension(userId, dimension);

      return res.status(200).json({
        success: true,
        message: 'Questions retrieved successfully',
        data: {
          dimension,
          questions,
          count: questions.length
        }
      });
    } catch (error) {
      logger.error('Error in getQuestionsByDimension:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to get questions',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Multer middleware for voice uploads
   * Use in routes: upload.single('audioFile')
   */
  static voiceUpload = upload.single('audioFile');
}

module.exports = QuestionController;