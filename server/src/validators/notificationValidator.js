import { z } from 'zod';

export const queryNotificationsSchema = z.object({
  unreadOnly: z.enum(['true', 'false']).optional().default('false'),
  type: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});

export const queryAuditLogsSchema = z.object({
  institutionId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(50)
});

