// src/sockets/intimacySpectrum.socket.js (REDESIGNED)

const intimacySpectrumService = require('../services/games/intimacySpectrum.service');
const IntimacySpectrumSession = require('../models/games/IntimacySpectrumSession');
const IntimacySpectrumQuestion = require('../models/games/IntimacySpectrumQuestion');
const logger = require('../utils/logger');

// =====================================================
// TIMER STORAGE (minimal - just for question timeouts)
// =====================================================
const gameTimers = new Map(); // sessionId -> { timeout, type }

// =====================================================
// CONSTANTS
// =====================================================
const QUESTION_TIME_MS = 20 * 1000;
const COUNTDOWN_TIME_MS = 3 * 1000;
const REVEAL_TIME_MS = 5 * 1000;
const RECONNECT_GRACE_MS = 60 * 1000; // 1 minute to reconnect

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function getRoom(sessionId) {
  return `is:${sessionId}`;
}

function clearTimer(sessionId) {
  const timer = gameTimers.get(sessionId);
  if (timer) {
    clearTimeout(timer.timeout);
    gameTimers.delete(sessionId);
  }
}

function getPlayerId(session, oduserId) {
  const odusId = oduserId.toString();
  const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
  const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();
  
  if (odusId === p1Id) return { isPlayer1: true, oduserId: p1Id, partnerId: p2Id };
  if (odusId === p2Id) return { isPlayer1: false, oduserId: p2Id, partnerId: p1Id };
  return null;
}

/**
 * Build complete state object for frontend
 */
async function buildStatePayload(session, oduserId) {
  const playerInfo = getPlayerId(session, oduserId);
  if (!playerInfo) return null;

  const { isPlayer1, partnerId } = playerInfo;
  const player = isPlayer1 ? session.player1 : session.player2;
  const partner = isPlayer1 ? session.player2 : session.player1;

  const state = {
    sessionId: session.sessionId,
    status: session.status,
    currentQuestionIndex: session.currentQuestionIndex,
    totalQuestions: 30,
    progress: Math.round((session.currentQuestionIndex / 30) * 100),
    partner: {
      oduserId: partnerId,
      firstName: partner.userId.firstName,
      lastName: partner.userId.lastName,
      profilePhoto: partner.userId.profilePhoto,
      isConnected: partner.isConnected
    },
    you: {
      isConnected: player.isConnected,
      totalAnswered: player.answers.filter(a => a.position !== null).length
    }
  };

  // Add current question if playing
  if (session.status === 'playing' && session.currentQuestionIndex < 30) {
    const questionNumber = session.questionOrder[session.currentQuestionIndex];
    const question = await IntimacySpectrumQuestion.findOne({ questionNumber });
    
    if (question) {
      state.currentQuestion = {
        index: session.currentQuestionIndex,
        number: questionNumber,
        category: question.category,
        questionText: question.questionText,
        leftLabel: question.leftLabel,
        rightLabel: question.rightLabel,
        spiceLevel: question.spiceLevel
      };

      // Time remaining
      if (session.currentQuestionExpiresAt) {
        state.timeRemaining = Math.max(0, session.currentQuestionExpiresAt - Date.now());
      }

      // Check if already answered
      const myAnswer = player.answers.find(a => a.questionNumber === questionNumber);
      const partnerAnswer = partner.answers.find(a => a.questionNumber === questionNumber);
      
      state.myAnswer = myAnswer?.position ?? null;
      state.partnerAnswered = partnerAnswer?.position !== null && partnerAnswer?.position !== undefined;
    }
  }

  // Add results if completed
  if (['completed', 'discussion'].includes(session.status)) {
    state.results = session.results;
    state.aiInsights = session.aiInsights;
  }

  return state;
}

/**
 * Emit state to all players in session
 */
async function emitStateToRoom(io, session) {
  const room = getRoom(session.sessionId);
  
  // Get both player states
  const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
  const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();

  const p1State = await buildStatePayload(session, p1Id);
  const p2State = await buildStatePayload(session, p2Id);

  // Emit to each player's socket
  io.to(`user:${p1Id}`).emit('is:state', p1State);
  io.to(`user:${p2Id}`).emit('is:state', p2State);
}

