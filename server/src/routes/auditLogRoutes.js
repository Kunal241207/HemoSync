import { Router } from 'express';
import * as auditLogController from '../controllers/auditLogController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get('/', auditLogController.getAuditLogs);

export default router;

