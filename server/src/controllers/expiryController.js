import * as expiryService from '../services/expiryService.js';
import { successResponse } from '../utils/apiResponse.js';
import {
  queryAlertsSchema,
  resolveAlertSchema,
  redistributionQuerySchema,
  runJobSchema
} from '../validators/expiryValidator.js';

export async function getAlerts(req, res, next) {
  try {
    const validatedQuery = queryAlertsSchema.parse(req.query);
    const result = await expiryService.getExpiryAlerts(req.user, validatedQuery);
    return successResponse(res, result, 'Expiry alerts retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function resolveAlert(req, res, next) {
  try {
    const validatedData = resolveAlertSchema.parse(req.body);
    const alert = await expiryService.resolveExpiryAlert(req.user, req.params.id, validatedData);
    return successResponse(res, alert, 'Expiry alert resolved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getSummary(req, res, next) {
  try {
    const summary = await expiryService.getExpirySummary(req.user, req.query);
    return successResponse(res, summary, 'Expiry summary retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getRedistributionSuggestions(req, res, next) {
  try {
    const validatedQuery = redistributionQuerySchema.parse(req.query);
    const result = await expiryService.getRedistributionSuggestions(req.user, validatedQuery);
    return successResponse(res, result, 'Redistribution suggestions retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function runJob(req, res, next) {
  try {
    const validatedBody = runJobSchema.parse(req.body);
    const result = await expiryService.runExpiryMonitoringJob({
      referenceDate: validatedBody.referenceDate,
      actorUserId: req.user.id
    });
    return successResponse(res, result, 'Expiry monitoring job executed successfully');
  } catch (err) {
    next(err);
  }
}

