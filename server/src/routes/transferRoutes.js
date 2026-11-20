import { Router } from 'express';
import * as transferController from '../controllers/transferController.js';
import { authenticate } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Queries
router.get('/', transferController.listTransfers);
router.get('/:id', transferController.getTransferById);

// Transfer lifecycle mutations
router.post('/', transferController.createTransfer);
router.patch('/:id/approve', transferController.approveTransfer);
router.patch('/:id/reject', transferController.rejectTransfer);
router.patch('/:id/dispatch', transferController.dispatchTransfer);
router.patch('/:id/receive', transferController.receiveTransfer);

export default router;

