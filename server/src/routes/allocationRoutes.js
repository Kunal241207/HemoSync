import { Router } from 'express';
import * as allocationController from '../controllers/allocationController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

router.get(
  '/:id/matches',
  authorize(['BLOOD_BANK_STAFF', 'HOSPITAL_STAFF', 'PLATFORM_ADMIN']),
  allocationController.getMatches
);

router.post(
  '/:id/allocate',
  authorize(['BLOOD_BANK_STAFF', 'PLATFORM_ADMIN']),
  allocationController.createAllocation
);

export default router;
