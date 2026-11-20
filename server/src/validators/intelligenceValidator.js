import { z } from 'zod';

export const historicalDemandQuerySchema = z.object({
  institutionId: z.string().uuid().optional(),
  componentType: z.enum(['RED_BLOOD_CELLS', 'PLATELETS', 'PLASMA']).optional(),
  lookbackDays: z.coerce.number().int().min(7).max(365).optional().default(180)
});

export const generateForecastSchema = z.object({
  institutionId: z.string().uuid().optional(),
  horizonDays: z.coerce.number().int().refine((val) => [7, 30].includes(val), {
    message: 'Horizon must be either 7 or 30 days'
  }).optional().default(7)
});

export const forecastQuerySchema = z.object({
  institutionId: z.string().uuid().optional(),
  componentType: z.enum(['RED_BLOOD_CELLS', 'PLATELETS', 'PLASMA']).optional(),
  horizonDays: z.coerce.number().int().optional().default(7)
});

export const shortageQuerySchema = z.object({
  institutionId: z.string().uuid().optional(),
  days: z.coerce.number().int().refine((val) => [7, 30].includes(val), {
    message: 'Days parameter must be 7 or 30'
  }).optional().default(7)
});

export const surplusQuerySchema = z.object({
  institutionId: z.string().uuid().optional(),
  componentType: z.enum(['RED_BLOOD_CELLS', 'PLATELETS', 'PLASMA']).optional()
});

export const rankedRedistributionQuerySchema = z.object({
  requestId: z.string().uuid().optional(),
  maxDistanceKm: z.coerce.number().positive().optional().default(100)
});

export const anomalyQuerySchema = z.object({
  institutionId: z.string().uuid().optional(),
  status: z.enum(['OPEN', 'ACKNOWLEDGED', 'DISMISSED', 'RESOLVED', 'ALL']).optional().default('OPEN'),
  componentType: z.enum(['RED_BLOOD_CELLS', 'PLATELETS', 'PLASMA']).optional(),
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20)
});

export const reviewAnomalySchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'DISMISSED', 'RESOLVED']),
  notes: z.string().trim().max(500).optional()
});

