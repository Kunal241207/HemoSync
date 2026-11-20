import * as forecastService from '../services/forecastService.js';
import * as syntheticService from '../services/syntheticHistoryService.js';
import { successResponse } from '../utils/apiResponse.js';
import {
  historicalDemandQuerySchema,
  generateForecastSchema,
  forecastQuerySchema
} from '../validators/intelligenceValidator.js';

export async function getSimpleForecast(req, res, next) {
  try {
    const institutionId = req.query.institutionId || (req.user?.role !== 'PLATFORM_ADMIN' ? req.user?.institutionId : null);
    const result = await forecastService.getSimpleDemandForecast(institutionId);
    return successResponse(res, result, 'Simple demand forecast retrieved');
  } catch (err) {
    next(err);
  }
}

export async function getHistoricalDemand(req, res, next) {
  try {
    const validated = historicalDemandQuerySchema.parse(req.query);

    let targetInstitutionId = null;
    if (req.user.role !== 'PLATFORM_ADMIN') {
      if (!req.user.institutionId) {
        return res.status(403).json({ success: false, message: 'User is not associated with an institution' });
      }
      targetInstitutionId = req.user.institutionId;
    } else {
      targetInstitutionId = validated.institutionId || req.user.institutionId;
    }

    const history = await forecastService.getDailyHistoricalDemand({
      institutionId: targetInstitutionId,
      componentType: validated.componentType,
      lookbackDays: validated.lookbackDays
    });

    return successResponse(res, { institutionId: targetInstitutionId, history }, 'Historical demand retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function generateForecasts(req, res, next) {
  try {
    const validated = generateForecastSchema.parse(req.body);

    let targetInstitutionId = null;
    if (req.user.role !== 'PLATFORM_ADMIN') {
      if (!req.user.institutionId) {
        return res.status(403).json({ success: false, message: 'User is not associated with an institution' });
      }
      targetInstitutionId = req.user.institutionId;
    } else {
      targetInstitutionId = validated.institutionId || req.user.institutionId;
    }

    const forecasts = await forecastService.generateAndPersistAllForecasts(
      targetInstitutionId,
      validated.horizonDays
    );

    return successResponse(res, forecasts, 'Demand forecasts generated and persisted successfully');
  } catch (err) {
    next(err);
  }
}

export async function getForecasts(req, res, next) {
  try {
    const validated = forecastQuerySchema.parse(req.query);
    const forecasts = await forecastService.getPersistedForecasts(req.user, validated);
    return successResponse(res, forecasts, 'Persisted forecasts retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function seedSyntheticHistory(req, res, next) {
  try {
    const { days = 180, seed = 424242, force = false } = req.body || {};
    const result = await syntheticService.seedSyntheticRequestHistory({ days, seed, force });
    return successResponse(res, result, 'Synthetic request history populated successfully');
  } catch (err) {
    next(err);
  }
}

