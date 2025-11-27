// services/testPerfectMatch.service.js
class TestPerfectMatchService {
    /**
     * Create EXACT copy of answers for perfect 100% match
     * WARNING: Only for testing - this creates identical answers
     */
    async createPerfectMatch(sourceUserId, targetUserId) {
      try {
        // Get source answers
        const sourceAnswers = await Answer.find({ userId: sourceUserId })
          .populate('questionId')
          .sort({ questionNumber: 1 });
  
        // Clear target's existing answers
        await Answer.deleteMany({ userId: targetUserId });
  
        // Create EXACT copies (only changing userId and timestamps)
        for (const sourceAnswer of sourceAnswers) {
          const answerCopy = {
            userId: targetUserId,
            questionId: sourceAnswer.questionId._id,
            questionNumber: sourceAnswer.questionNumber,
            textAnswer: sourceAnswer.textAnswer,
            transcribedText: sourceAnswer.transcribedText,
            selectedOption: sourceAnswer.selectedOption,
            selectedOptions: sourceAnswer.selectedOptions ? [...sourceAnswer.selectedOptions] : [],
            followUpAnswer: sourceAnswer.followUpAnswer,
            timeSpent: sourceAnswer.timeSpent,
            isVoiceAnswer: false, // Convert voice to text for simplicity
          };
  
          // Remove null/undefined fields
          Object.keys(answerCopy).forEach(key => {
            if (answerCopy[key] === null || answerCopy[key] === undefined) {
              delete answerCopy[key];
            }
          });
  
          await Answer.create(answerCopy);
        }
  
        // Update questionsAnswered count
        await User.findByIdAndUpdate(targetUserId, {
          questionsAnswered: sourceAnswers.length
        });
  
        // Run analysis for both
        const [sourceAnalysis, targetAnalysis] = await Promise.all([
          analysisService.analyzeUser(sourceUserId, true),
          analysisService.analyzeUser(targetUserId, true)
        ]);
  
        // Generate matches
        const matchResult = await MatchingService.generateMatches(sourceUserId);
  
        // Find the specific match
        const Match = require('../models/Match');
        const specificMatch = await Match.findOne({
          userId: sourceUserId,
          matchedUserId: targetUserId
        });
  
        return {
          success: true,
          compatibilityScore: specificMatch?.compatibilityScore || 0,
          message: `Created identical answers. Expected 100% match.`,
          match: specificMatch
        };
  
      } catch (error) {
        logger.error('Error creating perfect match:', error);
        throw error;
      }
    }
  }
  
  module.exports = new TestPerfectMatchService();