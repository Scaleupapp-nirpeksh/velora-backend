const Question = require('../models/Question');
const Answer = require('../models/Answer');
const User = require('../models/User');
const logger = require('../utils/logger');
const OpenAI = require('openai');
const AWS = require('aws-sdk');
const fs = require('fs-extra');
const path = require('path');

/**
 * QUESTION SERVICE (FIXED VERSION)
 * 
 * Business logic for the questions system:
 * - Progressive unlock based on signup date AND dayUnlocked field from database
 * - Answer submission with validation
 * - Voice note transcription with OpenAI Whisper (with question context)
 * - Progress tracking
 * - Sequential answering enforcement (FIXED for day-based progression)
 * 
 * FIXES:
 * - Sequential answering now works with day-based unlock system
 * - Users must complete all questions from earlier days before moving to later days
 * - Within a day, questions can be answered in any order
 * - Handles non-sequential question numbers correctly (Q1, Q19, Q21, etc.)
 */

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Configure AWS S3
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'ap-south-1'
});

class QuestionService {
  /**
   * Calculate which questions are unlocked for a user
   * Reads from Question.dayUnlocked field
   * 
   * @param {Date} signupDate - User's signup date
   * @returns {Promise<Array>} Array of unlocked question numbers (sorted)
   */
  static async getUnlockedQuestionNumbers(signupDate) {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0); // Normalize to start of day
      
      const signupDay = new Date(signupDate);
      signupDay.setHours(0, 0, 0, 0); // Normalize to start of day
      
      // Calculate days since signup (0 = signup day, 1 = next day, etc.)
      const daysSinceSignup = Math.floor((today - signupDay) / (1000 * 60 * 60 * 24));
      
      // Days unlocked = daysSinceSignup + 1 (Day 1 is unlocked on signup day)
      const daysUnlocked = daysSinceSignup + 1;
      
      logger.info(`User signed up ${daysSinceSignup} days ago. Unlocking up to day ${daysUnlocked}`);
      
      // Query database for questions with dayUnlocked <= daysUnlocked
      const questions = await Question.find({
        dayUnlocked: { $lte: daysUnlocked },
        isActive: true
      }).select('questionNumber').sort({ questionNumber: 1 });
      
      const unlockedNumbers = questions.map(q => q.questionNumber);
      
      logger.info(`Found ${unlockedNumbers.length} unlocked questions for user`);
      
