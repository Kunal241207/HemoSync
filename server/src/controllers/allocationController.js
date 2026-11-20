import * as allocationService from '../services/allocationService.js';
import {
  matchQuerySchema,
  createAllocationSchema
} from '../validators/allocationValidator.js';
import { successResponse } from '../utils/apiResponse.js';

export async function getMatches(req, res, next) {
  try {
    const validatedQuery = matchQuerySchema.parse(req.query);
    const result = await allocationService.findMatchesForRequest(
      req.user,
      req.params.id,
      validatedQuery
    );
    return successResponse(res, result, 'Compatible inventory matches retrieved');
  } catch (err) {
    next(err);
  }
}

export async function createAllocation(req, res, next) {
  try {
    const validated = createAllocationSchema.parse(req.body);
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const result = await allocationService.allocateUnitsForRequest(
      req.user,
      req.params.id,
      validated,
      ipAddress
    );

    return successResponse(res, result, 'Blood units allocated successfully', 201);
  } catch (err) {
    next(err);
  }
}

