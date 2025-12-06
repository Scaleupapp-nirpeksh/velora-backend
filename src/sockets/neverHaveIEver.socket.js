// src/sockets/neverHaveIEver.socket.js

const neverHaveIEverService = require('../services/games/neverHaveIEver.service');
const NeverHaveIEverSession = require('../models/games/NeverHaveIEverSession');
const NeverHaveIEverQuestion = require('../models/games/NeverHaveIEverQuestion');
const logger = require('../utils/logger');

// =====================================================
// TIMER STORAGE (minimal - just for question timeouts)
// =====================================================
const gameTimers = new Map(); // sessionId -> { timeout, type }

// =====================================================
// CONSTANTS
// =====================================================
const QUESTION_TIME_MS = 15 * 1000;    // 15 seconds per question
const COUNTDOWN_TIME_MS = 3 * 1000;    // 3 second countdown
const REVEAL_TIME_MS = 4 * 1000;       // 4 seconds to see reveal
const RECONNECT_GRACE_MS = 60 * 1000;  // 1 minute to reconnect

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function getRoom(sessionId) {
  return `nhie:${sessionId}`;
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
      totalIHave: player.totalIHave || 0,
      totalIHavent: player.totalIHavent || 0,
      discoveryPoints: player.discoveryPoints || 0,
      totalAnswered: player.answers?.length || 0
    }
  };

  // Add current question if playing
  if (session.status === 'playing' && session.currentQuestionIndex < 30) {
    const questionNumber = session.questionOrder[session.currentQuestionIndex];
    const question = await NeverHaveIEverQuestion.findOne({ questionNumber });
    
    if (question) {
      state.currentQuestion = {
        index: session.currentQuestionIndex,
        number: questionNumber,
        category: question.category,
        statementText: question.statementText,
        spiceLevel: question.spiceLevel
      };

      // Time remaining
      if (session.currentQuestionExpiresAt) {
        state.timeRemaining = Math.max(0, session.currentQuestionExpiresAt - Date.now());
      }

      // Check if already answered
      const myAnswer = player.answers?.find(a => a.questionNumber === questionNumber);
      const partnerAnswer = partner.answers?.find(a => a.questionNumber === questionNumber);
      
      state.myAnswer = myAnswer?.answer ?? null;
      state.partnerAnswered = partnerAnswer?.answer !== null && partnerAnswer?.answer !== undefined;
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
  // Get both player IDs
  const p1Id = session.player1.userId._id?.toString() || session.player1.userId.toString();
  const p2Id = session.player2.userId._id?.toString() || session.player2.userId.toString();

  const p1State = await buildStatePayload(session, p1Id);
  const p2State = await buildStatePayload(session, p2Id);

  // Emit to each player's socket
  io.to(`user:${p1Id}`).emit('nhie:state', p1State);
  io.to(`user:${p2Id}`).emit('nhie:state', p2State);
}

// =====================================================
// GAME FLOW FUNCTIONS
// =====================================================

async function startCountdown(io, sessionId) {
  const room = getRoom(sessionId);
  
  logger.info('[NHIE] Starting countdown', { sessionId });

  // Emit countdown start
  io.to(room).emit('nhie:countdown', { 
    sessionId,
    countdown: COUNTDOWN_TIME_MS / 1000,
    startsAt: new Date(Date.now() + COUNTDOWN_TIME_MS).toISOString()
  });

  // Set timer to start game
  const timeout = setTimeout(async () => {
    await startGame(io, sessionId);
  }, COUNTDOWN_TIME_MS);

  gameTimers.set(sessionId, { timeout, type: 'countdown' });
}

async function startGame(io, sessionId) {
  try {
    logger.info('[NHIE] startGame() called', { sessionId });
    
    clearTimer(sessionId);

    const session = await NeverHaveIEverSession.findBySessionId(sessionId);
    if (!session) {
      logger.warn('[NHIE] startGame - session not found', { sessionId });
      return;
    }

    logger.info('[NHIE] startGame - checking connections', { 
      sessionId,
      status: session.status,
      p1Connected: session.player1.isConnected,
      p2Connected: session.player2.isConnected
    });

    // Verify both still connected
    if (!session.player1.isConnected || !session.player2.isConnected) {
      logger.warn('[NHIE] startGame - not all players connected, pausing', { sessionId });
      session.status = 'paused';
      await session.save();
      await emitStateToRoom(io, session);
      return;
    }

    // Start the game
    logger.info('[NHIE] startGame - calling service.startGame()', { sessionId });
    await neverHaveIEverService.startGame(sessionId);
    
    // Reload session
    const updatedSession = await NeverHaveIEverSession.findBySessionId(sessionId);

    logger.info('[NHIE] Game started, sending first question', { sessionId });

    // Emit state with first question
    await emitStateToRoom(io, updatedSession);

    // Start question timer
    startQuestionTimer(io, sessionId, 0);

  } catch (error) {
    logger.error('[NHIE] Start game error:', error);
  }
}

function startQuestionTimer(io, sessionId, questionIndex) {
  clearTimer(sessionId);

  const timeout = setTimeout(async () => {
    await handleTimeout(io, sessionId, questionIndex);
  }, QUESTION_TIME_MS);

  gameTimers.set(sessionId, { timeout, type: 'question', questionIndex });
  
  logger.info('[NHIE] Question timer started', { sessionId, questionIndex, timeMs: QUESTION_TIME_MS });
}

async function handleTimeout(io, sessionId, questionIndex) {
  try {
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);
    if (!session || session.status !== 'playing') return;
    if (session.currentQuestionIndex !== questionIndex) return;

    logger.info('[NHIE] Question timed out', { sessionId, questionIndex });

    // Record timeout for players who didn't answer
    await neverHaveIEverService.handleTimeout(sessionId);

    // Do reveal
    await doReveal(io, sessionId, questionIndex);

  } catch (error) {
    logger.error('[NHIE] Timeout error:', error);
  }
}

