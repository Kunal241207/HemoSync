import bcrypt from 'bcrypt';
import { prisma } from '../config/db.js';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../utils/token.js';

export async function loginUser({ email, password, ipAddress, userAgent }) {
  const normalizedEmail = email.toLowerCase().trim();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
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
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    const error = new Error('Invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const payload = {
    userId: user.id,
    role: user.role,
    institutionId: user.institutionId
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.auditLog.create({
    data: {
      actorId: user.id,
      institutionId: user.institutionId,
      entityType: 'USER',
      entityId: user.id,
      action: 'LOGIN',
      metadata: {
        ip: ipAddress,
        userAgent: userAgent || 'unknown'
      }
    }
  });

  const sanitizedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    institution: user.institution
  };

  return { user: sanitizedUser, accessToken, refreshToken };
}

export async function refreshUserSession(refreshToken) {
  const payload = refreshToken ? verifyRefreshToken(refreshToken) : null;
  if (!payload?.userId) {
    const error = new Error('Session expired. Please sign in again.');
    error.statusCode = 401;
    throw error;
  }

  const user = await getCurrentUser(payload.userId);
  const tokenPayload = {
    userId: user.id,
    role: user.role,
    institutionId: user.institutionId
  };

  return {
    user,
    accessToken: generateAccessToken(tokenPayload),
    refreshToken: generateRefreshToken(tokenPayload)
  };
}

export async function registerUser({ name, email, password, institutionId, ipAddress, userAgent }) {
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (existing) {
    const error = new Error('An account with this email address already exists');
    error.statusCode = 409;
    throw error;
  }

  const assignedRole = 'HOSPITAL_STAFF';
  let assignedInstitutionId = institutionId || null;

  if (assignedInstitutionId) {
    const institution = await prisma.institution.findFirst({
      where: { id: assignedInstitutionId, type: 'HOSPITAL', isActive: true },
      select: { id: true }
    });
    if (!institution) {
      const error = new Error('An active hospital institution is required');
      error.statusCode = 400;
      throw error;
    }
    assignedInstitutionId = institution.id;
  } else {
    const defaultInstitution = await prisma.institution.findFirst({
      where: { type: 'HOSPITAL', isActive: true },
      select: { id: true }
    });
    if (!defaultInstitution) {
      const error = new Error('No active hospital institution is available');
      error.statusCode = 400;
      throw error;
    }
    assignedInstitutionId = defaultInstitution.id;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: assignedRole,
      institutionId: assignedInstitutionId,
      isActive: true
    },
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

  await prisma.auditLog.create({
    data: {
      actorId: newUser.id,
      institutionId: newUser.institutionId,
      entityType: 'USER',
      entityId: newUser.id,
      action: 'CREATE',
      metadata: {
        registeredBySelf: true,
        ip: ipAddress,
        userAgent: userAgent || 'unknown'
      }
    }
  });

  const sanitizedUser = {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    institutionId: newUser.institutionId,
    institution: newUser.institution
  };

  return { user: sanitizedUser };
}

export async function logoutUser({ user, ipAddress }) {
  if (user?.id) {
    await prisma.auditLog.create({
      data: {
        actorId: user.id,
        institutionId: user.institutionId,
        entityType: 'USER',
        entityId: user.id,
        action: 'LOGOUT',
        metadata: {
          ip: ipAddress
        }
      }
    });
  }
  return true;
}

export async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      institution: {
        select: {
          id: true,
          name: true,
          type: true,
          address: true,
          verificationStatus: true,
          isActive: true
        }
      }
    }
  });

  if (!user || !user.isActive) {
    const error = new Error('User not found or deactivated');
    error.statusCode = 404;
    throw error;
  }

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    institutionId: user.institutionId,
    institution: user.institution,
    createdAt: user.createdAt
  };
}

export async function createUserByAdmin({ actorUser, userData, ipAddress }) {
  const { name, email, password, role, institutionId } = userData;
  const normalizedEmail = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail }
  });

  if (existing) {
    const error = new Error('A user with this email address already exists');
    error.statusCode = 409;
    throw error;
  }

  if (institutionId) {
    const institution = await prisma.institution.findUnique({
      where: { id: institutionId }
    });
    if (!institution) {
      const error = new Error('Selected institution does not exist');
      error.statusCode = 400;
      throw error;
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const newUser = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        name,
        email: normalizedEmail,
        passwordHash,
        role,
        institutionId: institutionId || null,
        isActive: true
      },
      include: {
        institution: {
          select: {
            id: true,
            name: true,
            type: true
          }
        }
      }
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: created.institutionId,
        entityType: 'USER',
        entityId: created.id,
        action: 'CREATE',
        metadata: {
          assignedRole: created.role,
          assignedInstitutionId: created.institutionId,
          createdByIp: ipAddress
        }
      }
    });

    return created;
  });

  return {
    id: newUser.id,
    name: newUser.name,
    email: newUser.email,
    role: newUser.role,
    institutionId: newUser.institutionId,
    institution: newUser.institution,
    createdAt: newUser.createdAt
  };
}

export async function listUsersForAdmin() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      institution: {
        select: {
          id: true,
          name: true,
          type: true,
          verificationStatus: true
        }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  return users;
}
