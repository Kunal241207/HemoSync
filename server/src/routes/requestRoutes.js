import { Router } from 'express';
import * as requestController from '../controllers/requestController.js';
import * as allocationController from '../controllers/allocationController.js';
import * as transferController from '../controllers/transferController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

// All request endpoints require authentication
router.use(authenticate);

// Queries
router.get('/', requestController.listRequests);
router.get('/summary', requestController.getRequestSummary);
router.get('/:id', requestController.getRequestById);

// Module 7: Deterministic Inventory Matching & Allocation Engine
router.get('/:id/matches', allocationController.getMatches);
router.post(
  '/:id/allocations',
  authorize(['HOSPITAL_STAFF', 'BLOOD_BANK_STAFF', 'PLATFORM_ADMIN']),
  allocationController.createAllocation
);

// Module 8: Nearby Participating Inventory Search
router.get('/:id/nearby-matches', transferController.getNearbyMatches);

// Hospital Staff & Admin: Submit blood request
router.post(
  '/',
  authorize(['HOSPITAL_STAFF', 'PLATFORM_ADMIN']),
  requestController.createRequest
);

// Hospital Staff & Admin: Cancel open request
router.patch(
  '/:id/cancel',
  authorize(['HOSPITAL_STAFF', 'PLATFORM_ADMIN']),
  requestController.cancelRequest
);

// Blood Bank Staff & Admin: Update status / Validate request
router.patch(
  '/:id/status',
  authorize(['BLOOD_BANK_STAFF', 'PLATFORM_ADMIN']),
  requestController.updateRequestStatus
);

export default router;
