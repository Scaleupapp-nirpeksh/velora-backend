// regenerate-analysis.js
require('dotenv').config();
const mongoose = require('mongoose');
const whatWouldYouDoService = require('../src/services/games/whatWouldYouDo.service');

const SESSION_ID = 'd3dc138b-da9c-4a66-852f-d6b6c97f6b24';

async function regenerate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');
  
  try {
    console.log('Regenerating analysis...');
    const results = await whatWouldYouDoService.regenerateAnalysis(SESSION_ID);
    console.log('✅ Analysis regenerated!');
    console.log('Overall Compatibility:', results.overallCompatibility + '%');
    console.log('Level:', results.compatibilityLevel);
    console.log('Category Scores:', results.categoryScores);
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
  
  await mongoose.disconnect();
}

regenerate();