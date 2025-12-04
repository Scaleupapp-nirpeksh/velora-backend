const mongoose = require('mongoose');

/**
 * TwoTruthsLieStatement Model
 * 
 * Stores individual rounds of the Two Truths & A Lie game.
 * Each round contains 3 statements (2 truths + 1 lie) written by one player,
 * and tracks the other player's guess.
 * 
 * Each game has 20 statement documents total:
 * - 10 rounds written by the initiator (for partner to guess)
 * - 10 rounds written by the partner (for initiator to guess)
 */

const statementSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: [200, 'Statement cannot exceed 200 characters'],
    },
    isLie: {
      type: Boolean,
      required: true,
    },
    displayOrder: {
      type: Number,
      required: true,
      min: 0,
      max: 2,
      // 0, 1, or 2 - the shuffled order shown to the guesser
    },
  },
  { _id: false }
);

const twoTruthsLieStatementSchema = new mongoose.Schema(
  {
    // ==================== REFERENCES ====================
    
    // The game this belongs to
    gameId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'TwoTruthsLieGame',
      required: true,
      index: true,
    },

    // Who wrote these statements
    authorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // Who needs to guess (the other player)
    guesserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    // ==================== ROUND INFO ====================
    
    // Round number (1-10)
    roundNumber: {
      type: Number,
      required: true,
      min: 1,
      max: 10,
    },

    // ==================== THE STATEMENTS ====================
    
    // Array of exactly 3 statements (2 truths + 1 lie)
    statements: {
      type: [statementSchema],
      required: true,
      validate: {
        validator: function(arr) {
          // Must have exactly 3 statements
          if (arr.length !== 3) return false;
          
          // Must have exactly 1 lie
          const lieCount = arr.filter(s => s.isLie).length;
          if (lieCount !== 1) return false;
          
          // Display orders must be 0, 1, 2
          const orders = arr.map(s => s.displayOrder).sort();
          if (orders[0] !== 0 || orders[1] !== 1 || orders[2] !== 2) return false;
          
          return true;
        },
        message: 'Must have exactly 3 statements with 1 lie and display orders 0, 1, 2',
      },
    },

    // ==================== GUESS TRACKING ====================
    
    guess: {
      // Which statement index (0, 1, or 2) they guessed as the lie
      selectedIndex: {
        type: Number,
        min: 0,
        max: 2,
        default: null,
      },

      // Whether the guess was correct
      isCorrect: {
        type: Boolean,
        default: null,
      },

      // When the guess was made
      answeredAt: {
        type: Date,
        default: null,
      },

      // Time taken to answer (in seconds) - optional for analytics
      timeTaken: {
        type: Number,
        default: null,
      },
    },

    // ==================== METADATA ====================
    
    // When statements were created
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: false, // We manually handle createdAt
  }
);

// ==================== INDEXES ====================

// Find all statements for a game
twoTruthsLieStatementSchema.index({ gameId: 1, roundNumber: 1 });

// Find statements by author for a game
twoTruthsLieStatementSchema.index({ gameId: 1, authorId: 1, roundNumber: 1 });

// Find statements to be guessed by a user
twoTruthsLieStatementSchema.index({ gameId: 1, guesserId: 1, roundNumber: 1 });

// Unique constraint: one set of statements per author per round per game
twoTruthsLieStatementSchema.index(
  { gameId: 1, authorId: 1, roundNumber: 1 },
  { unique: true }
);

// ==================== VIRTUALS ====================

/**
 * Check if this round has been answered
 */
twoTruthsLieStatementSchema.virtual('isAnswered').get(function() {
  return this.guess.selectedIndex !== null;
});

/**
 * Get the lie statement
 */
twoTruthsLieStatementSchema.virtual('lieStatement').get(function() {
  return this.statements.find(s => s.isLie);
});

/**
 * Get the truth statements
 */
twoTruthsLieStatementSchema.virtual('truthStatements').get(function() {
  return this.statements.filter(s => !s.isLie);
});

/**
 * Get the lie's display index (what position it appears in)
 */
