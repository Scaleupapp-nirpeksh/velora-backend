// src/scripts/seedIntimacyQuestions.js

/**
 * INTIMACY SPECTRUM QUESTION SEEDER
 * 
 * Seeds all 30 questions for the Intimacy Spectrum game.
 * 
 * Usage:
 *   node src/scripts/seedIntimacyQuestions.js
 * 
 * Options:
 *   --force    Drop existing questions and reseed
 *   --dry-run  Show what would be seeded without writing to DB
 */

require('dotenv').config();
const mongoose = require('mongoose');
const IntimacySpectrumQuestion = require('../models/games/IntimacySpectrumQuestion');
const logger = require('../utils/logger');

// =====================================================
// ALL 30 QUESTIONS
// =====================================================

const questions = [
  // =====================================================
  // CATEGORY 1: DESIRE & DRIVE (Q1-5) 🔥
  // =====================================================
  {
    questionNumber: 1,
    category: 'desire_drive',
    questionText: 'How often does your ideal sex life look like?',
    leftLabel: 'A few times a month',
    rightLabel: 'Multiple times a day',
    insight: 'Sexual frequency expectations',
    spiceLevel: 1
  },
  {
    questionNumber: 2,
    category: 'desire_drive',
    questionText: 'How important is physical intimacy in a relationship to you?',
    leftLabel: 'Nice but not essential',
    rightLabel: 'Absolutely essential',
    insight: 'Priority of physical connection',
    spiceLevel: 1
  },
  {
    questionNumber: 3,
    category: 'desire_drive',
    questionText: 'Morning sex vs. night sex?',
    leftLabel: 'Night owl only',
    rightLabel: 'Morning person all the way',
    insight: 'Timing preferences',
    spiceLevel: 1
  },
  {
    questionNumber: 4,
    category: 'desire_drive',
    questionText: 'How spontaneous do you like intimacy to be?',
    leftLabel: 'Planned and anticipated',
    rightLabel: 'Completely spontaneous',
    insight: 'Spontaneity vs planning',
    spiceLevel: 1
  },
  {
    questionNumber: 5,
    category: 'desire_drive',
    questionText: 'How long do you prefer intimate sessions to last?',
    leftLabel: 'Quick and passionate',
    rightLabel: 'Long and exploratory',
    insight: 'Duration preferences',
    spiceLevel: 1
  },

  // =====================================================
  // CATEGORY 2: INITIATION & POWER (Q6-10) 🔥
  // =====================================================
  {
    questionNumber: 6,
    category: 'initiation_power',
    questionText: 'Who do you prefer initiates intimacy?',
    leftLabel: 'I prefer to be pursued',
    rightLabel: 'I love to initiate',
    insight: 'Initiation dynamics',
    spiceLevel: 1
  },
  {
    questionNumber: 7,
    category: 'initiation_power',
    questionText: 'In the bedroom, do you prefer to lead or follow?',
    leftLabel: 'Follow their lead',
    rightLabel: 'Take full control',
    insight: 'Power dynamics preference',
    spiceLevel: 1
  },
  {
    questionNumber: 8,
    category: 'initiation_power',
    questionText: 'How do you feel about being gently dominated?',
    leftLabel: 'Not for me',
    rightLabel: 'Yes please',
    insight: 'Submission comfort',
    spiceLevel: 2
  },
  {
    questionNumber: 9,
    category: 'initiation_power',
    questionText: 'How do you feel about taking a dominant role?',
    leftLabel: 'Prefer not to',
    rightLabel: 'Love being in charge',
    insight: 'Dominance comfort',
    spiceLevel: 2
  },
  {
    questionNumber: 10,
    category: 'initiation_power',
    questionText: 'How much do you enjoy the chase and seduction?',
    leftLabel: 'Get to the point',
    rightLabel: 'The chase is everything',
    insight: 'Seduction appreciation',
    spiceLevel: 1
  },

  // =====================================================
  // CATEGORY 3: TURN-ONS & CHEMISTRY (Q11-15) 🔥🔥
  // =====================================================
  {
    questionNumber: 11,
    category: 'turn_ons',
    questionText: 'How important is extended foreplay?',
    leftLabel: 'Nice but optional',
    rightLabel: 'Absolutely essential',
    insight: 'Foreplay importance',
    spiceLevel: 2
  },
  {
    questionNumber: 12,
    category: 'turn_ons',
    questionText: 'How much does physical appearance turn you on?',
    leftLabel: 'Connection matters more',
    rightLabel: 'Visual attraction is huge',
    insight: 'Visual stimulation importance',
    spiceLevel: 2
  },
  {
    questionNumber: 13,
    category: 'turn_ons',
    questionText: 'How do you feel about teasing and anticipation?',
    leftLabel: 'Don\'t make me wait',
    rightLabel: 'The tension drives me wild',
    insight: 'Teasing appreciation',
    spiceLevel: 2
  },
  {
    questionNumber: 14,
    category: 'turn_ons',
    questionText: 'How important is kissing during intimacy?',
    leftLabel: 'Can take it or leave it',
    rightLabel: 'Can\'t get enough',
    insight: 'Kissing preference',
    spiceLevel: 2
  },
  {
    questionNumber: 15,
    category: 'turn_ons',
    questionText: 'How much does a partner\'s scent affect your attraction?',
    leftLabel: 'Barely notice it',
    rightLabel: 'Incredibly intoxicating',
    insight: 'Scent attraction',
    spiceLevel: 2
  },

  // =====================================================
  // CATEGORY 4: COMMUNICATION & VOCAL (Q16-20) 🔥🔥
  // =====================================================
  {
    questionNumber: 16,
    category: 'communication',
    questionText: 'Dirty talk during sex?',
    leftLabel: 'Prefer silence',
    rightLabel: 'The filthier the better',
    insight: 'Verbal expression comfort',
    spiceLevel: 2
  },
  {
    questionNumber: 17,
    category: 'communication',
    questionText: 'How vocal are you during intimacy?',
    leftLabel: 'Quiet and subtle',
    rightLabel: 'Very expressive',
    insight: 'Vocalization level',
    spiceLevel: 2
  },
  {
    questionNumber: 18,
    category: 'communication',
    questionText: 'How comfortable are you giving explicit instructions?',
    leftLabel: 'Prefer to hint',
    rightLabel: 'Very direct about what I want',
    insight: 'Communication directness',
    spiceLevel: 2
  },
  {
    questionNumber: 19,
    category: 'communication',
    questionText: 'How do you feel about receiving explicit feedback?',
    leftLabel: 'Prefer gentle hints',
    rightLabel: 'Tell me exactly what you want',
    insight: 'Feedback receptiveness',
    spiceLevel: 2
  },
  {
    questionNumber: 20,
    category: 'communication',
    questionText: 'Talking about fantasies with your partner?',
    leftLabel: 'Keep them private',
    rightLabel: 'Share everything openly',
    insight: 'Fantasy communication',
    spiceLevel: 2
  },

  // =====================================================
  // CATEGORY 5: FANTASY & ROLEPLAY (Q21-25) 🔥🔥🔥
  // =====================================================
  {
    questionNumber: 21,
    category: 'fantasy_roleplay',
    questionText: 'How interested are you in roleplay scenarios?',
    leftLabel: 'Not my thing',
    rightLabel: 'Love getting into character',
    insight: 'Roleplay interest',
    spiceLevel: 3
  },
  {
    questionNumber: 22,
    category: 'fantasy_roleplay',
    questionText: 'How do you feel about watching or being watched?',
    leftLabel: 'Completely private',
    rightLabel: 'The thought excites me',
    insight: 'Voyeurism/exhibitionism',
    spiceLevel: 3
  },
  {
    questionNumber: 23,
    category: 'fantasy_roleplay',
    questionText: 'Interest in acting out specific fantasies?',
    leftLabel: 'Fantasies stay in my head',
    rightLabel: 'Want to bring them to life',
    insight: 'Fantasy actualization',
    spiceLevel: 3
  },
  {
    questionNumber: 24,
    category: 'fantasy_roleplay',
    questionText: 'How do you feel about power exchange scenarios?',
    leftLabel: 'Prefer equality',
    rightLabel: 'Power play is exciting',
    insight: 'Power exchange interest',
    spiceLevel: 3
  },
  {
    questionNumber: 25,
    category: 'fantasy_roleplay',
    questionText: 'Bringing a third person into the bedroom?',
    leftLabel: 'Absolutely not',
    rightLabel: 'Open to exploring',
    insight: 'Threesome openness',
    spiceLevel: 3
  },

  // =====================================================
  // CATEGORY 6: KINKS & INTENSITY (Q26-30) 🔥🔥🔥
  // =====================================================
  {
    questionNumber: 26,
    category: 'kinks_intensity',
    questionText: 'How do you feel about incorporating toys?',
    leftLabel: 'Prefer to keep it natural',
    rightLabel: 'Love adding toys',
    insight: 'Toy openness',
    spiceLevel: 3
  },
  {
    questionNumber: 27,
    category: 'kinks_intensity',
    questionText: 'Light biting, scratching, or hair pulling?',
    leftLabel: 'Too intense for me',
    rightLabel: 'Yes, I love it rough',
    insight: 'Pain/pleasure threshold',
    spiceLevel: 3
  },
  {
    questionNumber: 28,
    category: 'kinks_intensity',
    questionText: 'How do you feel about light restraints or blindfolds?',
    leftLabel: 'Not comfortable',
    rightLabel: 'Exciting and arousing',
    insight: 'Bondage comfort',
    spiceLevel: 3
  },
  {
    questionNumber: 29,
    category: 'kinks_intensity',
    questionText: 'Sex in adventurous locations?',
    leftLabel: 'Bedroom only',
    rightLabel: 'Anywhere and everywhere',
    insight: 'Location adventurousness',
    spiceLevel: 3
  },
  {
    questionNumber: 30,
    category: 'kinks_intensity',
    questionText: 'How experimental are you willing to be overall?',
    leftLabel: 'Prefer the classics',
    rightLabel: 'Always trying new things',
    insight: 'Overall adventurousness',
    spiceLevel: 3
  }
];

