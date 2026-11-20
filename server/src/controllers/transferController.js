import * as transferService from '../services/transferService.js';
import {
  nearbyMatchQuerySchema,
  createTransferSchema,
  queryTransfersSchema,
  approveTransferSchema,
  rejectTransferSchema,
  dispatchTransferSchema,
  receiveTransferSchema
} from '../validators/transferValidator.js';
import { successResponse } from '../utils/apiResponse.js';

export async function getNearbyMatches(req, res, next) {
  try {
    const validatedQuery = nearbyMatchQuerySchema.parse(req.query);
    const result = await transferService.findNearbyMatchesForRequest(
      req.user,
      req.params.id,
      validatedQuery
    );
    return successResponse(res, result, 'Nearby inventory matches retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function createTransfer(req, res, next) {
  try {
    const validated = createTransferSchema.parse(req.body);
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const result = await transferService.createTransfer(
      req.user,
      validated,
      ipAddress
    );

    return successResponse(res, result, 'Transfer request submitted successfully', 201);
  } catch (err) {
    next(err);
  }
}

export async function listTransfers(req, res, next) {
  try {
    const validatedQuery = queryTransfersSchema.parse(req.query);
    const result = await transferService.listTransfers(req.user, validatedQuery);
    return successResponse(res, result, 'Transfers retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getTransferById(req, res, next) {
  try {
    const result = await transferService.getTransferById(req.user, req.params.id);
    return successResponse(res, result, 'Transfer details retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function approveTransfer(req, res, next) {
  try {
    const validated = approveTransferSchema.parse(req.body || {});
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const result = await transferService.approveTransfer(
      req.user,
      req.params.id,
      validated,
      ipAddress
    );

    return successResponse(res, result, 'Transfer approved and units reserved');
  } catch (err) {
    next(err);
  }
}

export async function rejectTransfer(req, res, next) {
  try {
    const validated = rejectTransferSchema.parse(req.body || {});
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const result = await transferService.rejectTransfer(
      req.user,
      req.params.id,
      validated,
      ipAddress
    );

    return successResponse(res, result, 'Transfer rejected successfully');
  } catch (err) {
    next(err);
  }
}

export async function dispatchTransfer(req, res, next) {
  try {
    const validated = dispatchTransferSchema.parse(req.body || {});
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const result = await transferService.dispatchTransfer(
      req.user,
      req.params.id,
      validated,
      ipAddress
    );

    return successResponse(res, result, 'Transfer dispatch recorded successfully');
  } catch (err) {
    next(err);
  }
}

export async function receiveTransfer(req, res, next) {
  try {
    const validated = receiveTransferSchema.parse(req.body || {});
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const result = await transferService.receiveTransfer(
      req.user,
      req.params.id,
      validated,
      ipAddress
    );

    return successResponse(res, result, 'Transfer delivery and unit ownership confirmed');
  } catch (err) {
    next(err);
  }
}

