// src/services/datePlanning.service.js

const mongoose = require('mongoose');
const OpenAI = require('openai');
const DateDecision = require('../models/DateDecision');
const CoupleCompatibility = require('../models/CoupleCompatibility');
const User = require('../models/User');
const Match = require('../models/Match');

// Game session models for preference extraction
const DreamBoardSession = require('../models/games/DreamBoardSession');
const WouldYouRatherSession = require('../models/games/WouldYouRatherSession');
const IntimacySpectrumSession = require('../models/games/IntimacySpectrumSession');
const WhatWouldYouDoSession = require('../models/games/WhatWouldYouDoSession');
const NeverHaveIEverSession = require('../models/games/NeverHaveIEverSession');

const logger = require('../utils/logger');

/**
 * DATE PLANNING SERVICE
 * 
 * Generates personalized date plans for couples who are ready/almost_ready.
 * 
 * Process:
 * 1. Extract preferences from game sessions
 * 2. Find common location between users
 * 3. Generate venue suggestions via GPT-4o
 * 4. Create conversation starters from game insights
 * 5. Identify sensitive topics to handle carefully
 */

class DatePlanningService {

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
  }

  // =====================================================
  // MAIN PUBLIC METHODS
  // =====================================================

  /**
   * Generate complete date plan for a couple
   * 
   * @param {ObjectId} matchId - The match ID
   * @param {ObjectId} userId - Requesting user
   * @returns {Promise<Object>} Complete date plan
   */
  async generateDatePlan(matchId, userId) {
    try {
      logger.info('Generating date plan', { matchId, userId });

      // Get the date decision (must exist and be ready/almost_ready)
      const decision = await this._getValidDecision(matchId, userId);

      if (!decision.datePlanAvailable) {
        throw new Error('Date plan not available for this decision status');
      }

      // Get match and players
      const match = await Match.findById(matchId);
      const { player1Id, player2Id } = this._getPlayerIds(match, userId);

      // Get user profiles with location
      const [player1, player2] = await Promise.all([
        User.findById(player1Id).select('firstName location preferences'),
        User.findById(player2Id).select('firstName location preferences')
      ]);

      // Get CoupleCompatibility for existing insights
      const compatibility = await this._getCompatibilityData(matchId, player1Id, player2Id);

      // ==================== EXTRACT PREFERENCES ====================

      const preferences = await this._extractPreferences(matchId, player1Id, player2Id, player1, player2);

      // ==================== FIND COMMON LOCATION ====================

      const locationInfo = this._findCommonLocation(player1, player2);

      // ==================== GENERATE DATE PLAN VIA GPT ====================

      const gptDatePlan = await this._generateGPTDatePlan(
        preferences,
        locationInfo,
        compatibility,
        player1?.firstName,
        player2?.firstName
      );

      // ==================== BUILD CONVERSATION STARTERS ====================

      const conversationStarters = this._buildConversationStarters(compatibility, preferences);

      // ==================== IDENTIFY SENSITIVE TOPICS ====================

      const sensitiveTopics = this._identifySensitiveTopics(compatibility, decision);

      // ==================== COMPILE DATE PLAN ====================

      const datePlan = {
        primaryVenue: gptDatePlan.primaryVenue,
        alternatives: gptDatePlan.alternatives || [],
        activities: gptDatePlan.activities || [],
        conversationStarters,
        sensitiveTopics,
        timing: gptDatePlan.timing || {
          suggestedDuration: '2-3 hours',
          bestTimeOfDay: 'evening',
          reasoning: 'Allows for relaxed conversation without time pressure'
        },
        extractedPreferences: preferences.summary
      };

      // Save to decision document
      decision.datePlan = datePlan;
      decision.datePlanAvailable = true;
      await decision.save();

      logger.info('Date plan generated successfully', { matchId });

      return {
        matchId,
        decision: decision.decision,
        readinessScore: decision.readinessScore,
        datePlan,
        locationInfo,
        generatedAt: new Date()
      };

    } catch (error) {
      logger.error('Error generating date plan:', error);
      throw error;
    }
  }

  /**
   * Get existing date plan (if already generated)
   */
  async getDatePlan(matchId, userId) {
    try {
      const decision = await this._getValidDecision(matchId, userId);

      if (!decision.datePlan || !decision.datePlan.primaryVenue) {
        // Generate if not exists
        return this.generateDatePlan(matchId, userId);
      }

      const match = await Match.findById(matchId);
      const { player1Id, player2Id } = this._getPlayerIds(match, userId);

      const [player1, player2] = await Promise.all([
        User.findById(player1Id).select('firstName location'),
        User.findById(player2Id).select('firstName location')
      ]);

      const locationInfo = this._findCommonLocation(player1, player2);

      return {
        matchId,
        decision: decision.decision,
        readinessScore: decision.readinessScore,
        datePlan: decision.datePlan,
        locationInfo,
        generatedAt: decision.generatedAt
      };

    } catch (error) {
      logger.error('Error getting date plan:', error);
      throw error;
    }
  }

  // =====================================================
  // PREFERENCE EXTRACTION
  // =====================================================

  /**
   * Extract preferences from all game sessions
   */
  async _extractPreferences(matchId, player1Id, player2Id, player1, player2) {
    const preferences = {
      lifestyle: [],
      activities: [],
      food: [],
      atmosphere: [],
      pace: null,
      communication: null,
      adventureLevel: null,
      budgetAlignment: null,
      sharedInterests: [],
      summary: {}
    };

    // Get all game sessions for this couple
    const [dreamBoard, wouldYouRather, intimacySpectrum, whatWouldYouDo, neverHaveIEver] = await Promise.all([
      this._getDreamBoardSession(matchId, player1Id, player2Id),
      this._getWouldYouRatherSession(matchId, player1Id, player2Id),
      this._getIntimacySpectrumSession(matchId, player1Id, player2Id),
      this._getWhatWouldYouDoSession(matchId, player1Id, player2Id),
      this._getNeverHaveIEverSession(matchId, player1Id, player2Id)
    ]);

    // Extract from DreamBoard (future vision, weekends, adventures)
    if (dreamBoard) {
      this._extractDreamBoardPreferences(dreamBoard, preferences);
    }

    // Extract from WouldYouRather (lifestyle choices)
    if (wouldYouRather) {
      this._extractWouldYouRatherPreferences(wouldYouRather, preferences);
    }

    // Extract from IntimacySpectrum (pace preferences)
    if (intimacySpectrum) {
      this._extractIntimacyPreferences(intimacySpectrum, preferences);
    }

    // Extract from WhatWouldYouDo (communication style, values)
    if (whatWouldYouDo) {
      this._extractWhatWouldYouDoPreferences(whatWouldYouDo, preferences);
    }

    // Extract from NeverHaveIEver (shared experiences)
    if (neverHaveIEver) {
      this._extractNeverHaveIEverPreferences(neverHaveIEver, preferences);
    }

    // Add user profile preferences if available
    this._addUserProfilePreferences(player1, player2, preferences);

    // Build summary
    preferences.summary = {
      sharedInterests: [...new Set(preferences.sharedInterests)].slice(0, 5),
      preferredPace: preferences.pace || 'moderate',
      communicationStyle: preferences.communication || 'balanced',
      adventureLevel: preferences.adventureLevel || 'moderate',
      budgetAlignment: preferences.budgetAlignment || 'moderate',
      topActivities: [...new Set(preferences.activities)].slice(0, 3),
      atmospherePreference: preferences.atmosphere[0] || 'relaxed'
    };

    return preferences;
  }

  /**
   * Extract preferences from DreamBoard session
   */
  _extractDreamBoardPreferences(session, preferences) {
    if (!session.results?.categoryAnalysis) return;

    const categories = session.results.categoryAnalysis;

    // Our Weekends - reveals activity preferences
    if (categories.our_weekends) {
      const weekendData = categories.our_weekends;
      if (weekendData.player1Selection && weekendData.player2Selection) {
        if (weekendData.alignment >= 70) {
          preferences.sharedInterests.push('aligned weekend lifestyle');
        }
      }
    }

    // Our Adventures - reveals adventure appetite
    if (categories.our_adventures) {
      const adventureData = categories.our_adventures;
      if (adventureData.alignment >= 70) {
        preferences.adventureLevel = 'high';
        preferences.activities.push('adventure activities');
      } else if (adventureData.alignment >= 40) {
        preferences.adventureLevel = 'moderate';
      } else {
        preferences.adventureLevel = 'low';
      }
    }

    // Our Money - reveals budget preferences
    if (categories.our_money) {
      const moneyData = categories.our_money;
      if (moneyData.alignment >= 70) {
        preferences.budgetAlignment = 'aligned';
      }
    }

    // Extract from voice transcripts if available
    if (session.player1Selections) {
      for (const selection of session.player1Selections) {
        if (selection.voiceTranscript) {
          // GPT will use these transcripts for context
          preferences.lifestyle.push(selection.voiceTranscript.substring(0, 200));
        }
      }
    }
  }

  /**
   * Extract preferences from WouldYouRather session
   */
  _extractWouldYouRatherPreferences(session, preferences) {
    if (!session.results?.categoryBreakdown) return;

    const categories = session.results.categoryBreakdown;

    // Lifestyle category reveals activity preferences
    if (categories.lifestyle && categories.lifestyle >= 70) {
      preferences.sharedInterests.push('lifestyle alignment');
    }

    // Social category
    if (categories.social) {
      if (categories.social >= 70) {
        preferences.atmosphere.push('social');
      } else {
        preferences.atmosphere.push('intimate');
      }
    }

    // Adventure category
    if (categories.adventure) {
      if (categories.adventure >= 70) {
        preferences.activities.push('adventurous activities');
        preferences.adventureLevel = preferences.adventureLevel || 'high';
      }
    }

    // Extract from matched answers
    if (session.results?.matchedAnswers) {
      for (const match of session.results.matchedAnswers.slice(0, 5)) {
        if (match.category && match.chosenOption) {
          preferences.sharedInterests.push(`both chose: ${match.chosenOption}`);
        }
      }
    }
  }

  /**
   * Extract preferences from IntimacySpectrum session
   */
  _extractIntimacyPreferences(session, preferences) {
    if (!session.results?.categoryScores) return;

    const scores = session.results.categoryScores;

    // Communication score indicates conversation preference
    if (scores.communication && scores.communication.compatibility >= 70) {
      preferences.communication = 'open';
      preferences.sharedInterests.push('good communication alignment');
    }

    // Average gap indicates overall pace alignment
    if (session.results.averageGap) {
      if (session.results.averageGap < 15) {
        preferences.pace = 'well-aligned';
      } else if (session.results.averageGap < 30) {
        preferences.pace = 'moderate';
      } else {
        preferences.pace = 'take-it-slow';
      }
    }
  }

  /**
   * Extract preferences from WhatWouldYouDo session
   */
  _extractWhatWouldYouDoPreferences(session, preferences) {
    if (!session.results?.categoryScores) return;

    const scores = session.results.categoryScores;

    // Communication style from responses
    if (scores.communication && scores.communication >= 70) {
      preferences.communication = 'strong communicators';
    }

    // Values alignment
    if (scores.values && scores.values >= 70) {
      preferences.sharedInterests.push('shared values');
    }

    // Trust foundation
    if (scores.trust_honesty && scores.trust_honesty >= 70) {
      preferences.sharedInterests.push('trust foundation');
    }
  }

  /**
   * Extract preferences from NeverHaveIEver session
   */
  _extractNeverHaveIEverPreferences(session, preferences) {
    if (!session.results?.conversationStarters) return;

    // Conversation starters from differing answers are gold for dates
    for (const starter of session.results.conversationStarters.slice(0, 3)) {
      if (starter.question) {
        preferences.sharedInterests.push(`explore: ${starter.question}`);
      }
    }
  }

  /**
   * Add preferences from user profiles
   */
  _addUserProfilePreferences(player1, player2, preferences) {
    // Add from user preferences if available
    if (player1?.preferences?.datePreferences) {
      preferences.activities.push(...(player1.preferences.datePreferences.activities || []));
    }
    if (player2?.preferences?.datePreferences) {
      preferences.activities.push(...(player2.preferences.datePreferences.activities || []));
    }
  }

  // =====================================================
  // LOCATION HANDLING
  // =====================================================

  /**
   * Find common location between two users
   */
  _findCommonLocation(player1, player2) {
    const loc1 = player1?.location;
    const loc2 = player2?.location;

    // Default fallback
    const defaultLocation = {
      city: 'your city',
      area: null,
      hasCoordinates: false,
      midpoint: null,
      locationType: 'unknown'
    };

    // If neither has location
    if (!loc1 && !loc2) {
      return defaultLocation;
    }

    // If only one has location, use that
    if (!loc1 && loc2) {
      return {
        city: loc2.city || loc2.name || 'your city',
        area: loc2.area || loc2.locality || null,
        hasCoordinates: !!(loc2.coordinates || loc2.lat),
        coordinates: loc2.coordinates || (loc2.lat ? { lat: loc2.lat, lng: loc2.lng } : null),
        locationType: 'single_user'
      };
    }

    if (loc1 && !loc2) {
      return {
        city: loc1.city || loc1.name || 'your city',
        area: loc1.area || loc1.locality || null,
        hasCoordinates: !!(loc1.coordinates || loc1.lat),
        coordinates: loc1.coordinates || (loc1.lat ? { lat: loc1.lat, lng: loc1.lng } : null),
        locationType: 'single_user'
      };
    }

    // Both have location - find common ground
    const city1 = (loc1.city || loc1.name || '').toLowerCase().trim();
    const city2 = (loc2.city || loc2.name || '').toLowerCase().trim();

    // Same city
    if (city1 === city2 && city1) {
      const result = {
        city: loc1.city || loc1.name,
        locationType: 'same_city',
        hasCoordinates: false
      };

      // If both have coordinates, find midpoint
      const coords1 = loc1.coordinates || (loc1.lat ? { lat: loc1.lat, lng: loc1.lng } : null);
      const coords2 = loc2.coordinates || (loc2.lat ? { lat: loc2.lat, lng: loc2.lng } : null);

      if (coords1 && coords2) {
        result.hasCoordinates = true;
        result.midpoint = this._calculateMidpoint(coords1, coords2);
        result.player1Area = loc1.area || loc1.locality;
        result.player2Area = loc2.area || loc2.locality;
      }

      return result;
    }

    // Different cities - suggest midpoint or one city
    return {
      city: loc1.city || loc1.name || loc2.city || loc2.name,
      player1City: loc1.city || loc1.name,
      player2City: loc2.city || loc2.name,
      locationType: 'different_cities',
      suggestion: `Consider meeting in ${loc1.city || loc2.city} or finding a spot between ${loc1.city} and ${loc2.city}`
    };
  }

  /**
   * Calculate midpoint between two coordinates
   */
  _calculateMidpoint(coords1, coords2) {
    const lat1 = parseFloat(coords1.lat || coords1.latitude);
    const lng1 = parseFloat(coords1.lng || coords1.longitude);
    const lat2 = parseFloat(coords2.lat || coords2.latitude);
    const lng2 = parseFloat(coords2.lng || coords2.longitude);

    if (isNaN(lat1) || isNaN(lng1) || isNaN(lat2) || isNaN(lng2)) {
      return null;
    }

    return {
      lat: (lat1 + lat2) / 2,
      lng: (lng1 + lng2) / 2
    };
  }

  // =====================================================
  // GPT DATE PLAN GENERATION
  // =====================================================

  /**
   * Generate date plan using GPT-4o
   */
  async _generateGPTDatePlan(preferences, locationInfo, compatibility, player1Name, player2Name) {
    try {
      const prompt = this._buildDatePlanPrompt(preferences, locationInfo, compatibility, player1Name, player2Name);

      const response = await this.openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are a thoughtful date planning assistant for Velora, a dating app focused on meaningful connections. 
            
Your job is to suggest personalized date venues and activities based on couple compatibility data and preferences.

IMPORTANT GUIDELINES:
- Suggest REAL, plausible venue types for the given city (don't make up specific business names)
- Focus on venues that encourage conversation and connection
- Consider the couple's compatibility insights and pace preferences
- Provide 1 primary venue + 2 alternatives
- Keep suggestions practical and accessible
- Match the atmosphere to their communication style and adventure level

Respond in valid JSON format only.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0]?.message?.content;
      const parsed = JSON.parse(content);

      return this._formatGPTResponse(parsed, locationInfo);

    } catch (error) {
      logger.error('GPT date plan generation failed:', error);
      
      // Return fallback plan
      return this._getFallbackDatePlan(locationInfo, preferences);
    }
  }

  /**
   * Build prompt for GPT date plan generation
   */
  _buildDatePlanPrompt(preferences, locationInfo, compatibility, player1Name, player2Name) {
    const city = locationInfo.city || 'their city';
    const area = locationInfo.area || locationInfo.midpoint ? 'central area' : '';

    let compatibilityContext = '';
    if (compatibility) {
      compatibilityContext = `
COMPATIBILITY INSIGHTS:
- Overall compatibility: ${compatibility.overallCompatibility?.score || 'N/A'}%
- Strengths: ${compatibility.strengths?.slice(0, 3).map(s => s.text).join(', ') || 'Good chemistry'}
- Areas to explore: ${compatibility.discussionAreas?.slice(0, 2).map(d => d.text).join(', ') || 'Getting to know each other'}
`;
    }

    return `
Create a personalized first date plan for a couple.

COUPLE PROFILE:
- Names: ${player1Name || 'User 1'} and ${player2Name || 'User 2'}
- Location: ${city}${area ? `, preferably around ${area}` : ''}
- Location type: ${locationInfo.locationType}
${locationInfo.suggestion ? `- Note: ${locationInfo.suggestion}` : ''}

EXTRACTED PREFERENCES:
- Shared interests: ${preferences.summary.sharedInterests.join(', ') || 'Still discovering'}
- Preferred pace: ${preferences.summary.preferredPace}
- Communication style: ${preferences.summary.communicationStyle}
- Adventure level: ${preferences.summary.adventureLevel}
- Atmosphere preference: ${preferences.summary.atmospherePreference}
- Top activities: ${preferences.summary.topActivities.join(', ') || 'Open to suggestions'}
${compatibilityContext}

Generate a date plan with:
1. primaryVenue - Main recommendation with name, type, description, whyRecommended, priceRange ($/$$/$$$), atmosphere, bestFor, location (area, city)
2. alternatives - 2 alternative venues (same structure)
3. activities - 2-3 activity suggestions with name, description, duration, whyGood
4. timing - suggestedDuration, bestTimeOfDay, reasoning

JSON format required.`;
  }

  /**
   * Format GPT response into our schema
   */
  _formatGPTResponse(gptResponse, locationInfo) {
    const formatVenue = (venue) => {
      if (!venue) return null;
      
      return {
        name: venue.name || 'Cozy local spot',
        type: this._mapVenueType(venue.type),
        description: venue.description || '',
        whyRecommended: venue.whyRecommended || venue.why_recommended || '',
        priceRange: venue.priceRange || venue.price_range || '$$',
        atmosphere: venue.atmosphere || 'relaxed',
        bestFor: venue.bestFor || venue.best_for || 'conversation',
        location: {
          area: venue.location?.area || venue.area || '',
          city: venue.location?.city || locationInfo.city || ''
        },
        alignedPreferences: venue.alignedPreferences || []
      };
    };

    return {
      primaryVenue: formatVenue(gptResponse.primaryVenue || gptResponse.primary_venue),
      alternatives: (gptResponse.alternatives || []).map(formatVenue).filter(Boolean),
      activities: (gptResponse.activities || []).map(act => ({
        name: act.name || '',
        description: act.description || '',
        duration: act.duration || '1 hour',
        whyGood: act.whyGood || act.why_good || ''
      })),
      timing: {
        suggestedDuration: gptResponse.timing?.suggestedDuration || gptResponse.timing?.suggested_duration || '2-3 hours',
        bestTimeOfDay: gptResponse.timing?.bestTimeOfDay || gptResponse.timing?.best_time_of_day || 'evening',
        reasoning: gptResponse.timing?.reasoning || ''
      }
    };
  }

  /**
   * Map venue type to our enum
   */
  _mapVenueType(type) {
    const typeMap = {
      'restaurant': 'restaurant',
      'cafe': 'cafe',
      'coffee': 'cafe',
      'coffee shop': 'cafe',
      'bar': 'bar',
      'pub': 'bar',
      'activity': 'activity',
      'experience': 'activity',
      'outdoor': 'outdoor',
      'park': 'outdoor',
      'nature': 'outdoor',
      'cultural': 'cultural',
      'museum': 'cultural',
      'gallery': 'cultural',
      'entertainment': 'entertainment',
      'movie': 'entertainment',
      'show': 'entertainment'
    };

    const normalizedType = (type || '').toLowerCase();
    return typeMap[normalizedType] || 'restaurant';
  }

  /**
   * Fallback date plan if GPT fails
   */
  _getFallbackDatePlan(locationInfo, preferences) {
    const city = locationInfo.city || 'your city';
    const atmosphere = preferences.summary?.atmospherePreference || 'relaxed';

    return {
      primaryVenue: {
        name: `A quiet café in ${city}`,
        type: 'cafe',
        description: 'A comfortable spot for your first conversation',
        whyRecommended: 'Cafés provide a relaxed atmosphere perfect for getting to know each other',
        priceRange: '$$',
        atmosphere: atmosphere,
        bestFor: 'First date conversation',
        location: { city, area: '' },
        alignedPreferences: []
      },
      alternatives: [
        {
          name: `A casual restaurant in ${city}`,
          type: 'restaurant',
          description: 'Good food with a comfortable vibe',
          whyRecommended: 'Sharing a meal creates natural conversation opportunities',
          priceRange: '$$',
          atmosphere: 'casual',
          bestFor: 'Dinner date',
          location: { city, area: '' }
        }
      ],
      activities: [
        {
          name: 'Walk and talk',
          description: 'Take a stroll around a nice area after your meal/coffee',
          duration: '30-45 mins',
          whyGood: 'Walking side-by-side can make conversation flow more naturally'
        }
      ],
      timing: {
        suggestedDuration: '2-3 hours',
        bestTimeOfDay: 'evening',
        reasoning: 'Evening dates feel more relaxed and have natural end points'
      }
    };
  }

  // =====================================================
  // CONVERSATION STARTERS & SENSITIVE TOPICS
  // =====================================================

  /**
   * Build conversation starters from compatibility insights
   * FIXED: Handles different data structures and ensures prompt is always set
   */
  _buildConversationStarters(compatibility, preferences) {
    const starters = [];

    // Default starters to use as fallback
    const defaultStarters = [
      {
        topic: 'First impressions',
        prompt: 'What made you want to match with me?',
        source: 'default',
        depth: 'light'
      },
      {
        topic: 'Game highlights',
        prompt: 'Which game did you enjoy playing the most? Any surprising discoveries?',
        source: 'default',
        depth: 'medium'
      },
      {
        topic: 'Future dreams',
        prompt: 'What\'s something you\'re really looking forward to in the next year?',
        source: 'default',
        depth: 'medium'
      },
      {
        topic: 'Weekend vibes',
        prompt: 'What does your ideal weekend look like?',
        source: 'default',
        depth: 'light'
      },
      {
        topic: 'Hidden talents',
        prompt: 'What\'s something you\'re good at that most people don\'t know about?',
        source: 'default',
        depth: 'medium'
      }
    ];

    // From compatibility insights - handle different possible structures
    if (compatibility?.conversationStarters && Array.isArray(compatibility.conversationStarters)) {
      for (const starter of compatibility.conversationStarters.slice(0, 3)) {
        // Try multiple possible field names for the prompt text
        const promptText = starter.text || starter.prompt || starter.question || starter.starter || starter.content;
        
        if (promptText && typeof promptText === 'string' && promptText.trim().length > 0) {
          starters.push({
            topic: starter.sourceGame || starter.source || starter.topic || 'Your games',
            prompt: promptText.trim(),
            source: starter.sourceGame || starter.source || 'compatibility',
            depth: starter.depth || 'medium'
          });
        }
      }
    }

    // From shared interests
    if (preferences?.summary?.sharedInterests && Array.isArray(preferences.summary.sharedInterests)) {
      for (const interest of preferences.summary.sharedInterests.slice(0, 2)) {
        // Skip "both chose:" entries and empty strings
        if (interest && typeof interest === 'string' && !interest.startsWith('both chose:') && interest.trim().length > 0) {
          starters.push({
            topic: 'Shared Interest',
            prompt: `You both showed interest in ${interest}. What draws you to it?`,
            source: 'preferences',
            depth: 'light'
          });
        }
      }
    }

    // Fill with defaults until we have 5 starters
    let defaultIndex = 0;
    while (starters.length < 5 && defaultIndex < defaultStarters.length) {
      // Check if we already have a similar topic
      const defaultStarter = defaultStarters[defaultIndex];
      const hasSimilarTopic = starters.some(s => 
        s.topic.toLowerCase() === defaultStarter.topic.toLowerCase()
      );
      
      if (!hasSimilarTopic) {
        starters.push(defaultStarter);
      }
      defaultIndex++;
    }

    // Final safety filter - ensure ALL starters have valid prompt field
    const validStarters = starters.filter(s => {
      return s && 
             s.prompt && 
             typeof s.prompt === 'string' && 
             s.prompt.trim().length > 0 &&
             s.topic &&
             typeof s.topic === 'string';
    });

    // If somehow we still don't have enough, add more defaults
    while (validStarters.length < 3) {
      const fallback = defaultStarters[validStarters.length];
      if (fallback) {
        validStarters.push(fallback);
      } else {
        break;
      }
    }

    return validStarters.slice(0, 5);
  }

  /**
   * Identify sensitive topics from cautions and red flags
   * FIXED: Handles missing/undefined fields gracefully
   */
  _identifySensitiveTopics(compatibility, decision) {
    const topics = [];

    // From decision cautions
    if (decision?.cautions && Array.isArray(decision.cautions)) {
      for (const caution of decision.cautions) {
        if (caution.relatedDimension && caution.description) {
          topics.push({
            topic: caution.relatedDimension,
            reason: caution.description,
            approach: caution.suggestion || 'Approach this topic gently and listen actively'
          });
        }
      }
    }

    // From compatibility discussion areas
    if (compatibility?.discussionAreas && Array.isArray(compatibility.discussionAreas)) {
      for (const area of compatibility.discussionAreas.slice(0, 2)) {
        const areaText = area.text || area.description || area.content;
        if (areaText) {
          topics.push({
            topic: area.sourceGame || area.source || 'Compatibility',
            reason: areaText,
            approach: 'This came up in your games - worth discussing openly'
          });
        }
      }
    }

    // Add common first date sensitive topics if we don't have enough
    const defaultSensitiveTopics = [
      {
        topic: 'Past relationships',
        reason: 'Can be heavy for a first date',
        approach: 'Keep it brief if it comes up, focus on what you learned'
      },
      {
        topic: 'Work stress',
        reason: 'Can dominate conversation negatively',
        approach: 'Share briefly but pivot to passions and interests'
      }
    ];

    let defaultIndex = 0;
    while (topics.length < 2 && defaultIndex < defaultSensitiveTopics.length) {
      topics.push(defaultSensitiveTopics[defaultIndex]);
      defaultIndex++;
    }

    // Validate all topics have required fields
    return topics
      .filter(t => t && t.topic && t.reason && t.approach)
      .slice(0, 4);
  }

  // =====================================================
  // HELPER METHODS - GAME SESSION RETRIEVAL
  // =====================================================

  async _getDreamBoardSession(matchId, player1Id, player2Id) {
    return DreamBoardSession.findOne({
      $or: [
        { matchId, status: 'completed' },
        { player1Id, player2Id, status: 'completed' },
        { player1Id: player2Id, player2Id: player1Id, status: 'completed' }
      ]
    }).sort({ completedAt: -1 });
  }

  async _getWouldYouRatherSession(matchId, player1Id, player2Id) {
    return WouldYouRatherSession.findOne({
      $or: [
        { matchId, status: 'completed' },
        { player1Id, player2Id, status: 'completed' },
        { player1Id: player2Id, player2Id: player1Id, status: 'completed' }
      ]
    }).sort({ completedAt: -1 });
  }

  async _getIntimacySpectrumSession(matchId, player1Id, player2Id) {
    return IntimacySpectrumSession.findOne({
      $or: [
        { matchId, status: 'completed' },
        { player1Id, player2Id, status: 'completed' },
        { player1Id: player2Id, player2Id: player1Id, status: 'completed' }
      ]
    }).sort({ completedAt: -1 });
  }

  async _getWhatWouldYouDoSession(matchId, player1Id, player2Id) {
    return WhatWouldYouDoSession.findOne({
      $or: [
        { matchId, status: 'completed' },
        { player1Id, player2Id, status: 'completed' },
        { player1Id: player2Id, player2Id: player1Id, status: 'completed' }
      ]
    }).sort({ completedAt: -1 });
  }

  async _getNeverHaveIEverSession(matchId, player1Id, player2Id) {
    return NeverHaveIEverSession.findOne({
      $or: [
        { matchId, status: 'completed' },
        { player1Id, player2Id, status: 'completed' },
        { player1Id: player2Id, player2Id: player1Id, status: 'completed' }
      ]
    }).sort({ completedAt: -1 });
  }

  // =====================================================
  // HELPER METHODS - VALIDATION
  // =====================================================

  async _getValidDecision(matchId, userId) {
    const match = await Match.findById(matchId);
    if (!match) throw new Error('Match not found');

    const userIdStr = userId.toString();
    const isParticipant = 
      match.userId?.toString() === userIdStr ||
      match.matchedUserId?.toString() === userIdStr;

    if (!isParticipant) {
      throw new Error('You are not a participant in this match');
    }

    const { player1Id, player2Id } = this._getPlayerIds(match, userId);
    
    const decision = await DateDecision.findForCouple(matchId, player1Id, player2Id);
    
    if (!decision) {
      throw new Error('Date decision not found. Please check readiness first.');
    }

    return decision;
  }

  _getPlayerIds(match, userId) {
    const userIdStr = userId.toString();

    if (match.userId?.toString() === userIdStr) {
      return {
        player1Id: match.userId,
        player2Id: match.matchedUserId
      };
    } else {
      return {
        player1Id: match.matchedUserId,
        player2Id: match.userId
      };
    }
  }

  async _getCompatibilityData(matchId, player1Id, player2Id) {
    let compatibility = await CoupleCompatibility.findOne({ matchId });

    if (!compatibility) {
      compatibility = await CoupleCompatibility.findOne({
        $or: [
          { player1Id, player2Id },
          { player1Id: player2Id, player2Id: player1Id }
        ]
      });
    }

    return compatibility;
  }
}

module.exports = new DatePlanningService();