// =====================================================
// SEEDING FUNCTIONS
// =====================================================

async function connectDB() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/velora';
    await mongoose.connect(mongoUri);
    logger.info('Connected to MongoDB');
  } catch (error) {
    logger.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

async function seedQuestions(options = {}) {
  const { force = false, dryRun = false } = options;

  console.log('\n========================================');
  console.log('  INTIMACY SPECTRUM QUESTION SEEDER');
  console.log('========================================\n');

  if (dryRun) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Check existing questions
    const existingCount = await IntimacySpectrumQuestion.countDocuments();
    console.log(`📊 Existing questions in database: ${existingCount}`);

    if (existingCount > 0 && !force) {
      console.log('\n⚠️  Questions already exist. Use --force to overwrite.');
      console.log('   This will delete all existing questions and reseed.\n');
      return { success: false, reason: 'Questions already exist' };
    }

    if (force && existingCount > 0) {
      console.log('\n🗑️  Force mode: Deleting existing questions...');
      if (!dryRun) {
        await IntimacySpectrumQuestion.deleteMany({});
        console.log('   ✓ Deleted all existing questions');
      } else {
        console.log('   [DRY RUN] Would delete all existing questions');
      }
    }

    // Validate questions
    console.log('\n🔍 Validating questions...');
    
    const categories = {};
    const questionNumbers = new Set();
    
    for (const q of questions) {
      // Check for duplicate question numbers
      if (questionNumbers.has(q.questionNumber)) {
        throw new Error(`Duplicate question number: ${q.questionNumber}`);
      }
      questionNumbers.add(q.questionNumber);

      // Count by category
      categories[q.category] = (categories[q.category] || 0) + 1;
    }

    // Verify all 30 questions present
    if (questions.length !== 30) {
      throw new Error(`Expected 30 questions, found ${questions.length}`);
    }

    // Verify 5 questions per category
    console.log('\n📋 Questions by category:');
    for (const [category, count] of Object.entries(categories)) {
      const status = count === 5 ? '✓' : '✗';
      console.log(`   ${status} ${category}: ${count} questions`);
      if (count !== 5) {
        throw new Error(`Category ${category} has ${count} questions, expected 5`);
      }
    }

    // Verify spice level distribution
    const spiceLevels = { 1: 0, 2: 0, 3: 0 };
    questions.forEach(q => spiceLevels[q.spiceLevel]++);
    
    console.log('\n🌶️  Questions by spice level:');
    console.log(`   Level 1 (Mild):   ${spiceLevels[1]} questions`);
    console.log(`   Level 2 (Medium): ${spiceLevels[2]} questions`);
    console.log(`   Level 3 (Spicy):  ${spiceLevels[3]} questions`);

    console.log('\n✓ All validations passed!\n');

    // Insert questions
    if (!dryRun) {
      console.log('📝 Inserting questions...');
      
      const result = await IntimacySpectrumQuestion.insertMany(questions);
      
      console.log(`   ✓ Inserted ${result.length} questions\n`);

      // Verify insertion
      const finalCount = await IntimacySpectrumQuestion.countDocuments();
      console.log(`📊 Final question count: ${finalCount}`);

      // Show sample
      console.log('\n📖 Sample questions:');
      const samples = await IntimacySpectrumQuestion.find()
        .sort({ questionNumber: 1 })
        .limit(3);
      
      samples.forEach(q => {
        console.log(`\n   Q${q.questionNumber} [${q.category}] 🔥×${q.spiceLevel}`);
        console.log(`   "${q.questionText}"`);
        console.log(`   ← ${q.leftLabel} | ${q.rightLabel} →`);
      });

      return { success: true, inserted: result.length };
    } else {
      console.log('[DRY RUN] Would insert 30 questions\n');
      
      console.log('📖 Sample questions that would be inserted:');
      questions.slice(0, 3).forEach(q => {
        console.log(`\n   Q${q.questionNumber} [${q.category}] 🔥×${q.spiceLevel}`);
        console.log(`   "${q.questionText}"`);
        console.log(`   ← ${q.leftLabel} | ${q.rightLabel} →`);
      });

      return { success: true, dryRun: true };
    }

  } catch (error) {
    console.error('\n❌ Seeding error:', error.message);
    return { success: false, error: error.message };
  }
}

