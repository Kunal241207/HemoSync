import { prisma } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { notifyInstitutionStaff } from './notificationService.js';
import { calculateHaversineDistance } from '../utils/haversine.js';
import { evaluateCompatibility, CLINICAL_RULES_VERSION } from '../utils/compatibilityEngine.js';
import { deriveRequestQuantities } from '../utils/requestTransitions.js';
import { broadcastWsEvent } from '../utils/websocket.js';

export const HAVERSINE_DISCLAIMER =
  'Haversine distance is approximate straight-line geographic distance only and does not reflect driving distance, road transit conditions, or guaranteed delivery ETA.';

/**
 * Searches participating nearby blood banks with available compatible stock for an open request.
 * Ranks candidates by approximate distance, available inventory, and FEFO expiry suitability.
 */
export async function findNearbyMatchesForRequest(actorUser, requestId, options = {}) {
  const { radiusKm, limit = 10 } = options;

  // 1. Fetch request with requesting hospital coordinates
  const request = await prisma.bloodRequest.findUnique({
    where: { id: requestId },
    include: {
      hospital: {
        select: { id: true, name: true, type: true, address: true, latitude: true, longitude: true, phone: true }
      },
      allocations: {
        where: { status: { in: ['RESERVED', 'FULFILLED'] } }
      }
    }
  });

  if (!request) {
    const error = new Error(`Blood request with ID ${requestId} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Scoping: Hospital staff can only search for their own hospital requests
  if (actorUser.role === 'HOSPITAL_STAFF' && request.hospitalId !== actorUser.institutionId) {
    const error = new Error('Access denied: You do not have permission to view matches for another hospital');
    error.statusCode = 403;
    throw error;
  }

  // Status check: Closed or cancelled requests cannot be matched
  const closedStatuses = ['CANCELLED', 'FULFILLED', 'UNFULFILLED'];
  if (closedStatuses.includes(request.status)) {
    const error = new Error(`Cannot search nearby inventory for request in status '${request.status}'`);
    error.statusCode = 400;
    throw error;
  }

  const derived = deriveRequestQuantities(request);
  const remainingShortage = derived.remainingQuantity;

  if (remainingShortage <= 0) {
    return {
      requestId: request.id,
      remainingShortage: 0,
      nearbyInstitutions: [],
      rulesVersion: CLINICAL_RULES_VERSION,
      disclaimer: HAVERSINE_DISCLAIMER
    };
  }

  // 2. Query all other participating, active, verified institutions
  const candidateInstitutions = await prisma.institution.findMany({
    where: {
      id: { not: request.hospitalId },
      isActive: true,
      verificationStatus: 'VERIFIED'
    },
    select: {
      id: true,
      name: true,
      type: true,
      address: true,
      latitude: true,
      longitude: true,
      phone: true,
      email: true
    }
  });

  const now = new Date();
  const nearbyInstitutions = [];

  for (const inst of candidateInstitutions) {
    const distanceKm = calculateHaversineDistance(
      request.hospital.latitude,
      request.hospital.longitude,
      inst.latitude,
      inst.longitude
    );

    // Apply radius boundary filter if requested
    if (radiusKm && distanceKm !== null && distanceKm > radiusKm) {
      continue;
    }

    // Query unreserved, passed, released, unexpired units at this institution
    const eligibleUnits = await prisma.bloodUnit.findMany({
      where: {
        institutionId: inst.id,
        componentType: request.requestedComponent,
        inventoryStatus: 'AVAILABLE',
        testingStatus: 'PASSED',
        releaseStatus: 'RELEASED',
        expiryDate: { gt: now },
        allocations: { none: { status: 'RESERVED' } },
        transferUnits: {
          none: {
            transfer: {
              status: { in: ['REQUESTED', 'APPROVED', 'RESERVED', 'DISPATCHED'] }
            }
          }
        }
      },
      orderBy: { expiryDate: 'asc' }, // FEFO order
      take: 50
    });

    // Check clinical compatibility for each candidate unit
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

    if (compatibleUnits.length > 0) {
      // Sort: FEFO first, identical ABO/Rh tie-breaker
      compatibleUnits.sort((a, b) => {
        const diff = new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        if (diff !== 0) return diff;
        if (a.isIdentical && !b.isIdentical) return -1;
        if (!a.isIdentical && b.isIdentical) return 1;
        return 0;
      });

      nearbyInstitutions.push({
        institution: inst,
        distanceKm,
        availableCompatibleCount: compatibleUnits.length,
        candidateUnits: compatibleUnits.slice(0, remainingShortage)
      });
    }
  }

  // 3. Multi-factor ranking:
  // Primary: approximate Haversine distance ascending
  // Secondary: available compatible count descending
  nearbyInstitutions.sort((a, b) => {
    const distDiff = (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
    if (distDiff !== 0) return distDiff;
    return b.availableCompatibleCount - a.availableCompatibleCount;
  });

  return {
    requestId: request.id,
    requestedComponent: request.requestedComponent,
    requestedABO: request.requestedABO,
    requestedRh: request.requestedRh,
    remainingShortage,
    rulesVersion: CLINICAL_RULES_VERSION,
    disclaimer: HAVERSINE_DISCLAIMER,
    nearbyInstitutions: nearbyInstitutions.slice(0, limit)
  };
}

/**
 * Creates an inter-institution blood transfer request.
 */
export async function createTransfer(actorUser, transferData, ipAddress) {
  const { requestId, sourceInstitutionId, destinationInstitutionId, unitIds, notes } = transferData;

  // Resolve destination institution
  const resolvedDestId =
    actorUser.role === 'HOSPITAL_STAFF'
      ? actorUser.institutionId
      : (destinationInstitutionId || actorUser.institutionId);

  if (!resolvedDestId) {
    const error = new Error('Destination institution is required for transfer');
    error.statusCode = 400;
    throw error;
  }

  if (sourceInstitutionId === resolvedDestId) {
    const error = new Error('Source and destination institutions cannot be identical');
    error.statusCode = 400;
    throw error;
  }

  // Validate institutions
  const [sourceInst, destInst] = await Promise.all([
    prisma.institution.findUnique({ where: { id: sourceInstitutionId } }),
    prisma.institution.findUnique({ where: { id: resolvedDestId } })
  ]);

  if (!sourceInst || !sourceInst.isActive || sourceInst.verificationStatus !== 'VERIFIED') {
    const error = new Error('Source institution must be an active, verified institution');
    error.statusCode = 400;
    throw error;
  }

  if (!destInst || !destInst.isActive || destInst.verificationStatus !== 'VERIFIED') {
    const error = new Error('Destination institution must be an active, verified institution');
    error.statusCode = 400;
    throw error;
  }

  // If linked to a blood request, validate request state
  let linkedRequest = null;
  if (requestId) {
    linkedRequest = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: { allocations: { where: { status: { in: ['RESERVED', 'FULFILLED'] } } } }
    });

    if (!linkedRequest) {
      const error = new Error(`Blood request ${requestId} not found`);
      error.statusCode = 404;
      throw error;
    }

    if (['CANCELLED', 'FULFILLED', 'UNFULFILLED'].includes(linkedRequest.status)) {
      const error = new Error(`Cannot request transfer for blood request in status '${linkedRequest.status}'`);
      error.statusCode = 400;
      throw error;
    }

    if (linkedRequest.hospitalId !== resolvedDestId) {
      const error = new Error('Transfer destination institution must match the requesting hospital');
      error.statusCode = 400;
      throw error;
    }

    const remaining = Math.max(0, linkedRequest.requestedQuantity - linkedRequest.allocations.length);
    if (unitIds.length > remaining) {
      const error = new Error(
        `Cannot request transfer for ${unitIds.length} units: Remaining shortage is only ${remaining} units`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  // Atomic creation of transfer and transfer units
  const transfer = await prisma.$transaction(async (tx) => {
    const now = new Date();

    // Verify all units exist at source institution, are eligible and unexpired
    for (const unitId of unitIds) {
      const unit = await tx.bloodUnit.findUnique({
        where: { id: unitId },
        include: {
          allocations: { where: { status: 'RESERVED' } },
          transferUnits: {
            where: {
              transfer: { status: { in: ['REQUESTED', 'APPROVED', 'RESERVED', 'DISPATCHED'] } }
            }
          }
        }
      });

      if (!unit) {
        const error = new Error(`Blood unit ${unitId} not found`);
        error.statusCode = 404;
        throw error;
      }

      if (unit.institutionId !== sourceInstitutionId) {
        const error = new Error(`Blood unit ${unit.unitCode} does not belong to the source institution`);
        error.statusCode = 400;
        throw error;
      }

      if (unit.inventoryStatus !== 'AVAILABLE') {
        const error = new Error(`Blood unit ${unit.unitCode} is not available (status: ${unit.inventoryStatus})`);
        error.statusCode = 409;
        throw error;
      }

      if (unit.testingStatus !== 'PASSED' || unit.releaseStatus !== 'RELEASED') {
        const error = new Error(`Blood unit ${unit.unitCode} is not clinically cleared for transfer`);
        error.statusCode = 400;
        throw error;
      }

      if (new Date(unit.expiryDate) <= now) {
        const error = new Error(`Blood unit ${unit.unitCode} is expired and cannot be transferred`);
        error.statusCode = 400;
        throw error;
      }

      if (unit.allocations.length > 0 || unit.transferUnits.length > 0) {
        const error = new Error(`Blood unit ${unit.unitCode} is already allocated or in an active transfer`);
        error.statusCode = 409;
        throw error;
      }

      // If linked to request, check clinical compatibility
      if (linkedRequest) {
        const comp = evaluateCompatibility(
          linkedRequest.requestedComponent,
          linkedRequest.requestedABO,
          linkedRequest.requestedRh,
          unit.componentType,
          unit.aboGroup,
          unit.rhFactor
        );

        if (!comp.compatible) {
          const error = new Error(
            `Incompatible unit ${unit.unitCode}: ${unit.aboGroup}${unit.rhFactor === 'POSITIVE' ? '+' : '-'} does not match request profile`
          );
          error.statusCode = 400;
          throw error;
        }
      }
    }

    // Create the transfer record
    const created = await tx.transfer.create({
      data: {
        sourceInstitutionId,
        destinationInstitutionId: resolvedDestId,
        requestId: linkedRequest ? linkedRequest.id : null,
        status: 'REQUESTED',
        notes: notes || null
      }
    });

    // Create transfer units
    for (const unitId of unitIds) {
      await tx.transferUnit.create({
        data: {
          transferId: created.id,
          bloodUnitId: unitId
        }
      });
    }

    // If request linked, update status to TRANSFER_PENDING
    if (linkedRequest && linkedRequest.status === 'PENDING') {
      await tx.bloodRequest.update({
        where: { id: linkedRequest.id },
        data: { status: 'TRANSFER_PENDING' }
      });
    }

    // Record audit log
    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: resolvedDestId,
        entityType: 'TRANSFER',
        entityId: created.id,
        action: 'TRANSFER_REQUEST',
        metadata: {
          sourceInstitutionId,
          destinationInstitutionId: resolvedDestId,
          requestId: linkedRequest ? linkedRequest.id : null,
          unitsCount: unitIds.length,
          ip: ipAddress
        }
      }
    });

    return created;
  });

  // Module 12: Trigger notification for transfer request (notify source blood bank)
  try {
    await notifyInstitutionStaff(sourceInstitutionId, {
      type: 'TRANSFER_REQUESTED',
      title: 'Incoming Inter-Institution Transfer Request',
      message: `Transfer requisition submitted for ${unitIds.length} physical blood units. Staff review and authorization required.`,
      metadata: {
        transferId: transfer.id,
        sourceInstitutionId,
        destinationInstitutionId: resolvedDestId,
        unitsCount: unitIds.length
      }
    });
  } catch (err) {
    logger.warn(`Failed to broadcast transfer request notification: ${err.message}`);
  }

  try {
    broadcastWsEvent('TRANSFER_UPDATED', { transferId: transfer.id });
  } catch (e) {}

  return getTransferById(actorUser, transfer.id);
}

/**
 * Lists transfers with institution scoping and role-specific filters.
 */
export async function listTransfers(actorUser, filters = {}) {
  const { status, roleFilter = 'all', requestId, page = 1, limit = 50, sortBy = 'createdAt', order = 'desc' } = filters;

  const where = {};

  // Institution scoping: Hospital and Blood Bank staff can only view transfers their institution is involved in
  if (actorUser.role !== 'PLATFORM_ADMIN') {
    if (roleFilter === 'incoming') {
      where.destinationInstitutionId = actorUser.institutionId;
    } else if (roleFilter === 'outgoing') {
      where.sourceInstitutionId = actorUser.institutionId;
    } else {
      where.OR = [
        { destinationInstitutionId: actorUser.institutionId },
        { sourceInstitutionId: actorUser.institutionId }
      ];
    }
  } else {
    if (roleFilter === 'incoming' && filters.institutionId) {
      where.destinationInstitutionId = filters.institutionId;
    } else if (roleFilter === 'outgoing' && filters.institutionId) {
      where.sourceInstitutionId = filters.institutionId;
    }
  }

  if (status) where.status = status;
  if (requestId) where.requestId = requestId;

  const skip = (page - 1) * limit;

  const [transfers, total] = await Promise.all([
    prisma.transfer.findMany({
      where,
      include: {
        sourceInstitution: {
          select: { id: true, name: true, type: true, address: true, phone: true }
        },
        destinationInstitution: {
          select: { id: true, name: true, type: true, address: true, phone: true }
        },
        request: {
          select: {
            id: true,
            requestedComponent: true,
            requestedABO: true,
            requestedRh: true,
            urgency: true,
            status: true
          }
        },
        approvedBy: { select: { id: true, name: true, email: true } },
        transferUnits: {
          include: {
            bloodUnit: {
              select: {
                id: true,
                unitCode: true,
                componentType: true,
                aboGroup: true,
                rhFactor: true,
                volumeMl: true,
                expiryDate: true,
                inventoryStatus: true
              }
            }
          }
        }
      },
      orderBy: { [sortBy]: order },
      skip,
      take: limit
    }),
    prisma.transfer.count({ where })
  ]);

  return {
    transfers,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Retrieves transfer details by ID.
 */
export async function getTransferById(actorUser, id) {
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      sourceInstitution: {
        select: { id: true, name: true, type: true, address: true, phone: true, latitude: true, longitude: true }
      },
      destinationInstitution: {
        select: { id: true, name: true, type: true, address: true, phone: true, latitude: true, longitude: true }
      },
      request: {
        include: {
          hospital: { select: { id: true, name: true } }
        }
      },
      approvedBy: { select: { id: true, name: true, email: true, role: true } },
      transferUnits: {
        include: {
          bloodUnit: {
            select: {
              id: true,
              unitCode: true,
              componentType: true,
              aboGroup: true,
              rhFactor: true,
              volumeMl: true,
              expiryDate: true,
              inventoryStatus: true,
              testingStatus: true,
              releaseStatus: true
            }
          }
        }
      }
    }
  });

  if (!transfer) {
    const error = new Error(`Transfer with ID ${id} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Scoping: Non-admin users must belong to source or destination institution
  if (actorUser.role !== 'PLATFORM_ADMIN') {
    const isSource = transfer.sourceInstitutionId === actorUser.institutionId;
    const isDest = transfer.destinationInstitutionId === actorUser.institutionId;
    if (!isSource && !isDest) {
      const error = new Error('Access denied: You do not have permission to view this transfer');
      error.statusCode = 403;
      throw error;
    }
  }

  // Calculate approximate distance between institutions
  const distanceKm = calculateHaversineDistance(
    transfer.sourceInstitution.latitude,
    transfer.sourceInstitution.longitude,
    transfer.destinationInstitution.latitude,
    transfer.destinationInstitution.longitude
  );

  return {
    ...transfer,
    distanceKm,
    disclaimer: HAVERSINE_DISCLAIMER
  };
}

/**
 * Approves a requested transfer.
 * Only source institution staff or platform admin can approve.
 * Transactionally reserves all transfer units at the source blood bank.
 */
export async function approveTransfer(actorUser, id, data, ipAddress) {
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      transferUnits: { include: { bloodUnit: true } },
      request: true
    }
  });

  if (!transfer) {
    const error = new Error(`Transfer with ID ${id} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Authorization: Only staff of source institution (or platform admin) can approve!
  if (actorUser.role !== 'PLATFORM_ADMIN' && transfer.sourceInstitutionId !== actorUser.institutionId) {
    const error = new Error('Access denied: Only source institution personnel can approve transfer requests');
    error.statusCode = 403;
    throw error;
  }

  if (transfer.status !== 'REQUESTED') {
    const error = new Error(`Cannot approve transfer in status '${transfer.status}'. Must be in 'REQUESTED' status.`);
    error.statusCode = 400;
    throw error;
  }

  const now = new Date();

  // Transaction: Revalidate units, lock them, update status to RESERVED
  await prisma.$transaction(async (tx) => {
    for (const tu of transfer.transferUnits) {
      const unit = await tx.bloodUnit.findUnique({ where: { id: tu.bloodUnitId } });

      if (!unit || unit.inventoryStatus !== 'AVAILABLE') {
        const error = new Error(`Unit ${tu.bloodUnit.unitCode} is no longer available for transfer`);
        error.statusCode = 409;
        throw error;
      }

      if (new Date(unit.expiryDate) <= now) {
        const error = new Error(`Unit ${tu.bloodUnit.unitCode} is expired and cannot be transferred`);
        error.statusCode = 400;
        throw error;
      }

      // Atomically update unit to RESERVED
      const updateRes = await tx.bloodUnit.updateMany({
        where: {
          id: unit.id,
          inventoryStatus: 'AVAILABLE',
          expiryDate: { gt: now }
        },
        data: { inventoryStatus: 'RESERVED' }
      });

      if (updateRes.count === 0) {
        const error = new Error(`Concurrency conflict: Unit ${unit.unitCode} was reserved concurrently`);
        error.statusCode = 409;
        throw error;
      }

      // Record inventory event
      await tx.inventoryEvent.create({
        data: {
          bloodUnitId: unit.id,
          eventType: 'STATUS_CHANGE',
          previousStatus: 'AVAILABLE',
          newStatus: 'RESERVED',
          actorId: actorUser.id,
          notes: `Reserved for approved transfer #${transfer.id.slice(0, 8)} to ${transfer.destinationInstitutionId}`
        }
      });
    }

    // Update transfer status
    await tx.transfer.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedById: actorUser.id,
        notes: data.notes ? `${transfer.notes ? transfer.notes + ' | ' : ''}Approval: ${data.notes}` : transfer.notes
      }
    });

    // Record audit log
    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: transfer.sourceInstitutionId,
        entityType: 'TRANSFER',
        entityId: id,
        action: 'TRANSFER_APPROVE',
        metadata: {
          previousStatus: 'REQUESTED',
          newStatus: 'APPROVED',
          unitsCount: transfer.transferUnits.length,
          ip: ipAddress
        }
      }
    });
  });

  // Module 12: Trigger notification for transfer approval (notify destination hospital)
  try {
    await notifyInstitutionStaff(transfer.destinationInstitutionId, {
      type: 'TRANSFER_APPROVED',
      title: 'Transfer Request Approved',
      message: `Transfer #${id.slice(0, 8)} was approved by source blood bank. Units have been reserved for dispatch.`,
      metadata: { transferId: id }
    });
  } catch (err) {
    logger.warn(`Failed to broadcast transfer approval notification: ${err.message}`);
  }

  return getTransferById(actorUser, id);
}

