// services/conversationStarter.service.js
const OpenAI = require('openai');
const Answer = require('../models/Answer');
const AnswerAnalysis = require('../models/AnswerAnalysis');
const logger = require('../utils/logger');

class ConversationStarterService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  /**
   * Generate personalized conversation starters for a match
   */
  async generateStarters(userId, matchedUserId, compatibilityData) {
    try {
      // Get both users' answers and analyses
      const [userAnswers, matchAnswers, userAnalysis, matchAnalysis] = await Promise.all([
        Answer.find({ userId }).populate('questionId').lean(),
        Answer.find({ userId: matchedUserId }).populate('questionId').lean(),
        AnswerAnalysis.findOne({ userId }).lean(),
        AnswerAnalysis.findOne({ userId: matchedUserId }).lean()
      ]);

      // Find commonalities and differences
      const insights = this._findConversationHooks(
        userAnswers, 
        matchAnswers, 
        userAnalysis, 
        matchAnalysis,
        compatibilityData
      );

      // Generate AI suggestions
      const prompt = this._buildStarterPrompt(insights);
      
      const completion = await this.client.chat.completions.create({
        model: 'gpt-4-turbo-preview',
        messages: [
          { role: 'system', content: this._getSystemPrompt() },
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
        max_tokens: 1500
      });

      const suggestions = JSON.parse(completion.choices[0].message.content);
      
      logger.info('Generated conversation starters', {
        userId,
        matchedUserId,
        startersCount: suggestions.starters.length
      });

      return suggestions.starters;

    } catch (error) {
      logger.error('Failed to generate conversation starters:', error);
      throw error;
    }
  }

  /**
   * Find interesting conversation hooks from answers
   * @private
   */
  _findConversationHooks(userAnswers, matchAnswers, userAnalysis, matchAnalysis, compatibility) {
    const hooks = {
      sharedInterests: [],
      interestingDifferences: [],
      deepQuestions: [],
      commonValues: [],
      complementaryTraits: []
    };

    // Find shared answers
    userAnswers.forEach(userAnswer => {
      const matchAnswer = matchAnswers.find(m => 
        m.questionNumber === userAnswer.questionNumber
      );

      if (matchAnswer) {
        // Check for similar answers
        if (this._areSimilarAnswers(userAnswer, matchAnswer)) {
          hooks.sharedInterests.push({
            question: userAnswer.questionId?.questionText,
            userAnswer: userAnswer.textAnswer || userAnswer.selectedOption,
            matchAnswer: matchAnswer.textAnswer || matchAnswer.selectedOption,
            dimension: userAnswer.questionId?.dimension
          });
        } else if (this._areInterestingOpposites(userAnswer, matchAnswer)) {
          hooks.interestingDifferences.push({
            question: userAnswer.questionId?.questionText,
            userAnswer: userAnswer.textAnswer || userAnswer.selectedOption,
            matchAnswer: matchAnswer.textAnswer || matchAnswer.selectedOption,
            dimension: userAnswer.questionId?.dimension
          });
        }
      }
    });

    // Add personality insights
    hooks.personalityMatch = {
      userAttachment: userAnalysis?.personalityProfile?.attachment_style,
      matchAttachment: matchAnalysis?.personalityProfile?.attachment_style,
      userLoveLanguage: userAnalysis?.personalityProfile?.dominant_love_language,
      matchLoveLanguage: matchAnalysis?.personalityProfile?.dominant_love_language,
      compatibilityScore: compatibility.overallScore,
      strongestDimension: this._getStrongestDimension(compatibility.dimensionScores)
    };

    // Find unique or interesting answers
    hooks.uniqueAnswers = this._findUniqueAnswers(userAnswers, matchAnswers);

    return hooks;
  }

  /**
   * Build GPT-4 prompt for conversation starters
   * @private
   */
  _buildStarterPrompt(insights) {
    let prompt = `Generate 5 personalized conversation starters for a dating app match based on these insights:\n\n`;
    
    prompt += `COMPATIBILITY: ${insights.personalityMatch.compatibilityScore}% overall match\n`;
    prompt += `Strongest connection: ${insights.personalityMatch.strongestDimension}\n\n`;

    if (insights.sharedInterests.length > 0) {
      prompt += `SHARED INTERESTS:\n`;
      insights.sharedInterests.slice(0, 3).forEach(shared => {
        prompt += `- Both answered "${shared.question}" similarly\n`;
        prompt += `  User: "${shared.userAnswer}" | Match: "${shared.matchAnswer}"\n`;
      });
      prompt += '\n';
    }

    if (insights.interestingDifferences.length > 0) {
      prompt += `INTERESTING DIFFERENCES (could spark good conversation):\n`;
      insights.interestingDifferences.slice(0, 2).forEach(diff => {
        prompt += `- On "${diff.question}"\n`;
        prompt += `  User: "${diff.userAnswer}" | Match: "${diff.matchAnswer}"\n`;
      });
      prompt += '\n';
    }

    prompt += `PERSONALITY INSIGHTS:\n`;
    prompt += `- User attachment: ${insights.personalityMatch.userAttachment}\n`;
    prompt += `- Match attachment: ${insights.personalityMatch.matchAttachment}\n`;
    prompt += `- User love language: ${insights.personalityMatch.userLoveLanguage}\n`;
    prompt += `- Match love language: ${insights.personalityMatch.matchLoveLanguage}\n\n`;

    prompt += `Generate conversation starters that:\n`;
    prompt += `1. Reference specific shared interests or answers\n`;
    prompt += `2. Feel natural and not too forward\n`;
    prompt += `3. Encourage genuine conversation\n`;
    prompt += `4. Range from light/fun to deeper questions\n`;
    prompt += `5. Are 1-2 sentences max\n\n`;

    prompt += `Return JSON format:\n`;
    prompt += `{
      "starters": [
        {
          "suggestion": "the conversation starter text",
          "category": "shared_interest|question_based|personality_match|icebreaker|deep_question",
          "basedOn": "brief note about what this references",
          "tone": "playful|curious|thoughtful|flirty|deep"
        }
      ]
    }`;

    return prompt;
  }

  /**
   * System prompt for conversation generation
   * @private
   */
  _getSystemPrompt() {
    return `You are an expert dating coach helping create personalized conversation starters.
    Your starters should:
    - Feel authentic and natural
    - Reference specific details from their profiles
    - Avoid generic pickup lines
    - Encourage meaningful conversation
    - Be appropriate for a first message
    - Consider Indian cultural context (be respectful, not too forward)
    - Mix playful and thoughtful approaches`;
  }

  // Helper methods
  _areSimilarAnswers(answer1, answer2) {
    // Logic to determine if answers are similar
    if (answer1.selectedOption && answer2.selectedOption) {
      return answer1.selectedOption === answer2.selectedOption;
    }
    // Could add more sophisticated text similarity checking
    return false;
  }

  _areInterestingOpposites(answer1, answer2) {
    // Logic to find complementary differences
    const opposites = {
      'introvert': 'extrovert',
      'spontaneous': 'planner',
      'morning': 'night'
    };
    // Implementation based on your questions
    return false;
  }

  _getStrongestDimension(dimensionScores) {
    let strongest = { dimension: '', score: 0 };
    for (const [dim, score] of Object.entries(dimensionScores)) {
      if (score > strongest.score) {
        strongest = { dimension: dim, score };
      }
    }
    const labels = {
      emotional_intimacy: 'Emotional Connection',
      life_vision: 'Life Goals',
      conflict_communication: 'Communication Style',
      love_languages: 'Affection Expression',
      physical_sexual: 'Physical Chemistry',
      lifestyle: 'Lifestyle Compatibility'
    };
    return labels[strongest.dimension] || strongest.dimension;
  }

  _findUniqueAnswers(userAnswers, matchAnswers) {
    // Find interesting unique answers for conversation hooks
    return [];
  }
}

module.exports = new ConversationStarterService();