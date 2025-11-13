// src/server.js
require('dotenv').config();

console.log('1. Starting server.js - dotenv loaded');

let logger;
try {
  logger = require('./utils/logger');
  console.log('2. Logger loaded successfully');
} catch (err) {
  console.error('FAILED TO LOAD LOGGER:', err);
  process.exit(1);
}

const http = require('http');
logger.info('3. HTTP module loaded');

// 1) Attach handlers ASAP — before any other requires that might throw
process.on('uncaughtException', (err) => {
  console.error('UNCAUGHT EXCEPTION! Shutting down...');
  console.error(err);
  logger?.error('UNCAUGHT EXCEPTION! Shutting down...');
  logger?.error(err.name, err.message, err.stack);
  process.exit(1);
});

process.on('unhandledRejection', (err) => {
  console.error('UNHANDLED REJECTION! Shutting down...');
  console.error(err);
  logger?.error('UNHANDLED REJECTION! Shutting down...');
  logger?.error(err.name, err.message, err.stack);
  process.exit(1);
});

logger.info('4. Error handlers attached');

// Load socket manager
let socketManager;
try {
  logger.info('5. Loading socket manager...');
  socketManager = require('./config/socket');
  logger.info('6. Socket manager loaded successfully');
} catch (err) {
  logger.error('FAILED TO LOAD SOCKET MANAGER:', err);
  console.error('FAILED TO LOAD SOCKET MANAGER:', err);
  process.exit(1);
}

// 2) Now require the rest; if these throw, you'll see it.
let app;
try {
  logger.info('7. Loading Express app...');
  app = require('./app');
  logger.info('8. Express app loaded successfully');
} catch (err) {
  logger.error('Failed while requiring ./app', { name: err.name, message: err.message, stack: err.stack });
  console.error('FAILED TO LOAD APP:', err);
  process.exit(1);
}

// Load database connection
let connectDB;
try {
  logger.info('9. Loading database config...');
  connectDB = require('./config/database');
  logger.info('10. Database config loaded successfully');
} catch (err) {
  logger.error('Failed to load database config:', err);
  console.error('FAILED TO LOAD DATABASE CONFIG:', err);
  process.exit(1);
}

// 3) Connect DB
logger.info('11. Connecting to database...');
connectDB()
  .then(() => {
    logger.info('12. Database connected successfully');
    
    // 4) Create HTTP server and initialize Socket.io
    const PORT = process.env.PORT || 5000;
    logger.info(`13. Creating HTTP server on port ${PORT}...`);
    
    const server = http.createServer(app);
    logger.info('14. HTTP server created');
    
    // Initialize Socket.io
    try {
      logger.info('15. Initializing Socket.io...');
      socketManager.initialize(server);
      logger.info('16. Socket.io initialized successfully');
    } catch (err) {
      logger.error('Failed to initialize Socket.io:', err);
      console.error('SOCKET.IO INIT ERROR:', err);
      process.exit(1);
    }
    
    // Start server
    server.listen(PORT, () => {
      logger.info(`17. Server is listening on port ${PORT}`);
      logger.info(`
        ╔═══════════════════════════════════════╗
        ║     VELORA API SERVER STARTED         ║
        ╠═══════════════════════════════════════╣
        ║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(24)}║
        ║  Port: ${PORT.toString().padEnd(31)}║
        ║  API Version: ${(process.env.API_VERSION || 'v1').padEnd(26)}║
        ╚═══════════════════════════════════════╝
      `);
      logger.info(`Server ready at http://localhost:${PORT}`);
      logger.info(`API available at http://localhost:${PORT}/api/${process.env.API_VERSION || 'v1'}`);
      logger.info(`Socket.io ready for connections`);
    });
    
    // 5) Graceful shutdown signals
    process.on('SIGTERM', () => {
      logger.info('SIGTERM received. Shutting down gracefully...');
      server?.close(() => logger.info('Process terminated'));
    });
    
    process.on('SIGINT', () => {
      logger.info('SIGINT received. Shutting down gracefully...');
      server?.close(() => logger.info('Process terminated'));
    });
    
  })
  .catch(err => {
    logger.error('Failed to connect to database:', err);
    console.error('DATABASE CONNECTION ERROR:', err);
    process.exit(1);
  });

logger.info('18. Server.js setup complete, waiting for async operations...');