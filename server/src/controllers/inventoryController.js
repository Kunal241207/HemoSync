import * as inventoryService from '../services/inventoryService.js';
import {
  createUnitSchema,
  updateUnitStatusSchema,
  updateUnitSchema,
  queryInventorySchema
} from '../validators/inventoryValidator.js';
import { successResponse } from '../utils/apiResponse.js';

export async function listInventory(req, res, next) {
  try {
    const validatedQuery = queryInventorySchema.parse(req.query);
    const result = await inventoryService.listInventory(req.user, validatedQuery);
    return successResponse(res, result, 'Inventory retrieved successfully');
  } catch (err) {
    next(err);
  }
}

export async function getInventorySummary(req, res, next) {
  try {
    const institutionId = req.query.institutionId;
    const summary = await inventoryService.getInventorySummary(req.user, institutionId);
    return successResponse(res, summary, 'Inventory summary calculated successfully');
  } catch (err) {
    next(err);
  }
}

export async function getUnitById(req, res, next) {
  try {
    const unit = await inventoryService.getUnitById(req.user, req.params.id);
    return successResponse(res, unit, 'Blood unit details retrieved');
  } catch (err) {
    next(err);
  }
}

export async function registerUnit(req, res, next) {
  try {
    const validated = createUnitSchema.parse(req.body);
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const unit = await inventoryService.registerUnit(req.user, validated, ipAddress);
    return successResponse(res, unit, 'Blood unit registered successfully', 201);
  } catch (err) {
    next(err);
  }
}

export async function updateUnitStatus(req, res, next) {
  try {
    const validated = updateUnitStatusSchema.parse(req.body);
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const updated = await inventoryService.updateUnitStatus(
      req.user,
      req.params.id,
      validated,
      ipAddress
    );
    return successResponse(res, updated, 'Unit status updated successfully');
  } catch (err) {
    next(err);
  }
}

export async function updateUnitDetails(req, res, next) {
  try {
    const validated = updateUnitSchema.parse(req.body);
    const ipAddress = req.ip || req.connection?.remoteAddress || 'unknown';

    const updated = await inventoryService.updateUnitDetails(
      req.user,
      req.params.id,
      validated,
      ipAddress
    );
    return successResponse(res, updated, 'Unit details updated successfully');
  } catch (err) {
    next(err);
  }
}

