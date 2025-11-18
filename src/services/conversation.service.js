const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Match = require('../models/Match');
const Block = require('../models/Block');
const User = require('../models/User');
const openaiService = require('./openai.service');
const logger = require('../utils/logger');

/**
 * Conversation Service
 * Handles all conversation-related business logic
 */
class ConversationService {
  /**
   * Start a new conversation from a match
   */
  static async startConversation(userId, matchId) {
    try {
      // Verify match exists and is mutual
      const match = await Match.findOne({
        _id: matchId,
        $or: [
          { userId, status: 'mutual_like' },
          { matchedUserId: userId, status: 'mutual_like' },
        ],
      });

      if (!match) {
        throw new Error('Match not found or not mutual');
      }

      // Check if users have blocked each other
      const otherUserId = match.userId.toString() === userId.toString()
        ? match.matchedUserId
        : match.userId;

      const isBlocked = await Block.isEitherBlocked(userId, otherUserId);
      if (isBlocked) {
        throw new Error('Cannot start conversation - user is blocked');
      }

      // Find or create conversation
      let conversation = await Conversation.findOne({ matchId });

      if (!conversation) {
        // Get both users for ice breaker generation
        const [user, otherUser] = await Promise.all([
          User.findById(userId).lean(),
          User.findById(otherUserId).lean(),
        ]);

        // Generate AI ice breakers
        const iceBreakers = await this.generateIceBreakers(user, otherUser);

        // Create new conversation
        conversation = await Conversation.create({
          matchId,
          participants: [
            { userId },
            { userId: otherUserId },
          ],
          startedBy: userId,
          iceBreakers,
        });

        // Create system message for match
        await Message.createSystemMessage(
          conversation._id,
          'match_created'
        );

        // Update match to indicate conversation started
        await Match.findByIdAndUpdate(matchId, {
          conversationStarted: true,
          conversationStartedAt: new Date(),
        });

        logger.info(`Conversation created for match ${matchId}`);
      }

      // Populate participants for response
      await conversation.populate('participants.userId', 'firstName lastName profilePhoto username');

      return conversation;

    } catch (error) {
      logger.error('Error starting conversation:', error);
      throw error;
    }
  }

  /**
   * Generate AI ice breakers based on user profiles
   */
  static async generateIceBreakers(user1, user2) {
    try {
      // Get user answers for context
      const Answer = require('../models/Answer');
      const [user1Answers, user2Answers] = await Promise.all([
        Answer.find({ userId: user1._id }).limit(15).lean(),
        Answer.find({ userId: user2._id }).limit(15).lean(),
      ]);

      // Build context for AI
      const context = {
        user1: {
          name: user1.firstName,
          bio: user1.bio?.text,
          location: user1.location?.city,
          answers: user1Answers.map(a => ({
            question: a.questionNumber,
            answer: a.textAnswer || a.transcribedText,
          })),
        },
        user2: {
          name: user2.firstName,
          bio: user2.bio?.text,
          location: user2.location?.city,
          answers: user2Answers.map(a => ({
            question: a.questionNumber,
            answer: a.textAnswer || a.transcribedText,
          })),
        },
      };

      // Generate ice breakers with GPT-4
      const prompt = `
        You are a dating app assistant generating conversation starters.
        
        User 1: ${context.user1.name}
        Bio: ${context.user1.bio || 'Not provided'}
        Location: ${context.user1.location || 'Not provided'}
        
        User 2: ${context.user2.name}
        Bio: ${context.user2.bio || 'Not provided'}
        Location: ${context.user2.location || 'Not provided'}
        
        Based on their profiles, generate 5 unique ice breaker questions that either user could ask.
        Make them fun, specific to their interests, and conversation-starting.
        
        Categories to cover:
        1. Fun/Light - Something playful
        2. Deep - Something thoughtful
        3. Hobby - Based on their interests
        4. Travel/Adventure - About experiences
        5. Creative - Something unique
        
        Return as JSON array with structure:
        [
          { "text": "question text", "category": "fun|deep|hobby|travel|creative" }
        ]
      `;

      const iceBreakersRaw = await openaiService.generateCompletion(prompt, {
        temperature: 0.8,
        response_format: { type: 'json_object' },
      });

      const parsed = JSON.parse(iceBreakersRaw);
      const iceBreakers = parsed.iceBreakers || parsed.questions || [];

      // Fallback ice breakers if AI fails
      const fallbackIceBreakers = [
        { text: "What's the most spontaneous thing you've done recently?", category: 'fun' },
        { text: "If you could have dinner with anyone, living or dead, who would it be and why?", category: 'deep' },
        { text: "What hobby have you always wanted to try but never got around to?", category: 'hobby' },
        { text: "What's your dream travel destination and what would you do there?", category: 'travel' },
        { text: "If you could master any skill overnight, what would it be?", category: 'creative' },
      ];

      return iceBreakers.length > 0 ? iceBreakers : fallbackIceBreakers;

    } catch (error) {
      logger.error('Error generating ice breakers:', error);
      
      // Return default ice breakers on error
      return [
        { text: "What made you swipe right on me?", category: 'fun' },
        { text: "What's something you're passionate about that doesn't show in your profile?", category: 'deep' },
        { text: "What's your ideal weekend like?", category: 'hobby' },
        { text: "If you could teleport anywhere right now, where would you go?", category: 'travel' },
        { text: "What's the best advice you've ever received?", category: 'creative' },
      ];
    }
  }

