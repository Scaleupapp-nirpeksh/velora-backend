// src/services/games/dreamBoard.service.js

const DreamBoardCategory = require('../../models/games/DreamBoardCategory');
const DreamBoardSession = require('../../models/games/DreamBoardSession');
const Match = require('../../models/Match');
const User = require('../../models/User');
const s3Service = require('../s3.service');
const OpenAI = require('openai');
const logger = require('../../utils/logger');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Initialize OpenAI client
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * DREAM BOARD - GAME SERVICE
 * 
 * Async vision board compatibility game.
 * Both players build their dream future by selecting cards
 * across 10 life categories, then compare their visions.
 * 
 * Key Features:
 * - Card selection with priority & timeline
 * - Optional voice elaboration per category (transcribed by Whisper)
 * - Per-category alignment scoring (enhanced by voice context)
 * - AI-powered romantic compatibility insights
 * - Post-game discussion via voice notes
 */

class DreamBoardService {

  // =====================================================
  // INVITATION MANAGEMENT
  // =====================================================

  /**
   * Create a new game invitation
   * @param {ObjectId} initiatorId - User sending invitation
   * @param {ObjectId} matchId - The match to play with
   * @returns {Promise<Object>} Session and invited user info
   */
  async createInvitation(initiatorId, matchId) {
    // Validate match exists
    const match = await Match.findById(matchId);
    if (!match) {
      throw new Error('Match not found');
    }

    // Determine players
    const user1Id = match.userId.toString();
    const user2Id = match.matchedUserId.toString();
    const initiatorIdStr = initiatorId.toString();

    if (initiatorIdStr !== user1Id && initiatorIdStr !== user2Id) {
      throw new Error('You are not part of this match');
    }

    // Check mutual match
    if (!match.isMutualMatch) {
      throw new Error('Both users must have liked each other to play games');
    }

    const invitedUserId = initiatorIdStr === user1Id ? user2Id : user1Id;

    // Check for existing active game
    const existingGame = await DreamBoardSession.hasActiveGame(initiatorId, invitedUserId);
    if (existingGame) {
      throw new Error('An active Dream Board game already exists between you two');
    }

    // Get invited user info
    const invitedUser = await User.findById(invitedUserId)
      .select('firstName lastName username profilePhoto');

    if (!invitedUser) {
      throw new Error('Invited user not found');
    }

    // Create session
    const session = new DreamBoardSession({
      matchId,
      player1: {
        userId: initiatorId,
        selections: [],
        totalSelected: 0,
        isComplete: false,
        elaborationCount: 0
      },
      player2: {
        userId: invitedUserId,
        selections: [],
        totalSelected: 0,
        isComplete: false,
        elaborationCount: 0
      },
      status: 'pending',
      invitedAt: new Date(),
      expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000) // 48 hours
    });

    await session.save();

    logger.info('Dream Board invitation created', {
      sessionId: session.sessionId,
      initiator: initiatorId,
      invited: invitedUserId
    });

