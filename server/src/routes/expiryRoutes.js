import { Router } from 'express';
import * as expiryController from '../controllers/expiryController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All expiry endpoints require authentication
router.use(authenticate);

// Expiry alerts & summary
router.get('/alerts', expiryController.getAlerts);
router.patch('/alerts/:id/resolve', expiryController.resolveAlert);
router.get('/summary', expiryController.getSummary);

// Redistribution recommendations
router.get('/redistribution-suggestions', expiryController.getRedistributionSuggestions);

// Manual trigger for the idempotent monitoring job (Admins and Blood Bank Staff)
router.post(
  '/run-job',
  authorize(['PLATFORM_ADMIN', 'BLOOD_BANK_STAFF', 'HOSPITAL_STAFF']),
  expiryController.runJob
);

export default router;

