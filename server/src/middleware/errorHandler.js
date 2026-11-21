import { ZodError } from 'zod';
import { logger } from '../utils/logger.js';
import { errorResponse } from '../utils/apiResponse.js';
import { config } from '../config/index.js';

export function errorHandler(err, req, res, _next) {
  logger.error(`Error processing ${req.method} ${req.originalUrl}: ${err.message}`, {
    stack: config.isProduction ? undefined : err.stack
  });

  // Handle JSON parse errors from express.json()
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return errorResponse(res, 'Malformed JSON payload in request body', 400);
  }

  // Handle Zod Schema Validation Errors
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message
    }));
    return errorResponse(res, 'Validation failed', 400, formattedErrors);
  }

  // Handle Prisma Database Errors
  if (err.code && err.code.startsWith('P')) {
    if (err.code === 'P2002') {
      const target = err.meta?.target || 'field';
      return errorResponse(res, `A record with this ${target} already exists.`, 409);
    }
    if (err.code === 'P2025') {
      return errorResponse(res, 'Record not found.', 404);
    }
    return errorResponse(res, 'Database operation error.', 500);
  }

  // Standard or custom errors
  const statusCode = err.statusCode || err.status || 500;
  const message = config.isProduction && statusCode === 500
    ? 'Internal server error'
    : err.message || 'Internal server error';

  return errorResponse(res, message, statusCode);
}

