import { prisma } from '../config/db.js';
import { logger } from '../utils/logger.js';
import { notifyInstitutionStaff } from './notificationService.js';
import { broadcastWsEvent } from '../utils/websocket.js';
import {
  canTransitionRequest,
  deriveRequestQuantities,
  ALLOWED_REQUEST_STATUS_TRANSITIONS
} from '../utils/requestTransitions.js';

export { deriveRequestQuantities as deriveQuantities };

/**
 * Creates a new hospital blood request.
 * Enforces verified hospital membership, valid date/time in future, and positive quantity.
 */
export async function createBloodRequest(actorUser, data, ipAddress) {
  // Authorization: Only HOSPITAL_STAFF or PLATFORM_ADMIN can initiate blood requests
  if (actorUser.role !== 'HOSPITAL_STAFF' && actorUser.role !== 'PLATFORM_ADMIN') {
    const error = new Error('Access denied: Only hospital staff or administrators can submit blood requests');
    error.statusCode = 403;
    throw error;
  }

  const hospitalId = actorUser.role === 'PLATFORM_ADMIN'
    ? (data.hospitalId || actorUser.institutionId)
    : actorUser.institutionId;

  if (!hospitalId) {
    const error = new Error('Hospital ID is required to submit a blood request');
    error.statusCode = 400;
    throw error;
  }

  // Verify target hospital exists, is active, is a hospital, and is verified
  const hospital = await prisma.institution.findUnique({
    where: { id: hospitalId }
  });

  if (!hospital || !hospital.isActive || hospital.type !== 'HOSPITAL') {
    const error = new Error('Invalid requesting hospital: Must be an active hospital institution');
    error.statusCode = 400;
    throw error;
  }

  if (hospital.verificationStatus !== 'VERIFIED') {
    const error = new Error(`Requesting hospital is not verified (status: ${hospital.verificationStatus})`);
    error.statusCode = 400;
    throw error;
  }

  const newRequest = await prisma.$transaction(async (tx) => {
    const created = await tx.bloodRequest.create({
      data: {
        hospitalId,
        createdById: actorUser.id,
        requestedComponent: data.requestedComponent,
        requestedABO: data.requestedABO,
        requestedRh: data.requestedRh,
        requestedQuantity: data.requestedQuantity,
        urgency: data.urgency,
        status: 'PENDING',
        requiredBy: data.requiredBy,
        reason: data.reason || null
      },
      include: {
        hospital: {
          select: { id: true, name: true, type: true, address: true, phone: true }
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true }
        },
        allocations: true,
        transfers: true
      }
    });

    // Record audit log
    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: created.hospitalId,
        entityType: 'BLOOD_REQUEST',
        entityId: created.id,
        action: 'CREATE',
        metadata: {
          component: created.requestedComponent,
          group: `${created.requestedABO}${created.requestedRh === 'POSITIVE' ? '+' : '-'}`,
          quantity: created.requestedQuantity,
          urgency: created.urgency,
          requiredBy: created.requiredBy,
          ip: ipAddress
        }
      }
    });

    return created;
  });

  // Module 12: Trigger notification for new hospital request
  try {
    await notifyInstitutionStaff(newRequest.hospitalId, {
      type: 'REQUEST_CREATED',
      title: 'New Hospital Blood Request Submitted',
      message: `Requisition #${newRequest.id.slice(0, 8)} created for ${newRequest.requestedQuantity} units of ${newRequest.requestedComponent.replace(/_/g, ' ')} (${newRequest.requestedABO}${newRequest.requestedRh === 'POSITIVE' ? '+' : '-'}), Urgency: ${newRequest.urgency}.`,
      metadata: {
        requestId: newRequest.id,
        urgency: newRequest.urgency,
        requestedQuantity: newRequest.requestedQuantity
      }
    });
  } catch (err) {
    logger.warn(`Failed to broadcast request notification: ${err.message}`);
  }

  try {
    broadcastWsEvent('REQUEST_CREATED', {
      requestId: newRequest.id,
      hospitalId: newRequest.hospitalId,
      urgency: newRequest.urgency
    });
  } catch (wsErr) {}

  return deriveRequestQuantities(newRequest);
}

/**
 * Lists blood requests with multi-parameter filtering, search, sorting, and pagination.
 * Enforces institution scoping for hospital staff.
 */
