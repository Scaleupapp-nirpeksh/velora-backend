//src/routes/index.js
const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const questionRoutes = require('./question.routes');
const analysisRoutes = require('./analysis.routes'); 
const matchRoutes = require('./match.routes');
const conversationRoutes = require('./conversation.routes');  
const messageRoutes = require('./message.routes');
const testRoutes = require('./test.routes');
const twoTruthsLieRoutes = require('./twoTruthsLie.routes');
const wouldYouRatherRoutes = require('./games/wouldYouRather.routes');
const intimacySpectrumRoutes = require('./games/intimacySpectrum.routes');  // Add this


const router = express.Router();

/**
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Velora API is running',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

/**
 * API Routes
 */
router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/questions', questionRoutes);
router.use('/analysis', analysisRoutes); 
router.use('/matches', matchRoutes);
router.use('/conversations', conversationRoutes);  
router.use('/messages', messageRoutes);   
router.use('/test', testRoutes);
router.use('/games/two-truths-lie', twoTruthsLieRoutes);
router.use('/games/would-you-rather', wouldYouRatherRoutes);
router.use('/games/intimacy-spectrum', intimacySpectrumRoutes);  // Add this

module.exports = router;