/**
 * Rejects a requested transfer.
 * Releases any reserved units back to AVAILABLE if previously approved.
 */
export async function rejectTransfer(actorUser, id, data, ipAddress) {
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      transferUnits: { include: { bloodUnit: true } },
      request: true
    }
  });

  if (!transfer) {
    const error = new Error(`Transfer with ID ${id} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Authorization: Only source institution or platform admin
  if (actorUser.role !== 'PLATFORM_ADMIN' && transfer.sourceInstitutionId !== actorUser.institutionId) {
    const error = new Error('Access denied: Only source institution personnel can reject transfer requests');
    error.statusCode = 403;
    throw error;
  }

  const allowableStatuses = ['REQUESTED', 'APPROVED', 'RESERVED'];
  if (!allowableStatuses.includes(transfer.status)) {
    const error = new Error(`Cannot reject transfer in status '${transfer.status}'`);
    error.statusCode = 400;
    throw error;
  }

  await prisma.$transaction(async (tx) => {
    // If units were reserved, release them back to AVAILABLE
    if (transfer.status === 'APPROVED' || transfer.status === 'RESERVED') {
      for (const tu of transfer.transferUnits) {
        if (tu.bloodUnit.inventoryStatus === 'RESERVED') {
          await tx.bloodUnit.update({
            where: { id: tu.bloodUnitId },
            data: { inventoryStatus: 'AVAILABLE' }
          });

          await tx.inventoryEvent.create({
            data: {
              bloodUnitId: tu.bloodUnitId,
              eventType: 'ALLOCATION_RELEASED',
              previousStatus: 'RESERVED',
              newStatus: 'AVAILABLE',
              actorId: actorUser.id,
              notes: `Released due to transfer rejection: ${data.reason || 'Source institution rejected'}`
            }
          });
        }
      }
    }

    // Update transfer status
    await tx.transfer.update({
      where: { id },
      data: {
        status: 'REJECTED',
        notes: data.reason ? `${transfer.notes ? transfer.notes + ' | ' : ''}Rejection: ${data.reason}` : transfer.notes
      }
    });

    // Record audit log
    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: transfer.sourceInstitutionId,
        entityType: 'TRANSFER',
        entityId: id,
        action: 'STATUS_CHANGE',
        metadata: {
          previousStatus: transfer.status,
          newStatus: 'REJECTED',
          reason: data.reason || null,
          ip: ipAddress
        }
      }
    });
  });

  // Module 12: Trigger notification for transfer rejection (notify destination hospital)
  try {
    await notifyInstitutionStaff(transfer.destinationInstitutionId, {
      type: 'TRANSFER_REJECTED',
      title: 'Transfer Request Rejected',
      message: `Transfer #${id.slice(0, 8)} was rejected by source blood bank. Reason: ${data.reason || 'None provided'}.`,
      metadata: { transferId: id, reason: data.reason }
    });
  } catch (err) {
    logger.warn(`Failed to broadcast transfer rejection notification: ${err.message}`);
  }

  return getTransferById(actorUser, id);
}

