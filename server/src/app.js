import express from 'express';
import cookieParser from 'cookie-parser';
import { corsMiddleware } from './middleware/cors.js';
import { requestLogger } from './middleware/requestLogger.js';
import { errorHandler } from './middleware/errorHandler.js';
import apiRouter from './routes/index.js';

const app = express();

// Disable X-Powered-By header for security
app.disable('x-powered-by');

// Middleware pipeline
app.use(corsMiddleware);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(requestLogger);

// API router
app.use('/api', apiRouter);

// Root route
app.get('/', (req, res) => {
  res.json({
    name: 'HemoSync API',
    description: 'Blood Inventory, Hospital Coordination & AI Forecasting Platform',
    version: '1.0.0',
    endpoints: {
      health: '/api/health'
    }
  });
});

// 404 handler
app.use((req, res, next) => {
  errorHandler(
    { status: 404, message: `Route not found: ${req.method} ${req.originalUrl}` },
    req,
    res,
    next
  );
});

// Centralized error handler
app.use(errorHandler);

export default app;
