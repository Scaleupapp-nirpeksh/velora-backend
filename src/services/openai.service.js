const OpenAI = require('openai');
const logger = require('../utils/logger');

/**
 * OpenAI Service
 * 
 * Handles all interactions with OpenAI API:
 * - GPT-4 for answer analysis (Module 4)
 * - Whisper for voice transcription (Module 3 - already using)
 * 
 * This service centralizes OpenAI API calls with:
 * - Error handling and retries
 * - Rate limiting awareness
 * - Structured JSON responses
 * - Token usage logging
 */

class OpenAIService {
  constructor() {
    // Initialize OpenAI client
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Configuration
    this.config = {
      analysisModel: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      analysisTemperature: parseFloat(process.env.ANALYSIS_TEMPERATURE) || 0.3,
      maxRetries: 3,
      retryDelay: 2000, // 2 seconds
      maxTokens: 4000 // For analysis responses
    };

    logger.info('OpenAI Service initialized', {
      model: this.config.analysisModel,
      temperature: this.config.analysisTemperature
    });
  }

  /**
   * Analyze user's 50 question answers using GPT-4
   * 
   * @param {Object} params - Analysis parameters
   * @param {String} params.userId - User's ID
   * @param {Array} params.answers - Array of answer objects with question data
   * @param {Number} params.questionsAnswered - Total questions answered
   * @returns {Promise<Object>} - Parsed analysis results
   * 
   * @throws {Error} - If API call fails after retries
   */
  async analyzeAnswers({ userId, answers, questionsAnswered }) {
    try {
      logger.info('Starting answer analysis', {
        userId,
        questionsAnswered,
        answersCount: answers.length
      });

      // Build the analysis prompt
      const prompt = this._buildAnalysisPrompt(answers, questionsAnswered);

      // Call GPT-4 with structured JSON response
      const response = await this._callGPT4WithRetry({
        systemPrompt: this._getSystemPrompt(),
        userPrompt: prompt,
        responseFormat: 'json_object'
      });

      // Parse the JSON response
      const analysis = JSON.parse(response);

      // Validate the response structure
      this._validateAnalysisResponse(analysis);

      logger.info('Answer analysis completed successfully', {
        userId,
        overallScore: analysis.overallScore,
        redFlagsCount: analysis.redFlags?.length || 0,
        dealbreakersCount: analysis.dealbreakers?.length || 0
      });

      return analysis;

    } catch (error) {
      logger.error('Answer analysis failed', {
        userId,
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get the system prompt for relationship psychology analysis
   * 
   * @returns {String} - System prompt
   * @private
   */
  _getSystemPrompt() {
    return `You are an expert relationship psychologist with 20+ years of experience in compatibility analysis, attachment theory, and personality assessment.

Your role is to analyze dating profile answers to:
1. Extract personality insights and psychological patterns
2. Assess compatibility across 6 dimensions
3. Detect red flags (toxic patterns, dishonesty, emotional unavailability)
4. Identify dealbreakers (fundamental incompatibilities)
5. Generate personality profiles using attachment theory, love languages, and Big Five traits
6. Cross-reference answers for consistency and authenticity

Guidelines:
- Be objective, evidence-based, and balanced
- Base insights on actual answer content, not assumptions
- Detect patterns across multiple questions
- Flag contradictions (e.g., "career first" vs "family most important")
- Consider cultural context (Indian dating norms)
- Be specific in red flag descriptions (cite question numbers)
- Assign severity levels accurately (1=minor to 5=critical)
- Generate compatibility notes that are actionable

Response Format:
- Return ONLY valid JSON matching the specified schema
- No markdown, no explanation, just JSON
- Include all required fields
- Use null for missing data, never omit fields`;
  }

  /**
   * Build the user prompt with all answers organized by dimension
   * 
   * @param {Array} answers - User's answers with question data
   * @param {Number} questionsAnswered - Total questions answered
   * @returns {String} - Formatted prompt
   * @private
   */
  _buildAnalysisPrompt(answers, questionsAnswered) {
    // Group answers by dimension
    const answersByDimension = this._groupAnswersByDimension(answers);

    // Build prompt sections
    let prompt = `Analyze these ${questionsAnswered} dating profile answers for comprehensive compatibility profiling.\n\n`;

    // Add each dimension's answers
    const dimensionNames = {
      'emotional_intimacy': 'DIMENSION 1: EMOTIONAL INTIMACY & VULNERABILITY (Q1-8)',
      'life_vision': 'DIMENSION 2: LIFE VISION & VALUES (Q9-18)',
      'conflict_communication': 'DIMENSION 3: CONFLICT & COMMUNICATION (Q19-25)',
      'love_languages': 'DIMENSION 4: LOVE LANGUAGES & AFFECTION (Q26-31)',
      'physical_sexual': 'DIMENSION 5: PHYSICAL & SEXUAL COMPATIBILITY (Q32-39)',
      'lifestyle': 'DIMENSION 6: LIFESTYLE & DAILY RHYTHMS (Q40-50)'
    };

    for (const [dimension, dimensionLabel] of Object.entries(dimensionNames)) {
      if (answersByDimension[dimension] && answersByDimension[dimension].length > 0) {
        prompt += `\n${dimensionLabel}\n`;
        prompt += '='.repeat(60) + '\n\n';

        answersByDimension[dimension].forEach(answer => {
          prompt += `Q${answer.questionNumber}: ${answer.questionText}\n`;
          
          // Add the answer based on type
          if (answer.textAnswer) {
            prompt += `Answer: "${answer.textAnswer}"\n`;
          } else if (answer.transcribedText) {
            prompt += `Answer (voice transcribed): "${answer.transcribedText}"\n`;
          } else if (answer.selectedOption) {
            prompt += `Selected: Option ${answer.selectedOption}\n`;
          } else if (answer.selectedOptions && answer.selectedOptions.length > 0) {
            prompt += `Selected: Options ${answer.selectedOptions.join(', ')}\n`;
          }

          // Add follow-up if exists
          if (answer.followUpAnswer) {
            prompt += `Follow-up: "${answer.followUpAnswer}"\n`;
          }

          prompt += '\n';
        });
      }
    }

    // Add analysis instructions
    prompt += `\n${'='.repeat(60)}\n`;
    prompt += `ANALYSIS TASKS:\n\n`;
    prompt += `1. DIMENSION SCORING (0-100 for each):\n`;
    prompt += `   - Emotional Intimacy: Attachment style, vulnerability, emotional intelligence\n`;
    prompt += `   - Life Vision: Goals, family plans, religion, career priorities, values alignment\n`;
    prompt += `   - Conflict & Communication: Disagreement handling, boundaries, emotional regulation\n`;
    prompt += `   - Love Languages: Touch, words, time, service, gifts preferences\n`;
    prompt += `   - Physical & Sexual: Intimacy comfort, frequency, communication, boundaries\n`;
    prompt += `   - Lifestyle: Energy patterns, social needs, routines, habits\n\n`;

    prompt += `2. PERSONALITY PROFILING:\n`;
    prompt += `   - Attachment style: secure, anxious, avoidant, or fearful-avoidant\n`;
    prompt += `   - Conflict style: direct, passive, aggressive, passive-aggressive, avoidant, collaborative\n`;
    prompt += `   - Love languages: Identify dominant and secondary\n`;
    prompt += `   - Big Five traits: Introversion (0-100), Openness (0-100), Conscientiousness (0-100), Emotional Intelligence (0-100)\n`;
    prompt += `   - Communication style: expressive, reserved, balanced, analytical, emotional\n\n`;

    prompt += `3. CONSISTENCY CHECK:\n`;
    prompt += `   - Cross-reference answers for contradictions\n`;
    prompt += `   - Calculate authenticity score (0-100)\n`;
    prompt += `   - Lower score if answers conflict (e.g., "career first" but "family most important")\n\n`;

    prompt += `4. RED FLAGS DETECTION:\n`;
    prompt += `   - Toxic behavior: Blame-shifting, manipulation, control\n`;
    prompt += `   - Emotional unavailability: Avoidance, detachment patterns\n`;
    prompt += `   - Dishonesty: Vague answers, contradictions, inconsistency\n`;
    prompt += `   - Commitment issues: Inconsistent relationship goals\n`;
    prompt += `   - Communication issues: Poor conflict resolution\n`;
    prompt += `   - Boundary issues: Lack of healthy boundaries\n`;
    prompt += `   - Insecurity: Excessive jealousy, low self-esteem patterns\n`;
    prompt += `   - Assign severity: 1=minor, 2=worth noting, 3=moderate, 4=serious, 5=critical\n\n`;

    prompt += `5. DEALBREAKER IDENTIFICATION:\n`;
    prompt += `   - Kids: Wants kids vs doesn't want kids\n`;
    prompt += `   - Religion: Religious vs non-religious\n`;
    prompt += `   - Location: City preferences, relocation willingness\n`;
    prompt += `   - Lifestyle: Party vs homebody, active vs sedentary\n`;
    prompt += `   - Values: Core value misalignments\n`;
    prompt += `   - Family involvement: Enmeshment vs independence\n`;
    prompt += `   - Intimacy pace: Physical intimacy timeline\n`;
    prompt += `   - Career priority: Career-first vs relationship-first\n\n`;

    prompt += `6. AI SUMMARY:\n`;
    prompt += `   - Generate 100-150 character bio summarizing personality\n`;
    prompt += `   - List 3-5 key strengths\n`;
    prompt += `   - Write compatibility notes (who they'd match well with)\n\n`;

    // Add JSON schema
    prompt += this._getResponseSchema();

    return prompt;
  }

  /**
   * Get the expected JSON response schema
   * 
   * @returns {String} - JSON schema description
   * @private
   */
  _getResponseSchema() {
    return `\n${'='.repeat(60)}\n
RETURN THIS EXACT JSON STRUCTURE:

{
  "dimensionScores": {
    "emotional_intimacy": {
      "score": 0-100,
      "insights": ["insight 1", "insight 2"],
      "strengths": ["strength 1"],
      "concerns": ["concern 1"]
    },
    "life_vision": { "score": 0-100, "insights": [], "strengths": [], "concerns": [] },
    "conflict_communication": { "score": 0-100, "insights": [], "strengths": [], "concerns": [] },
    "love_languages": { "score": 0-100, "insights": [], "strengths": [], "concerns": [] },
    "physical_sexual": { "score": 0-100, "insights": [], "strengths": [], "concerns": [] },
    "lifestyle": { "score": 0-100, "insights": [], "strengths": [], "concerns": [] }
  },
  "overallScore": 0-100,
  "authenticityScore": 0-100,
  "personalityProfile": {
    "attachment_style": "secure|anxious|avoidant|fearful-avoidant|unknown",
    "conflict_style": "direct|passive|aggressive|passive-aggressive|avoidant|collaborative|unknown",
    "dominant_love_language": "physical_touch|words_of_affirmation|quality_time|acts_of_service|receiving_gifts|unknown",
    "secondary_love_language": "physical_touch|words_of_affirmation|quality_time|acts_of_service|receiving_gifts|unknown",
    "introversion_score": 0-100,
    "emotional_intelligence": 0-100,
    "communication_style": "expressive|reserved|balanced|analytical|emotional|unknown",
    "openness": 0-100,
    "conscientiousness": 0-100
  },
  "redFlags": [
    {
      "category": "toxic_behavior|emotional_unavailability|dishonesty|commitment_issues|communication_issues|boundary_issues|insecurity|other",
      "severity": 1-5,
      "description": "Specific description with evidence",
      "questionNumbers": [4, 11]
    }
  ],
  "dealbreakers": [
    {
      "type": "kids|religion|location|lifestyle|values|family_involvement|intimacy_pace|career_priority|other",
      "value": "User's position",
      "incompatibleWith": ["incompatible value 1"],
      "questionNumber": 15
    }
  ],
  "aiSummary": {
    "shortBio": "100-150 character personality summary",
    "strengths": ["strength 1", "strength 2", "strength 3"],
    "compatibilityNotes": "What type of person they'd match well with"
  }
}

IMPORTANT:
- Return ONLY this JSON, no markdown or explanation
- All fields must be present (use empty arrays [] if no data)
- Scores must be integers 0-100
- Be specific in descriptions and insights
- Cite question numbers for red flags`;
  }

  /**
   * Group answers by their dimension
   * 
   * @param {Array} answers - User's answers
   * @returns {Object} - Answers grouped by dimension
   * @private
   */
  _groupAnswersByDimension(answers) {
    const grouped = {
      emotional_intimacy: [],
      life_vision: [],
      conflict_communication: [],
      love_languages: [],
      physical_sexual: [],
      lifestyle: []
    };

    answers.forEach(answer => {
      const dimension = answer.dimension;
      if (grouped[dimension]) {
        grouped[dimension].push(answer);
      }
    });

    return grouped;
  }

  /**
   * Call GPT-4 API with retry logic
   * 
   * @param {Object} params - API call parameters
   * @param {String} params.systemPrompt - System prompt
   * @param {String} params.userPrompt - User prompt
   * @param {String} params.responseFormat - Response format ('json_object' or 'text')
   * @param {Number} attempt - Current retry attempt (internal)
   * @returns {Promise<String>} - GPT-4 response content
   * @private
   */
  async _callGPT4WithRetry({ systemPrompt, userPrompt, responseFormat = 'json_object' }, attempt = 1) {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.analysisModel,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: responseFormat },
        temperature: this.config.analysisTemperature,
        max_tokens: this.config.maxTokens
      });

      // Log token usage
      logger.info('GPT-4 API call successful', {
        model: this.config.analysisModel,
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
        totalTokens: completion.usage.total_tokens
      });

      return completion.choices[0].message.content;

    } catch (error) {
      // Handle rate limiting
      if (error.status === 429 && attempt < this.config.maxRetries) {
        logger.warn(`Rate limited, retrying in ${this.config.retryDelay}ms (attempt ${attempt}/${this.config.maxRetries})`);
        await this._sleep(this.config.retryDelay);
        return this._callGPT4WithRetry({ systemPrompt, userPrompt, responseFormat }, attempt + 1);
      }

      // Handle other retryable errors
      if (this._isRetryableError(error) && attempt < this.config.maxRetries) {
        logger.warn(`GPT-4 API error, retrying (attempt ${attempt}/${this.config.maxRetries})`, {
          error: error.message
        });
        await this._sleep(this.config.retryDelay);
        return this._callGPT4WithRetry({ systemPrompt, userPrompt, responseFormat }, attempt + 1);
      }

      // Non-retryable error or max retries reached
      logger.error('GPT-4 API call failed', {
        error: error.message,
        status: error.status,
        attempt
      });
      throw new Error(`OpenAI API failed: ${error.message}`);
    }
  }