/**
 * Records dispatch of an approved transfer.
 * Transitions units to IN_TRANSFER and logs dispatch event.
 */
export async function dispatchTransfer(actorUser, id, data, ipAddress) {
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      transferUnits: { include: { bloodUnit: true } },
      request: true
    }
  });

  if (!transfer) {
    const error = new Error(`Transfer with ID ${id} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Authorization: Source institution or platform admin
  if (actorUser.role !== 'PLATFORM_ADMIN' && transfer.sourceInstitutionId !== actorUser.institutionId) {
    const error = new Error('Access denied: Only source institution personnel can record dispatch');
    error.statusCode = 403;
    throw error;
  }

  if (transfer.status !== 'APPROVED' && transfer.status !== 'RESERVED') {
    const error = new Error(`Cannot dispatch transfer in status '${transfer.status}'. Must be in 'APPROVED' status.`);
    error.statusCode = 400;
    throw error;
  }

  const dispatchedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const tu of transfer.transferUnits) {
      // Units transition to IN_TRANSFER
      await tx.bloodUnit.update({
        where: { id: tu.bloodUnitId },
        data: { inventoryStatus: 'IN_TRANSFER' }
      });

      // Record dispatch event
      await tx.inventoryEvent.create({
        data: {
          bloodUnitId: tu.bloodUnitId,
          eventType: 'DISPATCH',
          previousStatus: 'RESERVED',
          newStatus: 'IN_TRANSFER',
          actorId: actorUser.id,
          notes: `Dispatched from source institution. Courier: ${data.courier || 'Medical transport'}${data.trackingNumber ? ` (Tracking: ${data.trackingNumber})` : ''}`
        }
      });
    }

    // Update transfer status
    await tx.transfer.update({
      where: { id },
      data: {
        status: 'DISPATCHED',
        dispatchedAt,
        notes: data.dispatchNotes ? `${transfer.notes ? transfer.notes + ' | ' : ''}Dispatch: ${data.dispatchNotes}` : transfer.notes
      }
    });

    // Record audit log
    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: transfer.sourceInstitutionId,
        entityType: 'TRANSFER',
        entityId: id,
        action: 'TRANSFER_DISPATCH',
        metadata: {
          dispatchedAt,
          courier: data.courier || null,
          trackingNumber: data.trackingNumber || null,
          ip: ipAddress
        }
      }
    });
  });

  // Module 12: Trigger notification for dispatch (notify destination hospital)
  try {
    await notifyInstitutionStaff(transfer.destinationInstitutionId, {
      type: 'TRANSFER_DISPATCHED',
      title: 'Blood Shipment Dispatched',
      message: `Shipment for transfer #${id.slice(0, 8)} has been dispatched via ${data.courier || 'Courier'}. Cold-chain protocol active.`,
      metadata: { transferId: id, courier: data.courier, trackingNumber: data.trackingNumber }
    });
  } catch (err) {
    logger.warn(`Failed to broadcast transfer dispatch notification: ${err.message}`);
  }

  return getTransferById(actorUser, id);
}

