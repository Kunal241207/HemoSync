import { prisma } from '../config/db.js';
import { canTransition, isUnitExpired } from '../utils/inventoryTransitions.js';
import { broadcastWsEvent } from '../utils/websocket.js';

export async function listInventory(actorUser, filters = {}) {
  const {
    institutionId,
    componentType,
    aboGroup,
    rhFactor,
    inventoryStatus,
    testingStatus,
    releaseStatus,
    isEligible,
    expiringWithinDays,
    search,
    sortBy = 'expiryDate',
    order = 'asc',
    page = 1,
    limit = 50
  } = filters;

  const where = {};

  // Institution scoping: non-admins are strictly locked to their own institution
  if (actorUser.role !== 'PLATFORM_ADMIN') {
    if (!actorUser.institutionId) {
      const error = new Error('User is not associated with an institution');
      error.statusCode = 403;
      throw error;
    }
    where.institutionId = actorUser.institutionId;
  } else if (institutionId) {
    where.institutionId = institutionId;
  }

  if (componentType) where.componentType = componentType;
  if (aboGroup) where.aboGroup = aboGroup;
  if (rhFactor) where.rhFactor = rhFactor;
  if (inventoryStatus) where.inventoryStatus = inventoryStatus;
  if (testingStatus) where.testingStatus = testingStatus;
  if (releaseStatus) where.releaseStatus = releaseStatus;

  // Server UTC time
  const now = new Date();

  // Filter only eligible units (AVAILABLE, PASSED, RELEASED, unexpired)
  if (isEligible === 'true') {
    where.inventoryStatus = 'AVAILABLE';
    where.testingStatus = 'PASSED';
    where.releaseStatus = 'RELEASED';
    where.expiryDate = { gt: now };
  }

  // Units expiring within specified days
  if (expiringWithinDays) {
    const threshold = new Date(now.getTime() + expiringWithinDays * 86400000);
    where.expiryDate = {
      gt: now,
      lte: threshold
    };
  }

  if (search && search.trim()) {
    where.unitCode = { contains: search.trim(), mode: 'insensitive' };
  }

  const skip = (page - 1) * limit;

  const [units, total] = await Promise.all([
    prisma.bloodUnit.findMany({
      where,
      include: {
        institution: {
          select: { id: true, name: true, type: true }
        }
      },
      orderBy: { [sortBy]: order },
      skip,
      take: limit
    }),
    prisma.bloodUnit.count({ where })
  ]);

  return {
    units,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
}

export async function getInventorySummary(actorUser, targetInstitutionId) {
  let resolvedInstitutionId = targetInstitutionId;

  if (actorUser.role !== 'PLATFORM_ADMIN') {
    resolvedInstitutionId = actorUser.institutionId;
  }

  const where = resolvedInstitutionId ? { institutionId: resolvedInstitutionId } : {};
  const now = new Date();
  const soonThreshold = new Date(now.getTime() + 7 * 86400000); // 7 days

  const allUnits = await prisma.bloodUnit.findMany({
    where,
    select: {
      id: true,
      componentType: true,
      inventoryStatus: true,
      testingStatus: true,
      releaseStatus: true,
      expiryDate: true
    }
  });

  const summary = {
    totalUnits: allUnits.length,
    byStatus: {
      AVAILABLE: 0,
      RESERVED: 0,
      IN_TRANSFER: 0,
      TRANSFERRED: 0,
      USED: 0,
      EXPIRED: 0,
      DISCARDED: 0,
      QUARANTINED: 0
    },
    byComponent: {
      RED_BLOOD_CELLS: 0,
      PLATELETS: 0,
      PLASMA: 0
    },
    eligibleUnits: 0,
    expiringSoon: 0,
    alreadyExpired: 0
  };

  for (const u of allUnits) {
    summary.byStatus[u.inventoryStatus] = (summary.byStatus[u.inventoryStatus] || 0) + 1;
    summary.byComponent[u.componentType] = (summary.byComponent[u.componentType] || 0) + 1;

    const isExpired = u.expiryDate.getTime() <= now.getTime();
    if (isExpired) {
      summary.alreadyExpired += 1;
    } else if (u.expiryDate.getTime() <= soonThreshold.getTime()) {
      summary.expiringSoon += 1;
    }

    if (
      u.inventoryStatus === 'AVAILABLE' &&
      u.testingStatus === 'PASSED' &&
      u.releaseStatus === 'RELEASED' &&
      !isExpired
    ) {
      summary.eligibleUnits += 1;
    }
  }

  return summary;
}

export async function getUnitById(actorUser, id) {
  const unit = await prisma.bloodUnit.findUnique({
    where: { id },
    include: {
      institution: {
        select: { id: true, name: true, type: true, address: true }
      },
      inventoryEvents: {
        include: {
          actor: { select: { id: true, name: true, role: true } }
        },
        orderBy: { timestamp: 'desc' }
      },
      allocations: {
        select: { id: true, requestId: true, status: true, createdAt: true }
      }
    }
  });

  if (!unit) {
    const error = new Error(`Blood unit with ID ${id} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Institution scope check
  if (actorUser.role !== 'PLATFORM_ADMIN' && unit.institutionId !== actorUser.institutionId) {
    const error = new Error('Access denied: Unit belongs to another institution');
    error.statusCode = 403;
    throw error;
  }

  return unit;
}

export async function registerUnit(actorUser, unitData, ipAddress) {
  // Authorization: Only BLOOD_BANK_STAFF or PLATFORM_ADMIN can register physical blood inventory
  if (actorUser.role !== 'BLOOD_BANK_STAFF' && actorUser.role !== 'PLATFORM_ADMIN') {
    const error = new Error('Access denied: Only blood bank staff or administrators can register blood inventory');
    error.statusCode = 403;
    throw error;
  }

  const institutionId = actorUser.role === 'PLATFORM_ADMIN'
    ? (unitData.institutionId || actorUser.institutionId)
    : actorUser.institutionId;

  if (!institutionId) {
    const error = new Error('Institution ID is required for unit registration');
    error.statusCode = 400;
    throw error;
  }

  // Check unitCode uniqueness
  const existing = await prisma.bloodUnit.findUnique({
    where: { unitCode: unitData.unitCode.trim() }
  });

  if (existing) {
    const error = new Error(`A blood unit with barcode '${unitData.unitCode}' already exists`);
    error.statusCode = 409;
    throw error;
  }

  // Expiry check on registration
  const isPastExpiry = isUnitExpired(unitData.expiryDate);
  if (isPastExpiry) {
    const error = new Error('Cannot register a unit whose expiry date is in the past');
    error.statusCode = 400;
    throw error;
  }

  // Ensure eligibility consistency on initial registration
  let initialStatus = unitData.inventoryStatus || 'AVAILABLE';
  if (unitData.testingStatus !== 'PASSED' || unitData.releaseStatus !== 'RELEASED') {
    initialStatus = 'QUARANTINED';
  }

  const createdUnit = await prisma.$transaction(async (tx) => {
    const unit = await tx.bloodUnit.create({
      data: {
        institutionId,
        unitCode: unitData.unitCode.trim(),
        componentType: unitData.componentType,
        aboGroup: unitData.aboGroup,
        rhFactor: unitData.rhFactor,
        volumeMl: unitData.volumeMl,
        collectionDate: unitData.collectionDate,
        expiryDate: unitData.expiryDate,
        testingStatus: unitData.testingStatus || 'PENDING',
        releaseStatus: unitData.releaseStatus || 'QUARANTINED',
        inventoryStatus: initialStatus
      },
      include: {
        institution: {
          select: { id: true, name: true, type: true }
        }
      }
    });

    // Record initial inventory history event
    await tx.inventoryEvent.create({
      data: {
        bloodUnitId: unit.id,
        eventType: 'REGISTRATION',
        previousStatus: null,
        newStatus: unit.inventoryStatus,
        actorId: actorUser.id,
        notes: `Physical unit registered. Testing: ${unit.testingStatus}, Release: ${unit.releaseStatus}`,
        timestamp: new Date()
      }
    });

    // Audit log
    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: unit.institutionId,
        entityType: 'BLOOD_UNIT',
        entityId: unit.id,
        action: 'CREATE',
        metadata: {
          unitCode: unit.unitCode,
          componentType: unit.componentType,
          aboGroup: unit.aboGroup,
          rhFactor: unit.rhFactor,
          ip: ipAddress
        }
      }
    });

    return unit;
  });

  try {
    broadcastWsEvent('INVENTORY_UPDATED', { institutionId });
  } catch (e) {}

  return createdUnit;
}

export async function updateUnitStatus(actorUser, id, { newStatus, notes }, ipAddress) {
  const unit = await prisma.bloodUnit.findUnique({ where: { id } });
  if (!unit) {
    const error = new Error(`Blood unit with ID ${id} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Institution scope check
  if (actorUser.role !== 'PLATFORM_ADMIN' && unit.institutionId !== actorUser.institutionId) {
    const error = new Error('Access denied: Cannot mutate inventory of another institution');
    error.statusCode = 403;
    throw error;
  }

  // Validate state machine transition
  if (!canTransition(unit.inventoryStatus, newStatus)) {
    const error = new Error(
      `Invalid status transition from '${unit.inventoryStatus}' to '${newStatus}'. Transition disallowed by lifecycle state machine.`
    );
    error.statusCode = 400;
    throw error;
  }

  // Additional eligibility guard: cannot transition to AVAILABLE if testing is failed/pending, release is quarantined/rejected, or unit expired
  if (newStatus === 'AVAILABLE') {
    if (unit.testingStatus !== 'PASSED') {
      const error = new Error(`Cannot mark unit AVAILABLE: Testing status is '${unit.testingStatus}'`);
      error.statusCode = 400;
      throw error;
    }
    if (unit.releaseStatus !== 'RELEASED') {
      const error = new Error(`Cannot mark unit AVAILABLE: Release status is '${unit.releaseStatus}'`);
      error.statusCode = 400;
      throw error;
    }
    if (isUnitExpired(unit.expiryDate)) {
      const error = new Error('Cannot mark unit AVAILABLE: Unit has expired');
      error.statusCode = 400;
      throw error;
    }
  }

  let eventType = 'STATUS_CHANGE';
  if (newStatus === 'DISCARDED') eventType = 'DISPOSAL';
  if (newStatus === 'QUARANTINED') eventType = 'QUARANTINE_APPLIED';

  const updatedUnit = await prisma.$transaction(async (tx) => {
    const updated = await tx.bloodUnit.update({
      where: { id },
      data: { inventoryStatus: newStatus }
    });

    await tx.inventoryEvent.create({
      data: {
        bloodUnitId: id,
        eventType,
        previousStatus: unit.inventoryStatus,
        newStatus,
        actorId: actorUser.id,
        notes,
        timestamp: new Date()
      }
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: unit.institutionId,
        entityType: 'BLOOD_UNIT',
        entityId: id,
        action: 'STATUS_CHANGE',
        metadata: {
          previousStatus: unit.inventoryStatus,
          newStatus,
          notes,
          ip: ipAddress
        }
      }
    });

    return updated;
  });

  return updatedUnit;
}

export async function updateUnitDetails(actorUser, id, updateData, ipAddress) {
  const unit = await prisma.bloodUnit.findUnique({ where: { id } });
  if (!unit) {
    const error = new Error(`Blood unit with ID ${id} not found`);
    error.statusCode = 404;
    throw error;
  }

  if (actorUser.role !== 'PLATFORM_ADMIN' && unit.institutionId !== actorUser.institutionId) {
    const error = new Error('Access denied: Cannot mutate inventory of another institution');
    error.statusCode = 403;
    throw error;
  }

  const dataToUpdate = {};
  if (updateData.volumeMl) dataToUpdate.volumeMl = updateData.volumeMl;
  if (updateData.testingStatus) dataToUpdate.testingStatus = updateData.testingStatus;
  if (updateData.releaseStatus) dataToUpdate.releaseStatus = updateData.releaseStatus;

  // If testing failed, automatically quarantine/reject
  if (updateData.testingStatus === 'FAILED') {
    dataToUpdate.releaseStatus = 'REJECTED';
    dataToUpdate.inventoryStatus = 'QUARANTINED';
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.bloodUnit.update({
      where: { id },
      data: dataToUpdate
    });

    await tx.inventoryEvent.create({
      data: {
        bloodUnitId: id,
        eventType: 'TEST_COMPLETED',
        previousStatus: unit.inventoryStatus,
        newStatus: res.inventoryStatus,
        actorId: actorUser.id,
        notes: updateData.notes || 'Unit testing or release details updated',
        timestamp: new Date()
      }
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: unit.institutionId,
        entityType: 'BLOOD_UNIT',
        entityId: id,
        action: 'UPDATE',
        metadata: {
          changes: dataToUpdate,
          ip: ipAddress
        }
      }
    });

    return res;
  });

  return updated;
}

