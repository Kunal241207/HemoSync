import { prisma } from '../config/db.js';

const AUDIT_ACTIONS = new Set([
  'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT', 'ALLOCATE',
  'TRANSFER_REQUEST', 'TRANSFER_APPROVE', 'TRANSFER_DISPATCH',
  'TRANSFER_RECEIVE', 'STATUS_CHANGE'
]);

/** Append an audit event. Audit entries are created only; this service exposes no update/delete operation. */
export async function recordAuditEvent({
  actorId = null,
  institutionId = null,
  entityType,
  entityId,
  action,
  metadata = undefined,
  ipAddress = null,
  userAgent = null,
  createdAt
}) {
  if (!entityType || !entityId) throw new TypeError('entityType and entityId are required');
  if (!AUDIT_ACTIONS.has(action)) throw new TypeError(`Unsupported audit action: ${action}`);

  return prisma.auditLog.create({
    data: {
      actorId,
      institutionId,
      entityType,
      entityId,
      action,
      metadata: metadata === undefined && !ipAddress && !userAgent
        ? undefined
        : { ...(metadata && typeof metadata === 'object' ? metadata : { value: metadata }),
            ...(ipAddress ? { ipAddress } : {}),
            ...(userAgent ? { userAgent } : {}) },
      ...(createdAt ? { createdAt } : {})
    }
  });
}

/** Read audit events with strict institution scoping for non-admin users. */
export async function getAuditLogs(actorUser, filters = {}) {
  const { institutionId, entityType, entityId, action, page = 1, limit = 50 } = filters;
  const where = {};

  if (actorUser.role !== 'PLATFORM_ADMIN') {
    if (!actorUser.institutionId) {
      const error = new Error('User is not associated with an institution');
      error.statusCode = 403;
      throw error;
    }
    where.institutionId = actorUser.institutionId;
  } else if (institutionId) {
    where.institutionId = institutionId;
  }
  if (entityType) where.entityType = entityType;
  if (entityId) where.entityId = entityId;
  if (action) where.action = action;

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.max(1, Math.min(100, Number(limit) || 50));
  const skip = (pageNum - 1) * limitNum;
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where, skip, take: limitNum, orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, name: true, email: true, role: true } },
        institution: { select: { id: true, name: true, type: true } }
      }
    })
  ]);
  return { logs, pagination: { total, page: pageNum, limit: limitNum, totalPages: Math.ceil(total / limitNum) || 1 } };
}
