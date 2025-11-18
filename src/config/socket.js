// src/config/socket.js

const socketIO = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const ConversationService = require('../services/conversation.service');
const MessageService = require('../services/message.service');
const logger = require('../utils/logger');

class SocketManager {
  constructor() {
    this.io = null;
    this.userSockets = new Map(); // userId -> socketId mapping
    this.socketUsers = new Map(); // socketId -> userId mapping
  }

  /**
   * Initialize Socket.io with Express server
   */
  initialize(server) {
    this.io = socketIO(server, {
      cors: {
        origin: process.env.CLIENT_URL || 'http://localhost:3000',
        credentials: true
      },
      pingTimeout: 60000,
      maxHttpBufferSize: 1e8 // 100 MB for file uploads
    });

    this.setupMiddleware();
    this.setupEventHandlers();

    logger.info('Socket.io initialized successfully');
    return this.io;
  }

  /**
   * Socket authentication middleware
   */
  setupMiddleware() {
    this.io.use(async (socket, next) => {
      try {
        const token = socket.handshake.auth.token;
        
        if (!token) {
          return next(new Error('Authentication required'));
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId || decoded.id)
          .select('_id username isOnline');

        if (!user) {
          return next(new Error('User not found'));
        }

        socket.userId = user._id.toString();
        socket.user = user;
        next();

      } catch (error) {
        logger.error('Socket authentication error:', error);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup socket event handlers
   */
  setupEventHandlers() {
    this.io.on('connection', async (socket) => {
      const userId = socket.userId;
      
      logger.info(`User connected: ${userId}`);
      
      // Store socket mapping
      this.userSockets.set(userId, socket.id);
      this.socketUsers.set(socket.id, userId);

      // Update user online status
      await this.updateUserStatus(userId, true);

      // Join user's conversation rooms
      await this.joinUserConversations(socket);

      // Socket event handlers
      this.handleJoinConversation(socket);
      this.handleLeaveConversation(socket);
      this.handleSendMessage(socket);
      this.handleTyping(socket);
      this.handleMarkAsRead(socket);
      this.handleDeleteMessage(socket);
      this.handleEditMessage(socket);
      this.handleReaction(socket);
      this.handleDisconnect(socket);
    });
  }

  /**
   * Join user to all their conversation rooms
   */
  async joinUserConversations(socket) {
    try {
      const conversations = await ConversationService.getUserConversations(
        socket.userId,
        { limit: 100 }
      );

      // FIX: Remove .data reference - conversations is already an array
      if (conversations && Array.isArray(conversations)) {
        conversations.forEach(conversation => {
          socket.join(`conversation:${conversation._id}`);
        });
      }

    } catch (error) {
      logger.error('Error joining conversations:', error);
    }
  }

  /**
   * Handle joining a specific conversation
   */
  handleJoinConversation(socket) {
    socket.on('conversation:join', async (data) => {
      try {
        const { conversationId } = data;

        // Verify user is participant
        const conversation = await ConversationService.getConversation(
          conversationId,
          socket.userId
        );

        if (!conversation) {
          return socket.emit('error', {
            message: 'Conversation not found or access denied'
          });
        }

        socket.join(`conversation:${conversationId}`);
        
        socket.emit('conversation:joined', {
          conversationId,
          success: true
        });

      } catch (error) {
        logger.error('Error joining conversation:', error);
        socket.emit('error', { message: 'Failed to join conversation' });
      }
    });
  }

  /**
   * Handle leaving a conversation
   */
  handleLeaveConversation(socket) {
    socket.on('conversation:leave', (data) => {
      const { conversationId } = data;
      socket.leave(`conversation:${conversationId}`);
      
      socket.emit('conversation:left', {
        conversationId,
        success: true
      });
    });
  }

  /**
   * Handle sending a message
   */
  handleSendMessage(socket) {
    socket.on('message:send', async (data) => {
      try {
        const {
          conversationId,
          text,
          clientMessageId,
          replyToMessageId
        } = data;

        // Verify user is participant
        const conversation = await ConversationService.getConversation(
          conversationId,
          socket.userId
        );

        if (!conversation || conversation.isBlocked) {
          return socket.emit('error', {
            message: 'Cannot send message to this conversation'
          });
        }

        // Send message
        const message = await MessageService.sendTextMessage(
          conversationId,
          socket.userId,
          text,
          clientMessageId,
          replyToMessageId
        );

        // Emit to all participants in conversation
        this.io.to(`conversation:${conversationId}`).emit('message:new', {
          message,
          conversationId
        });

        // Send push notification to offline recipient
        // FIX: Access participants properly based on conversation structure
        const otherParticipant = conversation.otherUser || 
          conversation.participants?.find(
            p => (p.userId?._id || p.userId || p).toString() !== socket.userId
          );
        
        const recipientId = otherParticipant?._id || otherParticipant?.userId || otherParticipant;

        if (recipientId && !this.userSockets.has(recipientId.toString())) {
          await this.sendPushNotification(recipientId, message, conversation);
        }

      } catch (error) {
        logger.error('Error sending message:', error);
        socket.emit('error', { 
          message: 'Failed to send message',
          clientMessageId: data.clientMessageId 
        });
      }
    });
  }

  /**
   * Handle typing indicators
   */
  handleTyping(socket) {
    let typingTimer;

    socket.on('typing:start', (data) => {
      const { conversationId } = data;
      
      // Broadcast to other participants
      socket.to(`conversation:${conversationId}`).emit('typing:started', {
        userId: socket.userId,
        conversationId
      });

      // Auto-stop typing after 5 seconds
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        socket.to(`conversation:${conversationId}`).emit('typing:stopped', {
          userId: socket.userId,
          conversationId
        });
      }, 5000);
    });

    socket.on('typing:stop', (data) => {
      const { conversationId } = data;
      clearTimeout(typingTimer);
      
      socket.to(`conversation:${conversationId}`).emit('typing:stopped', {
        userId: socket.userId,
        conversationId
      });
    });
  }

  /**
   * Handle marking messages as read
   */
  handleMarkAsRead(socket) {
    socket.on('message:read', async (data) => {
      try {
        const { conversationId, messageId } = data;

        // FIX: Use correct method name - markAsRead instead of markMessagesAsRead
        await MessageService.markAsRead(
          conversationId,
          socket.userId,
          [messageId] // Pass as array
        );

        // Notify sender that message was read
        socket.to(`conversation:${conversationId}`).emit('message:read:receipt', {
          conversationId,
          messageId,
          readBy: socket.userId,
          readAt: new Date()
        });

      } catch (error) {
        logger.error('Error marking message as read:', error);
      }
    });
  }

  /**
   * Handle message deletion
   */
  handleDeleteMessage(socket) {
    socket.on('message:delete', async (data) => {
      try {
        const { messageId } = data;

        const result = await MessageService.deleteMessage(
          messageId,
          socket.userId
        );

        if (result && result.success) {
          // Get message details to find conversation
          const message = await MessageService.getMessage(messageId);
          
          if (message) {
            // Notify all participants
            this.io.to(`conversation:${message.conversationId}`).emit('message:deleted', {
              messageId,
              conversationId: message.conversationId,
              deletedBy: socket.userId
            });
          }
        }

      } catch (error) {
        logger.error('Error deleting message:', error);
        socket.emit('error', { message: 'Failed to delete message' });
      }
    });
  }

  /**
   * Handle message editing
   */
  handleEditMessage(socket) {
    socket.on('message:edit', async (data) => {
      try {
        const { messageId, text } = data;

        const message = await MessageService.editMessage(
          messageId,
          text
        );

        if (message) {
          // Notify all participants
          this.io.to(`conversation:${message.conversationId}`).emit('message:edited', {
            message,
            editedBy: socket.userId
          });
        }

      } catch (error) {
        logger.error('Error editing message:', error);
        socket.emit('error', { message: error.message });
      }
    });
  }

  /**
   * Handle reactions
   */
  handleReaction(socket) {
    socket.on('message:react', async (data) => {
      try {
        const { messageId, emoji } = data;

        await MessageService.addReaction(messageId, socket.userId, emoji);

        const message = await MessageService.getMessage(messageId);

        // Notify all participants
        this.io.to(`conversation:${message.conversationId}`).emit('message:reaction', {
          messageId,
          userId: socket.userId,
          emoji,
          action: 'add'
        });

      } catch (error) {
        logger.error('Error adding reaction:', error);
      }
    });

    socket.on('message:unreact', async (data) => {
      try {
        const { messageId } = data;

        await MessageService.removeReaction(messageId, socket.userId);

        const message = await MessageService.getMessage(messageId);

        // Notify all participants
        this.io.to(`conversation:${message.conversationId}`).emit('message:reaction', {
          messageId,
          userId: socket.userId,
          action: 'remove'
        });

      } catch (error) {
        logger.error('Error removing reaction:', error);
      }
    });
  }

  /**
   * Handle disconnection
   */
  handleDisconnect(socket) {
    socket.on('disconnect', async () => {
      const userId = socket.userId;
      
      logger.info(`User disconnected: ${userId}`);

      // Remove socket mapping
      this.userSockets.delete(userId);
      this.socketUsers.delete(socket.id);

      // Update user online status (with 30s grace period)
      setTimeout(async () => {
        if (!this.userSockets.has(userId)) {
          await this.updateUserStatus(userId, false);
        }
      }, 30000);
    });
  }

  /**
   * Update user online status
   */
  async updateUserStatus(userId, isOnline) {
    try {
      await User.findByIdAndUpdate(userId, {
        isOnline,
        lastSeen: new Date()
      });

      // Broadcast status change to user's contacts
      const conversations = await ConversationService.getUserConversations(
        userId,
        { limit: 100 }
      );

      // FIX: Remove .data reference - conversations is already an array
      if (conversations && Array.isArray(conversations)) {
        conversations.forEach(conversation => {
          this.io.to(`conversation:${conversation._id}`).emit('user:status', {
            userId,
            isOnline,
            lastSeen: new Date()
          });
        });
      }

    } catch (error) {
      logger.error('Error updating user status:', error);
    }
  }

  /**
   * Send push notification (placeholder - implement with FCM)
   */
  async sendPushNotification(userId, message, conversation) {
    // This will be implemented with Firebase Cloud Messaging
    logger.info(`Push notification to ${userId}: New message in conversation`);
  }

  /**
   * Emit event to specific user
   */
  emitToUser(userId, event, data) {
    const socketId = this.userSockets.get(userId.toString());
    if (socketId) {
      this.io.to(socketId).emit(event, data);
    }
  }

  /**
   * Emit event to conversation room
   */
  emitToConversation(conversationId, event, data) {
    this.io.to(`conversation:${conversationId}`).emit(event, data);
  }
}

// Create singleton instance
const socketManager = new SocketManager();

module.exports = socketManager;