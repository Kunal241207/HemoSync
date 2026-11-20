import * as requestService from '../services/requestService.js';
import {
  createRequestSchema,
  cancelRequestSchema,
  updateRequestStatusSchema,
  queryRequestSchema
} from '../validators/requestValidator.js';
import { successResponse } from '../utils/apiResponse.js';

export async function createRequest(req, res, next) {
  try {
    const validated = createRequestSchema.parse(req.body);
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const newRequest = await requestService.createBloodRequest(
      req.user,
      validated,
      ipAddress
    );

    return successResponse(res, newRequest, 'Blood request submitted successfully', 201);
  } catch (err) {
    next(err);
  }
}

export async function listRequests(req, res, next) {
  try {
    const validatedQuery = queryRequestSchema.parse(req.query);
    const result = await requestService.listBloodRequests(req.user, validatedQuery);
    return successResponse(res, result, 'Blood requests retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getRequestSummary(req, res, next) {
  try {
    const hospitalId = req.query.hospitalId || null;
    const summary = await requestService.getRequestSummary(req.user, hospitalId);
    return successResponse(res, summary, 'Blood request summary statistics retrieved');
  } catch (err) {
    next(err);
  }
}

export async function getRequestById(req, res, next) {
  try {
    const request = await requestService.getRequestById(req.user, req.params.id);
    return successResponse(res, request, 'Blood request details retrieved');
  } catch (err) {
    next(err);
  }
}

export async function cancelRequest(req, res, next) {
  try {
    const validated = cancelRequestSchema.parse(req.body || {});
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const cancelled = await requestService.cancelBloodRequest(
      req.user,
      req.params.id,
      validated,
      ipAddress
    );

    return successResponse(res, cancelled, 'Blood request cancelled successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateRequestStatus(req, res, next) {
  try {
    const validated = updateRequestStatusSchema.parse(req.body);
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const updated = await requestService.updateRequestStatus(
      req.user,
      req.params.id,
      validated,
      ipAddress
    );

    return successResponse(res, updated, 'Blood request status updated successfully');
  } catch (err) {
    next(err);
  }
}