// =====================================================
// GAME FLOW FUNCTIONS
// =====================================================

async function startCountdown(io, sessionId) {
  const room = getRoom(sessionId);
  
  logger.info('[IS] Starting countdown', { sessionId });

  // Emit countdown start
  io.to(room).emit('is:state', { 
    status: 'starting',
    countdown: COUNTDOWN_TIME_MS / 1000 
  });

  // Set timer to start game
  const timeout = setTimeout(async () => {
    await startGame(io, sessionId);
  }, COUNTDOWN_TIME_MS);

  gameTimers.set(sessionId, { timeout, type: 'countdown' });
}

async function startGame(io, sessionId) {
  try {
    clearTimer(sessionId);

    const session = await IntimacySpectrumSession.findBySessionId(sessionId);
    if (!session) return;

    // Verify both still connected
    if (!session.player1.isConnected || !session.player2.isConnected) {
      session.status = 'paused';
      await session.save();
      await emitStateToRoom(io, session);
      return;
    }

    // Start the game
    const gameData = await intimacySpectrumService.startGame(sessionId);
    
    // Reload session
    const updatedSession = await IntimacySpectrumSession.findBySessionId(sessionId);

    logger.info('[IS] Game started, sending first question', { sessionId });

    // Emit state with first question
    await emitStateToRoom(io, updatedSession);

    // Start question timer
    startQuestionTimer(io, sessionId, 0);

  } catch (error) {
    logger.error('[IS] Start game error:', error);
  }
}

function startQuestionTimer(io, sessionId, questionIndex) {
  clearTimer(sessionId);

  const timeout = setTimeout(async () => {
    await handleTimeout(io, sessionId, questionIndex);
  }, QUESTION_TIME_MS);

  gameTimers.set(sessionId, { timeout, type: 'question', questionIndex });
  
  logger.info('[IS] Question timer started', { sessionId, questionIndex });
}

async function handleTimeout(io, sessionId, questionIndex) {
  try {
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);
    if (!session || session.status !== 'playing') return;
    if (session.currentQuestionIndex !== questionIndex) return;

    logger.info('[IS] Question timed out', { sessionId, questionIndex });

    // Record timeout
    await intimacySpectrumService.handleTimeout(sessionId);

    // Do reveal
    await doReveal(io, sessionId, questionIndex);

  } catch (error) {
    logger.error('[IS] Timeout error:', error);
  }
}

async function doReveal(io, sessionId, questionIndex) {
  try {
    clearTimer(sessionId);

    const revealData = await intimacySpectrumService.getRevealData(sessionId, questionIndex);
    const room = getRoom(sessionId);

    logger.info('[IS] Sending reveal', { sessionId, questionIndex, gap: revealData.gap });

    io.to(room).emit('is:reveal', {
      sessionId,
      questionIndex,
      ...revealData
    });

    // Auto-advance after reveal
    const timeout = setTimeout(async () => {
      await nextQuestion(io, sessionId);
    }, REVEAL_TIME_MS);

    gameTimers.set(sessionId, { timeout, type: 'reveal' });

  } catch (error) {
    logger.error('[IS] Reveal error:', error);
  }
}

async function nextQuestion(io, sessionId) {
  try {
    clearTimer(sessionId);

    const result = await intimacySpectrumService.nextQuestion(sessionId);

    if (result.isComplete) {
      await completeGame(io, sessionId);
    } else {
      const session = await IntimacySpectrumSession.findBySessionId(sessionId);
      
      logger.info('[IS] Next question', { sessionId, index: result.currentQuestion.index });
      
      await emitStateToRoom(io, session);
      startQuestionTimer(io, sessionId, result.currentQuestion.index);
    }

  } catch (error) {
    logger.error('[IS] Next question error:', error);
  }
}

async function completeGame(io, sessionId) {
  try {
    clearTimer(sessionId);

    const results = await intimacySpectrumService.getResults(sessionId);
    const session = await IntimacySpectrumSession.findBySessionId(sessionId);
    const room = getRoom(sessionId);

    logger.info('[IS] Game completed', { sessionId, score: results.results?.compatibilityScore });

    io.to(room).emit('is:completed', {
      sessionId,
      results: results.results,
      aiInsights: results.aiInsights
    });

  } catch (error) {
    logger.error('[IS] Complete game error:', error);
  }
}