async function showStats() {
  console.log('\n========================================');
  console.log('  CURRENT DATABASE STATISTICS');
  console.log('========================================\n');

  const total = await IntimacySpectrumQuestion.countDocuments();
  console.log(`Total questions: ${total}`);

  if (total > 0) {
    const byCategory = await IntimacySpectrumQuestion.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    console.log('\nBy category:');
    byCategory.forEach(c => {
      console.log(`  ${c._id}: ${c.count}`);
    });

    const bySpice = await IntimacySpectrumQuestion.aggregate([
      { $group: { _id: '$spiceLevel', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    console.log('\nBy spice level:');
    bySpice.forEach(s => {
      console.log(`  Level ${s._id}: ${s.count}`);
    });
  }
}

// =====================================================
// MAIN EXECUTION
// =====================================================

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const statsOnly = args.includes('--stats');

  await connectDB();

  if (statsOnly) {
    await showStats();
  } else {
    const result = await seedQuestions({ force, dryRun });
    
    if (result.success) {
      console.log('\n========================================');
      console.log('  ✅ SEEDING COMPLETED SUCCESSFULLY');
      console.log('========================================\n');
    } else {
      console.log('\n========================================');
      console.log('  ❌ SEEDING FAILED');
      console.log(`  Reason: ${result.reason || result.error}`);
      console.log('========================================\n');
    }
  }

  await mongoose.disconnect();
  console.log('Disconnected from MongoDB\n');
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

// Export for programmatic use
module.exports = { seedQuestions, questions };