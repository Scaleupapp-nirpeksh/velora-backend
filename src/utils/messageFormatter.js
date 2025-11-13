// src/utils/messageFormatter.js

class MessageFormatter {
    /**
     * Format message for API response
     */
    static formatMessage(message, currentUserId) {
      return {
        id: message._id,
        text: message.text,
        sender: {
          id: message.sender._id,
          username: message.sender.username,
          isMe: message.sender._id.toString() === currentUserId.toString()
        },
        type: message.type,
        media: message.media,
        createdAt: message.createdAt,
        isRead: message.readBy.some(r => r.userId.toString() === currentUserId.toString()),
        isEdited: message.isEdited,
        reactions: message.reactions
      };
    }
  
    /**
     * Format conversation list
     */
    static formatConversation(conversation, currentUserId) {
      const otherParticipant = conversation.participants.find(
        p => p._id.toString() !== currentUserId.toString()
      );
  
      return {
        id: conversation._id,
        participant: {
          id: otherParticipant._id,
          username: otherParticipant.username,
          profilePhoto: otherParticipant.profilePhoto,
          isOnline: otherParticipant.isOnline
        },
        lastMessage: conversation.lastMessage,
        unreadCount: conversation.unreadCount || 0,
        updatedAt: conversation.updatedAt
      };
    }
  
    /**
     * Sanitize message text
     */
    static sanitizeText(text) {
      return text
        .trim()
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .substring(0, 5000);
    }
  }
  
  module.exports = MessageFormatter;