twoTruthsLieStatementSchema.virtual('lieDisplayIndex').get(function() {
  const lie = this.statements.find(s => s.isLie);
  return lie ? lie.displayOrder : null;
});

/**
 * Get statements sorted by display order (for showing to guesser)
 */
twoTruthsLieStatementSchema.virtual('statementsInDisplayOrder').get(function() {
  return [...this.statements].sort((a, b) => a.displayOrder - b.displayOrder);
});

// Ensure virtuals are included in JSON
twoTruthsLieStatementSchema.set('toJSON', { virtuals: true });
twoTruthsLieStatementSchema.set('toObject', { virtuals: true });

// ==================== INSTANCE METHODS ====================

/**
 * Submit a guess for this round
 * @param {Number} selectedIndex - The index (0, 1, or 2) guessed as the lie
 * @param {Number} timeTaken - Optional time taken in seconds
 */
twoTruthsLieStatementSchema.methods.submitGuess = async function(selectedIndex, timeTaken = null) {
  if (this.guess.selectedIndex !== null) {
    throw new Error('This round has already been answered');
  }

  if (selectedIndex < 0 || selectedIndex > 2) {
    throw new Error('Selected index must be 0, 1, or 2');
  }

  // Find the lie's display order
  const lieDisplayOrder = this.lieDisplayIndex;
  
  // Check if guess is correct
  const isCorrect = selectedIndex === lieDisplayOrder;

  this.guess = {
    selectedIndex,
    isCorrect,
    answeredAt: new Date(),
    timeTaken,
  };

  return this.save();
};

/**
 * Get sanitized version for the guesser (hides which is the lie)
 */
twoTruthsLieStatementSchema.methods.toGuesserView = function() {
  return {
    roundNumber: this.roundNumber,
    statements: this.statementsInDisplayOrder.map((s, index) => ({
      index,
      text: s.text,
      // Don't expose isLie!
    })),
    isAnswered: this.isAnswered,
    // Only show guess info if already answered
    ...(this.isAnswered && {
      guess: {
        selectedIndex: this.guess.selectedIndex,
        isCorrect: this.guess.isCorrect,
      },
    }),
  };
};

/**
 * Get full view for results (shows everything)
 */
twoTruthsLieStatementSchema.methods.toResultsView = function() {
  return {
    roundNumber: this.roundNumber,
    statements: this.statementsInDisplayOrder.map((s, index) => ({
      index,
      text: s.text,
      isLie: s.isLie,
    })),
    lieIndex: this.lieDisplayIndex,
    guess: this.guess.selectedIndex !== null ? {
      selectedIndex: this.guess.selectedIndex,
      isCorrect: this.guess.isCorrect,
      answeredAt: this.guess.answeredAt,
    } : null,
  };
};

// ==================== STATIC METHODS ====================

/**
 * Create all 10 rounds of statements for a user
 * @param {ObjectId} gameId - The game ID
 * @param {ObjectId} authorId - Who is writing
 * @param {ObjectId} guesserId - Who will guess
 * @param {Array} rounds - Array of 10 rounds, each with { statements: [{text, isLie}, ...] }
 */
twoTruthsLieStatementSchema.statics.createStatementsForGame = async function(
  gameId,
  authorId,
  guesserId,
  rounds
) {
  if (rounds.length !== 10) {
    throw new Error('Must provide exactly 10 rounds');
  }

  const documents = rounds.map((round, index) => {
    // Validate round structure
    if (!round.statements || round.statements.length !== 3) {
      throw new Error(`Round ${index + 1} must have exactly 3 statements`);
    }

    const lieCount = round.statements.filter(s => s.isLie).length;
    if (lieCount !== 1) {
      throw new Error(`Round ${index + 1} must have exactly 1 lie`);
    }

    // Shuffle the display order
    const shuffledOrders = [0, 1, 2].sort(() => Math.random() - 0.5);

    const statements = round.statements.map((stmt, stmtIndex) => ({
      text: stmt.text.trim(),
      isLie: stmt.isLie,
      displayOrder: shuffledOrders[stmtIndex],
    }));

    return {
      gameId,
      authorId,
      guesserId,
      roundNumber: index + 1,
      statements,
    };
  });

  return this.insertMany(documents);
};

