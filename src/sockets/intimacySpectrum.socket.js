// src/sockets/intimacySpectrum.socket.js

const intimacySpectrumService = require('../services/games/intimacySpectrum.service');
const IntimacySpectrumSession = require('../models/games/IntimacySpectrumSession');
const IntimacySpectrumQuestion = require('../models/games/IntimacySpectrumQuestion');
const logger = require('../utils/logger');

/**
 * INTIMACY SPECTRUM SOCKET HANDLERS
 * 
 * Real-time event handling for the Intimacy Spectrum slider game.
 * 
 * =====================================================
 * EVENTS FROM CLIENT → SERVER:
 * =====================================================
 * - is:invite           - Send game invitation
 * - is:accept           - Accept invitation
 * - is:decline          - Decline invitation
 * - is:answer           - Submit slider position (0-100)
 * - is:ready_for_next   - Ready for next question after reveal
 * - is:voice_note       - Send post-game voice note
 * - is:reconnect        - Reconnect to active game
 * - is:leave            - Leave/abandon game
 * 
 * =====================================================
 * EVENTS FROM SERVER → CLIENT:
 * =====================================================
 * - is:invited          - You've been invited
 * - is:invitation_sent  - Your invitation was sent successfully
 * - is:invitation_expired - Invitation has expired
 * - is:accepted         - Your invitation was accepted
 * - is:declined         - Your invitation was declined
 * - is:game_starting    - Game starting (3s countdown)
 * - is:question         - New question to answer
 * - is:answer_recorded  - Your answer was recorded
 * - is:partner_answered - Partner has answered (no reveal yet)
 * - is:reveal           - Both answered, show results
 * - is:timeout          - Question timed out
 * - is:game_completed   - All 30 questions done
 * - is:results          - Final results with AI insights
 * - is:voice_note_received - Partner sent voice note
 * - is:partner_connected   - Partner connection status changed
 * - is:partner_disconnected - Partner disconnected
 * - is:game_paused      - Game paused due to disconnection
 * - is:game_resumed     - Game resumed after reconnection
 * - is:reconnected      - Successfully reconnected to game
 * - is:error            - Error occurred
 */

// =====================================================
// STORAGE FOR ACTIVE GAMES
// =====================================================

// Store active timers by sessionId
const questionTimers = new Map();

// Store countdown timers by sessionId (for starting phase)
const countdownTimers = new Map();

// Store which users are in which game rooms
const userSessions = new Map(); // oduserId -> sessionId

// Store ready states for next question
const readyForNext = new Map(); // sessionId -> Set of userIds ready

// =====================================================
// TIMER CONSTANTS
// =====================================================

const QUESTION_TIME_MS = 20 * 1000;       // 20 seconds per question
const COUNTDOWN_TIME_MS = 3 * 1000;       // 3 second countdown before start
const REVEAL_TIME_MS = 5 * 1000;          // 5 seconds to view reveal before auto-next
const INVITATION_EXPIRY_MS = 5 * 60 * 1000; // 5 minute invitation expiry
const RECONNECT_GRACE_MS = 30 * 1000;     // 30 seconds to reconnect before pause

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get the socket room name for a session
 */
function getSessionRoom(sessionId) {
  return `is:${sessionId}`;
}

/**
 * Clear all timers for a session
 */
function clearSessionTimers(sessionId) {
  const timer = questionTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer.timeout);
    questionTimers.delete(sessionId);
  }
  
  const countdown = countdownTimers.get(sessionId);
  if (countdown) {
    clearTimeout(countdown);
    countdownTimers.delete(sessionId);
  }
}

/**
 * Emit to a specific user by oduserId
 */
function emitToUser(io, socketManager, oduserId, event, data) {
  const userIdStr = oduserId.toString();
  
  // Try to get user's socket from socket manager
  if (socketManager && socketManager.userSockets) {
    const socketId = socketManager.userSockets.get(userIdStr);
    if (socketId) {
      io.to(socketId).emit(event, data);
      return true;
    }
  }
  
  // Fallback: emit to user's personal room
  io.to(`user:${userIdStr}`).emit(event, data);
  return true;
}

/**
 * Get both player IDs from session
 */
function getPlayerIds(session) {
  const p1Id = session.player1.userId._id 
    ? session.player1.userId._id.toString() 
    : session.player1.userId.toString();
  const p2Id = session.player2.userId._id 
    ? session.player2.userId._id.toString() 
    : session.player2.userId.toString();
  return { p1Id, p2Id };
}

/**
 * Check if user is a player in session
 */
