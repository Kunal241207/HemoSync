import { prisma } from '../config/db.js';
import { logger } from '../utils/logger.js';

/**
 * Creates a notification for a specific user.
 * Idempotent: checks for duplicate active notifications with the same title, recipient, and type within 5 minutes.
 */
export async function createNotification(params) {
  const { recipientUserId, institutionId, type = 'SYSTEM', title, message, metadata = null } = params;

  // Idempotency deduplication check: within last 5 minutes
  const recentWindow = new Date(Date.now() - 5 * 60 * 1000);
  const existing = await prisma.notification.findFirst({
    where: {
      recipientUserId,
      type,
      title,
      createdAt: { gte: recentWindow }
    }
  });

  if (existing) {
    return existing;
  }

  return prisma.notification.create({
    data: {
      recipientUserId,
      institutionId,
      type,
      title,
      message,
      metadata: metadata || undefined
    }
  });
}

/**
 * Broadcasts an operational notification to all active staff members belonging to an institution.
 */
export async function notifyInstitutionStaff(institutionId, params) {
  if (!institutionId) return [];

  const staffUsers = await prisma.user.findMany({
    where: {
      institutionId,
      isActive: true
    },
    select: { id: true }
  });

  const created = [];
  for (const user of staffUsers) {
    const notif = await createNotification({
      ...params,
      recipientUserId: user.id,
      institutionId
    });
    created.push(notif);
  }

  return created;
}

/**
 * Retrieves notifications for the current authenticated user.
 */
export async function getNotifications(actorUser, filters = {}) {
  const { unreadOnly = 'false', type, page = 1, limit = 20 } = filters;

  const where = {
    recipientUserId: actorUser.id
  };

  if (unreadOnly === 'true') {
    where.readAt = null;
  }
  if (type) {
    where.type = type;
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const [total, unreadCount, notifications] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.count({ where: { recipientUserId: actorUser.id, readAt: null } }),
    prisma.notification.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { createdAt: 'desc' }
    })
  ]);

  return {
    unreadCount,
    notifications,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    }
  };
}

/**
 * Marks a specific notification as read.
 */
export async function markNotificationAsRead(actorUser, notificationId) {
  const notif = await prisma.notification.findUnique({
    where: { id: notificationId }
  });

  if (!notif) {
    const error = new Error(`Notification with ID ${notificationId} not found`);
    error.statusCode = 404;
    throw error;
  }

  if (notif.recipientUserId !== actorUser.id && actorUser.role !== 'PLATFORM_ADMIN') {
    const error = new Error('Access denied: Cannot modify another user\'s notification');
    error.statusCode = 403;
    throw error;
  }

  if (notif.readAt) {
    return notif;
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { readAt: new Date() }
  });
}

/**
 * Marks all notifications for the actor user as read.
 */
export async function markAllNotificationsAsRead(actorUser) {
  const result = await prisma.notification.updateMany({
    where: {
      recipientUserId: actorUser.id,
      readAt: null
    },
    data: { readAt: new Date() }
  });

  return { markedCount: result.count };
}


