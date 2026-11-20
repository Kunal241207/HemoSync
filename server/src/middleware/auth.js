import { verifyAccessToken } from '../utils/token.js';
import { prisma } from '../config/db.js';
import { errorResponse } from '../utils/apiResponse.js';

export async function authenticate(req, res, next) {
  try {
    let token = null;

    if (req.cookies && req.cookies.hemosync_token) {
      token = req.cookies.hemosync_token;
    }
    else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return errorResponse(res, 'Authentication required. Please sign in.', 401);
    }

    const decoded = verifyAccessToken(token);
    if (!decoded || !decoded.userId) {
      return errorResponse(res, 'Invalid or expired session. Please sign in again.', 401);
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      include: {
        institution: {
          select: {
            id: true,
            name: true,
            type: true,
            verificationStatus: true,
            isActive: true
          }
        }
      }
    });

    if (!user || !user.isActive) {
      return errorResponse(res, 'User account is deactivated or no longer exists.', 401);
    }

    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      institutionId: user.institutionId,
      institution: user.institution
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function authorize(allowedRoles = []) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'Authentication required.', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      return errorResponse(
        res,
        `Access denied: role '${req.user.role}' is not authorized for this resource. Required: [${allowedRoles.join(', ')}]`,
        403
      );
    }

    next();
  };
}

export function enforceInstitutionScope(targetInstitutionIdResolver) {
  return (req, res, next) => {
    if (!req.user) {
      return errorResponse(res, 'Authentication required.', 401);
    }

    if (req.user.role === 'PLATFORM_ADMIN') {
      return next();
    }

    const targetInstitutionId = typeof targetInstitutionIdResolver === 'function'
      ? targetInstitutionIdResolver(req)
      : req.params[targetInstitutionIdResolver] || req.body[targetInstitutionIdResolver] || req.query[targetInstitutionIdResolver];

    if (!targetInstitutionId || targetInstitutionId !== req.user.institutionId) {
      return errorResponse(
        res,
        'Access denied: You do not have permission to access another institution\'s records.',
        403
      );
    }

    next();
  };
}