function isPlayerInSession(session, oduserId) {
  const { p1Id, p2Id } = getPlayerIds(session);
  const userIdStr = oduserId.toString();
  return userIdStr === p1Id || userIdStr === p2Id;
}

/**
 * Get partner's userId from session
 */
function getPartnerId(session, oduserId) {
  const { p1Id, p2Id } = getPlayerIds(session);
  const userIdStr = oduserId.toString();
  return userIdStr === p1Id ? p2Id : p1Id;
}

/**
 * Check if both players are connected
 */
function areBothPlayersConnected(session) {
  return session.player1.isConnected && session.player2.isConnected;
}

// =====================================================
// MAIN INITIALIZATION
// =====================================================

/**
 * Initialize Intimacy Spectrum socket handlers
 * @param {Server} io - Socket.io server instance
 * @param {Socket} socket - Individual socket connection
 * @param {Object} socketManager - Socket manager with helper methods
 */
function initializeIntimacySpectrumSocket(io, socket, socketManager) {
  const oduserId = socket.userId;

  if (!oduserId) {
    logger.error('[IS Socket] No oduserId on socket');
    return;
  }

  logger.info(`[IS Socket] Initializing for user ${oduserId}`);

  // =====================================================
  // RECONNECTION HANDLING
  // =====================================================

  /**
   * Handle user reconnecting to an active game
   * Payload: { sessionId? } - Optional, will find active session if not provided
   */
  socket.on('is:reconnect', async (payload = {}) => {
    try {
      let session;

      if (payload.sessionId) {
        session = await IntimacySpectrumSession.findBySessionId(payload.sessionId);
      } else {
        session = await IntimacySpectrumSession.findActiveForUser(oduserId);
      }

      if (!session) {
        socket.emit('is:error', { 
          code: 'NO_ACTIVE_GAME',
          message: 'No active game found' 
        });
        return;
      }

      if (!isPlayerInSession(session, oduserId)) {
        socket.emit('is:error', { 
          code: 'NOT_A_PLAYER',
          message: 'You are not a player in this game' 
        });
        return;
      }

      // Join the session room
      const room = getSessionRoom(session.sessionId);
      socket.join(room);
      userSessions.set(oduserId.toString(), session.sessionId);

      // Update connection status
      await intimacySpectrumService.updateConnectionStatus(
        session.sessionId,
        oduserId,
        true
      );

      // Reload session to get updated connection status
      session = await IntimacySpectrumSession.findBySessionId(session.sessionId);

      // Notify partner of reconnection
      const partnerId = getPartnerId(session, oduserId);
      emitToUser(io, socketManager, partnerId, 'is:partner_connected', {
        oduserId: oduserId.toString(),
        sessionId: session.sessionId
      });

      // Get current game state
      const { p1Id } = getPlayerIds(session);
      const isPlayer1 = p1Id === oduserId.toString();

      // Build reconnection response
      const reconnectData = {
        sessionId: session.sessionId,
        status: session.status,
        currentQuestionIndex: session.currentQuestionIndex,
        totalQuestions: 30,
        progress: session.progressPercent,
        partner: {
          oduserId: partnerId,
          firstName: isPlayer1 
            ? session.player2.userId.firstName 
            : session.player1.userId.firstName,
          isConnected: isPlayer1 
            ? session.player2.isConnected 
            : session.player1.isConnected
        }
      };

      // Handle different game states
      if (session.status === 'starting') {
        // Check if both players are now connected
        if (areBothPlayersConnected(session)) {
          reconnectData.message = 'Both players connected, game will start shortly';
          
          // Resume countdown if it was paused
          if (!countdownTimers.has(session.sessionId)) {
            io.to(room).emit('is:game_starting', {
              sessionId: session.sessionId,
              startsIn: COUNTDOWN_TIME_MS,
              startsAt: new Date(Date.now() + COUNTDOWN_TIME_MS).toISOString(),
              totalQuestions: 30,
              timePerQuestion: 20
            });

            // Start countdown
            const countdownTimeout = setTimeout(async () => {
              await startGameAfterCountdown(io, socketManager, session.sessionId, room);
            }, COUNTDOWN_TIME_MS);
            
            countdownTimers.set(session.sessionId, countdownTimeout);
          }
        } else {
          reconnectData.message = 'Waiting for partner to connect';
        }
      }

      // If game is in playing state, include current question
      if (session.status === 'playing') {
        const questionNumber = session.questionOrder[session.currentQuestionIndex];
        const question = await IntimacySpectrumQuestion.findOne({ questionNumber });

        if (question) {
          reconnectData.currentQuestion = {
            index: session.currentQuestionIndex,
            number: questionNumber,
            category: question.category,
            questionText: question.questionText,
            leftLabel: question.leftLabel,
            rightLabel: question.rightLabel,
            spiceLevel: question.spiceLevel,
            expiresAt: session.currentQuestionExpiresAt
          };

          // Check if user already answered this question
          const player = isPlayer1 ? session.player1 : session.player2;
          const existingAnswer = player.answers.find(
            a => a.questionNumber === questionNumber
          );
          reconnectData.alreadyAnswered = existingAnswer && existingAnswer.position !== null;
          reconnectData.yourPosition = existingAnswer?.position ?? null;

          // Check if partner already answered
          const partner = isPlayer1 ? session.player2 : session.player1;
          const partnerAnswer = partner.answers.find(
            a => a.questionNumber === questionNumber
          );
          reconnectData.partnerAnswered = partnerAnswer && partnerAnswer.position !== null;
        }
      }

      // If game was paused, check if we can resume
      if (session.status === 'paused') {
        if (areBothPlayersConnected(session)) {
          session.status = 'playing';
          await session.save();
          
          io.to(room).emit('is:game_resumed', {
            sessionId: session.sessionId
          });

          reconnectData.status = 'playing';
          
          // Restart question timer if needed
          const timeRemaining = session.currentQuestionExpiresAt 
            ? session.currentQuestionExpiresAt.getTime() - Date.now()
            : QUESTION_TIME_MS;
          
          if (timeRemaining > 0) {
            startQuestionTimer(io, socketManager, session.sessionId, session.currentQuestionIndex, timeRemaining);
          } else {
            // Time already expired, handle timeout
            await handleQuestionTimeout(io, socketManager, session.sessionId, session.currentQuestionIndex);
          }
        } else {
          reconnectData.message = 'Game paused, waiting for partner to reconnect';
        }
      }

      // If game is completed, include results
      if (['completed', 'discussion'].includes(session.status)) {
        reconnectData.results = session.results;
        reconnectData.aiInsights = session.aiInsights;
      }

      socket.emit('is:reconnected', reconnectData);

      logger.info('[IS Socket] User reconnected to game', {
        oduserId,
        sessionId: session.sessionId,
        status: session.status
      });

    } catch (error) {
      logger.error('[IS Socket] Reconnection error:', error);
      socket.emit('is:error', { 
        code: 'RECONNECT_FAILED',
        message: 'Failed to reconnect to game' 
      });
    }
  });

  // =====================================================
  // INVITATION EVENTS
  // =====================================================

  /**
   * Send a game invitation
   * Payload: { matchId }
   */
  socket.on('is:invite', async (payload) => {
    try {
      const { matchId } = payload;

      if (!matchId) {
        socket.emit('is:error', { 
          code: 'MISSING_MATCH_ID',
          message: 'Match ID is required' 
        });
        return;
      }

      // Check if user already has an active game
      const existingSession = await IntimacySpectrumSession.findActiveForUser(oduserId);
      if (existingSession) {
        socket.emit('is:error', { 
          code: 'ALREADY_IN_GAME',
          message: 'You already have an active game',
          sessionId: existingSession.sessionId
        });
        return;
      }

      // Create the invitation
      const result = await intimacySpectrumService.createInvitation(oduserId, matchId);
      const { session, invitedUser } = result;

      // Join the session room
      const room = getSessionRoom(session.sessionId);
      socket.join(room);
      userSessions.set(oduserId.toString(), session.sessionId);

      // Mark player 1 as connected
      await intimacySpectrumService.updateConnectionStatus(session.sessionId, oduserId, true);

      // Confirm to initiator
      socket.emit('is:invitation_sent', {
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        invitedUser
      });

      // Notify invited user
      emitToUser(io, socketManager, invitedUser.oduserId, 'is:invited', {
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        invitedBy: {
          oduserId: oduserId.toString(),
          firstName: session.player1.userId.firstName,
          lastName: session.player1.userId.lastName,
          profilePhoto: session.player1.userId.profilePhoto
        },
        gameInfo: {
          name: 'Intimacy Spectrum',
          description: 'Explore your compatibility through 30 intimate questions',
          questionCount: 30,
          timePerQuestion: 20
        }
      });

      // Set expiration timer
      setTimeout(async () => {
        try {
          const checkSession = await IntimacySpectrumSession.findBySessionId(session.sessionId);
          if (checkSession && checkSession.status === 'pending') {
            checkSession.status = 'expired';
            await checkSession.save();

            io.to(room).emit('is:invitation_expired', {
              sessionId: session.sessionId
            });

            clearSessionTimers(session.sessionId);
          }
        } catch (err) {
          logger.error('[IS Socket] Expiration check error:', err);
        }
      }, INVITATION_EXPIRY_MS);

      logger.info('[IS Socket] Invitation sent', {
        sessionId: session.sessionId,
        from: oduserId,
        to: invitedUser.oduserId
      });

    } catch (error) {
      logger.error('[IS Socket] Invite error:', error);
      socket.emit('is:error', { 
        code: 'INVITE_FAILED',
        message: error.message || 'Failed to send invitation' 
      });
    }
  });

  /**
   * Accept a game invitation
   * Payload: { sessionId }
   */
  socket.on('is:accept', async (payload) => {
    try {
      const { sessionId } = payload;

      if (!sessionId) {
        socket.emit('is:error', { 
          code: 'MISSING_SESSION_ID',
          message: 'Session ID is required' 
        });
        return;
      }

      // Check if user already has an active game (different from this one)
      const existingSession = await IntimacySpectrumSession.findActiveForUser(oduserId);
      if (existingSession && existingSession.sessionId !== sessionId) {
        socket.emit('is:error', { 
          code: 'ALREADY_IN_GAME',
          message: 'You already have an active game',
          sessionId: existingSession.sessionId
        });
        return;
      }

      // Accept the invitation
      const session = await intimacySpectrumService.acceptInvitation(sessionId, oduserId);

      // Join the session room
      const room = getSessionRoom(sessionId);
      socket.join(room);
      userSessions.set(oduserId.toString(), sessionId);

      // Update connection status for player 2
      await intimacySpectrumService.updateConnectionStatus(sessionId, oduserId, true);

      // Reload session to check connection status
      const updatedSession = await IntimacySpectrumSession.findBySessionId(sessionId);

      // Notify both players
      io.to(room).emit('is:accepted', {
        sessionId,
        acceptedBy: {
          oduserId: oduserId.toString(),
          firstName: session.player2.userId.firstName
        }
      });

      // Check if both players are connected
      if (areBothPlayersConnected(updatedSession)) {
        // Start countdown
        io.to(room).emit('is:game_starting', {
          sessionId,
          startsIn: COUNTDOWN_TIME_MS,
          startsAt: new Date(Date.now() + COUNTDOWN_TIME_MS).toISOString(),
          totalQuestions: 30,
          timePerQuestion: 20
        });

        // After countdown, start the game
        const countdownTimeout = setTimeout(async () => {
          await startGameAfterCountdown(io, socketManager, sessionId, room);
        }, COUNTDOWN_TIME_MS);

        countdownTimers.set(sessionId, countdownTimeout);
      } else {
        // Wait for both players to connect
        io.to(room).emit('is:waiting_for_players', {
          sessionId,
          message: 'Waiting for both players to be connected'
        });
      }

      logger.info('[IS Socket] Invitation accepted', {
        sessionId,
        acceptedBy: oduserId,
        bothConnected: areBothPlayersConnected(updatedSession)
      });

    } catch (error) {
      logger.error('[IS Socket] Accept error:', error);
      socket.emit('is:error', { 
        code: 'ACCEPT_FAILED',
        message: error.message || 'Failed to accept invitation' 
      });
    }
  });

  /**
   * Decline a game invitation
   * Payload: { sessionId }
   */
  socket.on('is:decline', async (payload) => {
    try {
      const { sessionId } = payload;

      if (!sessionId) {
        socket.emit('is:error', { 
          code: 'MISSING_SESSION_ID',
          message: 'Session ID is required' 
        });
        return;
      }

      const session = await intimacySpectrumService.declineInvitation(sessionId, oduserId);

      const room = getSessionRoom(sessionId);

      // Notify initiator
      io.to(room).emit('is:declined', {
        sessionId,
        declinedBy: {
          oduserId: oduserId.toString(),
          firstName: session.player2.userId.firstName
        }
      });

      // Clean up
      clearSessionTimers(sessionId);
      userSessions.delete(oduserId.toString());

      logger.info('[IS Socket] Invitation declined', {
        sessionId,
        declinedBy: oduserId
      });

    } catch (error) {
      logger.error('[IS Socket] Decline error:', error);
      socket.emit('is:error', { 
        code: 'DECLINE_FAILED',
        message: error.message || 'Failed to decline invitation' 
      });
    }
  });

  // =====================================================
  // GAMEPLAY EVENTS
  // =====================================================

  /**
   * Submit slider answer
   * Payload: { sessionId, position }
   * position: 0-100 (slider value)
   */
  socket.on('is:answer', async (payload) => {
    try {
      const { sessionId, position } = payload;

      // Validate payload
      if (!sessionId) {
        socket.emit('is:error', { 
          code: 'MISSING_SESSION_ID',
          message: 'Session ID is required' 
        });
        return;
      }

      if (position === undefined || position === null) {
        socket.emit('is:error', { 
          code: 'MISSING_POSITION',
          message: 'Slider position is required' 
        });
        return;
      }

      const positionNum = parseInt(position);
      if (isNaN(positionNum) || positionNum < 0 || positionNum > 100) {
        socket.emit('is:error', { 
          code: 'INVALID_POSITION',
          message: 'Position must be between 0 and 100' 
        });
        return;
      }

      // Get session
      const session = await IntimacySpectrumSession.findBySessionId(sessionId);

      if (!session) {
        socket.emit('is:error', { 
          code: 'SESSION_NOT_FOUND',
          message: 'Game session not found' 
        });
        return;
      }

      if (session.status !== 'playing') {
        socket.emit('is:error', { 
          code: 'GAME_NOT_PLAYING',
          message: 'Game is not in playing state' 
        });
        return;
      }

      // Check if question has expired
      if (new Date() > session.currentQuestionExpiresAt) {
        socket.emit('is:error', { 
          code: 'QUESTION_EXPIRED',
          message: 'Time has expired for this question' 
        });
        return;
      }

      // Submit the answer
      const result = await intimacySpectrumService.submitAnswer(
        sessionId,
        oduserId,
        positionNum
      );

      const room = getSessionRoom(sessionId);

      // Confirm to answering player
      socket.emit('is:answer_recorded', {
        sessionId,
        questionIndex: result.questionIndex,
        position: positionNum,
        recorded: true
      });

      // Notify partner that this player has answered (without revealing position)
      const partnerId = getPartnerId(session, oduserId);
      emitToUser(io, socketManager, partnerId, 'is:partner_answered', {
        sessionId,
        questionIndex: result.questionIndex
      });

      // If both have answered, do reveal
      if (result.bothAnswered) {
        await handleReveal(io, socketManager, sessionId, result.questionIndex);
      }

      logger.info('[IS Socket] Answer submitted', {
        sessionId,
        oduserId,
        questionIndex: result.questionIndex,
        position: positionNum
      });

    } catch (error) {
      logger.error('[IS Socket] Answer error:', error);
      socket.emit('is:error', { 
        code: 'ANSWER_FAILED',
        message: error.message || 'Failed to submit answer' 
      });
    }
  });

  /**
   * Player ready for next question after viewing reveal
   * Payload: { sessionId }
   */
  socket.on('is:ready_for_next', async (payload) => {
    try {
      const { sessionId } = payload;

      if (!sessionId) {
        socket.emit('is:error', { 
          code: 'MISSING_SESSION_ID',
          message: 'Session ID is required' 
        });
        return;
      }

      const session = await IntimacySpectrumSession.findBySessionId(sessionId);

      if (!session || session.status !== 'playing') {
        return; // Silently ignore if not in valid state
      }

      // Track who is ready
      if (!readyForNext.has(sessionId)) {
        readyForNext.set(sessionId, new Set());
      }

      const readySet = readyForNext.get(sessionId);
      readySet.add(oduserId.toString());

      // Get both player IDs
      const { p1Id, p2Id } = getPlayerIds(session);

      // Check if both are ready
      if (readySet.has(p1Id) && readySet.has(p2Id)) {
        // Clear ready set
        readyForNext.delete(sessionId);

        // Move to next question
        await moveToNextQuestion(io, socketManager, sessionId);
      }

    } catch (error) {
      logger.error('[IS Socket] Ready for next error:', error);
    }
  });

  // =====================================================
  // VOICE NOTES
  // =====================================================

  /**
   * Notify partner about voice note (actual upload via HTTP)
   * Payload: { sessionId, audioUrl, duration }
   */
  socket.on('is:voice_note', async (payload) => {
    try {
      const { sessionId, audioUrl, duration } = payload;

      if (!sessionId || !audioUrl || !duration) {
        socket.emit('is:error', { 
          code: 'INVALID_VOICE_NOTE',
          message: 'Session ID, audio URL, and duration are required' 
        });
        return;
      }

      const session = await IntimacySpectrumSession.findBySessionId(sessionId);

      if (!session) {
        socket.emit('is:error', { 
          code: 'SESSION_NOT_FOUND',
          message: 'Game session not found' 
        });
        return;
      }

      if (!['completed', 'discussion'].includes(session.status)) {
        socket.emit('is:error', { 
          code: 'VOICE_NOTES_NOT_AVAILABLE',
          message: 'Voice notes are only available after game completion' 
        });
        return;
      }

      // Notify partner
      const partnerId = getPartnerId(session, oduserId);
      const { p1Id } = getPlayerIds(session);
      const isPlayer1 = p1Id === oduserId.toString();

      emitToUser(io, socketManager, partnerId, 'is:voice_note_received', {
        sessionId,
        from: {
          oduserId: oduserId.toString(),
          firstName: isPlayer1 
            ? session.player1.userId.firstName 
            : session.player2.userId.firstName
        },
        audioUrl,
        duration,
        sentAt: new Date().toISOString()
      });

      logger.info('[IS Socket] Voice note notification sent', {
        sessionId,
        from: oduserId,
        to: partnerId,
        duration
      });

    } catch (error) {
      logger.error('[IS Socket] Voice note error:', error);
      socket.emit('is:error', { 
        code: 'VOICE_NOTE_FAILED',
        message: 'Failed to send voice note notification' 
      });
    }
  });

  // =====================================================
  // LEAVE / ABANDON GAME
  // =====================================================

  /**
   * Leave/abandon the current game
   * Payload: { sessionId, reason? }
   */
  socket.on('is:leave', async (payload) => {
    try {
      const { sessionId, reason } = payload;

      if (!sessionId) {
        socket.emit('is:error', { 
          code: 'MISSING_SESSION_ID',
          message: 'Session ID is required' 
        });
        return;
      }

      const session = await IntimacySpectrumSession.findBySessionId(sessionId);

      if (!session) {
        return; // Already gone
      }

      if (!isPlayerInSession(session, oduserId)) {
        return; // Not a player
      }

      const room = getSessionRoom(sessionId);

      // Mark game as abandoned if in progress
      if (['pending', 'starting', 'playing', 'paused'].includes(session.status)) {
        session.status = 'abandoned';
        session.lastActivityAt = new Date();
        await session.save();

        // Notify partner
        const partnerId = getPartnerId(session, oduserId);
        const { p1Id } = getPlayerIds(session);
        const isPlayer1 = p1Id === oduserId.toString();

        io.to(room).emit('is:game_abandoned', {
          sessionId,
          abandonedBy: {
            oduserId: oduserId.toString(),
            firstName: isPlayer1 
              ? session.player1.userId.firstName 
              : session.player2.userId.firstName
          },
          reason: reason || 'Player left the game'
        });

        // Clean up
        clearSessionTimers(sessionId);
        readyForNext.delete(sessionId);

        logger.info('[IS Socket] Game abandoned', {
          sessionId,
          abandonedBy: oduserId,
          reason
        });
      }

      // Leave the room
      socket.leave(room);
      userSessions.delete(oduserId.toString());

    } catch (error) {
      logger.error('[IS Socket] Leave error:', error);
    }
  });

  // =====================================================
  // DISCONNECTION HANDLING
  // =====================================================

  socket.on('disconnect', async () => {
    try {
      const sessionId = userSessions.get(oduserId.toString());

      if (!sessionId) {
        return; // User wasn't in a game
      }

      const session = await IntimacySpectrumSession.findBySessionId(sessionId);

      if (!session) {
        userSessions.delete(oduserId.toString());
        return;
      }

      // Update connection status
      await intimacySpectrumService.updateConnectionStatus(sessionId, oduserId, false);

      const room = getSessionRoom(sessionId);
      const partnerId = getPartnerId(session, oduserId);
      const { p1Id } = getPlayerIds(session);
      const isPlayer1 = p1Id === oduserId.toString();

      // Notify partner
      emitToUser(io, socketManager, partnerId, 'is:partner_disconnected', {
        sessionId,
        oduserId: oduserId.toString(),
        firstName: isPlayer1 
          ? session.player1.userId.firstName 
          : session.player2.userId.firstName
      });

      // Handle based on game status
      if (['starting', 'playing'].includes(session.status)) {
        // Cancel countdown if in starting phase
        if (session.status === 'starting') {
          const countdown = countdownTimers.get(sessionId);
          if (countdown) {
            clearTimeout(countdown);
            countdownTimers.delete(sessionId);
          }
        }

        // Get updated session
        const updatedSession = await IntimacySpectrumSession.findBySessionId(sessionId);
        
        // Check if partner is still connected
        const partnerConnected = isPlayer1 
          ? updatedSession.player2.isConnected 
          : updatedSession.player1.isConnected;

        if (!partnerConnected) {
          // Both disconnected, pause the game immediately
          updatedSession.status = 'paused';
          await updatedSession.save();

          clearSessionTimers(sessionId);

          io.to(room).emit('is:game_paused', {
            sessionId,
            reason: 'Both players disconnected'
          });

          logger.info('[IS Socket] Game paused - both disconnected', { sessionId });
        } else {
          // Give disconnected player time to reconnect
          setTimeout(async () => {
            try {
              const checkSession = await IntimacySpectrumSession.findBySessionId(sessionId);
              
              if (!checkSession) return;

              // Check if player reconnected
              const stillDisconnected = isPlayer1 
                ? !checkSession.player1.isConnected 
                : !checkSession.player2.isConnected;

              if (stillDisconnected && ['starting', 'playing'].includes(checkSession.status)) {
                // Pause the game
                checkSession.status = 'paused';
                await checkSession.save();

                clearSessionTimers(sessionId);

                io.to(room).emit('is:game_paused', {
                  sessionId,
                  reason: 'Player disconnected',
                  disconnectedPlayer: oduserId.toString()
                });

                logger.info('[IS Socket] Game paused - player timeout', { 
                  sessionId, 
                  disconnectedPlayer: oduserId 
                });
              }
            } catch (err) {
              logger.error('[IS Socket] Reconnect check error:', err);
            }
          }, RECONNECT_GRACE_MS);
        }
      }

      logger.info('[IS Socket] User disconnected', {
        oduserId,
        sessionId,
        gameStatus: session.status
      });

    } catch (error) {
      logger.error('[IS Socket] Disconnect handler error:', error);
    }
  });
}