  /**
   * Get user's conversations with pagination
   */
  static async getUserConversations(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        status = 'active',
      } = options;

      const conversations = await Conversation.getUserConversations(
        userId,
        { page, limit, status }
      );

      // Add unread counts and format for response
      const formattedConversations = conversations.map(conv => {
        const participant = conv.participants.find(
          p => p.userId._id.toString() === userId.toString()
        );
        const otherParticipant = conv.participants.find(
          p => p.userId._id.toString() !== userId.toString()
        );

        return {
          _id: conv._id,
          matchId: conv.matchId,
          lastMessage: conv.lastMessage,
          lastMessageAt: conv.lastMessageAt,
          unreadCount: participant?.unreadCount || 0,
          isMuted: participant?.isMuted || false,
          otherUser: {
            _id: otherParticipant?.userId._id,
            firstName: otherParticipant?.userId.firstName,
            lastName: otherParticipant?.userId.lastName,
            profilePhoto: otherParticipant?.userId.profilePhoto,
            username: otherParticipant?.userId.username,
            isBlocked: otherParticipant?.isBlocked || false,
          },
          status: conv.status,
          createdAt: conv.createdAt,
        };
      });

      return formattedConversations;

    } catch (error) {
      logger.error('Error getting user conversations:', error);
      throw error;
    }
  }

  /**
   * Get single conversation details
   */
  static async getConversation(conversationId, userId) {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId,
      })
        .populate('participants.userId', 'firstName lastName profilePhoto username bio location')
        .populate('matchId', 'compatibilityScore');

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Check if user is participant
      const isParticipant = conversation.participants.some(
        p => p.userId._id.toString() === userId.toString()
      );

      if (!isParticipant) {
        throw new Error('Unauthorized access to conversation');
      }

      // Get other participant details
      const otherParticipant = conversation.getOtherParticipant(userId);

      // Check if blocked
      const isBlocked = await Block.isEitherBlocked(
        userId,
        otherParticipant.userId._id
      );

      return {
        ...conversation.toObject(),
        isBlocked,
        canSendMessage: !isBlocked && conversation.status === 'active',
      };

    } catch (error) {
      logger.error('Error getting conversation:', error);
      throw error;
    }
  }

  /**
   * Mute/unmute conversation
   */
  static async toggleMute(conversationId, userId, duration = null) {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId,
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      const participant = conversation.getParticipant(userId);
      
      if (participant.isMuted) {
        // Unmute
        participant.isMuted = false;
        participant.mutedUntil = null;
      } else {
        // Mute
        participant.isMuted = true;
        if (duration) {
          const mutedUntil = new Date();
          mutedUntil.setHours(mutedUntil.getHours() + duration);
          participant.mutedUntil = mutedUntil;
        }
      }

      await conversation.save();

      return {
        isMuted: participant.isMuted,
        mutedUntil: participant.mutedUntil,
      };

    } catch (error) {
      logger.error('Error toggling mute:', error);
      throw error;
    }
  }

  /**
   * Delete conversation for user
   */
  static async deleteConversation(conversationId, userId) {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId,
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      await conversation.softDelete(userId);

      logger.info(`Conversation ${conversationId} deleted for user ${userId}`);

      return { success: true, message: 'Conversation deleted' };

    } catch (error) {
      logger.error('Error deleting conversation:', error);
      throw error;
    }
  }

  /**
   * Block user from conversation
   */
  static async blockFromConversation(conversationId, blockerId, reason = 'not_interested') {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': blockerId,
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Get other user
      const otherParticipant = conversation.getOtherParticipant(blockerId);
      const blockedUserId = otherParticipant.userId;

      // Create block
      await Block.createBlock({
        blockerId,
        blockedUserId,
        conversationId,
        matchId: conversation.matchId,
        reason,
        blockedFromScreen: 'chat',
      });

      // Update conversation status
      await conversation.block(blockerId, reason);

      // Create system message
      await Message.createSystemMessage(
        conversationId,
        'user_blocked'
      );

      logger.info(`User ${blockerId} blocked ${blockedUserId} from conversation ${conversationId}`);

      return { success: true, message: 'User blocked' };

    } catch (error) {
      logger.error('Error blocking from conversation:', error);
      throw error;
    }
  }

  /**
   * Unblock user from conversation
   */
  static async unblockFromConversation(conversationId, unblockerId) {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        blockedBy: unblockerId,
      });

      if (!conversation) {
        throw new Error('Conversation not found or you did not block this user');
      }

      // Get other user
      const otherParticipant = conversation.getOtherParticipant(unblockerId);
      const unblockedUserId = otherParticipant.userId;

      // Remove block
      await Block.removeBlock(unblockerId, unblockedUserId);

      // Update conversation status
      await conversation.unblock(unblockerId);

      // Create system message
      await Message.createSystemMessage(
        conversationId,
        'user_unblocked'
      );

      logger.info(`User ${unblockerId} unblocked ${unblockedUserId} from conversation ${conversationId}`);

      return { success: true, message: 'User unblocked' };

    } catch (error) {
      logger.error('Error unblocking from conversation:', error);
      throw error;
    }
  }

  /**
   * Use an ice breaker
   */
  static async useIceBreaker(conversationId, userId, iceBreakerId) {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.userId': userId,
      });

      if (!conversation) {
        throw new Error('Conversation not found');
      }

      // Find the ice breaker
      const iceBreaker = conversation.iceBreakers.find(
        ib => ib._id.toString() === iceBreakerId
      );

      if (!iceBreaker) {
        throw new Error('Ice breaker not found');
      }

      if (iceBreaker.used) {
        throw new Error('Ice breaker already used');
      }

      // Mark as used
      iceBreaker.used = true;
      iceBreaker.usedAt = new Date();
      iceBreaker.usedBy = userId;
      await conversation.save();

      // Create message with ice breaker
      const message = await Message.create({
        conversationId,
        senderId: userId,
        type: 'ice_breaker',
        text: iceBreaker.text,
        iceBreakerId: iceBreaker._id,
        status: 'sent',
      });

      return message;

    } catch (error) {
      logger.error('Error using ice breaker:', error);
      throw error;
    }
  }

  // Add this method to src/services/conversation.service.js

