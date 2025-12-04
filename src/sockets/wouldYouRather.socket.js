// src/sockets/wouldYouRather.socket.js

const wouldYouRatherService = require('../services/games/wouldYouRather.service');
const WouldYouRatherSession = require('../models/games/WouldYouRatherSession');
const WouldYouRatherQuestion = require('../models/games/WouldYouRatherQuestion');

/**
 * WOULD YOU RATHER SOCKET HANDLERS
 * 
 * Real-time event handling for the Would You Rather game.
 * 
 * Events from Client → Server:
 * - wyr:invite         - Send game invitation
 * - wyr:accept         - Accept invitation
 * - wyr:decline        - Decline invitation
 * - wyr:answer         - Submit answer for current question
 * - wyr:ready          - Player ready after reveal
 * - wyr:voice_note     - Send post-game voice note
 * 
 * Events from Server → Client:
 * - wyr:invited        - You've been invited
 * - wyr:invitation_sent - Your invitation was sent
 * - wyr:accepted       - Your invitation was accepted
 * - wyr:declined       - Your invitation was declined
 * - wyr:game_starting  - Game starting (3s countdown)
 * - wyr:question       - New question to answer
 * - wyr:partner_answered - Partner has answered (no reveal yet)
 * - wyr:reveal         - Both answered, show results
 * - wyr:timeout        - Question timed out
 * - wyr:game_completed - All 50 questions done
 * - wyr:voice_note_received - Partner sent voice note
 * - wyr:error          - Error occurred
 * - wyr:partner_connected - Partner connection status
 */

// Store active timers by sessionId
const questionTimers = new Map();

// Store active sessions by sessionId for quick lookup
const activeSessions = new Map();

/**
 * Initialize Would You Rather socket handlers
 * @param {Server} io - Socket.io server instance
 * @param {Socket} socket - Individual socket connection
 * @param {Object} socketManager - Socket manager with helper methods
 */