// =====================================================
// GAME START HELPER
// =====================================================

/**
 * Start the game after countdown completes
 */
async function startGameAfterCountdown(io, socketManager, sessionId, room) {
  try {
    // Clear countdown timer
    countdownTimers.delete(sessionId);

    // Verify session is still valid and both players connected
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);
    
    if (!session) {
      logger.warn('[IS Socket] Session not found after countdown', { sessionId });
      return;
    }

    if (session.status !== 'starting') {
      logger.warn('[IS Socket] Session no longer in starting state', { 
        sessionId, 
        status: session.status 
      });
      return;
    }

    if (!areBothPlayersConnected(session)) {
      logger.warn('[IS Socket] Not all players connected after countdown', { sessionId });
      
      // Pause the game instead of starting
      session.status = 'paused';
      await session.save();
      
      io.to(room).emit('is:game_paused', {
        sessionId,
        reason: 'Waiting for both players to connect'
      });
      return;
    }

    // Start the game
    const gameData = await intimacySpectrumService.startGame(sessionId);

    // Send first question to both players
    io.to(room).emit('is:question', {
      sessionId,
      question: gameData.currentQuestion,
      totalQuestions: 30,
      progress: 0,
      timeRemaining: QUESTION_TIME_MS
    });

    // Start question timer
    startQuestionTimer(io, socketManager, sessionId, 0);

    logger.info('[IS Socket] Game started', { sessionId });

  } catch (err) {
    logger.error('[IS Socket] Game start error:', err);
    io.to(room).emit('is:error', { 
      code: 'START_FAILED',
      message: 'Failed to start game' 
    });
  }
}

