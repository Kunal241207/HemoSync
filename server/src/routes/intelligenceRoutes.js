import { Router } from 'express';
import * as intelligenceController from '../controllers/intelligenceController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Shortage risk projection
router.get('/shortages', intelligenceController.getShortages);

// Surplus & Expiry exposure analytics
router.get('/surplus', intelligenceController.getSurplus);

// Constrained redistribution recommendations
router.get('/redistribution-suggestions', intelligenceController.getRedistributionRecommendations);

// Anomaly detection & review workflow
router.get('/anomalies', intelligenceController.getAnomalies);
router.post(
  '/anomalies/detect',
  authorize(['PLATFORM_ADMIN', 'HOSPITAL_STAFF', 'BLOOD_BANK_STAFF']),
  intelligenceController.detectAnomalies
);
router.patch(
  '/anomalies/:id/review',
  authorize(['PLATFORM_ADMIN', 'HOSPITAL_STAFF', 'BLOOD_BANK_STAFF']),
  intelligenceController.reviewAnomaly
);

// Model backtest evaluations
router.get('/model-evaluations', intelligenceController.getModelEvaluations);

export default router;

