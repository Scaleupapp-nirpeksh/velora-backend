// src/scripts/seedWouldYouRatherQuestions.js

/**
 * SEED SCRIPT: Would You Rather Questions
 * 
 * Run this script to populate the database with all 50 questions.
 * 
 * Usage:
 *   node src/scripts/seedWouldYouRatherQuestions.js
 * 
 * Or add to package.json scripts:
 *   "seed:wyr": "node src/scripts/seedWouldYouRatherQuestions.js"
 * 
 * Then run:
 *   npm run seed:wyr
 */

require('dotenv').config();
const mongoose = require('mongoose');
const WouldYouRatherQuestion = require('../models/games/WouldYouRatherQuestion');

async function seedQuestions() {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected to MongoDB');

    // Seed the questions
    console.log('\n📝 Seeding Would You Rather questions...\n');
    const result = await WouldYouRatherQuestion.seedQuestions();

    // Log results
    console.log('═══════════════════════════════════════════');
    console.log('   SEEDING COMPLETE');
    console.log('═══════════════════════════════════════════');
    console.log(`   Total questions: ${result.total}`);
    console.log(`   ✅ Created: ${result.created}`);
    console.log(`   🔄 Updated: ${result.updated}`);
    console.log(`   ❌ Errors: ${result.errors}`);
    console.log('═══════════════════════════════════════════\n');

    // Show category breakdown
    const categories = await WouldYouRatherQuestion.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    console.log('📊 Questions by Category:');
    console.log('───────────────────────────────────────────');
    categories.forEach(cat => {
      const emoji = getCategoryEmoji(cat._id);
      console.log(`   ${emoji} ${cat._id.padEnd(15)} : ${cat.count} questions`);
    });
    console.log('───────────────────────────────────────────\n');

    // Show spice level breakdown
    const spiceLevels = await WouldYouRatherQuestion.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$spiceLevel', count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);

    console.log('🌶️  Questions by Spice Level:');
    console.log('───────────────────────────────────────────');
    spiceLevels.forEach(level => {
      const spice = '🌶️'.repeat(level._id);
      console.log(`   Level ${level._id} ${spice.padEnd(12)} : ${level.count} questions`);
    });
    console.log('───────────────────────────────────────────\n');

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  }
}

function getCategoryEmoji(category) {
  const emojis = {
    lifestyle: '🏠',
    money: '💰',
    family: '👨‍👩‍👧‍👦',
    love: '❤️',
    intimacy: '🔥',
    conflict: '⚡',
    travel: '✈️',
    philosophy: '🤔',
    friendship: '👥',
    hobbies: '🎮',
    future: '🚀'
  };
  return emojis[category] || '❓';
}

// Run the seeder
seedQuestions();