// =====================================================
// TIMER MANAGEMENT
// =====================================================

/**
 * Start the timer for a question
 */
function startQuestionTimer(io, socketManager, sessionId, questionIndex, customDuration = null) {
  // Clear any existing timer
  const existingTimer = questionTimers.get(sessionId);
  if (existingTimer) {
    clearTimeout(existingTimer.timeout);
  }

  const duration = customDuration || QUESTION_TIME_MS;

  const timeout = setTimeout(async () => {
    await handleQuestionTimeout(io, socketManager, sessionId, questionIndex);
  }, duration);

  questionTimers.set(sessionId, {
    timeout,
    questionIndex,
    startedAt: Date.now()
  });
}

/**
 * Handle question timeout
 */
async function handleQuestionTimeout(io, socketManager, sessionId, questionIndex) {
  try {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);

    if (!session || session.status !== 'playing') {
      return;
    }

    // Only handle if we're still on this question
    if (session.currentQuestionIndex !== questionIndex) {
      return;
    }

    // Record timeouts
    const timeoutResult = await intimacySpectrumService.handleTimeout(sessionId);

    if (!timeoutResult) {
      return;
    }

    const room = getSessionRoom(sessionId);

    // Emit timeout event
    io.to(room).emit('is:timeout', {
      sessionId,
      questionIndex,
      player1TimedOut: timeoutResult.player1TimedOut,
      player2TimedOut: timeoutResult.player2TimedOut
    });

    // Do reveal even with timeouts
    await handleReveal(io, socketManager, sessionId, questionIndex);

    logger.info('[IS Socket] Question timed out', {
      sessionId,
      questionIndex,
      p1TimedOut: timeoutResult.player1TimedOut,
      p2TimedOut: timeoutResult.player2TimedOut
    });

  } catch (error) {
    logger.error('[IS Socket] Timeout handler error:', error);
  }
}