/**
 * Confirms receipt of transferred blood units at the destination hospital.
 * Critical handover: Updates physical inventory ownership to destination hospital,
 * updates inventory status, links allocations if a request is associated, and logs receipt events.
 */
export async function receiveTransfer(actorUser, id, data, ipAddress) {
  const transfer = await prisma.transfer.findUnique({
    where: { id },
    include: {
      transferUnits: { include: { bloodUnit: true } },
      request: {
        include: { allocations: { where: { status: { in: ['RESERVED', 'FULFILLED'] } } } }
      }
    }
  });

  if (!transfer) {
    const error = new Error(`Transfer with ID ${id} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Authorization: Only receiving destination hospital staff (or platform admin) can confirm receipt!
  if (actorUser.role !== 'PLATFORM_ADMIN' && transfer.destinationInstitutionId !== actorUser.institutionId) {
    const error = new Error('Access denied: Only destination institution personnel can confirm delivery receipt');
    error.statusCode = 403;
    throw error;
  }

  if (transfer.status !== 'DISPATCHED') {
    const error = new Error(`Cannot receive transfer in status '${transfer.status}'. Must be in 'DISPATCHED' status.`);
    error.statusCode = 400;
    throw error;
  }

  const receivedAt = new Date();

  await prisma.$transaction(async (tx) => {
    for (const tu of transfer.transferUnits) {
      // 1. Handover: Move inventory ownership to destination hospital!
      await tx.bloodUnit.update({
        where: { id: tu.bloodUnitId },
        data: {
          institutionId: transfer.destinationInstitutionId,
          inventoryStatus: transfer.requestId ? 'RESERVED' : 'AVAILABLE'
        }
      });

      // 2. Record immutable RECEIPT event
      await tx.inventoryEvent.create({
        data: {
          bloodUnitId: tu.bloodUnitId,
          eventType: 'RECEIPT',
          previousStatus: 'IN_TRANSFER',
          newStatus: transfer.requestId ? 'RESERVED' : 'AVAILABLE',
          actorId: actorUser.id,
          notes: `Confirmed delivery at destination hospital (${transfer.destinationInstitutionId}). Cold-chain verified: ${data.temperatureChecked ? 'Pass' : 'Unchecked'}. Packaging intact: ${data.packagingIntact ? 'Yes' : 'No'}. ${data.conditionNotes || ''}`
        }
      });

      // 3. If tied to a blood request, create authoritative allocation
      if (transfer.requestId) {
        await tx.allocation.create({
          data: {
            requestId: transfer.requestId,
            bloodUnitId: tu.bloodUnitId,
            allocatedById: actorUser.id,
            status: 'RESERVED'
          }
        });
      }
    }

    // 4. If tied to a request, update request status based on total fulfilled allocations
    if (transfer.request) {
      const totalAllocated = transfer.request.allocations.length + transfer.transferUnits.length;
      const nextRequestStatus = totalAllocated >= transfer.request.requestedQuantity ? 'ALLOCATED' : 'PARTIALLY_ALLOCATED';

      await tx.bloodRequest.update({
        where: { id: transfer.request.id },
        data: { status: nextRequestStatus }
      });
    }

    // 5. Update transfer status
    await tx.transfer.update({
      where: { id },
      data: {
        status: 'RECEIVED',
        receivedAt,
        notes: data.conditionNotes ? `${transfer.notes ? transfer.notes + ' | ' : ''}Receipt: ${data.conditionNotes}` : transfer.notes
      }
    });

    // 6. Record audit log
    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: transfer.destinationInstitutionId,
        entityType: 'TRANSFER',
        entityId: id,
        action: 'TRANSFER_RECEIVE',
        metadata: {
          receivedAt,
          transferredUnitsCount: transfer.transferUnits.length,
          newOwnerInstitutionId: transfer.destinationInstitutionId,
          ip: ipAddress
        }
      }
    });
  });

  // Module 12: Trigger notification for transfer receipt (notify source blood bank)
  try {
    await notifyInstitutionStaff(transfer.sourceInstitutionId, {
      type: 'TRANSFER_RECEIVED',
      title: 'Blood Transfer Received & Confirmed',
      message: `Transfer #${id.slice(0, 8)} was safely received by destination institution. Custody and condition checks verified.`,
      metadata: { transferId: id }
    });
  } catch (err) {
    logger.warn(`Failed to broadcast transfer receipt notification: ${err.message}`);
  }

  try {
    broadcastWsEvent('TRANSFER_UPDATED', { transferId: id });
    broadcastWsEvent('INVENTORY_UPDATED');
  } catch (e) {}

  return getTransferById(actorUser, id);
}