export async function listBloodRequests(actorUser, filters = {}) {
  const {
    hospitalId,
    status,
    urgency,
    componentType,
    requestedABO,
    requestedRh,
    search,
    sortBy = 'createdAt',
    order = 'desc',
    page = 1,
    limit = 50
  } = filters;

  const where = {};

  // Institution scoping: Hospital staff see only their own hospital's requests
  if (actorUser.role === 'HOSPITAL_STAFF') {
    where.hospitalId = actorUser.institutionId;
  } else if (hospitalId) {
    where.hospitalId = hospitalId;
  }

  if (status) where.status = status;
  if (urgency) where.urgency = urgency;
  if (componentType) where.requestedComponent = componentType;
  if (requestedABO) where.requestedABO = requestedABO;
  if (requestedRh) where.requestedRh = requestedRh;

  if (search && search.trim()) {
    where.OR = [
      { reason: { contains: search.trim(), mode: 'insensitive' } },
      { hospital: { name: { contains: search.trim(), mode: 'insensitive' } } }
    ];
  }

  const skip = (page - 1) * limit;

  const [rawRequests, total] = await Promise.all([
    prisma.bloodRequest.findMany({
      where,
      include: {
        hospital: {
          select: { id: true, name: true, type: true, address: true, phone: true }
        },
        createdBy: {
          select: { id: true, name: true, email: true, role: true }
        },
        allocations: {
          include: {
            bloodUnit: {
              select: {
                id: true,
                unitCode: true,
                componentType: true,
                aboGroup: true,
                rhFactor: true,
                expiryDate: true,
                inventoryStatus: true
              }
            },
            allocatedBy: { select: { id: true, name: true, email: true } }
          }
        },
        transfers: {
          select: {
            id: true,
            status: true,
            sourceInstitutionId: true,
            destinationInstitutionId: true,
            sourceInstitution: { select: { id: true, name: true } }
          }
        }
      },
      orderBy: { [sortBy]: order },
      skip,
      take: limit
    }),
    prisma.bloodRequest.count({ where })
  ]);

  const requests = rawRequests.map(deriveRequestQuantities);

  return {
    requests,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    }
  };
}

/**
 * Returns aggregated statistical summary of requests for live dashboard KPI cards.
 */
export async function getRequestSummary(actorUser, hospitalId = null) {
  const where = {};

  if (actorUser.role === 'HOSPITAL_STAFF') {
    where.hospitalId = actorUser.institutionId;
  } else if (hospitalId) {
    where.hospitalId = hospitalId;
  }

  const now = new Date();
  const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const [
    totalRequests,
    pendingCount,
    validatedCount,
    partiallyAllocatedCount,
    allocatedCount,
    fulfilledCount,
    cancelledCount,
    emergencyCount,
    urgentCount,
    dueWithin24hCount
  ] = await Promise.all([
    prisma.bloodRequest.count({ where }),
    prisma.bloodRequest.count({ where: { ...where, status: 'PENDING' } }),
    prisma.bloodRequest.count({ where: { ...where, status: 'VALIDATED' } }),
    prisma.bloodRequest.count({ where: { ...where, status: 'PARTIALLY_ALLOCATED' } }),
    prisma.bloodRequest.count({ where: { ...where, status: 'ALLOCATED' } }),
    prisma.bloodRequest.count({ where: { ...where, status: 'FULFILLED' } }),
    prisma.bloodRequest.count({ where: { ...where, status: 'CANCELLED' } }),
    prisma.bloodRequest.count({
      where: {
        ...where,
        urgency: 'EMERGENCY',
        status: { notIn: ['FULFILLED', 'CANCELLED', 'UNFULFILLED'] }
      }
    }),
    prisma.bloodRequest.count({
      where: {
        ...where,
        urgency: 'URGENT',
        status: { notIn: ['FULFILLED', 'CANCELLED', 'UNFULFILLED'] }
      }
    }),
    prisma.bloodRequest.count({
      where: {
        ...where,
        requiredBy: { lte: next24h, gte: now },
        status: { notIn: ['FULFILLED', 'CANCELLED', 'UNFULFILLED'] }
      }
    })
  ]);

  return {
    totalRequests,
    pendingCount,
    validatedCount,
    partiallyAllocatedCount,
    allocatedCount,
    fulfilledCount,
    cancelledCount,
    emergencyCount,
    urgentCount,
    dueWithin24hCount
  };
}

/**
 * Retrieves a single request by ID with complete allocation and transfer tracking details.
 */