// =====================================================
// REVEAL HANDLING
// =====================================================

/**
 * Handle reveal after both players answer (or timeout)
 */
async function handleReveal(io, socketManager, sessionId, questionIndex) {
  try {
    // Clear the question timer
    clearSessionTimers(sessionId);

    // Get reveal data
    const revealData = await intimacySpectrumService.getRevealData(sessionId, questionIndex);

    const room = getSessionRoom(sessionId);

    // Emit reveal to both players
    io.to(room).emit('is:reveal', {
      sessionId,
      ...revealData
    });

    // If this was the last question, complete the game
    if (revealData.isLastQuestion) {
      // Short delay before showing completion
      setTimeout(async () => {
        await handleGameCompletion(io, socketManager, sessionId);
      }, REVEAL_TIME_MS);
    } else {
      // Set auto-advance timer (in case players don't click ready)
      const autoAdvanceTimer = setTimeout(async () => {
        // Check if we haven't already moved on
        const session = await IntimacySpectrumSession.findBySessionId(sessionId);
        if (session && session.currentQuestionIndex === questionIndex) {
          await moveToNextQuestion(io, socketManager, sessionId);
        }
      }, REVEAL_TIME_MS);

      // Store the auto-advance timer
      questionTimers.set(sessionId, {
        timeout: autoAdvanceTimer,
        questionIndex,
        isRevealTimer: true
      });
    }

    logger.info('[IS Socket] Reveal sent', {
      sessionId,
      questionIndex,
      gap: revealData.gap
    });

  } catch (error) {
    logger.error('[IS Socket] Reveal error:', error);
  }
}

