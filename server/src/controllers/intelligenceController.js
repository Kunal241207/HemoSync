import * as intelligenceService from '../services/intelligenceService.js';
import { successResponse } from '../utils/apiResponse.js';
import {
  shortageQuerySchema,
  surplusQuerySchema,
  rankedRedistributionQuerySchema,
  anomalyQuerySchema,
  reviewAnomalySchema
} from '../validators/intelligenceValidator.js';

export async function getShortages(req, res, next) {
  try {
    const validated = shortageQuerySchema.parse(req.query);
    const result = await intelligenceService.getShortageProjections(req.user, validated);
    return successResponse(res, result, 'Shortage risk projections calculated successfully');
  } catch (err) {
    next(err);
  }
}

export async function getSurplus(req, res, next) {
  try {
    const validated = surplusQuerySchema.parse(req.query);
    const result = await intelligenceService.getSurplusAndExpiryExposure(req.user, validated);
    return successResponse(res, result, 'Surplus and expiry exposure analytics retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getRedistributionRecommendations(req, res, next) {
  try {
    const validated = rankedRedistributionQuerySchema.parse(req.query);
    const result = await intelligenceService.getRankedRedistributionSuggestions(req.user, validated);
    return successResponse(res, result, 'Ranked redistribution recommendations retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getAnomalies(req, res, next) {
  try {
    const validated = anomalyQuerySchema.parse(req.query);
    const result = await intelligenceService.getAnomalyEvents(req.user, validated);
    return successResponse(res, result, 'Anomaly events retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function detectAnomalies(req, res, next) {
  try {
    let targetInstId = req.user.institutionId;
    if (req.user.role === 'PLATFORM_ADMIN' && req.body.institutionId) {
      targetInstId = req.body.institutionId;
    }
    if (!targetInstId) {
      return res.status(400).json({ success: false, message: 'Institution ID required to run anomaly detection' });
    }

    const detected = await intelligenceService.detectAndRecordAnomalies(targetInstId);
    return successResponse(res, { count: detected.length, events: detected }, 'Anomaly detection scan completed');
  } catch (err) {
    next(err);
  }
}

export async function reviewAnomaly(req, res, next) {
  try {
    const validated = reviewAnomalySchema.parse(req.body);
    const updated = await intelligenceService.reviewAnomalyEvent(req.user, req.params.id, validated);
    return successResponse(res, updated, 'Anomaly event reviewed successfully');
  } catch (err) {
    next(err);
  }
}

export async function getModelEvaluations(req, res, next) {
  try {
    const result = await intelligenceService.getModelEvaluations(req.user, req.query);
    return successResponse(res, result, 'Model evaluations retrieved successfully');
  } catch (err) {
    next(err);
  }
}