      return unlockedNumbers;
    } catch (error) {
      logger.error('Error getting unlocked question numbers:', error);
      throw error;
    }
  }

  /**
   * Get today's unlocked questions for a user
   * Returns questions they haven't answered yet
   * 
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object>} { questions, unlockedCount, answeredCount }
   */
  static async getDailyQuestions(userId) {
    try {
      // Get user to check signup date
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Calculate unlocked question numbers
      const unlockedNumbers = await this.getUnlockedQuestionNumbers(user.createdAt);

      // Get all unlocked questions
      const unlockedQuestions = await Question.find({
        questionNumber: { $in: unlockedNumbers },
        isActive: true
      }).sort({ questionNumber: 1 });

      // Get user's answered questions
      const answeredQuestions = await Answer.find({ userId }).select('questionNumber');
      const answeredNumbers = answeredQuestions.map(a => a.questionNumber);

      // Filter to unanswered questions only
      const unansweredQuestions = unlockedQuestions.filter(
        q => !answeredNumbers.includes(q.questionNumber)
      );

      return {
        questions: unansweredQuestions.map(q => q.toClientJSON()),
        unlockedCount: unlockedNumbers.length,
        answeredCount: answeredNumbers.length,
        totalQuestions: 50
      };
    } catch (error) {
      logger.error('Error getting daily questions:', error);
      throw error;
    }
  }

  /**
   * Get a specific question by number
   * Validates that it's unlocked for the user
   * 
   * @param {ObjectId} userId - User ID
   * @param {Number} questionNumber - Question number (1-50)
   * @returns {Promise<Object>} Question object
   */
  static async getQuestionByNumber(userId, questionNumber) {
    try {
      // Get user to check signup date
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get question
      const question = await Question.findOne({
        questionNumber,
        isActive: true
      });

      if (!question) {
        throw new Error('Question not found');
      }

      // Check if unlocked
      const unlockedNumbers = await this.getUnlockedQuestionNumbers(user.createdAt);
      if (!unlockedNumbers.includes(questionNumber)) {
        throw new Error('Question is not unlocked yet');
      }

      // Check if already answered
      const existingAnswer = await Answer.findOne({ userId, questionNumber });

      return {
        question: question.toClientJSON(),
        isAnswered: !!existingAnswer,
        answer: existingAnswer ? existingAnswer.toClientJSON() : null
      };
    } catch (error) {
      logger.error('Error getting question by number:', error);
      throw error;
    }
  }

  /**
   * Get questions by dimension
   * Only returns unlocked questions
   * 
   * @param {ObjectId} userId - User ID
   * @param {String} dimension - Dimension name
   * @returns {Promise<Array>} Array of questions
   */
  static async getQuestionsByDimension(userId, dimension) {
    try {
      // Get user to check signup date
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Calculate unlocked question numbers
      const unlockedNumbers = await this.getUnlockedQuestionNumbers(user.createdAt);

      // Get questions by dimension that are unlocked
      const questions = await Question.find({
        dimension,
        questionNumber: { $in: unlockedNumbers },
        isActive: true
      }).sort({ questionNumber: 1 });

      // Get user's answered questions in this dimension
      const answeredQuestions = await Answer.find({ userId }).select('questionNumber');
      const answeredNumbers = answeredQuestions.map(a => a.questionNumber);

      return questions.map(q => ({
        ...q.toClientJSON(),
        isAnswered: answeredNumbers.includes(q.questionNumber)
      }));
    } catch (error) {
      logger.error('Error getting questions by dimension:', error);
      throw error;
    }
  }

  /**
   * Get user's progress
   * Overall and dimension-wise breakdown
   * 
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object>} Progress data
   */
  static async getUserProgress(userId) {
    try {
      // Get user
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Get answer count
      const answeredCount = await Answer.getAnswerCountByUser(userId);

      // Get dimension progress
      const dimensionProgress = await Answer.getDimensionProgress(userId);

      // Calculate unlocked questions
      const unlockedNumbers = await this.getUnlockedQuestionNumbers(user.createdAt);

      // Calculate percentage
      const percentageComplete = Math.round((answeredCount / 50) * 100);

      return {
        totalQuestions: 50,
        answeredCount,
        unlockedCount: unlockedNumbers.length,
        percentageComplete,
        isProfileComplete: answeredCount >= 15, // Minimum 15 for matching
        dimensionProgress,
        nextUnlockDate: this.getNextUnlockDate(user.createdAt)
      };
    } catch (error) {
      logger.error('Error getting user progress:', error);
      throw error;
    }
  }

  /**
   * Calculate next unlock date
   * 
   * @param {Date} signupDate - User's signup date
   * @returns {Date|null} Next unlock date or null if all unlocked
   */
  static getNextUnlockDate(signupDate) {
    const today = new Date();
    const daysSinceSignup = Math.floor((today - signupDate) / (1000 * 60 * 60 * 24));
    
    // Check if we're on day 8 or beyond (all 50 questions should be unlocked by day 8)
    if (daysSinceSignup >= 7) {
      return null; // All questions unlocked (Day 1 = 15, Days 2-8 = 5 each = 15+35=50)
    }

    // Next unlock is tomorrow at midnight
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    return tomorrow;
  }

  /**
   * Submit an answer to a question
   * Validates unlock status, sequential answering, and answer format
   * 
   * FIXED: Sequential validation now works with day-based progression
   * 
   * @param {ObjectId} userId - User ID
   * @param {Number} questionNumber - Question number
   * @param {Object} answerData - Answer data
   * @returns {Promise<Object>} Created answer
   */
  static async submitAnswer(userId, questionNumber, answerData) {
    try {
      // 1. Get user
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // 2. Get question
      const question = await Question.findOne({
        questionNumber,
        isActive: true
      });

      if (!question) {
        throw new Error('Question not found');
      }

      // 3. Check if question is unlocked
      const unlockedNumbers = await this.getUnlockedQuestionNumbers(user.createdAt);
      if (!unlockedNumbers.includes(questionNumber)) {
        throw new Error('This question is not unlocked yet. Please wait for tomorrow.');
      }

      // 4. Check if already answered
      const existingAnswer = await Answer.findOne({ userId, questionNumber });
      if (existingAnswer) {
        throw new Error('You have already answered this question. Answers cannot be edited.');
      }

      // 5. Validate sequential answering by day (must complete earlier days before later days)
      // Get all answered questions for this user
      const answeredQuestions = await Answer.find({ userId }).select('questionNumber');
      const answeredNumbers = answeredQuestions.map(a => a.questionNumber);
      
      // Get all unlocked questions with their dayUnlocked info
      const unlockedQuestionsWithDay = await Question.find({
        questionNumber: { $in: unlockedNumbers },
        isActive: true
      }).select('questionNumber dayUnlocked').sort({ dayUnlocked: 1, questionNumber: 1 });

      // Group questions by dayUnlocked
      const questionsByDay = {};
      for (const q of unlockedQuestionsWithDay) {
        if (!questionsByDay[q.dayUnlocked]) {
          questionsByDay[q.dayUnlocked] = [];
        }
        questionsByDay[q.dayUnlocked].push(q.questionNumber);
      }

      // Find the earliest day with unanswered questions
      let earliestDayWithUnanswered = null;
      const sortedDays = Object.keys(questionsByDay).map(d => parseInt(d)).sort((a, b) => a - b);
      
      for (const day of sortedDays) {
        const dayQuestions = questionsByDay[day];
        const unansweredInDay = dayQuestions.filter(num => !answeredNumbers.includes(num));
        
        if (unansweredInDay.length > 0) {
          earliestDayWithUnanswered = day;
          break;
        }
      }

      // If there are unanswered questions from earlier days, enforce day-based sequential answering
      if (earliestDayWithUnanswered !== null) {
        const currentQuestionDay = unlockedQuestionsWithDay.find(
          q => q.questionNumber === questionNumber
        )?.dayUnlocked;
        
        if (currentQuestionDay && currentQuestionDay > earliestDayWithUnanswered) {
          const earliestUnansweredQuestions = questionsByDay[earliestDayWithUnanswered].filter(
            num => !answeredNumbers.includes(num)
          );
          throw new Error(
            `Please complete Day ${earliestDayWithUnanswered} questions first. ` +
            `Remaining questions: ${earliestUnansweredQuestions.join(', ')}`
          );
        }
      }

      // 6. Validate answer format matches question type
      this.validateAnswerFormat(question, answerData);

      // 7. Create answer object
      const answerPayload = {
        userId,
        questionId: question._id,
        questionNumber,
        timeSpent: answerData.timeSpent || 0
      };

      // Handle different answer types
      if (answerData.answerType === 'voice') {
        // Voice answer (will be transcribed later)
        answerPayload.isVoiceAnswer = true;
        answerPayload.audioUrl = answerData.audioUrl;
        answerPayload.audioDuration = answerData.audioDuration;
        answerPayload.transcriptionStatus = 'pending';
      } else if (question.questionType === 'text') {
        // Text answer (typed)
        answerPayload.textAnswer = answerData.textAnswer;
      } else if (question.questionType === 'single_choice') {
        // Single choice
        answerPayload.selectedOption = answerData.selectedOption;
      } else if (question.questionType === 'multiple_choice') {
        // Multiple choice (exactly 2)
        answerPayload.selectedOptions = answerData.selectedOptions;
      }

      // Follow-up answer (if provided)
      if (answerData.followUpAnswer) {
        answerPayload.followUpAnswer = answerData.followUpAnswer;
      }

      // 8. Save answer
      const answer = await Answer.create(answerPayload);

      // 9. Update user.questionsAnswered count
      user.questionsAnswered = (user.questionsAnswered || 0) + 1;
      await user.save();

      logger.info(`User ${userId} answered question ${questionNumber}`);

      // 10. If voice answer, trigger transcription (async)
      if (answerData.answerType === 'voice') {
        this.transcribeVoiceAnswer(answer._id).catch(err => {
          logger.error('Error transcribing voice answer:', err);
        });
      }

      return {
        answer: answer.toClientJSON(),
        progress: {
          questionsAnswered: user.questionsAnswered,
          totalQuestions: 50,
          percentageComplete: Math.round((user.questionsAnswered / 50) * 100)
        }
      };
    } catch (error) {
      logger.error('Error submitting answer:', error);
      throw error;
    }
  }

  /**
   * Validate answer format matches question type
   * 
   * @param {Object} question - Question document
   * @param {Object} answerData - Answer data from request
   * @throws {Error} If validation fails
   */
  static validateAnswerFormat(question, answerData) {
    if (question.questionType === 'text') {
      // Text question: must have textAnswer OR voice
      if (answerData.answerType === 'voice') {
        if (!answerData.audioUrl || !answerData.audioDuration) {
          throw new Error('Voice answers must include audioUrl and audioDuration');
        }
        if (answerData.audioDuration > 180) {
          throw new Error('Audio duration cannot exceed 180 seconds (3 minutes)');
        }
      } else {
        if (!answerData.textAnswer || answerData.textAnswer.trim().length === 0) {
          throw new Error('Text answer is required');
        }
        if (answerData.textAnswer.length > question.characterLimit) {
          throw new Error(`Text answer cannot exceed ${question.characterLimit} characters`);
        }
        // Minimum character requirement (at least 20 characters for meaningful answers)
        if (answerData.textAnswer.trim().length < 20) {
          throw new Error('Text answer must be at least 20 characters');
        }
      }
    } else if (question.questionType === 'single_choice') {
      // Single choice: must have selectedOption
      if (!answerData.selectedOption) {
        throw new Error('Please select an option');
      }
      // Validate option exists
      const validOptions = question.options.map(opt => opt.key);
      if (!validOptions.includes(answerData.selectedOption)) {
        throw new Error(`Invalid option. Valid options are: ${validOptions.join(', ')}`);
      }
    } else if (question.questionType === 'multiple_choice') {
      // Multiple choice: must have exactly 2 selectedOptions
      if (!answerData.selectedOptions || answerData.selectedOptions.length !== 2) {
        throw new Error('Please select exactly 2 options');
      }
      // Validate options exist
      const validOptions = question.options.map(opt => opt.key);
      answerData.selectedOptions.forEach(opt => {
        if (!validOptions.includes(opt)) {
          throw new Error(`Invalid option: ${opt}. Valid options are: ${validOptions.join(', ')}`);
        }
      });
      // Ensure no duplicates
      if (answerData.selectedOptions[0] === answerData.selectedOptions[1]) {
        throw new Error('Please select 2 different options');
      }
    }

    // Validate follow-up answer if provided
    if (answerData.followUpAnswer && question.followUpOptions && question.followUpOptions.length > 0) {
      const validFollowUpOptions = question.followUpOptions.map(opt => opt.key);
      if (!validFollowUpOptions.includes(answerData.followUpAnswer)) {
        throw new Error(`Invalid follow-up option. Valid options are: ${validFollowUpOptions.join(', ')}`);
      }
    }
  }

  /**
   * Transcribe voice answer using OpenAI Whisper API
   * 
   * PRODUCTION READY with:
   * - Context-aware transcription (passes question text as prompt)
   * - Auto-detected language (Hindi/English mix support)
   * - S3 download and cleanup
   * - Full error handling
   * 
   * @param {ObjectId} answerId - Answer ID
   */
  static async transcribeVoiceAnswer(answerId) {
    let tempFilePath = null;

    try {
      // 1. Get answer from database
      const answer = await Answer.findById(answerId).populate('questionId');
      if (!answer || !answer.isVoiceAnswer) {
        throw new Error('Invalid voice answer');
      }

      logger.info(`Starting transcription for answer ${answerId}, audioUrl: ${answer.audioUrl}`);

      // 2. Update status to processing
      await answer.updateTranscription('processing');

      // 3. Extract S3 key from audioUrl
      const s3Key = this.extractS3KeyFromUrl(answer.audioUrl);
      if (!s3Key) {
        throw new Error('Invalid S3 URL format');
      }

      logger.info(`Downloading audio from S3: ${s3Key}`);

      // 4. Download audio file from S3
      const audioBuffer = await this.downloadFromS3(s3Key);

      // 5. Validate audio file
      if (!audioBuffer || audioBuffer.length === 0) {
        throw new Error('Downloaded audio file is empty');
      }

      // Check file size (max 25MB for Whisper API)
      const fileSizeMB = audioBuffer.length / (1024 * 1024);
      if (fileSizeMB > 25) {
        throw new Error(`Audio file too large: ${fileSizeMB.toFixed(2)}MB (max 25MB)`);
      }

      logger.info(`Audio downloaded successfully: ${(audioBuffer.length / 1024).toFixed(2)}KB`);

      // 6. Create temporary file (Whisper API requires file)
      const tempDir = path.join(__dirname, '../../temp');
      await fs.ensureDir(tempDir);

      const fileExtension = path.extname(s3Key) || '.mp3';
      tempFilePath = path.join(tempDir, `answer-${answerId}${fileExtension}`);
      
      await fs.writeFile(tempFilePath, audioBuffer);
      logger.info(`Temporary file created: ${tempFilePath}`);

      // 7. Build context prompt from question text
      // This helps Whisper understand what the user is answering
      let contextPrompt = '';
      if (answer.questionId && answer.questionId.questionText) {
        // Extract first 100 characters of question as context
        const questionText = answer.questionId.questionText.substring(0, 100);
        contextPrompt = `Answering: ${questionText}`;
        logger.info(`Using context prompt: ${contextPrompt}`);
      }

      // 8. Call OpenAI Whisper API with context
      logger.info('Calling OpenAI Whisper API with question context...');
      
      const transcriptionParams = {
        file: fs.createReadStream(tempFilePath),
        model: 'whisper-1',
        response_format: 'text',
        temperature: 0.2 // Lower temperature for more accurate transcription
      };

      // Add prompt (context) if available - helps with proper nouns and domain terms
      if (contextPrompt) {
        transcriptionParams.prompt = contextPrompt;
      }

      // Language auto-detection (Whisper will detect Hindi/English automatically)
      // No language parameter = auto-detect

      const transcription = await openai.audio.transcriptions.create(transcriptionParams);

      logger.info(`Transcription completed: ${transcription.substring(0, 100)}...`);

      // 9. Validate transcription
      if (!transcription || transcription.trim().length === 0) {
        throw new Error('Transcription returned empty text');
      }

      // 10. Update answer with transcription
      await answer.updateTranscription('completed', transcription.trim());

      logger.info(`Answer ${answerId} transcribed successfully (${transcription.length} characters)`);

      // 11. Clean up temporary file
      if (tempFilePath) {
        await fs.remove(tempFilePath);
        logger.info(`Temporary file deleted: ${tempFilePath}`);
      }

      return {
        success: true,
        transcription: transcription.trim(),
        length: transcription.length
      };

    } catch (error) {
      logger.error('Error transcribing voice answer:', {
        answerId,
        error: error.message,
        stack: error.stack
      });

      // Update answer with failed status
      try {
        const answer = await Answer.findById(answerId);
        if (answer) {
          await answer.updateTranscription('failed');
        }
      } catch (updateError) {
        logger.error('Error updating answer with failed status:', updateError);
      }

      // Clean up temporary file on error
      if (tempFilePath) {
        try {
          await fs.remove(tempFilePath);
          logger.info(`Temporary file deleted after error: ${tempFilePath}`);
        } catch (cleanupError) {
          logger.error('Error cleaning up temporary file:', cleanupError);
        }
      }

      // Re-throw error for upstream handling
      throw error;
    }
  }

  /**
   * Extract S3 key from full S3 URL
   * 
   * @param {String} s3Url - Full S3 URL
   * @returns {String} S3 key (path within bucket)
   */
  static extractS3KeyFromUrl(s3Url) {
    try {
      const bucketName = process.env.AWS_S3_BUCKET || 'velora';
      
      // Handle different S3 URL formats:
      // 1. https://bucket.s3.region.amazonaws.com/key
      // 2. https://s3.region.amazonaws.com/bucket/key
      // 3. https://bucket.s3.amazonaws.com/key
      
      if (s3Url.includes(`${bucketName}.s3`)) {
        // Format: https://velora.s3.ap-south-1.amazonaws.com/voice-notes/file.mp3
        const parts = s3Url.split('.amazonaws.com/');
        return parts[1];
      } else if (s3Url.includes('s3') && s3Url.includes(bucketName)) {
        // Format: https://s3.ap-south-1.amazonaws.com/velora/voice-notes/file.mp3
        const parts = s3Url.split(`${bucketName}/`);
        return parts[1];
      }
      
      throw new Error('Unrecognized S3 URL format');
    } catch (error) {
      logger.error('Error extracting S3 key from URL:', error);
      return null;
    }
  }

  /**
   * Download file from S3
   * 
   * @param {String} s3Key - S3 object key
   * @returns {Promise<Buffer>} File buffer
   */
  static async downloadFromS3(s3Key) {
    try {
      const bucketName = process.env.AWS_S3_BUCKET || 'velora';
      
      const params = {
        Bucket: bucketName,
        Key: s3Key
      };

      logger.info(`Downloading from S3: Bucket=${bucketName}, Key=${s3Key}`);

      const data = await s3.getObject(params).promise();
      
      if (!data || !data.Body) {
        throw new Error('S3 getObject returned no data');
      }

      return data.Body;
    } catch (error) {
      logger.error('Error downloading from S3:', {
        key: s3Key,
        error: error.message
      });
      throw new Error(`Failed to download audio from S3: ${error.message}`);
    }
  }

  /**
   * Retry transcription for failed voice answers
   * Can be called manually or via cron job
   * 
   * @param {Number} maxRetries - Maximum number of answers to retry
   * @returns {Promise<Object>} Retry results
   */
  static async retryFailedTranscriptions(maxRetries = 10) {
    try {
      logger.info(`Retrying failed transcriptions (max: ${maxRetries})`);

      // Find failed transcriptions
      const failedAnswers = await Answer.find({
        isVoiceAnswer: true,
        transcriptionStatus: 'failed'
      }).limit(maxRetries);

      logger.info(`Found ${failedAnswers.length} failed transcriptions`);

      const results = {
        total: failedAnswers.length,
        successful: 0,
        failed: 0,
        errors: []
      };

      // Retry each failed transcription
      for (const answer of failedAnswers) {
        try {
          await this.transcribeVoiceAnswer(answer._id);
          results.successful++;
          logger.info(`Retry successful for answer ${answer._id}`);
        } catch (error) {
          results.failed++;
          results.errors.push({
            answerId: answer._id,
            error: error.message
          });
          logger.error(`Retry failed for answer ${answer._id}:`, error);
        }

        // Add delay between retries to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      logger.info('Retry results:', results);
      return results;
    } catch (error) {
      logger.error('Error in retryFailedTranscriptions:', error);
      throw error;
    }
  }

  /**
   * Get all user's answers
   * 
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Array>} Array of answers
   */
  static async getUserAnswers(userId) {
    try {
      const answers = await Answer.getUserAnswers(userId);
      return answers.map(a => ({
        ...a.toObject(),
        question: a.questionId ? {
          questionNumber: a.questionId.questionNumber,
          dimension: a.questionId.dimension,
          questionText: a.questionId.questionText
        } : null
      }));
    } catch (error) {
      logger.error('Error getting user answers:', error);
      throw error;
    }
  }

  /**
   * Get user's answer to a specific question
   * 
   * @param {ObjectId} userId - User ID
   * @param {Number} questionNumber - Question number
   * @returns {Promise<Object>} Answer object
   */
  static async getUserAnswerByQuestionNumber(userId, questionNumber) {
    try {
      const answer = await Answer.getUserAnswerByQuestionNumber(userId, questionNumber);
      if (!answer) {
        throw new Error('Answer not found');
      }
      return answer;
    } catch (error) {
      logger.error('Error getting user answer:', error);
      throw error;
    }
  }
}

module.exports = QuestionService;