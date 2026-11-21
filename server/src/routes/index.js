import { Router } from 'express';
import healthRoutes from './healthRoutes.js';
import authRoutes from './authRoutes.js';
import adminRoutes from './adminRoutes.js';
import institutionRoutes from './institutionRoutes.js';
import inventoryRoutes from './inventoryRoutes.js';
import requestRoutes from './requestRoutes.js';
import transferRoutes from './transferRoutes.js';
import expiryRoutes from './expiryRoutes.js';
import forecastRoutes from './forecastRoutes.js';
import intelligenceRoutes from './intelligenceRoutes.js';
import notificationRoutes from './notificationRoutes.js';
import auditLogRoutes from './auditLogRoutes.js';

const apiRouter = Router();

// Health check endpoint
apiRouter.use('/health', healthRoutes);

// Module 3: Authentication & Admin User Management
apiRouter.use('/auth', authRoutes);
apiRouter.use('/admin', adminRoutes);

// Module 4: Institution Management
apiRouter.use('/institutions', institutionRoutes);

// Module 5: Blood Inventory Management
apiRouter.use('/inventory', inventoryRoutes);

// Module 6 & 7: Hospital Blood Request Management & Allocation Engine
apiRouter.use('/requests', requestRoutes);

// Module 8: Inter-Institution Transfers
apiRouter.use('/transfers', transferRoutes);

// Module 9: Expiry Monitoring & Redistribution
apiRouter.use('/expiry', expiryRoutes);

// Module 10 / AI 0–7: AI Intelligence & Forecasting Engine
apiRouter.use('/forecasts', forecastRoutes);
apiRouter.use('/intelligence', intelligenceRoutes);

// Module 12: Notifications & Audit Trails
apiRouter.use('/notifications', notificationRoutes);
apiRouter.use('/audit-logs', auditLogRoutes);

export default apiRouter;
