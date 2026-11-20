import http from 'http';
import app from './app.js';
import { config } from './config/index.js';
import { checkDbConnection, disconnectDb } from './config/db.js';
import { logger } from './utils/logger.js';
import { startExpiryCron, stopExpiryCron } from './jobs/expiryJob.js';

const server = http.createServer(app);

async function startServer() {
  try {
    // Check initial database connectivity
    const dbCheck = await checkDbConnection();
    if (dbCheck.connected) {
      logger.info(`PostgreSQL database connected successfully (latency: ${dbCheck.latencyMs}ms)`);
    } else {
      logger.warn(`PostgreSQL database connection check warning: ${dbCheck.error}`);
      logger.warn('Server will continue running. Check DATABASE_URL and local PostgreSQL service status.');
    }

    server.listen(config.port, () => {
      logger.info(`=======================================================`);
      logger.info(`🩸 HemoSync Server running on http://localhost:${config.port}`);
      logger.info(`   Environment: ${config.nodeEnv}`);
      logger.info(`   Health check: http://localhost:${config.port}/api/health`);
      logger.info(`   Allowed CORS Origin: ${config.frontendUrl}`);
      logger.info(`=======================================================`);

      // Initialize automated in-process expiry monitoring scheduler
      startExpiryCron();
    });
  } catch (err) {
    logger.error('Failed to initialize server:', err);
    process.exit(1);
  }
}

// Graceful shutdown handling
async function shutdown(signal) {
  logger.info(`Received ${signal}. Gracefully shutting down HemoSync server...`);
  stopExpiryCron();
  server.close(async () => {
    logger.info('HTTP server closed.');
    await disconnectDb();
    logger.info('Database disconnected.');
    process.exit(0);
  });

  // Force shutdown after timeout
  setTimeout(() => {
    logger.error('Could not close connections in time, forcefully shutting down.');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception thrown:', { error: error.message, stack: error.stack });
  process.exit(1);
});

startServer();

