const mongoose = require('mongoose');

/**
 * TwoTruthsLieVoiceNote Model
 * 
 * Stores voice notes exchanged between players after the game completes.
 * Allows players to discuss the results, insights, and have fun conversations
 * about the truths and lies they shared.
 * 
 * Voice notes are:
 * - Max 60 seconds each
 * - Stored in S3
 * - Optionally transcribed via OpenAI Whisper
 */

const twoTruthsLieVoiceNoteSchema = new mongoose.Schema(
  {
    // ==================== REFERENCES ====================
    
    // The game this voice note belongs to
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TwoTruthsLieGame',
      required: true,
      index: true,
    },

    // Who sent this voice note
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Who receives this voice note (the other player)
    receiverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ==================== AUDIO FILE ====================
    
    // S3 URL for the audio file
    audioUrl: {
      type: String,
      required: true,
    },

    // S3 key for deletion/management
    s3Key: {
      type: String,
      required: true,
    },

    // Duration in seconds (max 60)
    duration: {
      type: Number,
      required: true,
      min: 1,
      max: 60,
    },

    // File size in bytes
    fileSize: {
      type: Number,
      default: null,
    },

    // MIME type
    mimeType: {
      type: String,
      default: 'audio/m4a',
    },

    // ==================== TRANSCRIPTION ====================
    
    // Transcribed text (via OpenAI Whisper)
    transcription: {
      type: String,
      maxlength: 2000,
      default: null,
    },

    transcriptionStatus: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'skipped'],
      default: 'pending',
    },

    transcriptionError: {
      type: String,
      default: null,
    },

    transcribedAt: {
      type: Date,
      default: null,
    },

    // ==================== READ STATUS ====================
    
    // Whether the receiver has listened to this voice note
    isListened: {
      type: Boolean,
      default: false,
    },

    listenedAt: {
      type: Date,
      default: null,
    },

    // ==================== METADATA ====================
    
    // Optional: Which round/statement this voice note is about
    // Allows players to comment on specific rounds
    relatedRoundNumber: {
      type: Number,
      min: 1,
      max: 10,
      default: null,
    },

    // Flag for moderation
    isReported: {
      type: Boolean,
      default: false,
    },

    reportedAt: {
      type: Date,
      default: null,
    },

    reportReason: {
      type: String,
      maxlength: 200,
      default: null,
    },

    // Soft delete
    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },

    deletedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// ==================== INDEXES ====================

// Get all voice notes for a game (sorted by time)
twoTruthsLieVoiceNoteSchema.index({ gameId: 1, createdAt: 1 });

// Get voice notes sent by a user in a game
twoTruthsLieVoiceNoteSchema.index({ gameId: 1, senderId: 1, createdAt: 1 });

// Get unlistened voice notes for a user
twoTruthsLieVoiceNoteSchema.index({ receiverId: 1, isListened: 1, createdAt: -1 });

// Get voice notes related to a specific round
twoTruthsLieVoiceNoteSchema.index({ gameId: 1, relatedRoundNumber: 1 });

// ==================== VIRTUALS ====================

/**
 * Check if transcription is available
 */
twoTruthsLieVoiceNoteSchema.virtual('hasTranscription').get(function() {
  return this.transcriptionStatus === 'completed' && this.transcription;
});

/**
 * Get formatted duration (MM:SS)
 */
twoTruthsLieVoiceNoteSchema.virtual('formattedDuration').get(function() {
  const minutes = Math.floor(this.duration / 60);
  const seconds = this.duration % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
});

// Ensure virtuals are included in JSON
twoTruthsLieVoiceNoteSchema.set('toJSON', { virtuals: true });
twoTruthsLieVoiceNoteSchema.set('toObject', { virtuals: true });

// ==================== INSTANCE METHODS ====================

/**
 * Mark voice note as listened
 */
twoTruthsLieVoiceNoteSchema.methods.markAsListened = async function() {
  if (!this.isListened) {
    this.isListened = true;
    this.listenedAt = new Date();
    return this.save();
  }
  return this;
};

/**
 * Update transcription
 * @param {String} status - Transcription status
 * @param {String} text - Transcribed text (if completed)
 * @param {String} error - Error message (if failed)
 */
twoTruthsLieVoiceNoteSchema.methods.updateTranscription = async function(status, text = null, error = null) {
  this.transcriptionStatus = status;
  
  if (status === 'completed' && text) {
    this.transcription = text;
    this.transcribedAt = new Date();
  }
  
  if (status === 'failed' && error) {
    this.transcriptionError = error;
  }
  
  return this.save();
};

/**
 * Report this voice note
 * @param {String} reason - Report reason
 */
twoTruthsLieVoiceNoteSchema.methods.report = async function(reason) {
  this.isReported = true;
  this.reportedAt = new Date();
  this.reportReason = reason;
  return this.save();
};

/**
 * Soft delete this voice note
 * @param {ObjectId} userId - Who is deleting
 */
twoTruthsLieVoiceNoteSchema.methods.softDelete = async function(userId) {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.deletedBy = userId;
  return this.save();
};

/**
 * Get client-safe view of voice note
 * @param {ObjectId} viewerId - Who is viewing
 */
twoTruthsLieVoiceNoteSchema.methods.toClientView = function(viewerId) {
  const isOwner = this.senderId.toString() === viewerId.toString();
  
  return {
    id: this._id,
    gameId: this.gameId,
    senderId: this.senderId,
    receiverId: this.receiverId,
    audioUrl: this.audioUrl,
    duration: this.duration,
    formattedDuration: this.formattedDuration,
    transcription: this.hasTranscription ? this.transcription : null,
    transcriptionStatus: this.transcriptionStatus,
    isListened: this.isListened,
    listenedAt: this.listenedAt,
    relatedRoundNumber: this.relatedRoundNumber,
    isOwner,
    createdAt: this.createdAt,
  };
};

