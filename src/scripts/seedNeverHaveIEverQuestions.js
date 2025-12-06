// src/scripts/seedNeverHaveIEverQuestions.js

/**
 * NEVER HAVE I EVER - Question Seeding Script
 * 
 * Seeds 30 relationship-focused questions across 6 categories.
 * Questions progress from mild to spicy (sequential 1-30).
 * 
 * Usage:
 *   node src/scripts/seedNeverHaveIEverQuestions.js
 * 
 * Options:
 *   --force    Clear existing questions before seeding
 *   --dry-run  Show what would be seeded without making changes
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const NeverHaveIEverQuestion = require('../models/games/NeverHaveIEverQuestion');
const logger = require('../utils/logger');

// Parse command line arguments
const args = process.argv.slice(2);
const forceReseed = args.includes('--force');
const dryRun = args.includes('--dry-run');

async function seedQuestions() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
      throw new Error('MONGODB_URI environment variable is not set');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    // Check existing questions
    const existingCount = await NeverHaveIEverQuestion.countDocuments();
    console.log(`📊 Existing questions in database: ${existingCount}`);

    if (existingCount > 0 && !forceReseed) {
      console.log('\n⚠️  Questions already exist. Use --force to reseed.');
      console.log('   Example: node src/scripts/seedNeverHaveIEverQuestions.js --force\n');
      
      // Show existing questions summary
      const categoryCounts = await NeverHaveIEverQuestion.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]);
      
      console.log('📋 Current question distribution:');
      categoryCounts.forEach(cat => {
        console.log(`   ${cat._id}: ${cat.count} questions`);
      });
      
      await mongoose.disconnect();
      return;
    }

    // Get seed data from model
    const questions = NeverHaveIEverQuestion.getSeedData();

    if (dryRun) {
      console.log('\n🔍 DRY RUN - Would seed the following questions:\n');
      
      const categoryInfo = NeverHaveIEverQuestion.getCategoryInfo();
      let currentCategory = null;
      
      questions.forEach(q => {
        if (q.category !== currentCategory) {
          currentCategory = q.category;
          const info = categoryInfo[currentCategory];
          console.log(`\n${info.emoji} ${info.name} (${info.spice})`);
          console.log('─'.repeat(50));
        }
        console.log(`  Q${q.questionNumber}: "${q.statementText}"`);
        console.log(`         → ${q.insight}`);
      });
      
      console.log(`\n📊 Total: ${questions.length} questions`);
      console.log('\n✅ Dry run complete. No changes made.');
      await mongoose.disconnect();
      return;
    }

    // Clear existing if force flag
    if (forceReseed && existingCount > 0) {
      console.log('\n🗑️  Clearing existing questions...');
      await NeverHaveIEverQuestion.deleteMany({});
      console.log('✅ Cleared existing questions');
    }

    // Insert questions
    console.log('\n📝 Seeding questions...\n');
    
    const categoryInfo = NeverHaveIEverQuestion.getCategoryInfo();
    let currentCategory = null;
    let insertedCount = 0;

    for (const questionData of questions) {
      // Log category header
      if (questionData.category !== currentCategory) {
        currentCategory = questionData.category;
        const info = categoryInfo[currentCategory];
        console.log(`\n${info.emoji} ${info.name}`);
      }

      // Check if question already exists (for non-force updates)
      const existing = await NeverHaveIEverQuestion.findOne({ 
        questionNumber: questionData.questionNumber 
      });

      if (existing) {
        // Update existing
        await NeverHaveIEverQuestion.updateOne(
          { questionNumber: questionData.questionNumber },
          { $set: questionData }
        );
        console.log(`   ✏️  Q${questionData.questionNumber}: Updated`);
      } else {
        // Insert new
        await NeverHaveIEverQuestion.create(questionData);
        console.log(`   ✅ Q${questionData.questionNumber}: "${questionData.statementText.substring(0, 40)}..."`);
        insertedCount++;
      }
    }

    // Final summary
    console.log('\n' + '═'.repeat(50));
    console.log('📊 SEEDING COMPLETE');
    console.log('═'.repeat(50));
    
    const finalCount = await NeverHaveIEverQuestion.countDocuments();
    console.log(`\n   Total questions in database: ${finalCount}`);
    console.log(`   New questions inserted: ${insertedCount}`);
    console.log(`   Questions updated: ${questions.length - insertedCount}`);

    // Show category breakdown
    const finalCategoryCounts = await NeverHaveIEverQuestion.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$category', count: { $sum: 1 }, avgSpice: { $avg: '$spiceLevel' } } },
      { $sort: { avgSpice: 1 } }
    ]);

    console.log('\n📋 Questions by category:');
    finalCategoryCounts.forEach(cat => {
      const info = categoryInfo[cat._id];
      console.log(`   ${info.emoji} ${info.name}: ${cat.count} questions (${info.spice})`);
    });

    // Show sample questions
    console.log('\n🎲 Sample questions:');
    const samples = await NeverHaveIEverQuestion.find()
      .sort({ questionNumber: 1 })
      .limit(3);
    
    samples.forEach(q => {
      console.log(`   Q${q.questionNumber}: "Never have I ever ${q.statementText}"`);
    });

    console.log('\n✅ Seeding completed successfully!\n');

  } catch (error) {
    console.error('\n❌ Seeding failed:', error.message);
    logger.error('Seed script error:', error);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Run the seed function
seedQuestions();