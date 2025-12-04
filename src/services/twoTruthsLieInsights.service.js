const OpenAI = require('openai');
const TwoTruthsLieGame = require('../models/TwoTruthsLieGame');
const TwoTruthsLieStatement = require('../models/TwoTruthsLieStatement');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * TwoTruthsLie Insights Service
 * 
 * Generates AI-powered compatibility insights based on game results.
 * Uses OpenAI GPT-4 to analyze:
 * - The truths and lies each player shared
 * - How well they guessed each other's lies
 * - Patterns in what they chose to share
 * - Compatibility indicators from game behavior
 */

class TwoTruthsLieInsightsService {
  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.config = {
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      temperature: 0.7, // Slightly creative for fun insights
      maxTokens: 2000,
      maxRetries: 3,
      retryDelay: 2000,
    };

    logger.info('TwoTruthsLie Insights Service initialized');
  }

  /**
   * Generate insights for a completed game
   * @param {ObjectId} gameId - The game ID
   * @returns {Promise<Object>} - Generated insights
   */
  async generateInsights(gameId) {
    try {
      logger.info('Generating insights for game', { gameId });

      // Get game with populated users
      const game = await TwoTruthsLieGame.findById(gameId)
        .populate('initiatorId', 'firstName lastName username')
        .populate('partnerId', 'firstName lastName username');

      if (!game) {
        throw new Error('Game not found');
      }

      if (game.status !== 'completed') {
        throw new Error('Game must be completed to generate insights');
      }

      // Check if insights already exist
      if (game.insights && game.insights.generatedAt) {
        logger.info('Insights already exist, returning cached', { gameId });
        return game.insights;
      }

      // Get all statements
      const allStatements = await TwoTruthsLieStatement.getAllForGame(gameId);

      // Separate by author
      const initiatorStatements = allStatements.filter(
        s => s.authorId._id.toString() === game.initiatorId._id.toString()
      );
      const partnerStatements = allStatements.filter(
        s => s.authorId._id.toString() === game.partnerId._id.toString()
      );

      // Build the prompt
      const prompt = this._buildInsightsPrompt(
        game,
        initiatorStatements,
        partnerStatements
      );

      // Call OpenAI
      const response = await this._callOpenAI(prompt);

      // Parse response
      const insights = JSON.parse(response);

      // Validate and normalize insights
      const normalizedInsights = this._normalizeInsights(insights);

      // Save insights to game
      game.insights = {
        ...normalizedInsights,
        generatedAt: new Date(),
      };
      await game.save();

      logger.info('Insights generated successfully', {
        gameId,
        compatibilityScore: normalizedInsights.compatibilityScore,
      });

      return game.insights;

    } catch (error) {
      logger.error('Error generating insights:', error);
      throw error;
    }
  }

  /**
   * Build the prompt for OpenAI
   * @private
   */
  _buildInsightsPrompt(game, initiatorStatements, partnerStatements) {
    const initiator = game.initiatorId;
    const partner = game.partnerId;

    // Format statements for the prompt
    const formatStatements = (statements, authorName) => {
      return statements.map(s => {
        const sorted = s.statementsInDisplayOrder;
        const lieIndex = s.lieDisplayIndex;
        const guessedCorrectly = s.guess.isCorrect;

        return {
          round: s.roundNumber,
          truths: sorted.filter((_, i) => i !== lieIndex).map(st => st.text),
          lie: sorted[lieIndex].text,
          partnerGuessedCorrectly: guessedCorrectly,
        };
      });
    };

    const initiatorData = formatStatements(initiatorStatements, initiator.firstName);
    const partnerData = formatStatements(partnerStatements, partner.firstName);

    const prompt = `
Analyze this Two Truths and a Lie game between two people who matched on a dating app.

## Player 1: ${initiator.firstName}
Score: ${game.partnerScore}/10 (how many of ${partner.firstName}'s lies they correctly identified)

Their statements (what they shared about themselves):
${JSON.stringify(initiatorData, null, 2)}

## Player 2: ${partner.firstName}  
Score: ${game.initiatorScore}/10 (how many of ${initiator.firstName}'s lies they correctly identified)

Their statements (what they shared about themselves):
${JSON.stringify(partnerData, null, 2)}

## Analysis Request

Based on the truths they chose to share about themselves and the lies they crafted, provide insights about:

1. **Compatibility Score (0-100)**: How compatible do they seem based on:
   - Shared interests or values revealed in their truths
   - Communication style (creative lies vs straightforward)
   - How well they understood each other (guessing accuracy)
   - Topics they chose to share about

2. **Summary**: A warm, encouraging 2-3 sentence summary of what this game revealed about them as a potential couple.

3. **Observations**: 3-4 specific observations about their compatibility, personalities, or connection based on the game content.

4. **Fun Facts**: 2-3 interesting or amusing things discovered about them from their truths.

5. **Conversation Starters**: 3 thoughtful questions they could ask each other based on the truths revealed.

Respond in JSON format:
{
  "compatibilityScore": <number 0-100>,
  "summary": "<string>",
  "observations": ["<string>", ...],
  "funFacts": ["<string>", ...],
  "conversationStarters": ["<string>", ...]
}

Keep the tone warm, playful, and encouraging. Focus on connection potential rather than judgment. If truths reveal shared interests or complementary traits, highlight those.
`;

    return prompt;
  }

  /**
   * Call OpenAI API with retry logic
   * @private
   */
  async _callOpenAI(prompt, attempt = 1) {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: `You are a warm, insightful relationship analyst helping couples discover their compatibility through a fun game. You find connection points and express observations in an encouraging, positive way. Always respond with valid JSON.`,
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      });

      logger.info('OpenAI API call successful', {
        model: this.config.model,
        promptTokens: completion.usage.prompt_tokens,
        completionTokens: completion.usage.completion_tokens,
      });

      return completion.choices[0].message.content;

    } catch (error) {
      // Handle rate limiting
      if (error.status === 429 && attempt < this.config.maxRetries) {
        logger.warn(`Rate limited, retrying in ${this.config.retryDelay}ms`, {
          attempt,
          maxRetries: this.config.maxRetries,
        });
        await this._sleep(this.config.retryDelay);
        return this._callOpenAI(prompt, attempt + 1);
      }

      // Handle other retryable errors
      if (this._isRetryableError(error) && attempt < this.config.maxRetries) {
        logger.warn('OpenAI API error, retrying', {
          error: error.message,
          attempt,
        });
        await this._sleep(this.config.retryDelay);
        return this._callOpenAI(prompt, attempt + 1);
      }

      throw error;
    }
  }

  /**
   * Normalize and validate insights
   * @private
   */
  _normalizeInsights(insights) {
    // Ensure compatibility score is within bounds
    let compatibilityScore = parseInt(insights.compatibilityScore) || 70;
    compatibilityScore = Math.max(0, Math.min(100, compatibilityScore));

    // Ensure arrays exist and have reasonable lengths
    const observations = Array.isArray(insights.observations)
      ? insights.observations.slice(0, 5).map(o => String(o).slice(0, 200))
      : [];

    const funFacts = Array.isArray(insights.funFacts)
      ? insights.funFacts.slice(0, 4).map(f => String(f).slice(0, 200))
      : [];

    const conversationStarters = Array.isArray(insights.conversationStarters)
      ? insights.conversationStarters.slice(0, 5).map(c => String(c).slice(0, 200))
      : [];

    // Ensure summary exists and is reasonable length
    const summary = insights.summary
      ? String(insights.summary).slice(0, 1000)
      : 'You both showed creativity and openness in sharing about yourselves!';

    return {
      compatibilityScore,
      summary,
      observations,
      funFacts,
      conversationStarters,
    };
  }

  /**
   * Check if error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    return retryableStatuses.includes(error.status);
  }

  /**
   * Sleep utility
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Regenerate insights for a game (force refresh)
   * @param {ObjectId} gameId - The game ID
   * @returns {Promise<Object>} - New insights
   */
  async regenerateInsights(gameId) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId);

      if (!game) {
        throw new Error('Game not found');
      }

      // Clear existing insights
      game.insights = {};
      await game.save();

      // Generate fresh insights
      return this.generateInsights(gameId);

    } catch (error) {
      logger.error('Error regenerating insights:', error);
      throw error;
    }
  }

  /**
   * Generate a quick compatibility summary without full analysis
   * Useful for game history list view
   * @param {ObjectId} gameId - The game ID
   * @returns {Promise<Object>} - Quick summary
   */
  async getQuickSummary(gameId) {
    try {
      const game = await TwoTruthsLieGame.findById(gameId)
        .populate('initiatorId', 'firstName')
        .populate('partnerId', 'firstName');

      if (!game) {
        throw new Error('Game not found');
      }

      // If full insights exist, extract summary
      if (game.insights && game.insights.summary) {
        return {
          compatibilityScore: game.insights.compatibilityScore,
          summary: game.insights.summary,
          hasFullInsights: true,
        };
      }

      // Generate a simple summary without AI
      const totalScore = game.initiatorScore + game.partnerScore;
      const maxScore = 20;
      const scorePercentage = (totalScore / maxScore) * 100;

      let summary;
      if (scorePercentage >= 80) {
        summary = `${game.initiatorId.firstName} and ${game.partnerId.firstName} really understood each other!`;
      } else if (scorePercentage >= 60) {
        summary = `A fun game with some great moments of connection.`;
      } else if (scorePercentage >= 40) {
        summary = `Lots of surprises - you both have mysterious sides!`;
      } else {
        summary = `You kept each other guessing! So much to discover.`;
      }

      return {
        compatibilityScore: Math.round(scorePercentage * 0.8 + 20), // Normalize to 20-100 range
        summary,
        hasFullInsights: false,
      };

    } catch (error) {
      logger.error('Error getting quick summary:', error);
      throw error;
    }
  }

  /**
   * Batch generate insights for multiple games
   * Useful for backfilling or scheduled jobs
   * @param {Array} gameIds - Array of game IDs
   * @returns {Promise<Object>} - Results summary
   */
  async batchGenerateInsights(gameIds) {
    const results = {
      success: 0,
      failed: 0,
      skipped: 0,
      errors: [],
    };

    for (const gameId of gameIds) {
      try {
        const game = await TwoTruthsLieGame.findById(gameId);

        if (!game || game.status !== 'completed') {
          results.skipped++;
          continue;
        }

        if (game.insights && game.insights.generatedAt) {
          results.skipped++;
          continue;
        }

        await this.generateInsights(gameId);
        results.success++;

        // Small delay to avoid rate limiting
        await this._sleep(500);

      } catch (error) {
        results.failed++;
        results.errors.push({
          gameId,
          error: error.message,
        });
      }
    }

    logger.info('Batch insights generation completed', results);
    return results;
  }
}

module.exports = new TwoTruthsLieInsightsService();