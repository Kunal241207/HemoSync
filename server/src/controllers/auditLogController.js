import * as auditLogService from '../services/auditLogService.js';
import { successResponse } from '../utils/apiResponse.js';
import { queryAuditLogsSchema } from '../validators/notificationValidator.js';

export async function getAuditLogs(req, res, next) {
  try {
    const validated = queryAuditLogsSchema.parse(req.query);
    const result = await auditLogService.getAuditLogs(req.user, validated);
    return successResponse(res, result, 'Audit logs retrieved successfully');
  } catch (err) {
    next(err);
  }
}