// =====================================================
// NEXT QUESTION
// =====================================================

/**
 * Move to the next question
 */
async function moveToNextQuestion(io, socketManager, sessionId) {
  try {
    // Clear any existing timers
    clearSessionTimers(sessionId);
    readyForNext.delete(sessionId);

    const result = await intimacySpectrumService.nextQuestion(sessionId);

    const room = getSessionRoom(sessionId);

    if (result.isComplete) {
      // Game is complete
      await handleGameCompletion(io, socketManager, sessionId);
    } else {
      // Send next question
      io.to(room).emit('is:question', {
        sessionId,
        question: result.currentQuestion,
        totalQuestions: 30,
        progress: result.progress,
        timeRemaining: QUESTION_TIME_MS
      });

      // Start timer for new question
      startQuestionTimer(io, socketManager, sessionId, result.currentQuestion.index);

      logger.info('[IS Socket] Next question sent', {
        sessionId,
        questionIndex: result.currentQuestion.index
      });
    }

  } catch (error) {
    logger.error('[IS Socket] Next question error:', error);
  }
}

// =====================================================
// GAME COMPLETION
// =====================================================

/**
 * Handle game completion
 */
async function handleGameCompletion(io, socketManager, sessionId) {
  try {
    // Clear all timers
    clearSessionTimers(sessionId);
    readyForNext.delete(sessionId);

    // Get final results (AI insights are generated by the service)
    const results = await intimacySpectrumService.getResults(sessionId);

    const room = getSessionRoom(sessionId);

    // Emit completion event
    io.to(room).emit('is:game_completed', {
      sessionId,
      completedAt: results.completedAt
    });

    // Emit full results
    io.to(room).emit('is:results', {
      sessionId,
      ...results
    });

    logger.info('[IS Socket] Game completed', {
      sessionId,
      compatibilityScore: results.results.compatibilityScore
    });

  } catch (error) {
    logger.error('[IS Socket] Completion error:', error);
  }
}

// =====================================================
// CLEANUP
// =====================================================

/**
 * Cleanup expired sessions periodically
 */
async function cleanupExpiredSessions() {
  try {
    const result = await IntimacySpectrumSession.cleanupExpired();
    if (result.modifiedCount > 0) {
      logger.info(`[IS Socket] Cleaned up ${result.modifiedCount} expired sessions`);
    }
  } catch (error) {
    logger.error('[IS Socket] Cleanup error:', error);
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupExpiredSessions, 5 * 60 * 1000);

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  initializeIntimacySpectrumSocket,
  cleanupExpiredSessions
};