/**
 * Get conversation by match ID
 * Returns the conversation if it exists, or null if not found
 */
static async getConversationByMatch(matchId, userId) {
  try {
    // Find conversation by match ID
    const conversation = await Conversation.findOne({ 
      matchId,
      'participants.userId': userId 
    })
      .populate('participants.userId', 'firstName lastName profilePhoto username')
      .populate('lastMessage.senderId', 'firstName')
      .lean();

    if (!conversation) {
      return null; // No conversation exists for this match yet
    }

    // Format the conversation for response
    const participant = conversation.participants.find(
      p => p.userId._id.toString() === userId.toString()
    );
    const otherParticipant = conversation.participants.find(
      p => p.userId._id.toString() !== userId.toString()
    );

    return {
      _id: conversation._id,
      matchId: conversation.matchId,
      lastMessage: conversation.lastMessage,
      lastMessageAt: conversation.lastMessageAt,
      unreadCount: participant?.unreadCount || 0,
      isMuted: participant?.isMuted || false,
      otherUser: {
        _id: otherParticipant?.userId._id,
        firstName: otherParticipant?.userId.firstName,
        lastName: otherParticipant?.userId.lastName,
        profilePhoto: otherParticipant?.userId.profilePhoto,
        username: otherParticipant?.userId.username,
        isBlocked: otherParticipant?.isBlocked || false,
      },
      status: conversation.status,
      createdAt: conversation.createdAt,
      iceBreakers: conversation.iceBreakers,
    };

  } catch (error) {
    logger.error('Error getting conversation by match:', error);
    throw error;
  }
}
}

module.exports = ConversationService;