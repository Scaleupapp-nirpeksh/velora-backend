const Answer = require('../models/Answer');
const Question = require('../models/Question');
const User = require('../models/User');
const AnswerAnalysis = require('../models/AnswerAnalysis');
const openaiService = require('./openai.service');
const logger = require('../utils/logger');

/**
 * Analysis Service
 * 
 * Core business logic for analyzing user answers using AI.
 * 
 * Key responsibilities:
 * - Gather user's answers from database
 * - Validate minimum question requirements
 * - Call OpenAI service for AI analysis
 * - Store/update analysis results
 * - Manage re-analysis triggers
 * - Calculate compatibility vectors
 * 
 * Workflow:
 * 1. User completes 15+ questions
 * 2. Analysis triggered (manual or automatic)
 * 3. Gather answers with question data
 * 4. Send to GPT-4 via OpenAI service
 * 5. Store results in AnswerAnalysis collection
 * 6. Update user's needsReanalysis flag
 */

class AnalysisService {
  /**
   * Analyze a user's answers
   * 
   * @param {ObjectId} userId - User's MongoDB ID
   * @param {Boolean} forceReanalysis - Force re-analysis even if already analyzed
   * @returns {Promise<Object>} - Analysis results
   * @throws {Error} - If validation fails or analysis errors
   */
  async analyzeUser(userId, forceReanalysis = false) {
    try {
      logger.info('Starting user analysis', { userId, forceReanalysis });

      // Step 1: Validate user exists
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Step 2: Check if user has minimum questions answered
      const minQuestions = parseInt(process.env.ANALYSIS_MIN_QUESTIONS) || 15;
      const answeredCount = await Answer.countDocuments({ userId });

      if (answeredCount < minQuestions) {
        throw new Error(
          `Insufficient answers for analysis. Minimum ${minQuestions} required, user has ${answeredCount}`
        );
      }

      // Step 3: Check if already analyzed (unless force re-analysis)
      const existingAnalysis = await AnswerAnalysis.findOne({ userId });
      if (existingAnalysis && !forceReanalysis && !existingAnalysis.needsReanalysis) {
        logger.info('User already analyzed, returning existing analysis', { userId });
        return existingAnalysis;
      }

      // Step 4: Gather all user's answers with question data
      const answersWithQuestions = await this._gatherUserAnswers(userId);

      if (answersWithQuestions.length === 0) {
        throw new Error('No answers found for analysis');
      }

      // Step 5: Call OpenAI service for AI analysis
      logger.info('Calling OpenAI service for analysis', {
        userId,
        answersCount: answersWithQuestions.length
      });

      const aiAnalysis = await openaiService.analyzeAnswers({
        userId: userId.toString(),
        answers: answersWithQuestions,
        questionsAnswered: answersWithQuestions.length
      });

      // Step 6: Generate compatibility vector
      const compatibilityVector = this._generateCompatibilityVector(
        aiAnalysis,
        answersWithQuestions
      );

      // Step 7: Prepare analysis document
      const analysisData = {
        userId,
        dimensionScores: aiAnalysis.dimensionScores,
        overallScore: aiAnalysis.overallScore,
        authenticityScore: aiAnalysis.authenticityScore,
        personalityProfile: aiAnalysis.personalityProfile,
        redFlags: aiAnalysis.redFlags || [],
        dealbreakers: aiAnalysis.dealbreakers || [],
        aiSummary: {
          shortBio: aiAnalysis.aiSummary.shortBio,
          strengths: aiAnalysis.aiSummary.strengths,
          compatibilityNotes: aiAnalysis.aiSummary.compatibilityNotes,
          generatedAt: new Date()
        },
        compatibilityVector: {
          values: compatibilityVector,
          version: 'v1.0',
          generatedAt: new Date()
        },
        questionsAnalyzed: answersWithQuestions.length,
        lastAnalyzedAt: new Date(),
        analysisVersion: `${process.env.OPENAI_MODEL || 'gpt-4'}-v1.0`,
        needsReanalysis: false
      };

      // Step 8: Save or update analysis
      let analysis;
      if (existingAnalysis) {
        // Update existing analysis
        analysis = await AnswerAnalysis.findOneAndUpdate(
          { userId },
          analysisData,
          { new: true, runValidators: true }
        );
        logger.info('Analysis updated successfully', { userId });
      } else {
        // Create new analysis
        analysis = await AnswerAnalysis.create(analysisData);
        logger.info('Analysis created successfully', { userId });
      }

      // Step 9: Update user's questionsAnswered count
      await User.findByIdAndUpdate(userId, {
        questionsAnswered: answersWithQuestions.length
      });

      return analysis;

    } catch (error) {
      logger.error('User analysis failed', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get analysis for a user (without triggering new analysis)
   * 
   * @param {ObjectId} userId - User's MongoDB ID
   * @returns {Promise<Object|null>} - Analysis or null if not analyzed yet
   */
  async getAnalysis(userId) {
    try {
      const analysis = await AnswerAnalysis.findOne({ userId }).lean();
      
      if (!analysis) {
        logger.info('No analysis found for user', { userId });
        return null;
      }

      return analysis;
    } catch (error) {
      logger.error('Failed to get analysis', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get personality insights summary (user-friendly format)
   * 
   * @param {ObjectId} userId - User's MongoDB ID
   * @returns {Promise<Object>} - Formatted insights
   */
  async getPersonalityInsights(userId) {
    try {
      const analysis = await AnswerAnalysis.findOne({ userId }).lean();

      if (!analysis) {
        throw new Error('No analysis found. Please complete at least 15 questions.');
      }

      // Format insights in user-friendly way
      return {
        shortBio: analysis.aiSummary?.shortBio || 'No bio generated yet',
        strengths: analysis.aiSummary?.strengths || [],
        
        personalityTraits: {
          attachmentStyle: this._formatAttachmentStyle(analysis.personalityProfile?.attachment_style),
          conflictStyle: this._formatConflictStyle(analysis.personalityProfile?.conflict_style),
          loveLanaguages: {
            primary: this._formatLoveLanguage(analysis.personalityProfile?.dominant_love_language),
            secondary: this._formatLoveLanguage(analysis.personalityProfile?.secondary_love_language)
          },
          socialStyle: this._formatIntroversionScore(analysis.personalityProfile?.introversion_score),
          emotionalIntelligence: analysis.personalityProfile?.emotional_intelligence || null,
          communicationStyle: this._formatCommunicationStyle(analysis.personalityProfile?.communication_style)
        },

        dimensionBreakdown: {
          emotionalIntimacy: {
            score: analysis.dimensionScores?.emotional_intimacy?.score || null,
            strengths: analysis.dimensionScores?.emotional_intimacy?.strengths || [],
            insights: analysis.dimensionScores?.emotional_intimacy?.insights || []
          },
          lifeVision: {
            score: analysis.dimensionScores?.life_vision?.score || null,
            strengths: analysis.dimensionScores?.life_vision?.strengths || [],
            insights: analysis.dimensionScores?.life_vision?.insights || []
          },
          conflictCommunication: {
            score: analysis.dimensionScores?.conflict_communication?.score || null,
            strengths: analysis.dimensionScores?.conflict_communication?.strengths || [],
            insights: analysis.dimensionScores?.conflict_communication?.insights || []
          },
          loveLanguages: {
            score: analysis.dimensionScores?.love_languages?.score || null,
            strengths: analysis.dimensionScores?.love_languages?.strengths || [],
            insights: analysis.dimensionScores?.love_languages?.insights || []
          },
          physicalSexual: {
            score: analysis.dimensionScores?.physical_sexual?.score || null,
            strengths: analysis.dimensionScores?.physical_sexual?.strengths || [],
            insights: analysis.dimensionScores?.physical_sexual?.insights || []
          },
          lifestyle: {
            score: analysis.dimensionScores?.lifestyle?.score || null,
            strengths: analysis.dimensionScores?.lifestyle?.strengths || [],
            insights: analysis.dimensionScores?.lifestyle?.insights || []
          }
        },

        overallScore: analysis.overallScore,
        authenticityScore: analysis.authenticityScore,
        lastAnalyzed: analysis.lastAnalyzedAt,
        questionsAnalyzed: analysis.questionsAnalyzed
      };

    } catch (error) {
      logger.error('Failed to get personality insights', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get red flags for a user
   * 
   * @param {ObjectId} userId - User's MongoDB ID
   * @returns {Promise<Array>} - Array of red flags
   */
  async getRedFlags(userId) {
    try {
      const analysis = await AnswerAnalysis.findOne({ userId })
        .select('redFlags')
        .lean();

      if (!analysis) {
        throw new Error('No analysis found. Please complete at least 15 questions.');
      }

      // Sort by severity (highest first)
      const redFlags = (analysis.redFlags || []).sort((a, b) => b.severity - a.severity);

      return {
        count: redFlags.length,
        criticalCount: redFlags.filter(f => f.severity >= 4).length,
        flags: redFlags.map(flag => ({
          category: flag.category,
          severity: flag.severity,
          severityLabel: this._getSeverityLabel(flag.severity),
          description: flag.description,
          detectedAt: flag.detectedAt
        }))
      };

    } catch (error) {
      logger.error('Failed to get red flags', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Mark user for re-analysis
   * 
   * Called when user answers more questions after initial analysis
   * 
   * @param {ObjectId} userId - User's MongoDB ID
   * @returns {Promise<Boolean>} - Success status
   */
  async markForReanalysis(userId) {
    try {
      const analysis = await AnswerAnalysis.findOne({ userId });

      if (!analysis) {
        // No existing analysis, nothing to mark
        return false;
      }

      // Check if user has answered more questions since last analysis
      const currentAnswerCount = await Answer.countDocuments({ userId });

      if (currentAnswerCount > analysis.questionsAnalyzed) {
        analysis.needsReanalysis = true;
        await analysis.save();

        logger.info('User marked for re-analysis', {
          userId,
          previousCount: analysis.questionsAnalyzed,
          currentCount: currentAnswerCount
        });

        return true;
      }

      return false;

    } catch (error) {
      logger.error('Failed to mark for re-analysis', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Get compatibility preview between two users
   * 
   * Quick compatibility check without full matching algorithm
   * 
   * @param {ObjectId} userId1 - First user's ID
   * @param {ObjectId} userId2 - Second user's ID
   * @returns {Promise<Object>} - Compatibility preview
   */
  async getCompatibilityPreview(userId1, userId2) {
    try {
      // Get both users' analyses
      const [analysis1, analysis2] = await Promise.all([
        AnswerAnalysis.findOne({ userId: userId1 }).lean(),
        AnswerAnalysis.findOne({ userId: userId2 }).lean()
      ]);

      if (!analysis1 || !analysis2) {
        throw new Error('Both users must have completed analysis');
      }

      // Check for dealbreakers
      const dealbreakers = this._checkDealbreakers(analysis1, analysis2);

      if (dealbreakers.length > 0) {
        return {
          compatible: false,
          overallScore: 0,
          dealbreakers,
          message: 'Fundamental incompatibilities detected'
        };
      }

      // Calculate dimension compatibility scores
      const dimensionScores = this._calculateDimensionCompatibility(
        analysis1.dimensionScores,
        analysis2.dimensionScores
      );

      // Calculate overall compatibility (weighted average)
      const overallScore = this._calculateWeightedCompatibility(dimensionScores);

      return {
        compatible: true,
        overallScore: Math.round(overallScore),
        dimensionScores,
        dealbreakers: [],
        message: this._getCompatibilityMessage(overallScore)
      };

    } catch (error) {
      logger.error('Failed to get compatibility preview', {
        userId1,
        userId2,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Gather user's answers with full question data
   * 
   * @param {ObjectId} userId - User's MongoDB ID
   * @returns {Promise<Array>} - Answers with question details
   * @private
   */
  async _gatherUserAnswers(userId) {
    try {
      // Get all user's answers with question details populated
      const answers = await Answer.find({ userId })
        .populate('questionId')
        .sort({ questionNumber: 1 })
        .lean();

      // Format for OpenAI service
      return answers.map(answer => ({
        questionNumber: answer.questionNumber,
        questionText: answer.questionId?.questionText || 'Question text not available',
        dimension: answer.questionId?.dimension || 'unknown',
        questionType: answer.questionId?.questionType || 'text',
        
        // Answer content
        textAnswer: answer.textAnswer || null,
        transcribedText: answer.transcribedText || null,
        selectedOption: answer.selectedOption || null,
        selectedOptions: answer.selectedOptions || [],
        followUpAnswer: answer.followUpAnswer || null,
        
        // Metadata
        timeSpent: answer.timeSpent || null,
        submittedAt: answer.submittedAt
      }));

    } catch (error) {
      logger.error('Failed to gather user answers', { userId, error: error.message });
      throw error;
    }
  }

  /**
   * Generate compatibility vector for matching algorithm
   * 
   * Converts analysis into 50-dimensional vector for ML matching
   * 
   * @param {Object} aiAnalysis - AI analysis results
   * @param {Array} answers - User's answers
   * @returns {Array<Number>} - 50-dimensional vector
   * @private
   */
  _generateCompatibilityVector(aiAnalysis, answers) {
    const vector = [];

    // Dimensions 1-6: Dimension scores (normalized 0-1)
    vector.push((aiAnalysis.dimensionScores.emotional_intimacy?.score || 0) / 100);
    vector.push((aiAnalysis.dimensionScores.life_vision?.score || 0) / 100);
    vector.push((aiAnalysis.dimensionScores.conflict_communication?.score || 0) / 100);
    vector.push((aiAnalysis.dimensionScores.love_languages?.score || 0) / 100);
    vector.push((aiAnalysis.dimensionScores.physical_sexual?.score || 0) / 100);
    vector.push((aiAnalysis.dimensionScores.lifestyle?.score || 0) / 100);

    // Dimensions 7-8: Overall scores
    vector.push((aiAnalysis.overallScore || 0) / 100);
    vector.push((aiAnalysis.authenticityScore || 0) / 100);

    // Dimensions 9-13: Personality traits (normalized 0-1)
    vector.push((aiAnalysis.personalityProfile?.introversion_score || 50) / 100);
    vector.push((aiAnalysis.personalityProfile?.emotional_intelligence || 50) / 100);
    vector.push((aiAnalysis.personalityProfile?.openness || 50) / 100);
    vector.push((aiAnalysis.personalityProfile?.conscientiousness || 50) / 100);

    // Dimension 14: Red flag severity (inverse - 0 is good)
    const totalRedFlagSeverity = (aiAnalysis.redFlags || []).reduce((sum, f) => sum + f.severity, 0);
    vector.push(Math.max(0, 1 - (totalRedFlagSeverity / 25))); // Max 5 flags at severity 5 = 25

    // Dimensions 15-20: Attachment style (one-hot encoding)
    const attachmentStyles = ['secure', 'anxious', 'avoidant', 'fearful-avoidant', 'unknown'];
    attachmentStyles.forEach(style => {
      vector.push(aiAnalysis.personalityProfile?.attachment_style === style ? 1 : 0);
    });

    // Dimensions 21-25: Love languages (one-hot encoding primary)
    const loveLanguages = ['physical_touch', 'words_of_affirmation', 'quality_time', 'acts_of_service', 'receiving_gifts'];
    loveLanguages.forEach(lang => {
      vector.push(aiAnalysis.personalityProfile?.dominant_love_language === lang ? 1 : 0);
    });

    // Dimensions 26-30: Conflict style (one-hot encoding)
    const conflictStyles = ['direct', 'passive', 'aggressive', 'avoidant', 'collaborative'];
    conflictStyles.forEach(style => {
      vector.push(aiAnalysis.personalityProfile?.conflict_style === style ? 1 : 0);
    });

    // Dimensions 31-35: Communication style (one-hot encoding)
    const commStyles = ['expressive', 'reserved', 'balanced', 'analytical', 'emotional'];
    commStyles.forEach(style => {
      vector.push(aiAnalysis.personalityProfile?.communication_style === style ? 1 : 0);
    });

    // Dimensions 36-45: Dealbreaker flags (binary)
    const dealbreakerTypes = ['kids', 'religion', 'location', 'lifestyle', 'values', 'family_involvement', 'intimacy_pace', 'career_priority', 'other'];
    dealbreakerTypes.forEach(type => {
      const hasDealbreaker = (aiAnalysis.dealbreakers || []).some(db => db.type === type);
      vector.push(hasDealbreaker ? 1 : 0);
    });

    // Dimensions 46-50: Reserved for future features
    for (let i = 0; i < 5; i++) {
      vector.push(0);
    }

    logger.info('Compatibility vector generated', {
      vectorLength: vector.length,
      nonZeroCount: vector.filter(v => v !== 0).length
    });

    return vector;
  }

  /**
   * Check for dealbreakers between two users
   * 
   * @param {Object} analysis1 - First user's analysis
   * @param {Object} analysis2 - Second user's analysis
   * @returns {Array} - Array of dealbreaker conflicts
   * @private
   */
  _checkDealbreakers(analysis1, analysis2) {
    const conflicts = [];

    // Get dealbreakers for both users
    const dealbreakers1 = analysis1.dealbreakers || [];
    const dealbreakers2 = analysis2.dealbreakers || [];

    // Check for conflicts
    dealbreakers1.forEach(db1 => {
      dealbreakers2.forEach(db2 => {
        if (db1.type === db2.type) {
          // Check if values are incompatible
          if (db1.incompatibleWith.includes(db2.value) || db2.incompatibleWith.includes(db1.value)) {
            conflicts.push({
              type: db1.type,
              user1Value: db1.value,
              user2Value: db2.value
            });
          }
        }
      });
    });

    return conflicts;
  }

  /**
   * Calculate compatibility scores for each dimension
   * 
   * @param {Object} scores1 - First user's dimension scores
   * @param {Object} scores2 - Second user's dimension scores
   * @returns {Object} - Compatibility score per dimension
   * @private
   */
  _calculateDimensionCompatibility(scores1, scores2) {
    const dimensions = [
      'emotional_intimacy',
      'life_vision',
      'conflict_communication',
      'love_languages',
      'physical_sexual',
      'lifestyle'
    ];

    const compatibility = {};

    dimensions.forEach(dim => {
      const score1 = scores1[dim]?.score || 50;
      const score2 = scores2[dim]?.score || 50;

      // Calculate compatibility (inverse of difference)
      // 0 difference = 100% compatible, 100 difference = 0% compatible
      const difference = Math.abs(score1 - score2);
      compatibility[dim] = Math.max(0, 100 - difference);
    });

    return compatibility;
  }

  /**
   * Calculate weighted overall compatibility
   * 
   * @param {Object} dimensionScores - Compatibility scores per dimension
   * @returns {Number} - Weighted overall score (0-100)
   * @private
   */
  _calculateWeightedCompatibility(dimensionScores) {
    const weights = {
      emotional_intimacy: 0.25,
      life_vision: 0.20,
      conflict_communication: 0.15,
      love_languages: 0.15,
      physical_sexual: 0.15,
      lifestyle: 0.10
    };

    let totalScore = 0;
    let totalWeight = 0;

    for (const [dimension, weight] of Object.entries(weights)) {
      if (dimensionScores[dimension] !== undefined) {
        totalScore += dimensionScores[dimension] * weight;
        totalWeight += weight;
      }
    }

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  }

  // ==================== FORMATTING HELPERS ====================

  _formatAttachmentStyle(style) {
    const labels = {
      'secure': 'Secure (comfortable with intimacy and independence)',
      'anxious': 'Anxious (seeks closeness, fears abandonment)',
      'avoidant': 'Avoidant (values independence, uncomfortable with closeness)',
      'fearful-avoidant': 'Fearful-Avoidant (desires closeness but fears rejection)',
      'unknown': 'Not yet determined'
    };
    return labels[style] || style;
  }

  _formatConflictStyle(style) {
    const labels = {
      'direct': 'Direct (addresses issues openly)',
      'passive': 'Passive (avoids confrontation)',
      'aggressive': 'Aggressive (confrontational)',
      'passive-aggressive': 'Passive-Aggressive (indirect expression)',
      'avoidant': 'Avoidant (withdraws from conflict)',
      'collaborative': 'Collaborative (seeks win-win solutions)',
      'unknown': 'Not yet determined'
    };
    return labels[style] || style;
  }

  _formatLoveLanguage(language) {
    const labels = {
      'physical_touch': 'Physical Touch',
      'words_of_affirmation': 'Words of Affirmation',
      'quality_time': 'Quality Time',
      'acts_of_service': 'Acts of Service',
      'receiving_gifts': 'Receiving Gifts',
      'unknown': 'Not yet determined'
    };
    return labels[language] || language;
  }

  _formatIntroversionScore(score) {
    if (score === null) return 'Not yet determined';
    if (score < 33) return `Extrovert (${score}/100)`;
    if (score < 67) return `Ambivert (${score}/100)`;
    return `Introvert (${score}/100)`;
  }

  _formatCommunicationStyle(style) {
    const labels = {
      'expressive': 'Expressive (openly shares thoughts and feelings)',
      'reserved': 'Reserved (keeps thoughts private)',
      'balanced': 'Balanced (situational sharing)',
      'analytical': 'Analytical (logical communication)',
      'emotional': 'Emotional (feeling-driven communication)',
      'unknown': 'Not yet determined'
    };
    return labels[style] || style;
  }

  _getSeverityLabel(severity) {
    const labels = {
      1: 'Minor Concern',
      2: 'Worth Noting',
      3: 'Moderate Issue',
      4: 'Serious Concern',
      5: 'Critical'
    };
    return labels[severity] || 'Unknown';
  }

  _getCompatibilityMessage(score) {
    if (score >= 80) return 'Excellent compatibility - strong potential match';
    if (score >= 65) return 'Good compatibility - worth exploring';
    if (score >= 50) return 'Moderate compatibility - some alignment';
    if (score >= 35) return 'Low compatibility - significant differences';
    return 'Minimal compatibility - fundamental differences';
  }
}

// Export singleton instance
module.exports = new AnalysisService();