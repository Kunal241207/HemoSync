import { Router } from 'express';
import * as forecastController from '../controllers/forecastController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = Router();

router.use(authenticate);

// Simple demand forecast summary (sample data / illustration)
router.get('/summary', forecastController.getSimpleForecast);

// Historical demand series
router.get('/history', forecastController.getHistoricalDemand);

// Forecast generation and listing
router.post(
  '/generate',
  authorize(['PLATFORM_ADMIN', 'HOSPITAL_STAFF', 'BLOOD_BANK_STAFF']),
  forecastController.generateForecasts
);
router.get('/', forecastController.getForecasts);

// Seed synthetic history (admin / dev utility)
router.post(
  '/seed-synthetic',
  authorize(['PLATFORM_ADMIN']),
  forecastController.seedSyntheticHistory
);

export default router;

