const express = require('express');
const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const questionRoutes = require('./question.routes');
const analysisRoutes = require('./analysis.routes'); 
const matchRoutes = require('./match.routes');
const conversationRoutes = require('./conversation.routes');  
console.log('Loading message routes...');
const messageRoutes = require('./message.routes');
console.log('Message routes loaded:', !!messageRoutes);       

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

module.exports = router;