  /**
   * Check if error is retryable
   * 
   * @param {Error} error - Error object
   * @returns {Boolean} - True if retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    return retryableStatuses.includes(error.status);
  }

  /**
   * Sleep utility for retries
   * 
   * @param {Number} ms - Milliseconds to sleep
   * @returns {Promise} - Promise that resolves after delay
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Validate the analysis response structure
   * 
   * @param {Object} analysis - Parsed analysis object
   * @throws {Error} - If validation fails
   * @private
   */
  _validateAnalysisResponse(analysis) {
    // Check required top-level fields
    const requiredFields = [
      'dimensionScores',
      'overallScore',
      'authenticityScore',
      'personalityProfile',
      'redFlags',
      'dealbreakers',
      'aiSummary'
    ];

    for (const field of requiredFields) {
      if (!(field in analysis)) {
        throw new Error(`Missing required field in analysis response: ${field}`);
      }
    }

    // Check dimension scores
    const dimensions = [
      'emotional_intimacy',
      'life_vision',
      'conflict_communication',
      'love_languages',
      'physical_sexual',
      'lifestyle'
    ];

    for (const dimension of dimensions) {
      if (!analysis.dimensionScores[dimension]) {
        throw new Error(`Missing dimension in analysis response: ${dimension}`);
      }
      if (typeof analysis.dimensionScores[dimension].score !== 'number') {
        throw new Error(`Invalid score type for dimension: ${dimension}`);
      }
    }

    logger.info('Analysis response validation passed');
  }

  /**
   * Test OpenAI connection
   * 
   * @returns {Promise<Boolean>} - True if connection successful
   */
  async testConnection() {
    try {
      const response = await this.client.chat.completions.create({
        model: this.config.analysisModel,
        messages: [{ role: 'user', content: 'Test connection. Reply with "OK".' }],
        max_tokens: 10
      });

      logger.info('OpenAI connection test successful');
      return true;
    } catch (error) {
      logger.error('OpenAI connection test failed', { error: error.message });
      return false;
    }
  }
}

// Export singleton instance
module.exports = new OpenAIService();