function initializeWouldYouRatherSocket(io, socket, socketManager) {
  const userId = socket.userId;

  if (!userId) {
    console.error('[WYR Socket] No userId on socket');
    return;
  }

  console.log(`[WYR Socket] Initializing for user ${userId}`);

  // =====================================================
  // INVITATION EVENTS
  // =====================================================

  /**
   * Send a game invitation
   * Payload: { matchId }
   */
  socket.on('wyr:invite', async (data) => {
    try {
      const { matchId } = data;

      if (!matchId) {
        return socket.emit('wyr:error', { 
          message: 'Match ID is required' 
        });
      }

      console.log(`[WYR] User ${userId} inviting match ${matchId}`);

      // Create invitation via service
      const result = await wouldYouRatherService.createInvitation(userId, matchId);

      // Store session reference
      activeSessions.set(result.session.sessionId, {
        player1: userId.toString(),
        player2: result.invitedUser.oduserId.toString()
      });

      // Notify the initiator
      socket.emit('wyr:invitation_sent', {
        sessionId: result.session.sessionId,
        expiresAt: result.session.expiresAt,
        invitedUser: result.invitedUser
      });

      // Notify the invited user
      socketManager.emitToUser(result.invitedUser.oduserId.toString(), 'wyr:invited', {
        sessionId: result.session.sessionId,
        expiresAt: result.session.expiresAt,
        invitedBy: result.initiator
      });

      console.log(`[WYR] Invitation sent: ${result.session.sessionId}`);

    } catch (error) {
      console.error('[WYR] Invite error:', error.message);
      socket.emit('wyr:error', { message: error.message });
    }
  });

  /**
   * Accept a game invitation
   * Payload: { sessionId }
   */
  socket.on('wyr:accept', async (data) => {
    try {
      const { sessionId } = data;

      if (!sessionId) {
        return socket.emit('wyr:error', { 
          message: 'Session ID is required' 
        });
      }

      console.log(`[WYR] User ${userId} accepting session ${sessionId}`);

      // Accept via service
      const result = await wouldYouRatherService.acceptInvitation(sessionId, userId);

      // Get session info
      const sessionInfo = activeSessions.get(sessionId) || {
        player1: result.player1.oduserId.toString(),
        player2: result.player2.oduserId.toString()
      };
      activeSessions.set(sessionId, sessionInfo);

      // Notify both players that game is starting
      const gameStartingPayload = {
        sessionId,
        startsIn: 3000, // 3 second countdown
        player1: result.player1,
        player2: result.player2
      };

      // Notify accepting player
      socket.emit('wyr:game_starting', gameStartingPayload);

      // Notify initiating player
      socketManager.emitToUser(sessionInfo.player1, 'wyr:accepted', {
        sessionId,
        acceptedBy: result.player2
      });
      socketManager.emitToUser(sessionInfo.player1, 'wyr:game_starting', gameStartingPayload);

      // Start game after 3 second countdown
      setTimeout(async () => {
        await startGameAndSendQuestion(io, socketManager, sessionId, sessionInfo);
      }, 3000);

      console.log(`[WYR] Game accepted, starting in 3s: ${sessionId}`);

    } catch (error) {
      console.error('[WYR] Accept error:', error.message);
      socket.emit('wyr:error', { message: error.message });
    }
  });

  /**
   * Decline a game invitation
   * Payload: { sessionId }
   */
  socket.on('wyr:decline', async (data) => {
    try {
      const { sessionId } = data;

      if (!sessionId) {
        return socket.emit('wyr:error', { 
          message: 'Session ID is required' 
        });
      }

      console.log(`[WYR] User ${userId} declining session ${sessionId}`);

      // Decline via service
      await wouldYouRatherService.declineInvitation(sessionId, userId);

      // Get session info
      const sessionInfo = activeSessions.get(sessionId);

      // Notify declining player
      socket.emit('wyr:declined', { sessionId });

      // Notify initiating player
      if (sessionInfo) {
        socketManager.emitToUser(sessionInfo.player1, 'wyr:declined', {
          sessionId,
          declinedBy: userId
        });
        activeSessions.delete(sessionId);
      }

      console.log(`[WYR] Game declined: ${sessionId}`);

    } catch (error) {
      console.error('[WYR] Decline error:', error.message);
      socket.emit('wyr:error', { message: error.message });
    }
  });

  // =====================================================
  // GAMEPLAY EVENTS
  // =====================================================

  /**
   * Submit answer for current question
   * Payload: { sessionId, questionIndex, answer: 'A' | 'B' }
   */
  socket.on('wyr:answer', async (data) => {
    try {
      const { sessionId, questionIndex, answer } = data;

      if (!sessionId || questionIndex === undefined || !answer) {
        return socket.emit('wyr:error', { 
          message: 'Session ID, question index, and answer are required' 
        });
      }

      if (!['A', 'B'].includes(answer)) {
        return socket.emit('wyr:error', { 
          message: 'Answer must be A or B' 
        });
      }

      console.log(`[WYR] User ${userId} answered ${answer} for Q${questionIndex} in ${sessionId}`);

      // Record answer via service
      const result = await wouldYouRatherService.recordAnswer(
        sessionId, 
        userId, 
        questionIndex, 
        answer
      );

      // Get session info
      const sessionInfo = activeSessions.get(sessionId);
      if (!sessionInfo) {
        return socket.emit('wyr:error', { message: 'Session not found' });
      }

      // Determine partner
      const partnerId = userId.toString() === sessionInfo.player1 
        ? sessionInfo.player2 
        : sessionInfo.player1;

      if (result.bothAnswered) {
        // Both have answered - clear timer and reveal
        clearQuestionTimer(sessionId);

        // Get question details for reveal
        const session = await WouldYouRatherSession.findOne({ sessionId });
        const questionNumber = session.questionOrder[questionIndex];
        const question = await WouldYouRatherQuestion.findOne({ questionNumber });

        const revealPayload = {
          sessionId,
          questionIndex,
          questionNumber,
          category: question.category,
          optionA: question.optionA,
          optionB: question.optionB,
          matched: result.matched,
          revealDuration: 3000 // 3 seconds to view reveal
        };

        // Send personalized reveal to each player
        const isPlayer1 = userId.toString() === sessionInfo.player1;
        
        // To answering player
        socket.emit('wyr:reveal', {
          ...revealPayload,
          yourAnswer: answer,
          partnerAnswer: result.partnerAnswer
        });

        // To partner
        socketManager.emitToUser(partnerId, 'wyr:reveal', {
          ...revealPayload,
          yourAnswer: result.partnerAnswer,
          partnerAnswer: answer
        });

        console.log(`[WYR] Reveal sent for Q${questionIndex}, matched: ${result.matched}`);

        // Move to next question after reveal duration
        setTimeout(async () => {
          await moveToNextQuestion(io, socketManager, sessionId, sessionInfo);
        }, 3000);

      } else {
        // Waiting for partner - notify them
        socket.emit('wyr:answer_recorded', {
          sessionId,
          questionIndex,
          waitingForPartner: true
        });

        // Notify partner that this player has answered
        socketManager.emitToUser(partnerId, 'wyr:partner_answered', {
          sessionId,
          questionIndex
        });

        console.log(`[WYR] Waiting for partner to answer Q${questionIndex}`);
      }

    } catch (error) {
      console.error('[WYR] Answer error:', error.message);
      socket.emit('wyr:error', { message: error.message });
    }
  });

  // =====================================================
  // VOICE NOTE EVENTS
  // =====================================================

  /**
   * Send a voice note after game completion
   * Payload: { sessionId, audioUrl, duration }
   */
  socket.on('wyr:voice_note', async (data) => {
    try {
      const { sessionId, audioUrl, duration } = data;

      if (!sessionId || !audioUrl || !duration) {
        return socket.emit('wyr:error', { 
          message: 'Session ID, audio URL, and duration are required' 
        });
      }

      console.log(`[WYR] User ${userId} sending voice note to ${sessionId}`);

      // Add voice note via service
      await wouldYouRatherService.addVoiceNote(sessionId, userId, audioUrl, duration);

      // Get session info
      const session = await WouldYouRatherSession.findOne({ sessionId });
      const partnerId = session.player1.userId.toString() === userId.toString()
        ? session.player2.userId.toString()
        : session.player1.userId.toString();

      // Confirm to sender
      socket.emit('wyr:voice_note_sent', {
        sessionId,
        audioUrl,
        duration
      });

      // Notify partner
      socketManager.emitToUser(partnerId, 'wyr:voice_note_received', {
        sessionId,
        fromUserId: userId,
        audioUrl,
        duration
      });

      console.log(`[WYR] Voice note sent in ${sessionId}`);

    } catch (error) {
      console.error('[WYR] Voice note error:', error.message);
      socket.emit('wyr:error', { message: error.message });
    }
  });

  // =====================================================
  // CONNECTION EVENTS
  // =====================================================

  /**
   * Handle player reconnection to active game
   * Payload: { sessionId }
   */
  socket.on('wyr:reconnect', async (data) => {
    try {
      const { sessionId } = data;

      if (!sessionId) {
        return socket.emit('wyr:error', { 
          message: 'Session ID is required' 
        });
      }

      console.log(`[WYR] User ${userId} reconnecting to ${sessionId}`);

      // Update connection status
      await wouldYouRatherService.updateConnectionStatus(sessionId, userId, true);

      // Get current game state
      const session = await WouldYouRatherSession.findOne({ sessionId });

      if (!session) {
        return socket.emit('wyr:error', { message: 'Session not found' });
      }

      // If game is in progress, send current question
      if (session.status === 'playing') {
        const currentQuestion = await wouldYouRatherService.getCurrentQuestion(sessionId);
        socket.emit('wyr:question', currentQuestion);
      } else if (['completed', 'discussion'].includes(session.status)) {
        // Send results
        const results = await wouldYouRatherService.getResults(sessionId, userId);
        socket.emit('wyr:game_completed', results);
      }

      // Notify partner of reconnection
      const sessionInfo = activeSessions.get(sessionId);
      if (sessionInfo) {
        const partnerId = userId.toString() === sessionInfo.player1 
          ? sessionInfo.player2 
          : sessionInfo.player1;
        
        socketManager.emitToUser(partnerId, 'wyr:partner_connected', {
          sessionId,
          isConnected: true
        });
      }

    } catch (error) {
      console.error('[WYR] Reconnect error:', error.message);
      socket.emit('wyr:error', { message: error.message });
    }
  });

  /**
   * Handle socket disconnect
   */
  socket.on('disconnect', async () => {
    console.log(`[WYR Socket] User ${userId} disconnected`);

    // Find any active sessions for this user
    for (const [sessionId, sessionInfo] of activeSessions.entries()) {
      if (sessionInfo.player1 === userId.toString() || 
          sessionInfo.player2 === userId.toString()) {
        
        // Update connection status
        await wouldYouRatherService.updateConnectionStatus(sessionId, userId, false);

        // Notify partner
        const partnerId = userId.toString() === sessionInfo.player1 
          ? sessionInfo.player2 
          : sessionInfo.player1;

        socketManager.emitToUser(partnerId, 'wyr:partner_connected', {
          sessionId,
          isConnected: false
        });
      }
    }
  });
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Start the game and send first question
 */
async function startGameAndSendQuestion(io, socketManager, sessionId, sessionInfo) {
  try {
    console.log(`[WYR] Starting game ${sessionId}`);

    // Start game via service
    const gameData = await wouldYouRatherService.startGame(sessionId);

    // Send question to both players
    const questionPayload = {
      sessionId,
      status: 'playing',
      currentQuestion: gameData.currentQuestion,
      totalQuestions: gameData.totalQuestions,
      progress: gameData.progress
    };

    socketManager.emitToUser(sessionInfo.player1, 'wyr:question', questionPayload);
    socketManager.emitToUser(sessionInfo.player2, 'wyr:question', questionPayload);

    // Start 15-second timer
    startQuestionTimer(io, socketManager, sessionId, sessionInfo, 0);

    console.log(`[WYR] First question sent for ${sessionId}`);

  } catch (error) {
    console.error('[WYR] Start game error:', error.message);
    socketManager.emitToUser(sessionInfo.player1, 'wyr:error', { message: error.message });
    socketManager.emitToUser(sessionInfo.player2, 'wyr:error', { message: error.message });
  }
}

/**
 * Start the 15-second timer for a question
 */
function startQuestionTimer(io, socketManager, sessionId, sessionInfo, questionIndex) {
  // Clear any existing timer
  clearQuestionTimer(sessionId);

  console.log(`[WYR] Starting 15s timer for Q${questionIndex} in ${sessionId}`);

  const timer = setTimeout(async () => {
    await handleQuestionTimeout(io, socketManager, sessionId, sessionInfo, questionIndex);
  }, 15000); // 15 seconds

  questionTimers.set(sessionId, {
    timer,
    questionIndex
  });
}

/**
 * Clear the question timer
 */
function clearQuestionTimer(sessionId) {
  const timerInfo = questionTimers.get(sessionId);
  if (timerInfo) {
    clearTimeout(timerInfo.timer);
    questionTimers.delete(sessionId);
    console.log(`[WYR] Timer cleared for ${sessionId}`);
  }
}

/**
 * Handle question timeout (15 seconds elapsed)
 */
async function handleQuestionTimeout(io, socketManager, sessionId, sessionInfo, questionIndex) {
  try {
    console.log(`[WYR] Timeout for Q${questionIndex} in ${sessionId}`);

    // Handle timeout via service
    const result = await wouldYouRatherService.handleTimeout(sessionId, questionIndex);

    if (!result) {
      console.log(`[WYR] Question already processed, skipping timeout`);
      return;
    }

    // Get question details
    const session = await WouldYouRatherSession.findOne({ sessionId });
    const questionNumber = session.questionOrder[questionIndex];
    const question = await WouldYouRatherQuestion.findOne({ questionNumber });

    // Send timeout/reveal to both players
    const timeoutPayload = {
      sessionId,
      questionIndex,
      questionNumber,
      category: question.category,
      optionA: question.optionA,
      optionB: question.optionB,
      timedOut: true,
      bothTimedOut: result.bothTimedOut,
      matched: result.matched,
      revealDuration: 3000
    };

    // Send personalized timeout to each player
    socketManager.emitToUser(sessionInfo.player1, 'wyr:timeout', {
      ...timeoutPayload,
      yourAnswer: result.player1Answer,
      partnerAnswer: result.player2Answer,
      youTimedOut: result.player1Answer === null
    });

    socketManager.emitToUser(sessionInfo.player2, 'wyr:timeout', {
      ...timeoutPayload,
      yourAnswer: result.player2Answer,
      partnerAnswer: result.player1Answer,
      youTimedOut: result.player2Answer === null
    });

    console.log(`[WYR] Timeout reveal sent for Q${questionIndex}`);

    // Move to next question after reveal duration
    setTimeout(async () => {
      await moveToNextQuestion(io, socketManager, sessionId, sessionInfo);
    }, 3000);

  } catch (error) {
    console.error('[WYR] Timeout handling error:', error.message);
  }
}

/**
 * Move to the next question or complete game
 */
async function moveToNextQuestion(io, socketManager, sessionId, sessionInfo) {
  try {
    console.log(`[WYR] Moving to next question in ${sessionId}`);

    // Get next question via service
    const result = await wouldYouRatherService.nextQuestion(sessionId);

    if (result.isComplete) {
      // Game is complete
      console.log(`[WYR] Game completed: ${sessionId}`);

      // Get full results for each player
      const results1 = await wouldYouRatherService.getResults(sessionId, sessionInfo.player1);
      const results2 = await wouldYouRatherService.getResults(sessionId, sessionInfo.player2);

      socketManager.emitToUser(sessionInfo.player1, 'wyr:game_completed', results1);
      socketManager.emitToUser(sessionInfo.player2, 'wyr:game_completed', results2);

      // Clean up
      clearQuestionTimer(sessionId);
      activeSessions.delete(sessionId);

      // AI insights will be generated asynchronously by the service
      // and can be fetched later via REST API

    } else {
      // Send next question
      const questionPayload = {
        sessionId,
        status: 'playing',
        currentQuestion: result.currentQuestion,
        totalQuestions: result.totalQuestions,
        progress: result.progress
      };

      socketManager.emitToUser(sessionInfo.player1, 'wyr:question', questionPayload);
      socketManager.emitToUser(sessionInfo.player2, 'wyr:question', questionPayload);

      // Start timer for next question
      startQuestionTimer(
        io, 
        socketManager, 
        sessionId, 
        sessionInfo, 
        result.currentQuestion.index
      );

      console.log(`[WYR] Question ${result.currentQuestion.index + 1}/50 sent`);
    }

  } catch (error) {
    console.error('[WYR] Next question error:', error.message);
  }
}

/**
 * Register the socket handlers with the main socket manager
 * @param {Server} io - Socket.io server instance
 * @param {Object} socketManager - Socket manager instance
 */
function registerWouldYouRatherHandlers(io, socketManager) {
  // Store references for use in handlers
  const wyrNamespace = io;

  // Add handler registration to socket manager
  socketManager.registerGameHandler('wouldYouRather', (socket) => {
    initializeWouldYouRatherSocket(wyrNamespace, socket, socketManager);
  });

  console.log('[WYR Socket] Handlers registered');
}

module.exports = {
  initializeWouldYouRatherSocket,
  registerWouldYouRatherHandlers
};