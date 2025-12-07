// src/scripts/seedWhatWouldYouDoQuestions.js

/**
 * WHAT WOULD YOU DO - QUESTION SEEDING SCRIPT
 * 
 * Seeds the database with all 15 scenario questions for the game.
 * 
 * Usage:
 *   node src/scripts/seedWhatWouldYouDoQuestions.js
 * 
 * Options:
 *   --force    Drop existing questions and reseed
 */

require('dotenv').config();
const mongoose = require('mongoose');
const WhatWouldYouDoQuestion = require('../models/games/WhatWouldYouDoQuestion');

// Check for --force flag
const forceReseed = process.argv.includes('--force');

async function seedQuestions() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/velora';
    console.log('Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check existing questions
    const existingCount = await WhatWouldYouDoQuestion.countDocuments();
    
    if (existingCount > 0 && !forceReseed) {
      console.log(`\n⚠️  Found ${existingCount} existing questions.`);
      console.log('Use --force flag to drop and reseed.');
      console.log('Example: node src/scripts/seedWhatWouldYouDoQuestions.js --force\n');
      await mongoose.disconnect();
      return;
    }

    if (forceReseed && existingCount > 0) {
      console.log(`\n🗑️  Dropping ${existingCount} existing questions...`);
      await WhatWouldYouDoQuestion.deleteMany({});
      console.log('Existing questions dropped.');
    }

    // Get seed data from model
    const questions = WhatWouldYouDoQuestion.getSeedData();

    console.log(`\n📝 Seeding ${questions.length} questions...\n`);

    // Insert questions
    const inserted = await WhatWouldYouDoQuestion.insertMany(questions);

    console.log('✅ Questions seeded successfully!\n');

    // Display summary
    console.log('='.repeat(60));
    console.log('QUESTION SUMMARY');
    console.log('='.repeat(60));

    const categoryInfo = WhatWouldYouDoQuestion.getCategoryInfo();
    const categoryCounts = {};

    for (const q of inserted) {
      if (!categoryCounts[q.category]) {
        categoryCounts[q.category] = [];
      }
      categoryCounts[q.category].push(q.questionNumber);
    }

    for (const [category, numbers] of Object.entries(categoryCounts)) {
      const info = categoryInfo[category];
      console.log(`\n${info.emoji} ${info.name} (Q${numbers.join(', Q')})`);
      console.log(`   ${info.description}`);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`Total: ${inserted.length} questions across ${Object.keys(categoryCounts).length} categories`);
    console.log('='.repeat(60));

    // Show intensity distribution
    console.log('\n🌶️  INTENSITY DISTRIBUTION:');
    const intensityCounts = { 2: 0, 3: 0, 4: 0 };
    for (const q of inserted) {
      intensityCounts[q.intensity]++;
    }
    console.log(`   🌶️🌶️ (Mild):     ${intensityCounts[2]} questions`);
    console.log(`   🌶️🌶️🌶️ (Medium):  ${intensityCounts[3]} questions`);
    console.log(`   🌶️🌶️🌶️🌶️ (Spicy):  ${intensityCounts[4]} questions`);

    // Show all questions
    console.log('\n' + '='.repeat(60));
    console.log('ALL QUESTIONS');
    console.log('='.repeat(60));

    for (const q of inserted) {
      const info = categoryInfo[q.category];
      console.log(`\nQ${q.questionNumber} [${info.emoji} ${q.category}] ${'🌶️'.repeat(q.intensity)}`);
      console.log(`"${q.scenarioText}"`);
      console.log(`→ Tests: ${q.coreQuestion}`);
      console.log(`→ Reveals: ${q.insight}`);
    }

    console.log('\n✅ Seeding complete!\n');

  } catch (error) {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the seed
seedQuestions();