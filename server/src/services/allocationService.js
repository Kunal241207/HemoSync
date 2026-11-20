import { prisma } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { notifyInstitutionStaff } from './notificationService.js';
import { broadcastWsEvent } from '../utils/websocket.js';
import {
  evaluateCompatibility,
  getCompatibleDonorProfiles,
  CLINICAL_RULES_VERSION
} from '../utils/compatibilityEngine.js';
import { deriveRequestQuantities } from '../utils/requestTransitions.js';

/**
 * Finds eligible, compatible inventory units for a blood request using FIFO-by-expiry ordering.
 */
export async function findMatchesForRequest(actorUser, requestId, options = {}) {
  const { institutionId, limit = 50 } = options;

  // 1. Retrieve and validate the blood request
  const request = await prisma.bloodRequest.findUnique({
    where: { id: requestId },
    include: {
      hospital: {
        select: { id: true, name: true, type: true, address: true, phone: true }
      },
      allocations: {
        where: { status: { in: ['RESERVED', 'FULFILLED'] } },
        include: {
          bloodUnit: {
            select: { id: true, unitCode: true, componentType: true, aboGroup: true, rhFactor: true }
          }
        }
      }
    }
  });

  if (!request) {
    const error = new Error(`Blood request with ID ${requestId} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Scoping: Hospital staff can only match inventory for their own hospital requests
  if (actorUser.role === 'HOSPITAL_STAFF' && request.hospitalId !== actorUser.institutionId) {
    const error = new Error('Access denied: You do not have permission to view matches for another hospital');
    error.statusCode = 403;
    throw error;
  }

  // Status check: Closed or cancelled requests cannot be matched
  const nonMatchableStatuses = ['CANCELLED', 'FULFILLED', 'UNFULFILLED'];
  if (nonMatchableStatuses.includes(request.status)) {
    const error = new Error(`Cannot match inventory for blood request in status '${request.status}'`);
    error.statusCode = 400;
    throw error;
  }

  // 2. Derive current fulfillment quantities
  const derived = deriveRequestQuantities(request);
  const remainingQuantity = derived.remainingQuantity;

  // 3. Resolve target inventory institution
  // Default to the requesting hospital's local inventory; blood bank staff or admins can specify a blood bank
  let targetInstitutionId = request.hospitalId;
  if (institutionId) {
    targetInstitutionId = institutionId;
  } else if (actorUser.role === 'BLOOD_BANK_STAFF' && actorUser.institutionId) {
    targetInstitutionId = actorUser.institutionId;
  }

  const targetInstitution = await prisma.institution.findUnique({
    where: { id: targetInstitutionId },
    select: { id: true, name: true, type: true, address: true }
  });

  if (!targetInstitution) {
    const error = new Error(`Target inventory institution ${targetInstitutionId} not found`);
    error.statusCode = 404;
    throw error;
  }

  // 4. Clinical compatibility configuration check
  const compatibleProfiles = getCompatibleDonorProfiles(
    request.requestedComponent,
    request.requestedABO,
    request.requestedRh
  );

  if (!compatibleProfiles) {
    return {
      requestId: request.id,
      requestedComponent: request.requestedComponent,
      requestedABO: request.requestedABO,
      requestedRh: request.requestedRh,
      requestedQuantity: request.requestedQuantity,
      fulfilledQuantity: derived.fulfilledQuantity,
      remainingQuantity,
      rulesVersion: CLINICAL_RULES_VERSION,
      manualReviewRequired: true,
      manualReviewReason: `No approved clinical compatibility rule configured for component ${request.requestedComponent}`,
      targetInstitution,
      candidateUnits: [],
      availableEligibleCount: 0,
      shortage: remainingQuantity,
      isSufficient: false
    };
  }

  // 5. Query eligible physical units in the target institution
  // Strict clinical eligibility: AVAILABLE, PASSED, RELEASED, unexpired in UTC
  const now = new Date();
  const eligibleUnits = await prisma.bloodUnit.findMany({
    where: {
      institutionId: targetInstitutionId,
      componentType: request.requestedComponent,
      inventoryStatus: 'AVAILABLE',
      testingStatus: 'PASSED',
      releaseStatus: 'RELEASED',
      expiryDate: { gt: now },
      // Exclude units tied to active reservations
      allocations: {
        none: { status: 'RESERVED' }
      },
      // Exclude units in active transit
      transferUnits: {
        none: {
          transfer: {
            status: { in: ['REQUESTED', 'APPROVED', 'RESERVED', 'DISPATCHED'] }
          }
        }
      }
    },
    orderBy: {
      expiryDate: 'asc' // FEFO: First Expiry, First Out
    },
    take: limit
  });

  // 6. Apply deterministic clinical compatibility rules to each candidate
  const compatibleUnits = [];
  for (const unit of eligibleUnits) {
    const evalResult = evaluateCompatibility(
      request.requestedComponent,
      request.requestedABO,
      request.requestedRh,
      unit.componentType,
      unit.aboGroup,
      unit.rhFactor
    );

    if (evalResult.compatible) {
      compatibleUnits.push({
        ...unit,
        isIdentical: evalResult.isIdentical,
        compatibilityReason: evalResult.reason,
        daysUntilExpiry: Math.ceil((new Date(unit.expiryDate).getTime() - now.getTime()) / 86400000)
      });
    }
  }

  // 7. Stable FEFO sorting with identical-match tie breaking
  compatibleUnits.sort((a, b) => {
    const diff = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
    if (diff !== 0) return diff;
    // Tie-breaker: prioritize identical ABO/Rh over alternative compatible
    if (a.isIdentical && !b.isIdentical) return -1;
    if (!a.isIdentical && b.isIdentical) return 1;
    return 0;
  });

  // 8. Calculate shortage and recommendation partition
  const availableEligibleCount = compatibleUnits.length;
  const candidateUnits = compatibleUnits.slice(0, remainingQuantity);
  const surplusUnits = compatibleUnits.slice(remainingQuantity);
  const shortage = Math.max(0, remainingQuantity - availableEligibleCount);
  const isSufficient = availableEligibleCount >= remainingQuantity;

  return {
    requestId: request.id,
    requestedComponent: request.requestedComponent,
    requestedABO: request.requestedABO,
    requestedRh: request.requestedRh,
    requestedQuantity: request.requestedQuantity,
    fulfilledQuantity: derived.fulfilledQuantity,
    remainingQuantity,
    rulesVersion: CLINICAL_RULES_VERSION,
    manualReviewRequired: false,
    targetInstitution,
    availableEligibleCount,
    candidateUnits,
    surplusUnitsCount: surplusUnits.length,
    shortage,
    isSufficient
  };
}

/**
 * Commits unit allocation to a blood request within an atomic PostgreSQL transaction.
 * Enforces conditional locking, prevents race conditions, and logs events and audit trails.
 */
export async function allocateUnitsForRequest(actorUser, requestId, allocationData, ipAddress) {
  const { unitIds, quantity, institutionId, notes } = allocationData;

  // 1. Authorization check
  const allowedRoles = ['HOSPITAL_STAFF', 'BLOOD_BANK_STAFF', 'PLATFORM_ADMIN'];
  if (!allowedRoles.includes(actorUser.role)) {
    const error = new Error('Access denied: Unauthorized role for allocating inventory');
    error.statusCode = 403;
    throw error;
  }

  // 2. Execute transactional allocation with conditional row locking
  const result = await prisma.$transaction(async (tx) => {
    // a. Fetch the request inside the transaction with active allocations
    const request = await tx.bloodRequest.findUnique({
      where: { id: requestId },
      include: {
        hospital: { select: { id: true, name: true } },
        allocations: {
          where: { status: { in: ['RESERVED', 'FULFILLED'] } },
          include: { bloodUnit: true }
        }
      }
    });

    if (!request) {
      const error = new Error(`Blood request with ID ${requestId} not found`);
      error.statusCode = 404;
      throw error;
    }

    // Role-based institution scoping
    if (actorUser.role === 'HOSPITAL_STAFF' && request.hospitalId !== actorUser.institutionId) {
      const error = new Error('Access denied: Cannot allocate inventory to another hospital\'s request');
      error.statusCode = 403;
      throw error;
    }

    // Status check
    const closedStatuses = ['CANCELLED', 'FULFILLED', 'UNFULFILLED'];
    if (closedStatuses.includes(request.status)) {
      const error = new Error(`Cannot allocate units for request in status '${request.status}'`);
      error.statusCode = 400;
      throw error;
    }

    // b. Enforce remaining quantity & prevent over-fulfillment
    const activeAllocationsCount = request.allocations.length;
    const remainingShortage = Math.max(0, request.requestedQuantity - activeAllocationsCount);

    if (remainingShortage <= 0) {
      const error = new Error('Request is already fully fulfilled. No additional units can be allocated.');
      error.statusCode = 400;
      throw error;
    }

    // c. Resolve target unit IDs to allocate
    let targetUnitIds = [];
    if (unitIds && unitIds.length > 0) {
      if (unitIds.length > remainingShortage) {
        const error = new Error(
          `Cannot allocate ${unitIds.length} units: Remaining shortage is only ${remainingShortage} units. Over-fulfillment prevented.`
        );
        error.statusCode = 400;
        throw error;
      }
      targetUnitIds = unitIds;
    } else if (quantity) {
      if (quantity > remainingShortage) {
        const error = new Error(
          `Requested allocation quantity (${quantity}) exceeds remaining shortage (${remainingShortage}). Over-fulfillment prevented.`
        );
        error.statusCode = 400;
        throw error;
      }

      // FIFO-by-expiry selection using SELECT ... FOR UPDATE SKIP LOCKED
      const targetInstId = institutionId || (actorUser.role === 'BLOOD_BANK_STAFF' ? actorUser.institutionId : request.hospitalId);

      let candidateUnits = [];
      try {
        const rawLockedUnits = await tx.$queryRaw`
          SELECT id, unit_code, component_type, abo_group, rh_factor, volume_ml, expiry_date, testing_status, release_status, inventory_status
          FROM blood_units
          WHERE institution_id = ${targetInstId}
            AND component_type = ${request.requestedComponent}::"BloodComponentType"
            AND inventory_status = 'AVAILABLE'
            AND testing_status = 'PASSED'
            AND release_status = 'RELEASED'
            AND expiry_date > NOW()
            AND id NOT IN (
              SELECT blood_unit_id FROM allocations WHERE status IN ('RESERVED', 'FULFILLED')
            )
          ORDER BY expiry_date ASC
          LIMIT 50
          FOR UPDATE SKIP LOCKED
        `;

        candidateUnits = rawLockedUnits.map((u) => ({
          id: u.id,
          unitCode: u.unit_code,
          componentType: u.component_type,
          aboGroup: u.abo_group,
          rhFactor: u.rh_factor,
          volumeMl: u.volume_ml,
          expiryDate: u.expiry_date,
          testingStatus: u.testing_status,
          releaseStatus: u.release_status,
          inventoryStatus: u.inventory_status
        }));
      } catch (rawErr) {
        // Fallback for mock environments
        const now = new Date();
        candidateUnits = await tx.bloodUnit.findMany({
          where: {
            institutionId: targetInstId,
            componentType: request.requestedComponent,
            inventoryStatus: 'AVAILABLE',
            testingStatus: 'PASSED',
            releaseStatus: 'RELEASED',
            expiryDate: { gt: now },
            allocations: { none: { status: 'RESERVED' } }
          },
          orderBy: { expiryDate: 'asc' },
          take: 50
        });
      }

      const compatible = candidateUnits.filter((u) => {
        const evalRes = evaluateCompatibility(
          request.requestedComponent,
          request.requestedABO,
          request.requestedRh,
          u.componentType,
          u.aboGroup,
          u.rhFactor
        );
        return evalRes.compatible;
      });

      if (compatible.length < quantity) {
        const error = new Error(
          `Insufficient eligible compatible inventory: Requested ${quantity} units, but only ${compatible.length} compatible units are available.`
        );
        error.statusCode = 400;
        throw error;
      }

      targetUnitIds = compatible.slice(0, quantity).map((u) => u.id);
    }

    // d. Revalidate, lock, and reserve each unit
    const createdAllocations = [];
    const now = new Date();

    for (const unitId of targetUnitIds) {
      const unit = await tx.bloodUnit.findUnique({
        where: { id: unitId }
      });

      if (!unit) {
        const error = new Error(`Blood unit with ID ${unitId} not found`);
        error.statusCode = 404;
        throw error;
      }

      // Revalidate eligibility inside the transaction
      if (unit.inventoryStatus !== 'AVAILABLE') {
        const error = new Error(
          `Unit ${unit.unitCode} is not available for allocation (current status: ${unit.inventoryStatus})`
        );
        error.statusCode = 409;
        throw error;
      }

      if (unit.testingStatus !== 'PASSED') {
        const error = new Error(`Unit ${unit.unitCode} cannot be allocated: Testing status is ${unit.testingStatus}`);
        error.statusCode = 400;
        throw error;
      }

      if (unit.releaseStatus !== 'RELEASED') {
        const error = new Error(`Unit ${unit.unitCode} cannot be allocated: Release status is ${unit.releaseStatus}`);
        error.statusCode = 400;
        throw error;
      }

      if (new Date(unit.expiryDate) <= now) {
        const error = new Error(`Unit ${unit.unitCode} expired on ${unit.expiryDate.toISOString()} and cannot be allocated`);
        error.statusCode = 400;
        throw error;
      }

      // Revalidate clinical compatibility inside transaction
      const compEval = evaluateCompatibility(
        request.requestedComponent,
        request.requestedABO,
        request.requestedRh,
        unit.componentType,
        unit.aboGroup,
        unit.rhFactor
      );

      if (!compEval.compatible) {
        const error = new Error(
          `Clinical compatibility violation: Unit ${unit.unitCode} (${unit.aboGroup}${unit.rhFactor === 'POSITIVE' ? '+' : '-'} ${unit.componentType}) cannot be given to recipient profile (${request.requestedABO}${request.requestedRh === 'POSITIVE' ? '+' : '-'} ${request.requestedComponent}): ${compEval.reason}`
        );
        error.statusCode = 400;
        throw error;
      }

      // e. Atomic conditional update (locking against concurrent reservation)
      const updateResult = await tx.bloodUnit.updateMany({
        where: {
          id: unit.id,
          inventoryStatus: 'AVAILABLE',
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED',
          expiryDate: { gt: now }
        },
        data: {
          inventoryStatus: 'RESERVED'
        }
      });

      if (updateResult.count === 0) {
        const error = new Error(
          `Concurrency conflict: Blood unit ${unit.unitCode} was just reserved by another concurrent transaction`
        );
        error.statusCode = 409;
        throw error;
      }

      // f. Prevent duplicate allocation of the same unit
      const existingActiveAlloc = await tx.allocation.findFirst({
        where: {
          bloodUnitId: unit.id,
          status: 'RESERVED'
        }
      });

      if (existingActiveAlloc) {
        const error = new Error(`Unit ${unit.unitCode} is already allocated to request ${existingActiveAlloc.requestId}`);
        error.statusCode = 409;
        throw error;
      }

      // g. Create allocation record
      const alloc = await tx.allocation.create({
        data: {
          requestId: request.id,
          bloodUnitId: unit.id,
          allocatedById: actorUser.id,
          status: 'RESERVED'
        },
        include: {
          bloodUnit: {
            select: {
              id: true,
              unitCode: true,
              componentType: true,
              aboGroup: true,
              rhFactor: true,
              volumeMl: true,
              expiryDate: true
            }
          }
        }
      });

      createdAllocations.push(alloc);

      // h. Record immutable inventory event
      await tx.inventoryEvent.create({
        data: {
          bloodUnitId: unit.id,
          eventType: 'ALLOCATION_RESERVED',
          previousStatus: 'AVAILABLE',
          newStatus: 'RESERVED',
          actorId: actorUser.id,
          notes: `Reserved for request #${request.id.slice(0, 8)} (${request.requestedComponent} ${request.requestedABO}${request.requestedRh === 'POSITIVE' ? '+' : '-'})${notes ? `: ${notes}` : ''}`,
          timestamp: new Date()
        }
      });
    }

    // i. Update request lifecycle status based on new allocation total
    const totalAllocated = activeAllocationsCount + createdAllocations.length;
    const newStatus = totalAllocated >= request.requestedQuantity ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED';

    const updatedRequest = await tx.bloodRequest.update({
      where: { id: request.id },
      data: { status: newStatus },
      include: {
        hospital: { select: { id: true, name: true } },
        allocations: {
          include: { bloodUnit: true }
        }
      }
    });

    // j. Record audit log
    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: request.hospitalId,
        entityType: 'BLOOD_REQUEST',
        entityId: request.id,
        action: 'ALLOCATE',
        metadata: {
          previousAllocations: activeAllocationsCount,
          newAllocationsAdded: createdAllocations.length,
          totalAllocated,
          requestedQuantity: request.requestedQuantity,
          status: newStatus,
          allocatedUnitCodes: createdAllocations.map((a) => a.bloodUnit.unitCode),
          ip: ipAddress,
          clinicalRulesVersion: CLINICAL_RULES_VERSION
        }
      }
    });

    return {
      request: deriveRequestQuantities(updatedRequest),
      allocations: createdAllocations,
      allocatedCount: createdAllocations.length,
      newStatus
    };
  });

  // Trigger notification for allocation approval
  try {
    await notifyInstitutionStaff(result.request.hospitalId, {
      type: 'ALLOCATION_APPROVED',
      title: 'Blood Request Units Allocated',
      message: `${result.allocatedCount} compatible units allocated for request #${result.request.id.slice(0, 8)}. Status updated to ${result.newStatus}.`,
      metadata: {
        requestId: result.request.id,
        allocatedCount: result.allocatedCount,
        status: result.newStatus
      }
    });
  } catch (err) {
    logger.warn(`Failed to broadcast allocation notification: ${err.message}`);
  }

  // Broadcast live dashboard update via WebSocket
  try {
    broadcastWsEvent('REQUEST_ALLOCATED', {
      requestId: result.request.id,
      allocatedCount: result.allocatedCount,
      newStatus: result.newStatus
    });
    broadcastWsEvent('INVENTORY_UPDATED', {
      hospitalId: result.request.hospitalId
    });
  } catch (wsErr) {
    // Non-blocking
  }

  return result;
}