/**
 * Get all statements written by a user for a game
 */
twoTruthsLieStatementSchema.statics.getStatementsForAuthor = async function(gameId, authorId) {
  return this.find({ gameId, authorId })
    .sort({ roundNumber: 1 });
};

/**
 * Get all statements to be guessed by a user for a game
 */
twoTruthsLieStatementSchema.statics.getStatementsForGuesser = async function(gameId, guesserId) {
  return this.find({ gameId, guesserId })
    .sort({ roundNumber: 1 });
};

/**
 * Get unanswered statements for a guesser
 */
twoTruthsLieStatementSchema.statics.getUnansweredForGuesser = async function(gameId, guesserId) {
  return this.find({
    gameId,
    guesserId,
    'guess.selectedIndex': null,
  })
    .sort({ roundNumber: 1 });
};

/**
 * Submit all answers at once
 * @param {ObjectId} gameId - The game ID
 * @param {ObjectId} guesserId - Who is guessing
 * @param {Array} answers - Array of { roundNumber, selectedIndex }
 */
twoTruthsLieStatementSchema.statics.submitAllAnswers = async function(gameId, guesserId, answers) {
  if (answers.length !== 10) {
    throw new Error('Must provide exactly 10 answers');
  }

  let correctCount = 0;
  const results = [];

  for (const answer of answers) {
    const statement = await this.findOne({
      gameId,
      guesserId,
      roundNumber: answer.roundNumber,
    });

    if (!statement) {
      throw new Error(`Statement for round ${answer.roundNumber} not found`);
    }

    if (statement.guess.selectedIndex !== null) {
      throw new Error(`Round ${answer.roundNumber} already answered`);
    }

    // Submit the guess
    await statement.submitGuess(answer.selectedIndex, answer.timeTaken);

    if (statement.guess.isCorrect) {
      correctCount++;
    }

    results.push({
      roundNumber: answer.roundNumber,
      isCorrect: statement.guess.isCorrect,
    });
  }

  return {
    correctCount,
    totalRounds: 10,
    results,
  };
};

/**
 * Calculate score for a guesser in a game
 */
twoTruthsLieStatementSchema.statics.calculateScore = async function(gameId, guesserId) {
  const statements = await this.find({ gameId, guesserId });
  
  const answered = statements.filter(s => s.guess.selectedIndex !== null);
  const correct = statements.filter(s => s.guess.isCorrect === true);

  return {
    totalRounds: statements.length,
    answeredRounds: answered.length,
    correctGuesses: correct.length,
    score: correct.length,
    isComplete: answered.length === 10,
  };
};

/**
 * Get all statements for a game (for results view)
 */
twoTruthsLieStatementSchema.statics.getAllForGame = async function(gameId) {
  return this.find({ gameId })
    .populate('authorId', 'firstName lastName username profilePhoto')
    .populate('guesserId', 'firstName lastName username profilePhoto')
    .sort({ authorId: 1, roundNumber: 1 });
};

/**
 * Delete all statements for a game (for cleanup/restart)
 */
twoTruthsLieStatementSchema.statics.deleteAllForGame = async function(gameId) {
  const result = await this.deleteMany({ gameId });
  return result.deletedCount;
};

/**
 * Check if a user has submitted all statements for a game
 */
twoTruthsLieStatementSchema.statics.hasSubmittedStatements = async function(gameId, authorId) {
  const count = await this.countDocuments({ gameId, authorId });
  return count === 10;
};

/**
 * Check if a user has answered all statements for a game
 */
twoTruthsLieStatementSchema.statics.hasAnsweredAll = async function(gameId, guesserId) {
  const unanswered = await this.countDocuments({
    gameId,
    guesserId,
    'guess.selectedIndex': null,
  });
  return unanswered === 0;
};

module.exports = mongoose.model('TwoTruthsLieStatement', twoTruthsLieStatementSchema);