// =====================================================
// MAIN SOCKET HANDLER
// =====================================================

function initializeIntimacySpectrumSocket(io, socket, socketManager) {
  const oduserId = socket.userId;
  if (!oduserId) return;

  // Join user's personal room for targeted events
  socket.join(`user:${oduserId}`);

  logger.info('[IS] Socket initialized', { oduserId });

  // -------------------------------------------------
  // JOIN - Get current game state
  // -------------------------------------------------
  socket.on('is:join', async ({ sessionId }) => {
    try {
      let session;

      if (sessionId) {
        session = await IntimacySpectrumSession.findBySessionId(sessionId);
      } else {
        session = await IntimacySpectrumSession.findActiveForUser(oduserId);
      }

      if (!session) {
        socket.emit('is:state', { status: 'none' });
        return;
      }

      const playerInfo = getPlayerId(session, oduserId);
      if (!playerInfo) {
        socket.emit('is:error', { code: 'NOT_PLAYER', message: 'Not a player in this game' });
        return;
      }

      // Join session room
      socket.join(getRoom(session.sessionId));

      // Mark connected
      await intimacySpectrumService.updateConnectionStatus(session.sessionId, oduserId, true);

      // Reload and emit state
      session = await IntimacySpectrumSession.findBySessionId(session.sessionId);
      const state = await buildStatePayload(session, oduserId);
      
      socket.emit('is:state', state);

      // Notify partner
      socket.to(getRoom(session.sessionId)).emit('is:partner_connected', {
        oduserId: oduserId.toString()
      });

      // If was paused and both now connected, resume
      if (session.status === 'paused' && session.player1.isConnected && session.player2.isConnected) {
        session.status = 'playing';
        await session.save();
        
        // Restart question timer
        const timeLeft = session.currentQuestionExpiresAt 
          ? Math.max(0, session.currentQuestionExpiresAt - Date.now())
          : QUESTION_TIME_MS;
        
        if (timeLeft > 0) {
          startQuestionTimer(io, session.sessionId, session.currentQuestionIndex);
        }
        
        await emitStateToRoom(io, session);
      }

      logger.info('[IS] Player joined', { oduserId, sessionId: session.sessionId, status: session.status });

    } catch (error) {
      logger.error('[IS] Join error:', error);
      socket.emit('is:error', { code: 'JOIN_FAILED', message: error.message });
    }
  });

  // -------------------------------------------------
  // ACCEPT - Accept invitation
  // -------------------------------------------------
  socket.on('is:accept', async ({ sessionId }) => {
    try {
      if (!sessionId) {
        socket.emit('is:error', { code: 'MISSING_SESSION', message: 'Session ID required' });
        return;
      }

      const session = await intimacySpectrumService.acceptInvitation(sessionId, oduserId);
      
      // Join room
      socket.join(getRoom(sessionId));
      
      // Mark connected
      await intimacySpectrumService.updateConnectionStatus(sessionId, oduserId, true);

      // Reload session
      const updatedSession = await IntimacySpectrumSession.findBySessionId(sessionId);

      logger.info('[IS] Invitation accepted', { 
        sessionId, 
        oduserId,
        p1Connected: updatedSession.player1.isConnected,
        p2Connected: updatedSession.player2.isConnected
      });

      // Emit updated state to both
      await emitStateToRoom(io, updatedSession);

      // Start countdown if both connected
      if (updatedSession.player1.isConnected && updatedSession.player2.isConnected) {
        await startCountdown(io, sessionId);
      }

    } catch (error) {
      logger.error('[IS] Accept error:', error);
      socket.emit('is:error', { code: 'ACCEPT_FAILED', message: error.message });
    }
  });

  // -------------------------------------------------
  // DECLINE - Decline invitation
  // -------------------------------------------------
  socket.on('is:decline', async ({ sessionId }) => {
    try {
      if (!sessionId) return;

      await intimacySpectrumService.declineInvitation(sessionId, oduserId);
      
      const room = getRoom(sessionId);
      io.to(room).emit('is:state', { status: 'declined', sessionId });

      clearTimer(sessionId);

      logger.info('[IS] Invitation declined', { sessionId, oduserId });

    } catch (error) {
      logger.error('[IS] Decline error:', error);
    }
  });

  // -------------------------------------------------
  // ANSWER - Submit slider answer
  // -------------------------------------------------
  socket.on('is:answer', async ({ sessionId, position }) => {
    try {
      if (!sessionId || position === undefined) {
        socket.emit('is:error', { code: 'INVALID_ANSWER', message: 'Session and position required' });
        return;
      }

      const pos = parseInt(position);
      if (isNaN(pos) || pos < 0 || pos > 100) {
        socket.emit('is:error', { code: 'INVALID_POSITION', message: 'Position must be 0-100' });
        return;
      }

      const result = await intimacySpectrumService.submitAnswer(sessionId, oduserId, pos);

      logger.info('[IS] Answer submitted', { sessionId, oduserId, position: pos, bothAnswered: result.bothAnswered });

      // Confirm to player
      socket.emit('is:answer_recorded', { 
        sessionId, 
        questionIndex: result.questionIndex,
        position: pos 
      });

      // Notify partner they answered
      socket.to(getRoom(sessionId)).emit('is:waiting', {
        sessionId,
        partnerAnswered: true
      });

      // If both answered, reveal
      if (result.bothAnswered) {
        await doReveal(io, sessionId, result.questionIndex);
      }

    } catch (error) {
      logger.error('[IS] Answer error:', error);
      socket.emit('is:error', { code: 'ANSWER_FAILED', message: error.message });
    }
  });

  // -------------------------------------------------
  // QUIT - Permanently abandon game
  // -------------------------------------------------
  socket.on('is:quit', async ({ sessionId }) => {
    try {
      if (!sessionId) return;

      const session = await IntimacySpectrumSession.findBySessionId(sessionId);
      if (!session) return;

      const playerInfo = getPlayerId(session, oduserId);
      if (!playerInfo) return;

      // Only abandon if game is in progress
      if (['pending', 'starting', 'playing', 'paused'].includes(session.status)) {
        session.status = 'abandoned';
        await session.save();

        clearTimer(sessionId);

        const room = getRoom(sessionId);
        io.to(room).emit('is:state', { 
          status: 'abandoned',
          sessionId,
          quitBy: oduserId.toString()
        });

        logger.info('[IS] Game abandoned', { sessionId, oduserId });
      }

    } catch (error) {
      logger.error('[IS] Quit error:', error);
    }
  });

  // -------------------------------------------------
  // DISCONNECT - Handle socket disconnect
  // -------------------------------------------------
  socket.on('disconnect', async () => {
    try {
      // Find user's active session
      const session = await IntimacySpectrumSession.findActiveForUser(oduserId);
      if (!session) return;

      // Mark disconnected
      await intimacySpectrumService.updateConnectionStatus(session.sessionId, oduserId, false);

      const room = getRoom(session.sessionId);

      // Notify partner
      socket.to(room).emit('is:partner_disconnected', {
        oduserId: oduserId.toString()
      });

      logger.info('[IS] Player disconnected', { oduserId, sessionId: session.sessionId });

      // Check if we should pause (give grace period)
      setTimeout(async () => {
        const currentSession = await IntimacySpectrumSession.findBySessionId(session.sessionId);
        if (!currentSession) return;
        
        const playerInfo = getPlayerId(currentSession, oduserId);
        if (!playerInfo) return;

        const player = playerInfo.isPlayer1 ? currentSession.player1 : currentSession.player2;
        
        // If still disconnected and game is active, pause it
        if (!player.isConnected && ['starting', 'playing'].includes(currentSession.status)) {
          currentSession.status = 'paused';
          await currentSession.save();
          
          clearTimer(session.sessionId);
          
          io.to(room).emit('is:state', {
            status: 'paused',
            sessionId: session.sessionId,
            reason: 'Player disconnected'
          });

          logger.info('[IS] Game paused due to disconnect', { sessionId: session.sessionId });
        }
      }, RECONNECT_GRACE_MS);

    } catch (error) {
      logger.error('[IS] Disconnect error:', error);
    }
  });
}

module.exports = { initializeIntimacySpectrumSocket };