async function doReveal(io, sessionId, questionIndex) {
  try {
    clearTimer(sessionId);

    const revealData = await neverHaveIEverService.getRevealData(sessionId);
    const room = getRoom(sessionId);

    logger.info('[NHIE] Sending reveal', { 
      sessionId, 
      questionIndex, 
      outcome: revealData.outcome 
    });

    io.to(room).emit('nhie:reveal', {
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
    logger.error('[NHIE] Reveal error:', error);
  }
}

async function nextQuestion(io, sessionId) {
  try {
    clearTimer(sessionId);

    const result = await neverHaveIEverService.nextQuestion(sessionId);

    if (result.isComplete) {
      await completeGame(io, sessionId);
    } else {
      const session = await NeverHaveIEverSession.findBySessionId(sessionId);
      
      logger.info('[NHIE] Next question', { sessionId, index: result.currentQuestion.index });
      
      await emitStateToRoom(io, session);
      startQuestionTimer(io, sessionId, result.currentQuestion.index);
    }

  } catch (error) {
    logger.error('[NHIE] Next question error:', error);
  }
}

async function completeGame(io, sessionId) {
  try {
    clearTimer(sessionId);

    const results = await neverHaveIEverService.getResults(sessionId);
    const session = await NeverHaveIEverSession.findBySessionId(sessionId);
    const room = getRoom(sessionId);

    logger.info('[NHIE] Game completed', { 
      sessionId, 
      p1Points: results.results?.player1Points,
      p2Points: results.results?.player2Points
    });

    io.to(room).emit('nhie:completed', {
      sessionId,
      results: results.results,
      aiInsights: results.aiInsights
    });

  } catch (error) {
    logger.error('[NHIE] Complete game error:', error);
  }
}

// =====================================================
// MAIN SOCKET HANDLER
// =====================================================

function initializeNeverHaveIEverSocket(io, socket, socketManager) {
  const oduserId = socket.userId;
  if (!oduserId) return;

  // Join user's personal room for targeted events
  socket.join(`user:${oduserId}`);

  logger.info('[NHIE] Socket initialized', { oduserId });

  // -------------------------------------------------
  // INVITE - Create and send game invitation
  // -------------------------------------------------
  socket.on('nhie:invite', async ({ matchId }) => {
    try {
      if (!matchId) {
        socket.emit('nhie:error', { code: 'MISSING_MATCH', message: 'Match ID required' });
        return;
      }

      // Check if user already has an active game
      const existingSession = await NeverHaveIEverSession.findActiveForUser(oduserId);
      if (existingSession) {
        socket.emit('nhie:error', { 
          code: 'ALREADY_IN_GAME',
          message: 'You already have an active game',
          sessionId: existingSession.sessionId
        });
        return;
      }

      // Create the invitation
      const result = await neverHaveIEverService.createInvitation(oduserId, matchId);
      const { session, invitedUser } = result;

      // Join the session room
      socket.join(getRoom(session.sessionId));

      // Mark player 1 as connected
      await neverHaveIEverService.updateConnectionStatus(session.sessionId, oduserId, true);

      // Confirm to initiator
      socket.emit('nhie:invitation_sent', {
        sessionId: session.sessionId,
        status: 'pending',
        expiresAt: session.expiresAt,
        invitedUser: {
          oduserId: invitedUser.oduserId,
          firstName: invitedUser.firstName,
          lastName: invitedUser.lastName,
          profilePhoto: invitedUser.profilePhoto
        }
      });

      // Notify invited user
      io.to(`user:${invitedUser.oduserId}`).emit('nhie:invited', {
        sessionId: session.sessionId,
        expiresAt: session.expiresAt,
        invitedBy: {
          oduserId: oduserId.toString(),
          firstName: session.player1.userId.firstName,
          lastName: session.player1.userId.lastName,
          profilePhoto: session.player1.userId.profilePhoto
        },
        gameInfo: {
          name: 'Never Have I Ever',
          description: 'Discover hidden experiences and secrets through 30 revealing questions',
          questionCount: 30,
          timePerQuestion: 15
        }
      });

      logger.info('[NHIE] Invitation created and sent', {
        sessionId: session.sessionId,
        from: oduserId,
        to: invitedUser.oduserId
      });

    } catch (error) {
      logger.error('[NHIE] Invite error:', error);
      socket.emit('nhie:error', { code: 'INVITE_FAILED', message: error.message });
    }
  });

  // -------------------------------------------------
  // JOIN - Get current game state
  // -------------------------------------------------
  socket.on('nhie:join', async ({ sessionId }) => {
    try {
      let session;

      if (sessionId) {
        session = await NeverHaveIEverSession.findBySessionId(sessionId);
      } else {
        session = await NeverHaveIEverSession.findActiveForUser(oduserId);
      }

      if (!session) {
        socket.emit('nhie:state', { status: 'none' });
        return;
      }

      const playerInfo = getPlayerId(session, oduserId);
      if (!playerInfo) {
        socket.emit('nhie:error', { code: 'NOT_PLAYER', message: 'Not a player in this game' });
        return;
      }

      // Join session room
      socket.join(getRoom(session.sessionId));

      // Mark connected
      await neverHaveIEverService.updateConnectionStatus(session.sessionId, oduserId, true);

      // Reload and emit state
      session = await NeverHaveIEverSession.findBySessionId(session.sessionId);
      const state = await buildStatePayload(session, oduserId);
      
      socket.emit('nhie:state', state);

      // Notify partner
      socket.to(getRoom(session.sessionId)).emit('nhie:partner_connected', {
        oduserId: oduserId.toString()
      });

      logger.info('[NHIE] Player joined', { 
        oduserId, 
        sessionId: session.sessionId, 
        status: session.status,
        p1Connected: session.player1.isConnected,
        p2Connected: session.player2.isConnected
      });

      // If status is 'starting' and both now connected, start countdown
      if (session.status === 'starting' && session.player1.isConnected && session.player2.isConnected) {
        // Only start if no countdown already running
        if (!gameTimers.has(session.sessionId)) {
          logger.info('[NHIE] Both players connected in starting state, beginning countdown', { 
            sessionId: session.sessionId 
          });
          await startCountdown(io, session.sessionId);
        } else {
          logger.info('[NHIE] Countdown already running', { sessionId: session.sessionId });
        }
      }

      // If was paused and both now connected, resume
      if (session.status === 'paused' && session.player1.isConnected && session.player2.isConnected) {
        session.status = 'playing';
        await session.save();
        
        logger.info('[NHIE] Resuming paused game', { sessionId: session.sessionId });
        
        // Restart question timer with remaining time
        const timeLeft = session.currentQuestionExpiresAt 
          ? Math.max(0, session.currentQuestionExpiresAt - Date.now())
          : QUESTION_TIME_MS;
        
        if (timeLeft > 0) {
          // Use remaining time for this question
          clearTimer(session.sessionId);
          const timeout = setTimeout(async () => {
            await handleTimeout(io, session.sessionId, session.currentQuestionIndex);
          }, timeLeft);
          gameTimers.set(session.sessionId, { timeout, type: 'question', questionIndex: session.currentQuestionIndex });
        }
        
        await emitStateToRoom(io, session);
      }

    } catch (error) {
      logger.error('[NHIE] Join error:', error);
      socket.emit('nhie:error', { code: 'JOIN_FAILED', message: error.message });
    }
  });

  // -------------------------------------------------
  // ACCEPT - Accept invitation
  // -------------------------------------------------
  socket.on('nhie:accept', async ({ sessionId }) => {
    try {
      if (!sessionId) {
        socket.emit('nhie:error', { code: 'MISSING_SESSION', message: 'Session ID required' });
        return;
      }

      // Check if user already has an active game (different from this one)
      const existingSession = await NeverHaveIEverSession.findActiveForUser(oduserId);
      if (existingSession && existingSession.sessionId !== sessionId) {
        socket.emit('nhie:error', { 
          code: 'ALREADY_IN_GAME',
          message: 'You already have an active game',
          sessionId: existingSession.sessionId
        });
        return;
      }

      const session = await neverHaveIEverService.acceptInvitation(sessionId, oduserId);
      
      // Join room
      socket.join(getRoom(sessionId));
      
      // Mark connected
      await neverHaveIEverService.updateConnectionStatus(sessionId, oduserId, true);

      // Reload session
      const updatedSession = await NeverHaveIEverSession.findBySessionId(sessionId);

      logger.info('[NHIE] Invitation accepted', { 
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
      logger.error('[NHIE] Accept error:', error);
      socket.emit('nhie:error', { code: 'ACCEPT_FAILED', message: error.message });
    }
  });

  // -------------------------------------------------
  // DECLINE - Decline invitation
  // -------------------------------------------------
  socket.on('nhie:decline', async ({ sessionId }) => {
    try {
      if (!sessionId) return;

      await neverHaveIEverService.declineInvitation(sessionId, oduserId);
      
      const room = getRoom(sessionId);
      io.to(room).emit('nhie:state', { status: 'declined', sessionId });

      clearTimer(sessionId);

      logger.info('[NHIE] Invitation declined', { sessionId, oduserId });

    } catch (error) {
      logger.error('[NHIE] Decline error:', error);
    }
  });

  // -------------------------------------------------
  // ANSWER - Submit "I Have" (true) or "I Haven't" (false)
  // -------------------------------------------------
  socket.on('nhie:answer', async ({ sessionId, answer }) => {
    try {
      if (!sessionId || answer === undefined || answer === null) {
        socket.emit('nhie:error', { code: 'INVALID_ANSWER', message: 'Session and answer required' });
        return;
      }

      // Ensure boolean
      const boolAnswer = Boolean(answer);

      const result = await neverHaveIEverService.recordAnswer(sessionId, oduserId, boolAnswer);

      logger.info('[NHIE] Answer submitted', { 
        sessionId, 
        oduserId, 
        answer: boolAnswer ? 'I Have' : 'I Haven\'t',
        bothAnswered: result.bothAnswered 
      });

      // Confirm to player
      socket.emit('nhie:answer_recorded', { 
        sessionId, 
        questionIndex: result.questionIndex,
        answer: boolAnswer
      });

      // Notify partner they answered (without revealing what)
      socket.to(getRoom(sessionId)).emit('nhie:waiting', {
        sessionId,
        partnerAnswered: true
      });

      // If both answered, reveal
      if (result.bothAnswered) {
        await doReveal(io, sessionId, result.questionIndex);
      }

    } catch (error) {
      logger.error('[NHIE] Answer error:', error);
      socket.emit('nhie:error', { code: 'ANSWER_FAILED', message: error.message });
    }
  });

  // -------------------------------------------------
  // QUIT - Permanently abandon game
  // -------------------------------------------------
  socket.on('nhie:quit', async ({ sessionId }) => {
    try {
      if (!sessionId) return;

      const session = await NeverHaveIEverSession.findBySessionId(sessionId);
      if (!session) return;

      const playerInfo = getPlayerId(session, oduserId);
      if (!playerInfo) return;

      // Only abandon if game is in progress
      if (['pending', 'starting', 'playing', 'paused'].includes(session.status)) {
        session.status = 'abandoned';
        await session.save();

        clearTimer(sessionId);

        const room = getRoom(sessionId);
        io.to(room).emit('nhie:state', { 
          status: 'abandoned',
          sessionId,
          quitBy: oduserId.toString()
        });

        logger.info('[NHIE] Game abandoned', { sessionId, oduserId });
      }

    } catch (error) {
      logger.error('[NHIE] Quit error:', error);
    }
  });

  // -------------------------------------------------
  // DISCONNECT - Handle socket disconnect
  // -------------------------------------------------
  socket.on('disconnect', async () => {
    try {
      // Find user's active session
      const session = await NeverHaveIEverSession.findActiveForUser(oduserId);
      if (!session) return;

      // Mark disconnected
      await neverHaveIEverService.updateConnectionStatus(session.sessionId, oduserId, false);

      const room = getRoom(session.sessionId);

      // Notify partner
      socket.to(room).emit('nhie:partner_disconnected', {
        oduserId: oduserId.toString()
      });

      logger.info('[NHIE] Player disconnected', { oduserId, sessionId: session.sessionId });

      // Check if we should pause (give grace period)
      setTimeout(async () => {
        try {
          const currentSession = await NeverHaveIEverSession.findBySessionId(session.sessionId);
          if (!currentSession) return;
          
          const playerInfo = getPlayerId(currentSession, oduserId);
          if (!playerInfo) return;

          const player = playerInfo.isPlayer1 ? currentSession.player1 : currentSession.player2;
          
          // If still disconnected and game is active, pause it
          if (!player.isConnected && ['starting', 'playing'].includes(currentSession.status)) {
            currentSession.status = 'paused';
            await currentSession.save();
            
            clearTimer(session.sessionId);
            
            io.to(room).emit('nhie:state', {
              status: 'paused',
              sessionId: session.sessionId,
              reason: 'Player disconnected'
            });

            logger.info('[NHIE] Game paused due to disconnect', { sessionId: session.sessionId });
          }
        } catch (err) {
          logger.error('[NHIE] Disconnect grace period error:', err);
        }
      }, RECONNECT_GRACE_MS);

    } catch (error) {
      logger.error('[NHIE] Disconnect error:', error);
    }
  });
}

module.exports = { initializeNeverHaveIEverSocket };