    return {
      session,
      invitedUser: {
        userId: invitedUser._id,
        firstName: invitedUser.firstName,
        lastName: invitedUser.lastName,
        username: invitedUser.username,
        profilePhoto: invitedUser.profilePhoto
      }
    };
  }

  /**
   * Accept a game invitation
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User accepting
   * @returns {Promise<Object>} Updated session
   */
  async acceptInvitation(sessionId, userId) {
    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    if (userId.toString() !== p2Id) {
      throw new Error('Only the invited player can accept');
    }

    if (session.status !== 'pending') {
      throw new Error('Invitation is no longer pending');
    }

    if (new Date() > session.expiresAt) {
      session.status = 'expired';
      await session.save();
      throw new Error('Invitation has expired');
    }

    session.status = 'active';
    session.acceptedAt = new Date();
    session.lastActivityAt = new Date();
    await session.save();

    logger.info('Dream Board invitation accepted', {
      sessionId: session.sessionId,
      userId: userId
    });

    return session;
  }

  /**
   * Decline a game invitation
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User declining
   * @returns {Promise<Object>} Updated session
   */
  async declineInvitation(sessionId, userId) {
    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
    if (userId.toString() !== p2Id) {
      throw new Error('Only the invited player can decline');
    }

    if (session.status !== 'pending') {
      throw new Error('Invitation is no longer pending');
    }

    session.status = 'declined';
    session.lastActivityAt = new Date();
    await session.save();

    logger.info('Dream Board invitation declined', {
      sessionId: session.sessionId,
      userId: userId
    });

    return session;
  }

  /**
   * Get pending invitation for a user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object|null>} Pending invitation or null
   */
  async getPendingInvitation(userId) {
    const session = await DreamBoardSession.findPendingInvitation(userId);

    if (!session) {
      return null;
    }

    return {
      sessionId: session.sessionId,
      invitedBy: {
        userId: session.player1.userId._id,
        firstName: session.player1.userId.firstName,
        lastName: session.player1.userId.lastName,
        profilePhoto: session.player1.userId.profilePhoto
      },
      expiresAt: session.expiresAt,
      gameInfo: {
        name: 'Dream Board',
        tagline: 'See if your futures align',
        description: 'Build your dream future across 10 life categories and discover how aligned your visions are.',
        categoryCount: 10,
        estimatedTime: '10-15 minutes',
        features: [
          'Choose vision cards for 10 life areas',
          'Add voice notes to explain your choices (optional)',
          'AI analyzes your compatibility',
          'Discuss your dreams together'
        ]
      }
    };
  }

  /**
   * Get active session for a user
   * @param {ObjectId} userId - User ID
   * @returns {Promise<Object|null>} Active session or null
   */
  async getActiveSession(userId) {
    const session = await DreamBoardSession.findActiveForUser(userId);

    if (!session) {
      return null;
    }

    const playerInfo = session.getPlayerInfo(userId);
    const progress = session.getProgress(userId);

    return {
      sessionId: session.sessionId,
      status: session.status,
      matchId: session.matchId,
      progress,
      partner: {
        userId: playerInfo.partner.userId._id,
        firstName: playerInfo.partner.userId.firstName,
        lastName: playerInfo.partner.userId.lastName,
        profilePhoto: playerInfo.partner.userId.profilePhoto
      },
      expiresAt: session.expiresAt,
      createdAt: session.createdAt
    };
  }

  /**
   * Get session state
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User requesting
   * @returns {Promise<Object>} Session state
   */
  async getSessionState(sessionId, userId) {
    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!session.isParticipant(userId)) {
      throw new Error('You are not a participant in this game');
    }

    const playerInfo = session.getPlayerInfo(userId);
    const progress = session.getProgress(userId);

    // Get categories for reference
    const categories = await DreamBoardCategory.getAllCategories();

    // Build selections map for the player (including elaboration status)
    const selectionsMap = {};
    playerInfo.player.selections.forEach(sel => {
      selectionsMap[sel.categoryNumber] = {
        categoryId: sel.categoryId,
        cardId: sel.cardId,
        priority: sel.priority,
        timeline: sel.timeline,
        selectedAt: sel.selectedAt,
        hasElaboration: !!sel.elaboration,
        elaborationDuration: sel.elaboration?.duration || null
      };
    });

    return {
      sessionId: session.sessionId,
      status: session.status,
      progress,
      yourSelections: selectionsMap,
      categories: categories.map(cat => ({
        categoryNumber: cat.categoryNumber,
        categoryId: cat.categoryId,
        emoji: cat.emoji,
        title: cat.title,
        question: cat.question,
        isSelected: !!selectionsMap[cat.categoryNumber],
        hasElaboration: selectionsMap[cat.categoryNumber]?.hasElaboration || false
      })),
      partner: {
        userId: playerInfo.partner.userId._id,
        firstName: playerInfo.partner.userId.firstName,
        lastName: playerInfo.partner.userId.lastName,
        profilePhoto: playerInfo.partner.userId.profilePhoto
      },
      expiresAt: session.expiresAt,
      hasResults: session.status === 'completed' && !!session.results
    };
  }

  // =====================================================
  // CARD SELECTION
  // =====================================================

  /**
   * Get a specific category with cards
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User requesting
   * @param {Number} categoryNumber - Category number (1-10)
   * @returns {Promise<Object>} Category with cards and user's selection if any
   */
  async getCategory(sessionId, userId, categoryNumber) {
    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!session.isParticipant(userId)) {
      throw new Error('You are not a participant in this game');
    }

    if (session.status !== 'active') {
      throw new Error('Game is not active');
    }

    const category = await DreamBoardCategory.getByNumber(categoryNumber);

    if (!category) {
      throw new Error('Category not found');
    }

    // Check if user already selected for this category
    const playerInfo = session.getPlayerInfo(userId);
    const existingSelection = playerInfo.player.selections.find(
      s => s.categoryNumber === categoryNumber
    );

    const priorityInfo = DreamBoardCategory.getPriorityInfo();
    const timelineInfo = DreamBoardCategory.getTimelineInfo();

    return {
      category: {
        categoryNumber: category.categoryNumber,
        categoryId: category.categoryId,
        emoji: category.emoji,
        title: category.title,
        question: category.question,
        insight: category.insight,
        cards: category.cards
      },
      existingSelection: existingSelection ? {
        cardId: existingSelection.cardId,
        priority: existingSelection.priority,
        timeline: existingSelection.timeline,
        // Include elaboration info
        elaboration: existingSelection.elaboration ? {
          voiceNoteUrl: existingSelection.elaboration.voiceNoteUrl,
          duration: existingSelection.elaboration.duration,
          hasTranscript: !!existingSelection.elaboration.transcript,
          addedAt: existingSelection.elaboration.addedAt
        } : null
      } : null,
      priorityOptions: Object.entries(priorityInfo).map(([key, info]) => ({
        value: key,
        label: info.label,
        emoji: info.emoji,
        description: info.description
      })),
      timelineOptions: Object.entries(timelineInfo).map(([key, info]) => ({
        value: key,
        label: info.label,
        emoji: info.emoji,
        description: info.description
      })),
      progress: session.getProgress(userId),
      elaborationHint: this._getElaborationHint(category.categoryId)
    };
  }

  /**
   * Get elaboration prompt hint for a category
   * @private
   */
  _getElaborationHint(categoryId) {
    const hints = {
      our_home: "What does 'home' feel like to you? Any must-haves or deal-breakers?",
      our_family: "What's your vision for family? Any thoughts you'd like to share?",
      our_careers: "How do you see work fitting into your life together?",
      our_money: "What's your relationship with money? Any values or goals?",
      our_weekends: "What does your ideal weekend look like? What recharges you?",
      our_adventures: "What's on your travel bucket list? How do you like to explore?",
      our_roots: "How do you envision family involvement in your life?",
      our_intimacy: "What does connection mean to you in a relationship?",
      our_growth: "How do you like to grow as a person? Any shared goals?",
      our_someday: "What's your long-term dream? What legacy matters to you?"
    };
    return hints[categoryId] || "Tell us more about your choice...";
  }

  /**
   * Submit a card selection
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User selecting
   * @param {Object} selectionData - { categoryNumber, cardId, priority, timeline }
   * @returns {Promise<Object>} Updated progress and status
   */
  async submitSelection(sessionId, userId, selectionData) {
    const { categoryNumber, cardId, priority, timeline } = selectionData;

    // Validate inputs
    if (!categoryNumber || !cardId || !priority || !timeline) {
      throw new Error('Missing required fields: categoryNumber, cardId, priority, timeline');
    }

    if (categoryNumber < 1 || categoryNumber > 10) {
      throw new Error('Category number must be between 1 and 10');
    }

    if (!['A', 'B', 'C', 'D'].includes(cardId)) {
      throw new Error('Invalid card ID');
    }

    if (!['heart_set', 'dream', 'flow'].includes(priority)) {
      throw new Error('Invalid priority');
    }

    if (!['cant_wait', 'when_right', 'someday'].includes(timeline)) {
      throw new Error('Invalid timeline');
    }

    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!session.isParticipant(userId)) {
      throw new Error('You are not a participant in this game');
    }

    if (session.status !== 'active') {
      throw new Error('Game is not active');
    }

    // Get category to validate and get categoryId
    const category = await DreamBoardCategory.getByNumber(categoryNumber);
    if (!category) {
      throw new Error('Category not found');
    }

    // Add selection
    session.addSelection(userId, {
      categoryNumber,
      categoryId: category.categoryId,
      cardId,
      priority,
      timeline
    });

    await session.save();

    const progress = session.getProgress(userId);

    logger.info('Dream Board selection submitted', {
      sessionId: session.sessionId,
      userId: userId,
      categoryNumber,
      cardId,
      progress: progress.you.selected
    });

    // Check if both players completed
    let result = {
      success: true,
      progress,
      status: session.status,
      bothComplete: progress.bothComplete,
      canAddElaboration: true,
      elaborationHint: this._getElaborationHint(category.categoryId)
    };

    if (progress.bothComplete && session.status === 'active') {
      // Trigger analysis
      session.status = 'analyzing';
      await session.save();

      // Generate insights (async - don't await)
      this.generateInsights(sessionId).catch(err => {
        logger.error('Failed to generate Dream Board insights', { sessionId, error: err.message });
      });

      result.status = 'analyzing';
      result.message = 'Both players completed! Generating your dream compatibility insights...';
      result.canAddElaboration = false;
    }

    return result;
  }

  // =====================================================
  // VOICE ELABORATION
  // =====================================================

  /**
   * Add voice elaboration to a card selection
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User adding elaboration
   * @param {Number} categoryNumber - Category number (1-10)
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {String} mimeType - Audio MIME type
   * @param {Number} duration - Duration in seconds
   * @returns {Promise<Object>} Elaboration info with transcript
   */
  async addElaboration(sessionId, userId, categoryNumber, audioBuffer, mimeType, duration) {
    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!session.isParticipant(userId)) {
      throw new Error('You are not a participant in this game');
    }

    if (session.status !== 'active') {
      throw new Error('Elaborations can only be added during active gameplay');
    }

    // Validate category number
    if (categoryNumber < 1 || categoryNumber > 10) {
      throw new Error('Category number must be between 1 and 10');
    }

    // Check if user has selected this category
    const playerInfo = session.getPlayerInfo(userId);
    const existingSelection = playerInfo.player.selections.find(
      s => s.categoryNumber === categoryNumber
    );

    if (!existingSelection) {
      throw new Error('You must select a card for this category before adding an elaboration');
    }

    // Validate duration (max 2 minutes)
    if (duration > 120) {
      throw new Error('Elaboration cannot exceed 2 minutes');
    }

    // Upload to S3
    const fileName = `dream-board/elaborations/${sessionId}/${userId}_cat${categoryNumber}_${Date.now()}`;
    const result = await s3Service.uploadFile(
        audioBuffer,
        `${fileName}.${this._getAudioExtension(mimeType)}`,
        mimeType,
        'voice-notes'
      );
      const voiceNoteUrl = result.url;

    // Transcribe with Whisper
    let transcript = null;
    try {
      transcript = await this._transcribeAudio(audioBuffer, mimeType);
      logger.info('Elaboration transcribed successfully', {
        sessionId,
        userId,
        categoryNumber,
        transcriptLength: transcript?.length
      });
    } catch (error) {
      logger.error('Failed to transcribe elaboration', {
        sessionId,
        userId,
        categoryNumber,
        error: error.message
      });
      // Continue without transcript - AI will still have the card selection
    }

    // Add elaboration to session
    session.addElaboration(userId, categoryNumber, {
      voiceNoteUrl,
      duration,
      transcript
    });

    await session.save();

    logger.info('Dream Board elaboration added', {
      sessionId,
      userId,
      categoryNumber,
      duration,
      hasTranscript: !!transcript
    });

    return {
      success: true,
      categoryNumber,
      voiceNoteUrl,
      duration,
      hasTranscript: !!transcript,
      transcriptPreview: transcript ? transcript.substring(0, 100) + (transcript.length > 100 ? '...' : '') : null,
      message: transcript
        ? 'Your thoughts have been recorded and transcribed!'
        : 'Your thoughts have been recorded! (Transcript pending)'
    };
  }

  /**
   * Transcribe audio using OpenAI Whisper
   * @private
   */
  async _transcribeAudio(audioBuffer, mimeType) {
    // Create temp file for Whisper API
    const extension = this._getAudioExtension(mimeType);
    const tempPath = path.join(os.tmpdir(), `whisper_${Date.now()}.${extension}`);

    try {
      // Write buffer to temp file
      fs.writeFileSync(tempPath, audioBuffer);

      // Call Whisper API
      const response = await openaiClient.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: 'whisper-1',
        language: 'en', // Can be made dynamic for Hindi/English
        response_format: 'text'
      });

      return response.trim();

    } finally {
      // Clean up temp file
      if (fs.existsSync(tempPath)) {
        fs.unlinkSync(tempPath);
      }
    }
  }

  /**
   * Get file extension from MIME type
   * @private
   */
  _getAudioExtension(mimeType) {
    const extensions = {
      'audio/webm': 'webm',
      'audio/mp4': 'm4a',
      'audio/mpeg': 'mp3',
      'audio/wav': 'wav',
      'audio/ogg': 'ogg',
      'audio/x-m4a': 'm4a'
    };
    return extensions[mimeType] || 'webm';
  }

  /**
   * Get elaboration for a specific category
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User requesting
   * @param {Number} categoryNumber - Category number
   * @returns {Promise<Object|null>} Elaboration info or null
   */
  async getElaboration(sessionId, userId, categoryNumber) {
    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!session.isParticipant(userId)) {
      throw new Error('You are not a participant in this game');
    }

    const selection = session.getSelection(userId, categoryNumber);

    if (!selection || !selection.elaboration) {
      return null;
    }

    return {
      categoryNumber,
      voiceNoteUrl: selection.elaboration.voiceNoteUrl,
      duration: selection.elaboration.duration,
      hasTranscript: !!selection.elaboration.transcript,
      addedAt: selection.elaboration.addedAt
    };
  }

  /**
   * Delete elaboration for a category (allow re-recording)
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User requesting
   * @param {Number} categoryNumber - Category number
   * @returns {Promise<Object>} Success status
   */
  async deleteElaboration(sessionId, userId, categoryNumber) {
    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!session.isParticipant(userId)) {
      throw new Error('You are not a participant in this game');
    }

    if (session.status !== 'active') {
      throw new Error('Cannot modify elaborations after game completion');
    }

    const playerInfo = session.getPlayerInfo(userId);
    const selection = playerInfo.player.selections.find(
      s => s.categoryNumber === categoryNumber
    );

    if (!selection || !selection.elaboration) {
      throw new Error('No elaboration found for this category');
    }

    // Remove elaboration
    selection.elaboration = null;
    playerInfo.player.elaborationCount = playerInfo.player.selections.filter(s => s.elaboration).length;

    await session.save();

    logger.info('Dream Board elaboration deleted', {
      sessionId,
      userId,
      categoryNumber
    });

    return { success: true, message: 'Elaboration deleted. You can record a new one.' };
  }

  // =====================================================
  // RESULTS & INSIGHTS
  // =====================================================

  /**
   * Calculate alignment score between two selections
   * @param {Object} sel1 - Player 1's selection
   * @param {Object} sel2 - Player 2's selection
   * @returns {Object} Alignment score and level
   */
  _calculateCategoryAlignment(sel1, sel2) {
    let score = 0;
    let level = 'needs_conversation';

    const sameCard = sel1.cardId === sel2.cardId;
    const samePriority = sel1.priority === sel2.priority;
    const sameTimeline = sel1.timeline === sel2.timeline;

    // Both flexible
    const bothFlexible = sel1.priority === 'flow' && sel2.priority === 'flow';
    // One flexible
    const oneFlexible = sel1.priority === 'flow' || sel2.priority === 'flow';
    // Both heart set
    const bothHeartSet = sel1.priority === 'heart_set' && sel2.priority === 'heart_set';

    if (sameCard) {
      // Same card - great alignment!
      if (samePriority && sameTimeline) {
        score = 100;
        level = 'aligned';
      } else if (samePriority || sameTimeline) {
        score = 90;
        level = 'aligned';
      } else {
        score = 80;
        level = 'aligned';
      }
    } else {
      // Different cards
      if (bothFlexible) {
        score = 70;
        level = 'close';
      } else if (oneFlexible) {
        score = 55;
        level = 'close';
      } else if (bothHeartSet) {
        // Both feel strongly but picked different things
        score = 25;
        level = 'needs_conversation';
      } else {
        // Different cards, mixed priorities
        score = 45;
        level = 'different';
      }

      // Timeline alignment bonus/penalty for different cards
      if (sameTimeline) {
        score = Math.min(score + 10, 100);
      }
    }

    return { score, level };
  }

  /**
   * Generate AI insights for completed game
   * @param {String} sessionId - Session UUID
   * @returns {Promise<Object>} Generated insights
   */
  async generateInsights(sessionId) {
    try {
      logger.info('Generating Dream Board insights', { sessionId });

      const session = await DreamBoardSession.findBySessionId(sessionId);

      if (!session) {
        throw new Error('Session not found');
      }

      if (!session.isBothComplete()) {
        throw new Error('Both players must complete before generating insights');
      }

      // Get all categories
      const categories = await DreamBoardCategory.getAllCategories();
      const categoryMap = {};
      categories.forEach(cat => {
        categoryMap[cat.categoryNumber] = cat;
      });

      const priorityInfo = DreamBoardCategory.getPriorityInfo();
      const timelineInfo = DreamBoardCategory.getTimelineInfo();

      // Get all elaborations for AI context
      const elaborations = session.getAllElaborations();
      const hasElaborations = elaborations.player1.length > 0 || elaborations.player2.length > 0;

      // Build category analysis
      const categoryAnalysis = [];
      let totalScore = 0;
      let alignedCount = 0;
      let closeCount = 0;
      let differentCount = 0;

      for (let i = 1; i <= 10; i++) {
        const category = categoryMap[i];
        const p1Sel = session.player1.selections.find(s => s.categoryNumber === i);
        const p2Sel = session.player2.selections.find(s => s.categoryNumber === i);

        if (!p1Sel || !p2Sel) continue;

        const p1Card = category.cards.find(c => c.cardId === p1Sel.cardId);
        const p2Card = category.cards.find(c => c.cardId === p2Sel.cardId);

        const alignment = this._calculateCategoryAlignment(p1Sel, p2Sel);
        totalScore += alignment.score;

        if (alignment.level === 'aligned') alignedCount++;
        else if (alignment.level === 'close') closeCount++;
        else differentCount++;

        categoryAnalysis.push({
          categoryNumber: i,
          categoryId: category.categoryId,
          categoryTitle: category.title,
          categoryEmoji: category.emoji,
          alignmentScore: alignment.score,
          alignmentLevel: alignment.level,
          player1Card: {
            cardId: p1Sel.cardId,
            title: p1Card?.title || '',
            emoji: p1Card?.emoji || '',
            subtitle: p1Card?.subtitle || '',
            priority: p1Sel.priority,
            priorityLabel: priorityInfo[p1Sel.priority]?.label,
            priorityEmoji: priorityInfo[p1Sel.priority]?.emoji,
            timeline: p1Sel.timeline,
            timelineLabel: timelineInfo[p1Sel.timeline]?.label,
            timelineEmoji: timelineInfo[p1Sel.timeline]?.emoji,
            hasElaboration: !!p1Sel.elaboration,
            elaborationSummary: null // Will be filled by AI
          },
          player2Card: {
            cardId: p2Sel.cardId,
            title: p2Card?.title || '',
            emoji: p2Card?.emoji || '',
            subtitle: p2Card?.subtitle || '',
            priority: p2Sel.priority,
            priorityLabel: priorityInfo[p2Sel.priority]?.label,
            priorityEmoji: priorityInfo[p2Sel.priority]?.emoji,
            timeline: p2Sel.timeline,
            timelineLabel: timelineInfo[p2Sel.timeline]?.label,
            timelineEmoji: timelineInfo[p2Sel.timeline]?.emoji,
            hasElaboration: !!p2Sel.elaboration,
            elaborationSummary: null
          }
        });
      }

      const overallAlignment = Math.round(totalScore / 10);

      // Generate AI insights (with elaborations if available)
      const aiInsights = await this._generateAIInsights(
        session,
        categoryAnalysis,
        overallAlignment,
        { alignedCount, closeCount, differentCount },
        elaborations
      );

      // Add AI insights to category analysis
      categoryAnalysis.forEach((cat) => {
        if (aiInsights.categoryInsights && aiInsights.categoryInsights[cat.categoryId]) {
          cat.insight = aiInsights.categoryInsights[cat.categoryId].insight || aiInsights.categoryInsights[cat.categoryId];
          cat.elaborationInsight = aiInsights.categoryInsights[cat.categoryId].elaborationInsight || null;
          
          // Add elaboration summaries if AI provided them
          if (aiInsights.categoryInsights[cat.categoryId].player1Summary) {
            cat.player1Card.elaborationSummary = aiInsights.categoryInsights[cat.categoryId].player1Summary;
          }
          if (aiInsights.categoryInsights[cat.categoryId].player2Summary) {
            cat.player2Card.elaborationSummary = aiInsights.categoryInsights[cat.categoryId].player2Summary;
          }
        }
      });

      // Save results
      session.results = {
        overallAlignment,
        alignedCount,
        closeCount,
        differentCount,
        categoryAnalysis,
        alignedDreamsSummary: aiInsights.alignedDreamsSummary,
        closeEnoughSummary: aiInsights.closeEnoughSummary,
        conversationStartersSummary: aiInsights.conversationStartersSummary,
        overallInsight: aiInsights.overallInsight,
        // New elaboration-specific insights
        hiddenAlignments: aiInsights.hiddenAlignments || null,
        hiddenConcerns: aiInsights.hiddenConcerns || null
      };

      session.status = 'completed';
      session.completedAt = new Date();
      await session.save();

      logger.info('Dream Board insights generated', {
        sessionId,
        overallAlignment,
        alignedCount,
        closeCount,
        differentCount,
        hasElaborations,
        elaborationCount: elaborations.player1.length + elaborations.player2.length
      });

      return session.results;

    } catch (error) {
      logger.error('Error generating Dream Board insights', { sessionId, error: error.message });

      // Mark as completed even if AI fails
      const session = await DreamBoardSession.findBySessionId(sessionId);
      if (session && session.status === 'analyzing') {
        session.status = 'completed';
        session.completedAt = new Date();
        await session.save();
      }

      throw error;
    }
  }

  /**
   * Generate AI insights using GPT-4 (enhanced with elaborations)
   * @private
   */
  async _generateAIInsights(session, categoryAnalysis, overallAlignment, counts, elaborations) {
    const player1Name = session.player1.userId.firstName || 'Player 1';
    const player2Name = session.player2.userId.firstName || 'Player 2';

    const hasElaborations = elaborations.player1.length > 0 || elaborations.player2.length > 0;

    // Build detailed comparison for AI
    const comparisons = categoryAnalysis.map(cat => {
      const comparison = {
        category: cat.categoryTitle,
        categoryId: cat.categoryId,
        emoji: cat.categoryEmoji,
        alignment: cat.alignmentLevel,
        score: cat.alignmentScore,
        player1: {
          choice: `${cat.player1Card.emoji} ${cat.player1Card.title}`,
          subtitle: cat.player1Card.subtitle,
          priority: cat.player1Card.priorityLabel,
          timeline: cat.player1Card.timelineLabel
        },
        player2: {
          choice: `${cat.player2Card.emoji} ${cat.player2Card.title}`,
          subtitle: cat.player2Card.subtitle,
          priority: cat.player2Card.priorityLabel,
          timeline: cat.player2Card.timelineLabel
        }
      };

      // Add elaborations if available
      const p1Elab = elaborations.player1.find(e => e.categoryId === cat.categoryId);
      const p2Elab = elaborations.player2.find(e => e.categoryId === cat.categoryId);

      if (p1Elab) {
        comparison.player1.voiceNote = p1Elab.transcript;
      }
      if (p2Elab) {
        comparison.player2.voiceNote = p2Elab.transcript;
      }

      return comparison;
    });

    // Build the prompt (enhanced for elaborations)
    const prompt = this._buildAIPrompt(
      player1Name,
      player2Name,
      comparisons,
      overallAlignment,
      counts,
      hasElaborations
    );

    try {
      const response = await openaiClient.chat.completions.create({
        model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
        messages: [
          {
            role: 'system',
            content: 'You are a warm, insightful relationship advisor who helps couples discover their compatibility. You respond only in valid JSON format.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 3000,
        response_format: { type: 'json_object' }
      });

      const content = response.choices[0].message.content;
      const insights = JSON.parse(content);

      logger.info('AI insights generated successfully', { sessionId: session.sessionId, hasElaborations });

      return insights;

    } catch (error) {
      logger.error('Error calling OpenAI for Dream Board insights', { error: error.message });

      // Return fallback insights
      return this._generateFallbackInsights(categoryAnalysis, overallAlignment, counts, player1Name, player2Name);
    }
  }

  /**
 * Build AI prompt (with or without elaborations)
 * @private
 */
_buildAIPrompt(player1Name, player2Name, comparisons, overallAlignment, counts, hasElaborations) {
    // Build list of categories with voice notes for emphasis
    const categoriesWithVoiceNotes = comparisons
      .filter(c => c.player1?.voiceNote || c.player2?.voiceNote)
      .map(c => ({
        categoryId: c.categoryId,
        category: c.category,
        player1HasVoice: !!c.player1?.voiceNote,
        player2HasVoice: !!c.player2?.voiceNote
      }));
  
    const basePrompt = `You are a warm, romantic relationship advisor helping two people understand their future compatibility. They just completed a "Dream Board" game where they independently chose vision cards for 10 life categories.
  
  PLAYERS:
  - ${player1Name}
  - ${player2Name}
  
  THEIR DREAM BOARD COMPARISON:
  ${JSON.stringify(comparisons, null, 2)}
  
  OVERALL STATS:
  - Alignment Score: ${overallAlignment}%
  - Aligned Dreams: ${counts.alignedCount}/10 categories
  - Close Enough: ${counts.closeCount}/10 categories  
  - Worth Discussing: ${counts.differentCount}/10 categories`;
  
    const elaborationInstructions = hasElaborations ? `
  
  IMPORTANT - VOICE NOTE ANALYSIS:
  Some players added voice notes explaining their choices (shown as "voiceNote" field). These are CRUCIAL for understanding their true intentions.
  
  CATEGORIES WITH VOICE NOTES (YOU MUST ANALYZE THESE):
  ${JSON.stringify(categoriesWithVoiceNotes, null, 2)}
  
  FOR EVERY CATEGORY THAT HAS A VOICE NOTE, YOU MUST PROVIDE:
  - player1Summary: If ${player1Name} recorded a voice note, summarize what they said in 1 sentence. This is REQUIRED if they have a voiceNote.
  - player2Summary: If ${player2Name} recorded a voice note, summarize what they said in 1 sentence. This is REQUIRED if they have a voiceNote.
  - elaborationInsight: If the voice notes reveal anything beyond what the card selection shows (hidden alignment, hidden concern, flexibility, dealbreaker), describe it. Otherwise null.
  
  ANALYSIS RULES:
  
  1. HIDDEN ALIGNMENTS: Sometimes players pick different cards but their voice notes reveal they actually want similar things. For example:
     - One picks "City", one picks "Suburbs", but both voice notes mention wanting "green space and good schools" → They may actually align!
     - Flag these discoveries in "hiddenAlignments"
  
  2. HIDDEN CONCERNS: Sometimes players pick the same card but voice notes reveal different expectations:
     - Both pick "Full house" but one says "definitely 3 kids" and other says "maybe 1-2 max" → Worth discussing!
     - Flag these in "hiddenConcerns"
  
  3. DEALBREAKERS: Listen for strong language like "non-negotiable", "absolutely need", "can't compromise on"
     - Mention these gently in conversation starters
  
  4. FLEXIBILITY SIGNALS: Listen for "I'm open to", "could be convinced", "depends on partner"
     - These suggest more alignment potential than the card alone shows
  
  5. SUMMARIZE EVERY VOICE NOTE: Even if the voice note just confirms the card choice, still provide a brief summary. Users want to see that their voice was heard.` : '';
  
    const responseFormat = hasElaborations ? `
  {
    "alignedDreamsSummary": "A warm 2-3 sentence paragraph celebrating where they align perfectly.",
    
    "closeEnoughSummary": "A reassuring 2-3 sentence paragraph about areas where they're close. If no close categories, say null.",
    
    "conversationStartersSummary": "A gentle 3-4 sentence paragraph with 2-3 specific questions to ask each other about areas worth discussing.",
    
    "overallInsight": "A romantic, hopeful 2-3 sentence final summary that makes them feel excited about their future.",
    
    "hiddenAlignments": "If voice notes revealed that players are more aligned than their cards suggest, describe this here (1-2 sentences). Be specific about which categories. Otherwise null.",
    
    "hiddenConcerns": "If voice notes revealed potential concerns or different expectations despite similar cards, describe gently here (1-2 sentences). Be specific. Otherwise null.",
    
    "categoryInsights": {
      "our_home": {
        "insight": "One sentence insight about their card choices for this category",
        "elaborationInsight": "If voice notes changed the picture or revealed something beyond cards, explain here. Otherwise null.",
        "player1Summary": "REQUIRED if ${player1Name} has voiceNote for this category: 1-sentence summary of what they said. Otherwise null.",
        "player2Summary": "REQUIRED if ${player2Name} has voiceNote for this category: 1-sentence summary of what they said. Otherwise null."
      },
      "our_family": {
        "insight": "...",
        "elaborationInsight": "...",
        "player1Summary": "...",
        "player2Summary": "..."
      },
      "our_careers": {
        "insight": "...",
        "elaborationInsight": "...",
        "player1Summary": "...",
        "player2Summary": "..."
      },
      "our_money": {
        "insight": "...",
        "elaborationInsight": "...",
        "player1Summary": "...",
        "player2Summary": "..."
      },
      "our_weekends": {
        "insight": "...",
        "elaborationInsight": "...",
        "player1Summary": "...",
        "player2Summary": "..."
      },
      "our_adventures": {
        "insight": "...",
        "elaborationInsight": "...",
        "player1Summary": "...",
        "player2Summary": "..."
      },
      "our_roots": {
        "insight": "...",
        "elaborationInsight": "...",
        "player1Summary": "...",
        "player2Summary": "..."
      },
      "our_intimacy": {
        "insight": "...",
        "elaborationInsight": "...",
        "player1Summary": "...",
        "player2Summary": "..."
      },
      "our_growth": {
        "insight": "...",
        "elaborationInsight": "...",
        "player1Summary": "...",
        "player2Summary": "..."
      },
      "our_someday": {
        "insight": "...",
        "elaborationInsight": "...",
        "player1Summary": "...",
        "player2Summary": "..."
      }
    }
  }` : `
  {
    "alignedDreamsSummary": "A warm 2-3 sentence paragraph celebrating where they align perfectly.",
    
    "closeEnoughSummary": "A reassuring 2-3 sentence paragraph about areas where they're close. If no close categories, say null.",
    
    "conversationStartersSummary": "A gentle 3-4 sentence paragraph with 2-3 specific questions to ask each other.",
    
    "overallInsight": "A romantic, hopeful 2-3 sentence final summary.",
    
    "categoryInsights": {
      "our_home": { "insight": "One sentence insight for this category" },
      "our_family": { "insight": "One sentence insight" },
      "our_careers": { "insight": "One sentence insight" },
      "our_money": { "insight": "One sentence insight" },
      "our_weekends": { "insight": "One sentence insight" },
      "our_adventures": { "insight": "One sentence insight" },
      "our_roots": { "insight": "One sentence insight" },
      "our_intimacy": { "insight": "One sentence insight" },
      "our_growth": { "insight": "One sentence insight" },
      "our_someday": { "insight": "One sentence insight" }
    }
  }`;
  
    return `${basePrompt}
  ${elaborationInstructions}
  
  YOUR TASK:
  Generate romantic, warm, encouraging insights about their compatibility. Focus on:
  1. Celebrating where they align (make them feel excited!)
  2. Showing how "close" differences can work (reassure them)
  3. Providing gentle, curious conversation starters for differences (not scary, just curious)
  4. An overall romantic summary that makes them feel hopeful
  ${hasElaborations ? `5. CRITICAL: Summarize EVERY voice note - users recorded these and want to see their words acknowledged
  6. Analyzing voice notes for hidden alignments or concerns that cards alone don't show` : ''}
  
  IMPORTANT GUIDELINES:
  - Be WARM and ROMANTIC, not clinical or analytical
  - Use "you both" language to create togetherness
  - Frame differences as "interesting conversations to have" not "problems"
  - For the Indian context: be respectful about family-related differences
  - Make aligned dreams feel magical ("You're dreaming the same dream!")
  - Keep each insight concise but meaningful
  - Use emojis sparingly but effectively
  ${hasElaborations ? `- ALWAYS provide player1Summary/player2Summary for categories where they recorded voice notes
  - Trust voice notes over card selections when they reveal true intentions
  - Don't leave elaborationInsight, player1Summary, player2Summary as null if there IS a voice note for that category/player` : ''}
  
  RESPOND IN THIS EXACT JSON FORMAT:
  ${responseFormat}
  
  Remember: They're playing this because they care about each other. Help them feel closer, not further apart.`;
  }                                                             

  /**
   * Generate fallback insights if AI fails
   * @private
   */
  _generateFallbackInsights(categoryAnalysis, overallAlignment, counts, player1Name, player2Name) {
    const aligned = categoryAnalysis.filter(c => c.alignmentLevel === 'aligned');
    const different = categoryAnalysis.filter(c => c.alignmentLevel === 'needs_conversation');

    const alignedCategories = aligned.map(c => c.categoryTitle.toLowerCase()).join(', ');
    const differentCategories = different.map(c => c.categoryTitle.toLowerCase()).join(', ');

    return {
      alignedDreamsSummary: aligned.length > 0
        ? `You're both dreaming the same dream when it comes to ${alignedCategories}! 💫 These shared visions are a beautiful foundation for your future together.`
        : `While you have unique perspectives, this is a chance to learn about each other's dreams and find common ground.`,

      closeEnoughSummary: counts.closeCount > 0
        ? `On a few topics, you're close but not identical - and that's actually wonderful! Small differences can bring balance and new perspectives to a relationship.`
        : `Your visions show distinct perspectives - this means you'll bring different strengths to your life together.`,

      conversationStartersSummary: different.length > 0
        ? `There are some dreams worth talking about, especially around ${differentCategories}. Try asking each other: "Help me understand what that vision looks like for you?" These conversations often bring couples closer.`
        : `You're remarkably aligned! Still, keep dreaming together and sharing your evolving visions.`,

      overallInsight: overallAlignment >= 70
        ? `With ${overallAlignment}% alignment, you two are dreaming in the same direction! 🌟 Your futures want to intertwine.`
        : overallAlignment >= 50
        ? `At ${overallAlignment}% alignment, you have a solid foundation with room for beautiful conversations ahead. Every great relationship is built on understanding.`
        : `At ${overallAlignment}% alignment, you have different visions - but that's valuable information! The best relationships are built on honest conversations about what you both want.`,

      hiddenAlignments: null,
      hiddenConcerns: null,
      categoryInsights: {}
    };
  }

  /**
 * Get results for a completed game
 * @param {String} sessionId - Session UUID
 * @param {ObjectId} userId - User requesting
 * @returns {Promise<Object>} Full results with all captured data
 */
async getResults(sessionId, userId) {
    const session = await DreamBoardSession.findBySessionId(sessionId);
  
    if (!session) {
      throw new Error('Game session not found');
    }
  
    if (!session.isParticipant(userId)) {
      throw new Error('You are not a participant in this game');
    }
  
    if (session.status === 'analyzing') {
      return {
        status: 'analyzing',
        message: 'Your dream compatibility insights are being generated...'
      };
    }
  
    if (session.status !== 'completed') {
      throw new Error('Game is not yet completed');
    }
  
    const playerInfo = session.getPlayerInfo(userId);
    const isPlayer1 = playerInfo.isPlayer1;
  
    // Get raw selections with elaborations for both players
    const getPlayerSelections = (player, isCurrentUser) => {
      return player.selections.map(sel => ({
        categoryNumber: sel.categoryNumber,
        categoryId: sel.categoryId,
        cardId: sel.cardId,
        priority: sel.priority,
        timeline: sel.timeline,
        selectedAt: sel.selectedAt,
        // Include full elaboration data
        elaboration: sel.elaboration ? {
          voiceNoteUrl: sel.elaboration.voiceNoteUrl,
          duration: sel.elaboration.duration,
          transcript: sel.elaboration.transcript || null,
          transcribedAt: sel.elaboration.transcribedAt,
          addedAt: sel.elaboration.addedAt
        } : null
      }));
    };
  
    // Build category results with ALL captured data
    const categoryResults = session.results.categoryAnalysis.map(cat => {
      // Get raw selections for additional data
      const p1Selection = session.player1.selections.find(s => s.categoryNumber === cat.categoryNumber);
      const p2Selection = session.player2.selections.find(s => s.categoryNumber === cat.categoryNumber);
  
      // Build your card (current user's perspective)
      const yourRawSelection = isPlayer1 ? p1Selection : p2Selection;
      const partnerRawSelection = isPlayer1 ? p2Selection : p1Selection;
  
      return {
        categoryNumber: cat.categoryNumber,
        categoryId: cat.categoryId,
        categoryTitle: cat.categoryTitle,
        categoryEmoji: cat.categoryEmoji,
        alignmentScore: cat.alignmentScore,
        alignmentLevel: cat.alignmentLevel,
        
        // Your card with full elaboration
        yourCard: {
          cardId: isPlayer1 ? cat.player1Card.cardId : cat.player2Card.cardId,
          title: isPlayer1 ? cat.player1Card.title : cat.player2Card.title,
          emoji: isPlayer1 ? cat.player1Card.emoji : cat.player2Card.emoji,
          subtitle: isPlayer1 ? cat.player1Card.subtitle : cat.player2Card.subtitle,
          priority: isPlayer1 ? cat.player1Card.priority : cat.player2Card.priority,
          priorityLabel: isPlayer1 ? cat.player1Card.priorityLabel : cat.player2Card.priorityLabel,
          priorityEmoji: isPlayer1 ? cat.player1Card.priorityEmoji : cat.player2Card.priorityEmoji,
          timeline: isPlayer1 ? cat.player1Card.timeline : cat.player2Card.timeline,
          timelineLabel: isPlayer1 ? cat.player1Card.timelineLabel : cat.player2Card.timelineLabel,
          timelineEmoji: isPlayer1 ? cat.player1Card.timelineEmoji : cat.player2Card.timelineEmoji,
          hasElaboration: isPlayer1 ? cat.player1Card.hasElaboration : cat.player2Card.hasElaboration,
          elaborationSummary: isPlayer1 ? cat.player1Card.elaborationSummary : cat.player2Card.elaborationSummary,
          // ADD: Raw elaboration data
          elaboration: yourRawSelection?.elaboration ? {
            voiceNoteUrl: yourRawSelection.elaboration.voiceNoteUrl,
            duration: yourRawSelection.elaboration.duration,
            transcript: yourRawSelection.elaboration.transcript
          } : null
        },
        
        // Partner's card with full elaboration
        partnerCard: {
          cardId: isPlayer1 ? cat.player2Card.cardId : cat.player1Card.cardId,
          title: isPlayer1 ? cat.player2Card.title : cat.player1Card.title,
          emoji: isPlayer1 ? cat.player2Card.emoji : cat.player1Card.emoji,
          subtitle: isPlayer1 ? cat.player2Card.subtitle : cat.player1Card.subtitle,
          priority: isPlayer1 ? cat.player2Card.priority : cat.player1Card.priority,
          priorityLabel: isPlayer1 ? cat.player2Card.priorityLabel : cat.player1Card.priorityLabel,
          priorityEmoji: isPlayer1 ? cat.player2Card.priorityEmoji : cat.player1Card.priorityEmoji,
          timeline: isPlayer1 ? cat.player2Card.timeline : cat.player1Card.timeline,
          timelineLabel: isPlayer1 ? cat.player2Card.timelineLabel : cat.player1Card.timelineLabel,
          timelineEmoji: isPlayer1 ? cat.player2Card.timelineEmoji : cat.player1Card.timelineEmoji,
          hasElaboration: isPlayer1 ? cat.player2Card.hasElaboration : cat.player1Card.hasElaboration,
          elaborationSummary: isPlayer1 ? cat.player2Card.elaborationSummary : cat.player1Card.elaborationSummary,
          // ADD: Raw elaboration data
          elaboration: partnerRawSelection?.elaboration ? {
            voiceNoteUrl: partnerRawSelection.elaboration.voiceNoteUrl,
            duration: partnerRawSelection.elaboration.duration,
            transcript: partnerRawSelection.elaboration.transcript
          } : null
        },
        
        // Insights
        insight: cat.insight,
        elaborationInsight: cat.elaborationInsight || null
      };
    });
  
    // Build player info with elaboration counts
    const yourPlayer = isPlayer1 ? session.player1 : session.player2;
    const partnerPlayer = isPlayer1 ? session.player2 : session.player1;
  
    return {
      sessionId: session.sessionId,
      status: session.status,
      completedAt: session.completedAt,
      
      // Your info
      you: {
        oduserId: playerInfo.player.userId._id || playerInfo.player.userId,
        firstName: playerInfo.player.userId.firstName,
        totalSelected: yourPlayer.totalSelected,
        elaborationCount: yourPlayer.elaborationCount || yourPlayer.selections.filter(s => s.elaboration).length
      },
      
      // Partner info
      partner: {
        oduserId: playerInfo.partner.userId._id,
        firstName: playerInfo.partner.userId.firstName,
        lastName: playerInfo.partner.userId.lastName,
        profilePhoto: playerInfo.partner.userId.profilePhoto,
        totalSelected: partnerPlayer.totalSelected,
        elaborationCount: partnerPlayer.elaborationCount || partnerPlayer.selections.filter(s => s.elaboration).length
      },
      
      // Main results
      results: {
        overallAlignment: session.results.overallAlignment,
        alignedCount: session.results.alignedCount,
        closeCount: session.results.closeCount,
        differentCount: session.results.differentCount,
        
        // Category-by-category breakdown
        categoryResults,
        
        // AI-generated summaries
        alignedDreamsSummary: session.results.alignedDreamsSummary,
        closeEnoughSummary: session.results.closeEnoughSummary,
        conversationStartersSummary: session.results.conversationStartersSummary,
        overallInsight: session.results.overallInsight,
        
        // Voice-derived insights (NEW - these were missing!)
        hiddenAlignments: session.results.hiddenAlignments || null,
        hiddenConcerns: session.results.hiddenConcerns || null
      },
      
      // Raw selections for detailed view (optional use by frontend)
      selections: {
        yours: getPlayerSelections(yourPlayer, true),
        partner: getPlayerSelections(partnerPlayer, false)
      },
      
      // Elaboration stats
      elaborationStats: {
        yourCount: yourPlayer.elaborationCount || yourPlayer.selections.filter(s => s.elaboration).length,
        partnerCount: partnerPlayer.elaborationCount || partnerPlayer.selections.filter(s => s.elaboration).length,
        totalVoiceNotes: (yourPlayer.elaborationCount || 0) + (partnerPlayer.elaborationCount || 0),
        categoriesWithBothVoices: categoryResults.filter(
          c => c.yourCard.hasElaboration && c.partnerCard.hasElaboration
        ).length
      },
      
      // Discussion notes
      discussionNotes: session.discussionNotes.map(note => ({
        oduserId: note.userId,
        isYours: note.userId.toString() === userId.toString(),
        senderName: note.userId.toString() === session.player1.userId._id?.toString()
          ? session.player1.userId.firstName
          : session.player2.userId.firstName,
        categoryNumber: note.categoryNumber,
        voiceNoteUrl: note.voiceNoteUrl,
        duration: note.duration,
        listened: note.listenedBy.includes(userId),
        createdAt: note.createdAt
      }))
    };
  }

  // =====================================================
  // DISCUSSION VOICE NOTES (POST-GAME)
  // =====================================================

  /**
   * Add a discussion voice note
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User adding note
   * @param {Buffer} audioBuffer - Audio file buffer
   * @param {String} mimeType - Audio MIME type
   * @param {Number} duration - Duration in seconds
   * @param {Number|null} categoryNumber - Specific category (null for general)
   * @returns {Promise<Object>} Created note info
   */
  async addDiscussionNote(sessionId, userId, audioBuffer, mimeType, duration, categoryNumber = null) {
    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!session.isParticipant(userId)) {
      throw new Error('You are not a participant in this game');
    }

    if (session.status !== 'completed') {
      throw new Error('Discussion is only available after game completion');
    }

    // Validate category number if provided
    if (categoryNumber !== null && (categoryNumber < 1 || categoryNumber > 10)) {
      throw new Error('Category number must be between 1 and 10');
    }

    // Upload to S3
    const fileName = `dream-board/discussion/${sessionId}/${userId}_${Date.now()}`;
    const result = await s3Service.uploadFile(
        audioBuffer,
        `${fileName}.${this._getAudioExtension(mimeType)}`,
        mimeType,
        'voice-notes'
      );
      const voiceNoteUrl = result.url;

    // Add to session
    const note = session.addDiscussionNote(userId, voiceNoteUrl, duration, categoryNumber);
    await session.save();

    logger.info('Dream Board discussion note added', {
      sessionId,
      userId: userId,
      categoryNumber,
      duration
    });

    return {
      voiceNoteUrl,
      duration,
      categoryNumber,
      createdAt: note.createdAt
    };
  }

  /**
   * Get discussion notes for a session
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User requesting
   * @returns {Promise<Array>} Discussion notes
   */
  async getDiscussionNotes(sessionId, userId) {
    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!session.isParticipant(userId)) {
      throw new Error('You are not a participant in this game');
    }

    // Get category info for notes tied to specific categories
    const categoryInfo = DreamBoardCategory.getCategoryInfo();

    return session.discussionNotes.map((note, index) => ({
      noteIndex: index,
      userId: note.userId,
      isYours: note.userId.toString() === userId.toString(),
      senderName: note.userId.toString() === session.player1.userId._id?.toString()
        ? session.player1.userId.firstName
        : session.player2.userId.firstName,
      categoryNumber: note.categoryNumber,
      categoryInfo: note.categoryNumber ? categoryInfo[
        session.results?.categoryAnalysis?.find(c => c.categoryNumber === note.categoryNumber)?.categoryId
      ] : null,
      voiceNoteUrl: note.voiceNoteUrl,
      duration: note.duration,
      listened: note.listenedBy.includes(userId),
      createdAt: note.createdAt
    }));
  }

  /**
   * Mark a discussion note as listened
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User marking as listened
   * @param {Number} noteIndex - Index of the note
   * @returns {Promise<Boolean>} Success
   */
  async markNoteListened(sessionId, userId, noteIndex) {
    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!session.isParticipant(userId)) {
      throw new Error('You are not a participant in this game');
    }

    if (noteIndex < 0 || noteIndex >= session.discussionNotes.length) {
      throw new Error('Invalid note index');
    }

    session.markNoteListened(noteIndex, userId);
    await session.save();

    return true;
  }

  // =====================================================
  // GAME MANAGEMENT
  // =====================================================

  /**
   * Abandon a game
   * @param {String} sessionId - Session UUID
   * @param {ObjectId} userId - User abandoning
   * @returns {Promise<Object>} Updated session
   */
  async abandonGame(sessionId, userId) {
    const session = await DreamBoardSession.findBySessionId(sessionId);

    if (!session) {
      throw new Error('Game session not found');
    }

    if (!session.isParticipant(userId)) {
      throw new Error('You are not a participant in this game');
    }

    if (!['pending', 'active', 'analyzing'].includes(session.status)) {
      throw new Error('Game cannot be abandoned in current state');
    }

    session.status = 'abandoned';
    session.lastActivityAt = new Date();
    await session.save();

    logger.info('Dream Board game abandoned', {
      sessionId,
      byUser: userId
    });

    return session;
  }

  /**
   * Get game history for a user
   * @param {ObjectId} userId - User ID
   * @param {Number} limit - Max results
   * @returns {Promise<Array>} Completed games
   */
  async getGameHistory(userId, limit = 10) {
    const sessions = await DreamBoardSession.findCompletedForUser(userId, limit);

    return sessions.map(session => {
      const playerInfo = session.getPlayerInfo(userId);

      return {
        sessionId: session.sessionId,
        completedAt: session.completedAt,
        overallAlignment: session.results?.overallAlignment || 0,
        alignedCount: session.results?.alignedCount || 0,
        partner: {
          userId: playerInfo.partner.userId._id,
          firstName: playerInfo.partner.userId.firstName,
          lastName: playerInfo.partner.userId.lastName,
          profilePhoto: playerInfo.partner.userId.profilePhoto
        }
      };
    });
  }

  /**
   * Get all categories (for reference)
   * @returns {Promise<Object>} All categories with cards
   */
  async getAllCategories() {
    const categories = await DreamBoardCategory.getAllCategories();
    const categoryInfo = DreamBoardCategory.getCategoryInfo();
    const priorityInfo = DreamBoardCategory.getPriorityInfo();
    const timelineInfo = DreamBoardCategory.getTimelineInfo();

    return {
      categories: categories.map(cat => ({
        categoryNumber: cat.categoryNumber,
        categoryId: cat.categoryId,
        emoji: cat.emoji,
        title: cat.title,
        question: cat.question,
        insight: cat.insight,
        cards: cat.cards,
        color: categoryInfo[cat.categoryId]?.color,
        elaborationHint: this._getElaborationHint(cat.categoryId)
      })),
      priorityOptions: Object.entries(priorityInfo).map(([key, info]) => ({
        value: key,
        label: info.label,
        emoji: info.emoji,
        description: info.description
      })),
      timelineOptions: Object.entries(timelineInfo).map(([key, info]) => ({
        value: key,
        label: info.label,
        emoji: info.emoji,
        description: info.description
      })),
      totalCategories: 10,
      cardsPerCategory: 4,
      features: {
        elaborationsEnabled: true,
        maxElaborationDuration: 120, // seconds
        elaborationsOptional: true
      }
    };
  }
}

module.exports = new DreamBoardService();