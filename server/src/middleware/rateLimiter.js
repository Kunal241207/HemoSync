import { errorResponse } from '../utils/apiResponse.js';

// In-memory tracker for login rate limiting: key -> { count, resetTime }
const loginAttempts = new Map();

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5; // 5 failed attempts per window

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of loginAttempts.entries()) {
    if (now > record.resetTime) {
      loginAttempts.delete(key);
    }
  }
}, 5 * 60 * 1000).unref();

export function loginRateLimiter(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || 'unknown';
  const email = req.body?.email ? String(req.body.email).toLowerCase().trim() : '';
  const key = `${ip}:${email}`;

  const now = Date.now();
  const record = loginAttempts.get(key);

  if (record && now < record.resetTime) {
    if (record.count >= MAX_ATTEMPTS) {
      const retryAfterSeconds = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSeconds);
      return errorResponse(
        res,
        `Too many failed login attempts. Please try again in ${Math.ceil(retryAfterSeconds / 60)} minutes.`,
        429
      );
    }
  }

  // Helper attached to response to record a failed attempt or reset on success
  res.recordFailedLogin = () => {
    const current = loginAttempts.get(key);
    if (!current || now > current.resetTime) {
      loginAttempts.set(key, { count: 1, resetTime: now + WINDOW_MS });
    } else {
      current.count += 1;
    }
  };

  res.resetLoginAttempts = () => {
    loginAttempts.delete(key);
  };

  next();
}

// Export for test resets
export function _resetRateLimiter() {
  loginAttempts.clear();
}

