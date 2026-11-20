import { loginSchema } from '../validators/authValidator.js';
import * as authService from '../services/authService.js';
import { successResponse, errorResponse } from '../utils/apiResponse.js';
import { COOKIE_OPTIONS, tokenDurationMs } from '../utils/token.js';
import { config } from '../config/index.js';

function setSessionCookies(res, accessToken, refreshToken) {
  res.cookie('hemosync_token', accessToken, {
    ...COOKIE_OPTIONS,
    maxAge: tokenDurationMs(config.jwt.expiresIn)
  });
  res.cookie('hemosync_refresh', refreshToken, {
    ...COOKIE_OPTIONS,
    maxAge: tokenDurationMs(config.jwt.refreshExpiresIn)
  });
}

export async function register(req, res, next) {
  try {
    const { name, email, password, institutionId } = req.body;
    if (!name || !email || !password) {
      return errorResponse(res, 'Name, email and password are required', 400);
    }
    if (password.length < 8) {
      return errorResponse(res, 'Password must be at least 8 characters long', 400);
    }

    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    const { user } = await authService.registerUser({
      name,
      email,
      password,
      institutionId,
      ipAddress,
      userAgent
    });

    return successResponse(res, { user }, 'Account created successfully', 201);
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const validated = loginSchema.parse(req.body);
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    try {
      const { user, accessToken, refreshToken } = await authService.loginUser({
        email: validated.email,
        password: validated.password,
        ipAddress,
        userAgent
      });

      if (typeof res.resetLoginAttempts === 'function') {
        res.resetLoginAttempts();
      }

      setSessionCookies(res, accessToken, refreshToken);

      return successResponse(
        res,
        {
          user,
          token: accessToken
        },
        'Authenticated successfully'
      );
    } catch (authError) {
      if (typeof res.recordFailedLogin === 'function') {
        res.recordFailedLogin();
      }
      return errorResponse(res, authError.message || 'Authentication failed', authError.statusCode || 401);
    }
  } catch (err) {
    next(err);
  }
}

export async function refresh(req, res, next) {
  try {
    const { accessToken, refreshToken } = await authService.refreshUserSession(req.cookies?.hemosync_refresh);
    setSessionCookies(res, accessToken, refreshToken);
    return successResponse(res, { token: accessToken }, 'Session refreshed');
  } catch (err) {
    if (err.statusCode === 401 || err.statusCode === 404) {
      res.clearCookie('hemosync_token', COOKIE_OPTIONS);
      res.clearCookie('hemosync_refresh', COOKIE_OPTIONS);
      return errorResponse(res, 'Session expired. Please sign in again.', 401);
    }
    next(err);
  }
}

export async function logout(req, res, next) {
  try {
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';
    await authService.logoutUser({ user: req.user, ipAddress });

    res.clearCookie('hemosync_token', COOKIE_OPTIONS);
    res.clearCookie('hemosync_refresh', COOKIE_OPTIONS);

    return successResponse(res, null, 'Signed out successfully');
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    const currentUser = await authService.getCurrentUser(req.user.id);
    return successResponse(res, currentUser, 'Session profile retrieved');
  } catch (err) {
    next(err);
  }
}