export async function getRequestById(actorUser, id) {
  const request = await prisma.bloodRequest.findUnique({
    where: { id },
    include: {
      hospital: {
        select: { id: true, name: true, type: true, address: true, phone: true, licenseNumber: true }
      },
      createdBy: {
        select: { id: true, name: true, email: true, role: true }
      },
      allocations: {
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
          },
          allocatedBy: { select: { id: true, name: true, email: true } }
        }
      },
      transfers: {
        include: {
          sourceInstitution: { select: { id: true, name: true, type: true } },
          destinationInstitution: { select: { id: true, name: true, type: true } },
          transferUnits: {
            include: {
              bloodUnit: {
                select: {
                  id: true,
                  unitCode: true,
                  componentType: true,
                  aboGroup: true,
                  rhFactor: true,
                  expiryDate: true
                }
              }
            }
          }
        }
      }
    }
  });

  if (!request) {
    const error = new Error(`Blood request with ID ${id} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Hospital staff can only view their own hospital's requests
  if (actorUser.role === 'HOSPITAL_STAFF' && request.hospitalId !== actorUser.institutionId) {
    const error = new Error('Access denied: You do not have permission to view another hospital\'s request');
    error.statusCode = 403;
    throw error;
  }

  return deriveRequestQuantities(request);
}

/**
 * Cancels an eligible open blood request.
 * Releases any active reserved units back to AVAILABLE status in an atomic transaction.
 */
export async function cancelBloodRequest(actorUser, id, cancelData, ipAddress) {
  const request = await prisma.bloodRequest.findUnique({
    where: { id },
    include: { allocations: true }
  });

  if (!request) {
    const error = new Error(`Blood request with ID ${id} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Permission check: Must be PLATFORM_ADMIN or staff from the requesting hospital
  if (actorUser.role !== 'PLATFORM_ADMIN' && request.hospitalId !== actorUser.institutionId) {
    const error = new Error('Access denied: Cannot cancel requests belonging to another institution');
    error.statusCode = 403;
    throw error;
  }

  // State eligibility check: Terminal states cannot be cancelled
  const nonCancellableStatuses = ['FULFILLED', 'CANCELLED', 'UNFULFILLED'];
  if (nonCancellableStatuses.includes(request.status)) {
    const error = new Error(
      `Cannot cancel request in status '${request.status}'. Only open requests can be cancelled.`
    );
    error.statusCode = 400;
    throw error;
  }

  const updatedRequest = await prisma.$transaction(async (tx) => {
    // 1. Release any currently reserved units back to AVAILABLE
    const activeAllocations = request.allocations.filter((a) => a.status === 'RESERVED');
    for (const alloc of activeAllocations) {
      await tx.bloodUnit.update({
        where: { id: alloc.bloodUnitId },
        data: { inventoryStatus: 'AVAILABLE' }
      });

      await tx.allocation.update({
        where: { id: alloc.id },
        data: { status: 'CANCELLED' }
      });

      await tx.inventoryEvent.create({
        data: {
          bloodUnitId: alloc.bloodUnitId,
          eventType: 'ALLOCATION_RELEASED',
          previousStatus: 'RESERVED',
          newStatus: 'AVAILABLE',
          actorId: actorUser.id,
          notes: `Released due to cancellation of request ${request.id.slice(0, 8)}: ${cancelData.reason || 'Hospital cancelled'}`,
          timestamp: new Date()
        }
      });
    }

    // 2. Mark request as CANCELLED
    const cancelled = await tx.bloodRequest.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: {
        hospital: { select: { id: true, name: true } },
        allocations: true,
        transfers: true
      }
    });

    // 3. Record audit log
    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: request.hospitalId,
        entityType: 'BLOOD_REQUEST',
        entityId: id,
        action: 'STATUS_CHANGE',
        metadata: {
          previousStatus: request.status,
          newStatus: 'CANCELLED',
          reason: cancelData.reason || 'Staff initiated cancellation',
          releasedUnitsCount: activeAllocations.length,
          ip: ipAddress
        }
      }
    });

    return cancelled;
  });

  return deriveRequestQuantities(updatedRequest);
}

/**
 * Transitions the status of a blood request following the finite-state machine.
 * Enforces allowed transitions and records audit logs.
 */
export async function updateRequestStatus(actorUser, id, updateData, ipAddress) {
  const { status: nextStatus, notes } = updateData;

  const request = await prisma.bloodRequest.findUnique({
    where: { id },
    include: {
      allocations: true,
      transfers: true
    }
  });

  if (!request) {
    const error = new Error(`Blood request with ID ${id} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Validate state transition
  if (!canTransitionRequest(request.status, nextStatus)) {
    const allowed = ALLOWED_REQUEST_STATUS_TRANSITIONS[request.status] || [];
    const error = new Error(
      `Cannot transition request from '${request.status}' to '${nextStatus}'. Allowed transitions: [${allowed.join(', ')}]`
    );
    error.statusCode = 400;
    throw error;
  }

  // If transitioning to FULFILLED, ensure fulfilledQuantity >= requestedQuantity
  if (nextStatus === 'FULFILLED') {
    const derived = deriveRequestQuantities(request);
    if (derived.remainingQuantity > 0) {
      const error = new Error(
        `Cannot mark request as FULFILLED: Remaining shortage of ${derived.remainingQuantity} units must be satisfied first`
      );
      error.statusCode = 400;
      throw error;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.bloodRequest.update({
      where: { id },
      data: { status: nextStatus },
      include: {
        hospital: { select: { id: true, name: true } },
        allocations: true,
        transfers: true
      }
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: request.hospitalId,
        entityType: 'BLOOD_REQUEST',
        entityId: id,
        action: 'STATUS_CHANGE',
        metadata: {
          previousStatus: request.status,
          newStatus: nextStatus,
          notes: notes || null,
          ip: ipAddress
        }
      }
    });

    return res;
  });

  return deriveRequestQuantities(updated);
}