// ==================== STATIC METHODS ====================

/**
 * Create a new voice note
 * @param {Object} data - Voice note data
 */
twoTruthsLieVoiceNoteSchema.statics.createVoiceNote = async function(data) {
  const {
    gameId,
    senderId,
    receiverId,
    audioUrl,
    s3Key,
    duration,
    fileSize,
    mimeType,
    relatedRoundNumber,
  } = data;

  // Validate duration
  if (duration > 60) {
    throw new Error('Voice note cannot exceed 60 seconds');
  }

  const voiceNote = await this.create({
    gameId,
    senderId,
    receiverId,
    audioUrl,
    s3Key,
    duration,
    fileSize,
    mimeType,
    relatedRoundNumber,
    transcriptionStatus: 'pending',
  });

  return voiceNote;
};

/**
 * Get all voice notes for a game
 * @param {ObjectId} gameId - The game ID
 * @param {Object} options - Query options
 */
twoTruthsLieVoiceNoteSchema.statics.getVoiceNotesForGame = async function(gameId, options = {}) {
  const { limit = 50, skip = 0, includeDeleted = false } = options;

  const query = { gameId };
  
  if (!includeDeleted) {
    query.isDeleted = false;
  }

  return this.find(query)
    .populate('senderId', 'firstName lastName username profilePhoto')
    .populate('receiverId', 'firstName lastName username profilePhoto')
    .sort({ createdAt: 1 })
    .skip(skip)
    .limit(limit);
};

/**
 * Get voice notes for a specific round
 * @param {ObjectId} gameId - The game ID
 * @param {Number} roundNumber - The round number (1-10)
 */
twoTruthsLieVoiceNoteSchema.statics.getVoiceNotesForRound = async function(gameId, roundNumber) {
  return this.find({
    gameId,
    relatedRoundNumber: roundNumber,
    isDeleted: false,
  })
    .populate('senderId', 'firstName lastName username profilePhoto')
    .sort({ createdAt: 1 });
};

/**
 * Get unlistened voice notes for a user across all games
 * @param {ObjectId} userId - The receiver's ID
 */
twoTruthsLieVoiceNoteSchema.statics.getUnlistenedForUser = async function(userId) {
  return this.find({
    receiverId: userId,
    isListened: false,
    isDeleted: false,
  })
    .populate('senderId', 'firstName lastName username profilePhoto')
    .populate('gameId', 'status')
    .sort({ createdAt: -1 });
};

/**
 * Get unlistened count for a user in a specific game
 * @param {ObjectId} gameId - The game ID
 * @param {ObjectId} userId - The receiver's ID
 */
twoTruthsLieVoiceNoteSchema.statics.getUnlistenedCountForGame = async function(gameId, userId) {
  return this.countDocuments({
    gameId,
    receiverId: userId,
    isListened: false,
    isDeleted: false,
  });
};

/**
 * Mark all voice notes as listened for a user in a game
 * @param {ObjectId} gameId - The game ID
 * @param {ObjectId} userId - The receiver's ID
 */
twoTruthsLieVoiceNoteSchema.statics.markAllAsListenedForGame = async function(gameId, userId) {
  const result = await this.updateMany(
    {
      gameId,
      receiverId: userId,
      isListened: false,
    },
    {
      isListened: true,
      listenedAt: new Date(),
    }
  );

  return result.modifiedCount;
};

/**
 * Get voice notes pending transcription
 * @param {Number} limit - Max notes to return
 */
twoTruthsLieVoiceNoteSchema.statics.getPendingTranscription = async function(limit = 10) {
  return this.find({
    transcriptionStatus: 'pending',
    isDeleted: false,
  })
    .sort({ createdAt: 1 })
    .limit(limit);
};

/**
 * Delete all voice notes for a game (for cleanup)
 * @param {ObjectId} gameId - The game ID
 */
twoTruthsLieVoiceNoteSchema.statics.deleteAllForGame = async function(gameId) {
  // Get all voice notes to delete S3 files
  const voiceNotes = await this.find({ gameId });
  
  const result = await this.deleteMany({ gameId });
  
  return {
    deletedCount: result.deletedCount,
    s3Keys: voiceNotes.map(vn => vn.s3Key),
  };
};

/**
 * Get voice note count for a game
 * @param {ObjectId} gameId - The game ID
 */
twoTruthsLieVoiceNoteSchema.statics.getCountForGame = async function(gameId) {
  return this.countDocuments({
    gameId,
    isDeleted: false,
  });
};

/**
 * Get voice note statistics for a game
 * @param {ObjectId} gameId - The game ID
 */
twoTruthsLieVoiceNoteSchema.statics.getStatsForGame = async function(gameId) {
  const stats = await this.aggregate([
    {
      $match: {
        gameId: new mongoose.Types.ObjectId(gameId),
        isDeleted: false,
      },
    },
    {
      $group: {
        _id: '$senderId',
        count: { $sum: 1 },
        totalDuration: { $sum: '$duration' },
      },
    },
  ]);

  const totalNotes = stats.reduce((sum, s) => sum + s.count, 0);
  const totalDuration = stats.reduce((sum, s) => sum + s.totalDuration, 0);

  return {
    totalVoiceNotes: totalNotes,
    totalDurationSeconds: totalDuration,
    byUser: stats,
  };
};

module.exports = mongoose.model('TwoTruthsLieVoiceNote', twoTruthsLieVoiceNoteSchema);