const express = require('express');
const router = express.Router();
const QuestionController = require('../controllers/question.controller');
const { authenticate } = require('../middleware/auth.middleware');
const {
  validateQuestionNumber,
  validateAnswerSubmission,
  validateDimension
} = require('../validators/question.validator');

/**
 * QUESTION ROUTES
 * 
 * All routes are protected with authenticate middleware
 * Base path: /api/v1/questions
 * 
 * Routes:
 * - GET    /daily                           - Get today's unlocked questions
 * - GET    /:questionNumber                 - Get specific question
 * - GET    /progress                        - Get user's progress
 * - POST   /:questionNumber/answer          - Submit answer (text/choice/voice)
 * - GET    /dimension/:dimension            - Get questions by dimension
 * 
 * Answer routes (base path: /api/v1/answers):
 * - GET    /my                              - Get all user's answers
 * - GET    /:questionNumber                 - Get answer to specific question
 * - PATCH  /:questionNumber                 - Edit answer (currently disabled)
 */

// =====================================
// QUESTION ROUTES
// =====================================

/**
 * @route   GET /api/v1/questions/daily
 * @desc    Get today's unlocked questions for the user (unanswered only)
 * @access  Private
 */
router.get(
  '/daily',
  authenticate,
  QuestionController.getDailyQuestions
);

/**
 * @route   GET /api/v1/questions/progress
 * @desc    Get user's question answering progress (overall + dimension-wise)
 * @access  Private
 * 
 * Note: This route must come BEFORE /:questionNumber to avoid conflict
 */
router.get(
  '/progress',
  authenticate,
  QuestionController.getUserProgress
);

/**
 * @route   GET /api/v1/questions/dimension/:dimension
 * @desc    Get all questions in a specific dimension (unlocked only)
 * @access  Private
 * 
 * Valid dimensions:
 * - emotional_intimacy
 * - life_vision
 * - conflict_communication
 * - love_languages
 * - physical_sexual
 * - lifestyle
 */
router.get(
  '/dimension/:dimension',
  authenticate,
  validateDimension,
  QuestionController.getQuestionsByDimension
);

/**
 * @route   GET /api/v1/questions/:questionNumber
 * @desc    Get a specific question by number (1-50)
 * @access  Private
 */
router.get(
  '/:questionNumber',
  authenticate,
  validateQuestionNumber,
  QuestionController.getQuestionByNumber
);

/**
 * @route   POST /api/v1/questions/:questionNumber/answer
 * @desc    Submit an answer to a question
 * @access  Private
 * 
 * Body (for text answer):
 * {
 *   "textAnswer": "string (20-500 chars)",
 *   "followUpAnswer": "A|B|C|D|E (optional)",
 *   "timeSpent": 45
 * }
 * 
 * Body (for single choice):
 * {
 *   "selectedOption": "A|B|C|D|E",
 *   "followUpAnswer": "A|B|C|D|E (optional)",
 *   "timeSpent": 12
 * }
 * 
 * Body (for multiple choice):
 * {
 *   "selectedOptions": ["A", "D"],
 *   "timeSpent": 18
 * }
 * 
 * Body (for voice answer) - multipart/form-data:
 * {
 *   "audioFile": <audio-file>,
 *   "audioDuration": 45,
 *   "timeSpent": 50
 * }
 */
router.post(
  '/:questionNumber/answer',
  authenticate,
  QuestionController.voiceUpload, // Multer middleware (optional - only if voice)
  validateQuestionNumber,
  validateAnswerSubmission,
  QuestionController.submitAnswer
);

// =====================================
// ANSWER ROUTES
// =====================================

/**
 * @route   GET /api/v1/answers/my
 * @desc    Get all answers submitted by the user
 * @access  Private
 */
router.get(
  '/answers/my',
  authenticate,
  QuestionController.getUserAnswers
);

/**
 * @route   GET /api/v1/answers/:questionNumber
 * @desc    Get user's answer to a specific question
 * @access  Private
 */
router.get(
  '/answers/:questionNumber',
  authenticate,
  validateQuestionNumber,
  QuestionController.getUserAnswerByQuestionNumber
);

/**
 * @route   PATCH /api/v1/answers/:questionNumber
 * @desc    Edit an answer (currently disabled - answers are immutable)
 * @access  Private
 */
router.patch(
  '/answers/:questionNumber',
  authenticate,
  validateQuestionNumber,
  QuestionController.editAnswer
);

module.exports = router;