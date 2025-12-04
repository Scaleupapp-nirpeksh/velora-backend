const mongoose = require('mongoose');

/**
 * TwoTruthsLieGame Model
 * 
 * Main game session for the async Two Truths & A Lie couple game.
 * Tracks game state, player phases, scores, and AI-generated insights.
 * 
 * Game Flow:
 * 1. Initiator starts game → Partner receives notification
 * 2. Both players write 10 rounds of statements (2 truths + 1 lie each)
 * 3. Both players answer partner's questions
 * 4. Results shown with AI insights + voice note discussion
 */

const twoTruthsLieGameSchema = new mongoose.Schema(
  {
    // ==================== PLAYERS ====================
    
    // User who started the game
    initiatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // The partner user
    partnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Reference to mutual match (validation)
    matchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Match',
      required: true,
    },

    // ==================== GAME STATUS ====================
    
    status: {
      type: String,
      enum: [
        'pending_acceptance',   // Waiting for partner to accept
        'writing_phase',        // Both users writing statements
        'answering_phase',      // Both users answering
        'completed',            // Game finished
        'declined',             // Partner declined invitation
        'expired',              // Invitation expired (24h)
        'cancelled',            // Game cancelled by a player
      ],
      default: 'pending_acceptance',
      index: true,
    },

    // ==================== INDIVIDUAL PHASE TRACKING ====================
    
    // Track each player's progress independently
    initiatorPhase: {
      type: String,
      enum: [
        'not_started',          // Haven't begun writing
        'writing',              // Currently writing (optional - for UI)
        'submitted_statements', // Finished writing, waiting for partner
        'answering',            // Answering partner's questions
        'completed',            // Finished answering
      ],
      default: 'not_started',
    },

    partnerPhase: {
      type: String,
      enum: [
        'not_started',
        'writing',
        'submitted_statements',
        'answering',
        'completed',
      ],
      default: 'not_started',
    },

    // ==================== TIMESTAMPS ====================
    
    // Invitation
    invitedAt: {
      type: Date,
      default: Date.now,
    },

    invitationExpiresAt: {
      type: Date,
      default: function() {
        // 24 hours from creation
        return new Date(Date.now() + 24 * 60 * 60 * 1000);
      },
      index: true,
    },

    // Acceptance
    acceptedAt: {
      type: Date,
      default: null,
    },

    declinedAt: {
      type: Date,
      default: null,
    },

    // Statement submission timestamps
    initiatorStatementsSubmittedAt: {
      type: Date,
      default: null,
    },

    partnerStatementsSubmittedAt: {
      type: Date,
      default: null,
    },

    // Answer submission timestamps
    initiatorAnswersSubmittedAt: {
      type: Date,
      default: null,
    },

    partnerAnswersSubmittedAt: {
      type: Date,
      default: null,
    },

    // Completion
    completedAt: {
      type: Date,
      default: null,
    },

    // ==================== SCORES ====================
    
    // How many lies the initiator correctly identified (out of 10)
    initiatorScore: {
      type: Number,
      min: 0,
      max: 10,
      default: null,
    },

    // How many lies the partner correctly identified (out of 10)
    partnerScore: {
      type: Number,
      min: 0,
      max: 10,
      default: null,
    },

    // ==================== AI INSIGHTS ====================
    
    insights: {
      // Overall compatibility based on game responses
      compatibilityScore: {
        type: Number,
        min: 0,
        max: 100,
        default: null,
      },

      // AI-generated summary of the game
      summary: {
        type: String,
        maxlength: 1000,
        default: null,
      },

      // Key observations from the game
      observations: [{
        type: String,
        maxlength: 200,
      }],

      // Fun facts discovered about the couple
      funFacts: [{
        type: String,
        maxlength: 200,
      }],

      // Suggestions for conversation topics
      conversationStarters: [{
        type: String,
        maxlength: 200,
      }],

      // When insights were generated
      generatedAt: {
        type: Date,
        default: null,
      },
    },

    // ==================== RESTART FEATURE ====================
    
    // Track restart requests
    restartRequestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    restartRequestedAt: {
      type: Date,
      default: null,
    },

    // How many times this game has been restarted
    restartCount: {
      type: Number,
      default: 0,
    },

    // Reference to previous game if this is a restart
    previousGameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TwoTruthsLieGame',
      default: null,
    },

    // ==================== CANCELLATION ====================
    
    cancelledBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    cancelledAt: {
      type: Date,
      default: null,
    },

    cancellationReason: {
      type: String,
      maxlength: 200,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ==================== INDEXES ====================

// Find games for a specific user (as either player)
twoTruthsLieGameSchema.index({ initiatorId: 1, status: 1 });
twoTruthsLieGameSchema.index({ partnerId: 1, status: 1 });

// Find active games between two specific users
twoTruthsLieGameSchema.index({ initiatorId: 1, partnerId: 1, status: 1 });

// Find expired invitations for cleanup job
twoTruthsLieGameSchema.index({ status: 1, invitationExpiresAt: 1 });

// Find completed games for history
twoTruthsLieGameSchema.index({ status: 1, completedAt: -1 });

// ==================== VIRTUALS ====================

/**
 * Check if invitation has expired
 */
twoTruthsLieGameSchema.virtual('isExpired').get(function() {
  if (this.status !== 'pending_acceptance') return false;
  return new Date() > this.invitationExpiresAt;
});

/**
 * Check if both players have submitted statements
 */
twoTruthsLieGameSchema.virtual('bothStatementsSubmitted').get(function() {
  return this.initiatorStatementsSubmittedAt && this.partnerStatementsSubmittedAt;
});

/**
 * Check if both players have submitted answers
 */
twoTruthsLieGameSchema.virtual('bothAnswersSubmitted').get(function() {
  return this.initiatorAnswersSubmittedAt && this.partnerAnswersSubmittedAt;
});

/**
 * Get the winner (or tie)
 */
twoTruthsLieGameSchema.virtual('winner').get(function() {
  if (this.initiatorScore === null || this.partnerScore === null) return null;
  if (this.initiatorScore > this.partnerScore) return 'initiator';
  if (this.partnerScore > this.initiatorScore) return 'partner';
  return 'tie';
});

/**
 * Check if a restart has been requested
 */
twoTruthsLieGameSchema.virtual('hasRestartRequest').get(function() {
  return this.restartRequestedBy !== null;
});

// Ensure virtuals are included in JSON
twoTruthsLieGameSchema.set('toJSON', { virtuals: true });
twoTruthsLieGameSchema.set('toObject', { virtuals: true });

// ==================== INSTANCE METHODS ====================

/**
 * Accept game invitation
 */
twoTruthsLieGameSchema.methods.accept = async function() {
  if (this.status !== 'pending_acceptance') {
    throw new Error('Game is not pending acceptance');
  }
  
  if (this.isExpired) {
    this.status = 'expired';
    await this.save();
    throw new Error('Game invitation has expired');
  }

  this.status = 'writing_phase';
  this.acceptedAt = new Date();
  this.initiatorPhase = 'not_started';
  this.partnerPhase = 'not_started';
  
  return this.save();
};

/**
 * Decline game invitation
 */
twoTruthsLieGameSchema.methods.decline = async function() {
  if (this.status !== 'pending_acceptance') {
    throw new Error('Game is not pending acceptance');
  }

  this.status = 'declined';
  this.declinedAt = new Date();
  
  return this.save();
};

/**
 * Submit statements for a user
 * @param {ObjectId} userId - The user submitting statements
 */
twoTruthsLieGameSchema.methods.submitStatements = async function(userId) {
  if (this.status !== 'writing_phase') {
    throw new Error('Game is not in writing phase');
  }

  const isInitiator = this.initiatorId.toString() === userId.toString();
  const isPartner = this.partnerId.toString() === userId.toString();

  if (!isInitiator && !isPartner) {
    throw new Error('User is not a participant in this game');
  }

  if (isInitiator) {
    if (this.initiatorStatementsSubmittedAt) {
      throw new Error('Statements already submitted');
    }
    this.initiatorPhase = 'submitted_statements';
    this.initiatorStatementsSubmittedAt = new Date();
  } else {
    if (this.partnerStatementsSubmittedAt) {
      throw new Error('Statements already submitted');
    }
    this.partnerPhase = 'submitted_statements';
    this.partnerStatementsSubmittedAt = new Date();
  }

  // Check if both have submitted - transition to answering phase
  if (this.initiatorStatementsSubmittedAt && this.partnerStatementsSubmittedAt) {
    this.status = 'answering_phase';
    this.initiatorPhase = 'answering';
    this.partnerPhase = 'answering';
  }

  return this.save();
};

/**
 * Submit answers for a user
 * @param {ObjectId} userId - The user submitting answers
 * @param {Number} score - Number of correct guesses (0-10)
 */
twoTruthsLieGameSchema.methods.submitAnswers = async function(userId, score) {
  if (this.status !== 'answering_phase') {
    throw new Error('Game is not in answering phase');
  }

  const isInitiator = this.initiatorId.toString() === userId.toString();
  const isPartner = this.partnerId.toString() === userId.toString();

  if (!isInitiator && !isPartner) {
    throw new Error('User is not a participant in this game');
  }

  if (isInitiator) {
    if (this.initiatorAnswersSubmittedAt) {
      throw new Error('Answers already submitted');
    }
    this.initiatorPhase = 'completed';
    this.initiatorAnswersSubmittedAt = new Date();
    this.initiatorScore = score;
  } else {
    if (this.partnerAnswersSubmittedAt) {
      throw new Error('Answers already submitted');
    }
    this.partnerPhase = 'completed';
    this.partnerAnswersSubmittedAt = new Date();
    this.partnerScore = score;
  }

  // Check if both have submitted - transition to completed
  if (this.initiatorAnswersSubmittedAt && this.partnerAnswersSubmittedAt) {
    this.status = 'completed';
    this.completedAt = new Date();
  }

  return this.save();
};

/**
 * Request to restart the game
 * @param {ObjectId} userId - The user requesting restart
 */
twoTruthsLieGameSchema.methods.requestRestart = async function(userId) {
  if (this.status !== 'completed') {
    throw new Error('Can only restart a completed game');
  }

  if (this.restartRequestedBy) {
    throw new Error('Restart already requested');
  }

  const isParticipant = 
    this.initiatorId.toString() === userId.toString() ||
    this.partnerId.toString() === userId.toString();

  if (!isParticipant) {
    throw new Error('User is not a participant in this game');
  }

  this.restartRequestedBy = userId;
  this.restartRequestedAt = new Date();

  return this.save();
};

/**
 * Cancel the game
 * @param {ObjectId} userId - The user cancelling
 * @param {String} reason - Optional reason
 */
twoTruthsLieGameSchema.methods.cancel = async function(userId, reason = null) {
  const validStatuses = ['pending_acceptance', 'writing_phase', 'answering_phase'];
  
  if (!validStatuses.includes(this.status)) {
    throw new Error('Cannot cancel a game in this status');
  }

  const isParticipant = 
    this.initiatorId.toString() === userId.toString() ||
    this.partnerId.toString() === userId.toString();

  if (!isParticipant) {
    throw new Error('User is not a participant in this game');
  }

  this.status = 'cancelled';
  this.cancelledBy = userId;
  this.cancelledAt = new Date();
  this.cancellationReason = reason;

  return this.save();
};

/**
 * Get the other player's ID
 * @param {ObjectId} userId - Current user's ID
 */
twoTruthsLieGameSchema.methods.getOtherPlayerId = function(userId) {
  // Handle both populated (object with _id) and non-populated (ObjectId) cases
  const initiatorId = this.initiatorId._id || this.initiatorId;
  const partnerId = this.partnerId._id || this.partnerId;
  
  if (initiatorId.toString() === userId.toString()) {
    return partnerId;
  }
  if (partnerId.toString() === userId.toString()) {
    return initiatorId;
  }
  return null;
};

/**
 * Check if user is a participant
 * @param {ObjectId} userId - User ID to check
 */
twoTruthsLieGameSchema.methods.isParticipant = function(userId) {
  // Handle both populated (object with _id) and non-populated (ObjectId) cases
  const initiatorId = this.initiatorId._id || this.initiatorId;
  const partnerId = this.partnerId._id || this.partnerId;
  
  return (
    initiatorId.toString() === userId.toString() ||
    partnerId.toString() === userId.toString()
  );
};

/**
 * Get user's role in the game
 * @param {ObjectId} userId - User ID
 */
twoTruthsLieGameSchema.methods.getUserRole = function(userId) {
  // Handle both populated (object with _id) and non-populated (ObjectId) cases
  const initiatorId = this.initiatorId._id || this.initiatorId;
  const partnerId = this.partnerId._id || this.partnerId;
  
  if (initiatorId.toString() === userId.toString()) return 'initiator';
  if (partnerId.toString() === userId.toString()) return 'partner';
  return null;
};

/**
 * Get user's current phase
 * @param {ObjectId} userId - User ID
 */
twoTruthsLieGameSchema.methods.getUserPhase = function(userId) {
  const role = this.getUserRole(userId);
  if (role === 'initiator') return this.initiatorPhase;
  if (role === 'partner') return this.partnerPhase;
  return null;
};

// ==================== STATIC METHODS ====================

/**
 * Find active game between two users
 */
twoTruthsLieGameSchema.statics.findActiveGameBetweenUsers = async function(userId1, userId2) {
  const activeStatuses = ['pending_acceptance', 'writing_phase', 'answering_phase'];
  
  return this.findOne({
    $or: [
      { initiatorId: userId1, partnerId: userId2 },
      { initiatorId: userId2, partnerId: userId1 },
    ],
    status: { $in: activeStatuses },
  });
};

/**
 * Find all active games for a user
 */
twoTruthsLieGameSchema.statics.findActiveGamesForUser = async function(userId) {
  const activeStatuses = ['pending_acceptance', 'writing_phase', 'answering_phase'];
  
  return this.find({
    $or: [
      { initiatorId: userId },
      { partnerId: userId },
    ],
    status: { $in: activeStatuses },
  })
    .populate('initiatorId', 'firstName lastName username profilePhoto')
    .populate('partnerId', 'firstName lastName username profilePhoto')
    .sort({ updatedAt: -1 });
};

/**
 * Find pending invitations for a user (games they need to accept/decline)
 */
twoTruthsLieGameSchema.statics.findPendingInvitationsForUser = async function(userId) {
  return this.find({
    partnerId: userId,
    status: 'pending_acceptance',
    invitationExpiresAt: { $gt: new Date() },
  })
    .populate('initiatorId', 'firstName lastName username profilePhoto')
    .sort({ invitedAt: -1 });
};

/**
 * Find completed games for a user (history)
 */
twoTruthsLieGameSchema.statics.findCompletedGamesForUser = async function(userId, options = {}) {
  const { limit = 20, skip = 0 } = options;

  return this.find({
    $or: [
      { initiatorId: userId },
      { partnerId: userId },
    ],
    status: 'completed',
  })
    .populate('initiatorId', 'firstName lastName username profilePhoto')
    .populate('partnerId', 'firstName lastName username profilePhoto')
    .sort({ completedAt: -1 })
    .skip(skip)
    .limit(limit);
};

/**
 * Expire old pending invitations (for cleanup job)
 */
twoTruthsLieGameSchema.statics.expireOldInvitations = async function() {
  const result = await this.updateMany(
    {
      status: 'pending_acceptance',
      invitationExpiresAt: { $lt: new Date() },
    },
    {
      status: 'expired',
    }
  );

  return result.modifiedCount;
};

/**
 * Get game statistics for a user
 */
twoTruthsLieGameSchema.statics.getStatsForUser = async function(userId) {
  const stats = await this.aggregate([
    {
      $match: {
        $or: [
          { initiatorId: new mongoose.Types.ObjectId(userId) },
          { partnerId: new mongoose.Types.ObjectId(userId) },
        ],
        status: 'completed',
      },
    },
    {
      $group: {
        _id: null,
        totalGames: { $sum: 1 },
        avgInitiatorScore: { $avg: '$initiatorScore' },
        avgPartnerScore: { $avg: '$partnerScore' },
      },
    },
  ]);

  if (stats.length === 0) {
    return {
      totalGames: 0,
      averageScore: 0,
      gamesWon: 0,
      gamesLost: 0,
      gamesTied: 0,
    };
  }

  // Get win/loss/tie counts
  const games = await this.find({
    $or: [
      { initiatorId: userId },
      { partnerId: userId },
    ],
    status: 'completed',
  });

  let gamesWon = 0;
  let gamesLost = 0;
  let gamesTied = 0;
  let totalScore = 0;

  games.forEach(game => {
    const isInitiator = game.initiatorId.toString() === userId.toString();
    const myScore = isInitiator ? game.initiatorScore : game.partnerScore;
    const theirScore = isInitiator ? game.partnerScore : game.initiatorScore;

    totalScore += myScore;

    if (myScore > theirScore) gamesWon++;
    else if (myScore < theirScore) gamesLost++;
    else gamesTied++;
  });

  return {
    totalGames: games.length,
    averageScore: games.length > 0 ? (totalScore / games.length).toFixed(1) : 0,
    gamesWon,
    gamesLost,
    gamesTied,
  };
};

module.exports = mongoose.model('TwoTruthsLieGame', twoTruthsLieGameSchema);