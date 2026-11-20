import { Router } from 'express';
import * as inventoryController from '../controllers/inventoryController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Queries
router.get('/summary', inventoryController.getInventorySummary);
router.get('/', inventoryController.listInventory);
router.get('/:id', inventoryController.getUnitById);

// Mutations (Restricted to BLOOD_BANK_STAFF and PLATFORM_ADMIN)
router.post(
  '/',
  authorize(['BLOOD_BANK_STAFF', 'PLATFORM_ADMIN']),
  inventoryController.registerUnit
);

router.patch(
  '/:id/status',
  authorize(['BLOOD_BANK_STAFF', 'PLATFORM_ADMIN']),
  inventoryController.updateUnitStatus
);

router.patch(
  '/:id',
  authorize(['BLOOD_BANK_STAFF', 'PLATFORM_ADMIN']),
  inventoryController.updateUnitDetails
);

export default router;

