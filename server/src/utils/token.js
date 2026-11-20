import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

export function generateAccessToken(payload) {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn
  });
}

export function generateRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn
  });
}

export function verifyAccessToken(token) {
  try {
    return jwt.verify(token, config.jwt.secret);
  } catch (err) {
    return null;
  }
}

export function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, config.jwt.refreshSecret);
  } catch (err) {
    return null;
  }
}

export function tokenDurationMs(duration) {
  if (typeof duration === 'number' && Number.isFinite(duration)) return duration * 1000;

  const match = String(duration).trim().match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d|w|y)?$/i);
  if (!match) return undefined;

  const units = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000, y: 31536000000 };
  const unit = (match[2] || 'ms').toLowerCase();
  return Number(match[1]) * units[unit];
}

export const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: config.isProduction ? 'none' : 'lax',
  path: '/'
};

