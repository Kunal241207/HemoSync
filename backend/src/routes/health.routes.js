import { Router } from 'express';
import { pool } from '../db/pool.js';

export const healthRouter = Router();

healthRouter.get('/', async (_request, response) => {
  const database = await pool.query('SELECT 1');
  response.json({
    service: 'hemosync-api',
    status: 'ok',
    database: database.rowCount === 1 ? 'connected' : 'unknown',
    timestamp: new Date().toISOString()
  });
});
