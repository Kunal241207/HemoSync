import { prisma } from '../config/db.js';
import { evaluateUnitExpiryRisk, getComponentThresholds } from '../utils/expiryThresholds.js';
import { calculateHaversineDistance } from '../utils/haversine.js';
import { evaluateCompatibility } from '../utils/compatibilityEngine.js';
import { logger } from '../utils/logger.js';
import { notifyInstitutionStaff } from './notificationService.js';
import { broadcastWsEvent } from '../utils/websocket.js';

/**
 * Executes the automated expiry monitoring job.
 * Idempotent: can be executed repeatedly with the same referenceDate without creating duplicate alerts or duplicate events.
 *
 * @param {Object} options
 * @param {Date} [options.referenceDate=new Date()] UTC reference date for calculations
 * @param {string} [options.actorUserId=null] Optional user ID triggering manual run
 * @returns {Promise<Object>} Execution summary
 */
export async function runExpiryMonitoringJob(options = {}) {
  const referenceDate = options.referenceDate ? new Date(options.referenceDate) : new Date();
  const actorUserId = options.actorUserId || null;

  let expiredUnitsMarked = 0;
  let alertsCreated = 0;
  let alertsUpdated = 0;
  const alertedInstitutions = new Set();

  // 1. Mark expired units that are not yet marked EXPIRED or DISCARDED or USED
  const expiredCandidates = await prisma.bloodUnit.findMany({
    where: {
      expiryDate: { lte: referenceDate },
      inventoryStatus: {
        notIn: ['EXPIRED', 'DISCARDED', 'USED']
      }
    },
    include: {
      institution: { select: { id: true, name: true } }
    }
  });

  for (const unit of expiredCandidates) {
    await prisma.$transaction(async (tx) => {
      // Transition inventory status to EXPIRED
      await tx.bloodUnit.update({
        where: { id: unit.id },
        data: {
          inventoryStatus: 'EXPIRED',
          releaseStatus: 'REJECTED'
        }
      });

      // Record inventory status change event
      await tx.inventoryEvent.create({
        data: {
          bloodUnitId: unit.id,
          eventType: 'STATUS_CHANGE',
          previousStatus: unit.inventoryStatus,
          newStatus: 'EXPIRED',
          actorId: actorUserId,
          notes: `Automated Expiry Monitor: Unit reached expiry date (${unit.expiryDate.toISOString()}). Marked ineligible for allocation.`,
          timestamp: referenceDate
        }
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          actorId: actorUserId,
          institutionId: unit.institutionId,
          entityType: 'BLOOD_UNIT',
          entityId: unit.id,
          action: 'STATUS_CHANGE',
          metadata: {
            previousStatus: unit.inventoryStatus,
            newStatus: 'EXPIRED',
            reason: 'Unit expired',
            referenceDate: referenceDate.toISOString()
          },
          createdAt: referenceDate
        }
      });

      // Upsert or escalate ExpiryAlert to CRITICAL
      const existingAlert = await tx.expiryAlert.findFirst({
        where: {
          bloodUnitId: unit.id,
          resolved: false
        }
      });

      if (existingAlert) {
        if (existingAlert.severity !== 'CRITICAL') {
          await tx.expiryAlert.update({
            where: { id: existingAlert.id },
            data: {
              severity: 'CRITICAL',
              updatedAt: referenceDate
            }
          });
          alertsUpdated++;
        }
      } else {
        await tx.expiryAlert.create({
          data: {
            bloodUnitId: unit.id,
            institutionId: unit.institutionId,
            severity: 'CRITICAL',
            resolved: false,
            createdAt: referenceDate
          }
        });
        alertsCreated++;
        alertedInstitutions.add(unit.institutionId);
      }
    });

    expiredUnitsMarked++;
  }

  // 2. Scan active AVAILABLE units for near-expiry risk
  const activeUnits = await prisma.bloodUnit.findMany({
    where: {
      expiryDate: { gt: referenceDate },
      inventoryStatus: 'AVAILABLE'
    }
  });

  for (const unit of activeUnits) {
    const risk = evaluateUnitExpiryRisk(unit, referenceDate);
    if (risk.isNearExpiry) {
      const existingAlert = await prisma.expiryAlert.findFirst({
        where: {
          bloodUnitId: unit.id,
          resolved: false
        }
      });

      if (existingAlert) {
        // Escalate severity if risk increased
        if (existingAlert.severity !== risk.severity) {
          await prisma.expiryAlert.update({
            where: { id: existingAlert.id },
            data: {
              severity: risk.severity,
              updatedAt: referenceDate
            }
          });
          alertsUpdated++;
        }
      } else {
        // Create new alert
        await prisma.expiryAlert.create({
          data: {
            bloodUnitId: unit.id,
            institutionId: unit.institutionId,
            severity: risk.severity,
            resolved: false,
            createdAt: referenceDate
          }
        });
        alertsCreated++;
        alertedInstitutions.add(unit.institutionId);
      }
    }
  }

  const activeAlertsTotal = await prisma.expiryAlert.count({
    where: { resolved: false }
  });

  // Module 12: Trigger near-expiry warnings for alerted institutions
  for (const instId of alertedInstitutions) {
    notifyInstitutionStaff(instId, {
      type: 'NEAR_EXPIRY_WARNING',
      title: 'Near-Expiry Blood Units Warning',
      message: 'Physical units in inventory are nearing shelf-life expiration threshold. Prioritize FEFO release or redistribution.',
      metadata: { institutionId: instId, executedAt: referenceDate.toISOString() }
    }).catch((err) => logger.warn(`Failed to broadcast expiry warning: ${err.message}`));
  }

  try {
    broadcastWsEvent('EXPIRY_UPDATED', {
      expiredUnitsMarked,
      alertsCreated,
      activeAlertsTotal
    });
    if (expiredUnitsMarked > 0) {
      broadcastWsEvent('INVENTORY_UPDATED');
    }
  } catch (e) {}

  return {
    executedAt: referenceDate.toISOString(),
    unitsEvaluated: expiredCandidates.length + activeUnits.length,
    expiredUnitsMarked,
    alertsCreated,
    alertsUpdated,
    activeAlertsTotal
  };
}

/**
 * Retrieves expiry alerts with role-based scoping and filtering.
 */
export async function getExpiryAlerts(actorUser, filters = {}) {
  const {
    resolved = 'false',
    severity,
    institutionId,
    page = 1,
    limit = 20
  } = filters;

  const where = {};

  // Institution scoping: non-admins strictly locked to their own institution
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

  if (resolved === 'false') {
    where.resolved = false;
  } else if (resolved === 'true') {
    where.resolved = true;
  }
  // 'all' leaves resolved unrestricted

  if (severity) {
    where.severity = severity;
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const [total, alerts] = await Promise.all([
    prisma.expiryAlert.count({ where }),
    prisma.expiryAlert.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: [
        { severity: 'desc' },
        { createdAt: 'desc' }
      ],
      include: {
        bloodUnit: {
          select: {
            id: true,
            unitCode: true,
            componentType: true,
            aboGroup: true,
            rhFactor: true,
            collectionDate: true,
            expiryDate: true,
            volumeMl: true,
            inventoryStatus: true,
            testingStatus: true,
            releaseStatus: true
          }
        },
        institution: {
          select: {
            id: true,
            name: true,
            type: true,
            licenseNumber: true
          }
        }
      }
    })
  ]);

  // Compute dynamic remaining time relative to current server UTC
  const now = new Date();
  const enrichedAlerts = alerts.map((alert) => {
    const risk = alert.bloodUnit ? evaluateUnitExpiryRisk(alert.bloodUnit, now) : null;
    return {
      ...alert,
      currentRisk: risk
    };
  });

  return {
    alerts: enrichedAlerts,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    }
  };
}

/**
 * Resolves an active expiry alert with staff authorization.
 */
export async function resolveExpiryAlert(actorUser, alertId, data = {}) {
  const alert = await prisma.expiryAlert.findUnique({
    where: { id: alertId },
    include: { institution: true, bloodUnit: true }
  });

  if (!alert) {
    const error = new Error(`Expiry alert with ID ${alertId} not found`);
    error.statusCode = 404;
    throw error;
  }

  // Institution scope check
  if (actorUser.role !== 'PLATFORM_ADMIN' && alert.institutionId !== actorUser.institutionId) {
    const error = new Error('Access denied: Cannot resolve alert belonging to another institution');
    error.statusCode = 403;
    throw error;
  }

  if (alert.resolved) {
    return alert;
  }

  const resolvedAlert = await prisma.$transaction(async (tx) => {
    const updated = await tx.expiryAlert.update({
      where: { id: alertId },
      data: {
        resolved: true,
        resolvedAt: new Date()
      },
      include: {
        bloodUnit: true,
        institution: true
      }
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: alert.institutionId,
        entityType: 'EXPIRY_ALERT',
        entityId: alert.id,
        action: 'UPDATE',
        metadata: {
          action: 'ALERT_RESOLVED',
          notes: data.notes || 'Alert marked resolved by authorized staff',
          unitCode: alert.bloodUnit?.unitCode
        }
      }
    });

    return updated;
  });

  return resolvedAlert;
}

/**
 * Summarizes operational expiry risk and metrics for dashboards.
 */
export async function getExpirySummary(actorUser, filters = {}) {
  let targetInstitutionId = null;

  if (actorUser.role !== 'PLATFORM_ADMIN') {
    if (!actorUser.institutionId) {
      const error = new Error('User is not associated with an institution');
      error.statusCode = 403;
      throw error;
    }
    targetInstitutionId = actorUser.institutionId;
  } else if (filters.institutionId) {
    targetInstitutionId = filters.institutionId;
  }

  const baseWhere = targetInstitutionId ? { institutionId: targetInstitutionId } : {};
  const now = new Date();

  // Parallel metric aggregation
  const [
    totalExpired,
    activeAlertsTotal,
    criticalAlertsCount,
    highAlertsCount,
    mediumAlertsCount,
    resolvedAlertsCount,
    expiringUnits
  ] = await Promise.all([
    prisma.bloodUnit.count({
      where: {
        ...baseWhere,
        inventoryStatus: 'EXPIRED'
      }
    }),
    prisma.expiryAlert.count({
      where: {
        ...baseWhere,
        resolved: false
      }
    }),
    prisma.expiryAlert.count({
      where: {
        ...baseWhere,
        resolved: false,
        severity: 'CRITICAL'
      }
    }),
    prisma.expiryAlert.count({
      where: {
        ...baseWhere,
        resolved: false,
        severity: 'HIGH'
      }
    }),
    prisma.expiryAlert.count({
      where: {
        ...baseWhere,
        resolved: false,
        severity: 'MEDIUM'
      }
    }),
    prisma.expiryAlert.count({
      where: {
        ...baseWhere,
        resolved: true
      }
    }),
    prisma.bloodUnit.findMany({
      where: {
        ...baseWhere,
        inventoryStatus: 'AVAILABLE',
        expiryDate: { gt: now }
      },
      orderBy: { expiryDate: 'asc' },
      take: 200,
      include: {
        institution: {
          select: { id: true, name: true, type: true }
        }
      }
    })
  ]);

  // Breakdown expiring units by risk evaluation and component
  const componentBreakdown = {
    RED_BLOOD_CELLS: { critical: 0, high: 0, medium: 0, totalNearExpiry: 0, redistributionEligible: 0 },
    PLATELETS: { critical: 0, high: 0, medium: 0, totalNearExpiry: 0, redistributionEligible: 0 },
    PLASMA: { critical: 0, high: 0, medium: 0, totalNearExpiry: 0, redistributionEligible: 0 }
  };

  const urgentUnits = [];
  let totalNearExpiry = 0;
  let redistributionCandidatesCount = 0;

  for (const unit of expiringUnits) {
    const risk = evaluateUnitExpiryRisk(unit, now);
    if (risk.isNearExpiry) {
      totalNearExpiry++;
      const comp = componentBreakdown[unit.componentType];
      if (comp) {
        if (risk.severity === 'CRITICAL') comp.critical++;
        else if (risk.severity === 'HIGH') comp.high++;
        else if (risk.severity === 'MEDIUM') comp.medium++;
        comp.totalNearExpiry++;
        if (risk.canRedistribute) {
          comp.redistributionEligible++;
        }
      }

      if (risk.canRedistribute) {
        redistributionCandidatesCount++;
      }

      if (urgentUnits.length < 10) {
        urgentUnits.push({
          id: unit.id,
          unitCode: unit.unitCode,
          componentType: unit.componentType,
          aboGroup: unit.aboGroup,
          rhFactor: unit.rhFactor,
          volumeMl: unit.volumeMl,
          expiryDate: unit.expiryDate,
          hoursUntilExpiry: risk.hoursUntilExpiry,
          daysUntilExpiry: risk.daysUntilExpiry,
          severity: risk.severity,
          canRedistribute: risk.canRedistribute,
          institution: unit.institution
        });
      }
    }
  }

  try {
    broadcastWsEvent('EXPIRY_UPDATED', {
      expiredUnitsMarked,
      alertsCreated,
      activeAlertsTotal
    });
    if (expiredUnitsMarked > 0) {
      broadcastWsEvent('INVENTORY_UPDATED');
    }
  } catch (e) {}

  return {
    referenceDate: now.toISOString(),
    institutionId: targetInstitutionId,
    kpis: {
      totalExpiredUnits: totalExpired,
      totalNearExpiryUnits: totalNearExpiry,
      activeAlertsTotal,
      criticalAlertsCount,
      highAlertsCount,
      mediumAlertsCount,
      resolvedAlertsCount,
      redistributionCandidatesCount
    },
    componentBreakdown,
    urgentActionList: urgentUnits
  };
}

/**
 * Suggests constrained redistribution opportunities for near-expiry inventory.
 * Hard safety constraints:
 * - Never suggests expired, quarantined, unreleased, or reserved units.
 * - Units must have sufficient shelf life exceeding minimum transit window.
 * - Recipient must be verified active institution within maxDistanceKm.
 * - Compatibility rules must be strictly satisfied.
 * - Staff authorization required (planning support only).
 */
export async function getRedistributionSuggestions(actorUser, filters = {}) {
  const {
    institutionId,
    componentType,
    maxDistanceKm = 100,
    limit = 20
  } = filters;

  let sourceInstitutionId = null;

  if (actorUser.role !== 'PLATFORM_ADMIN') {
    if (!actorUser.institutionId) {
      const error = new Error('User is not associated with an institution');
      error.statusCode = 403;
      throw error;
    }
    sourceInstitutionId = actorUser.institutionId;
  } else if (institutionId) {
    sourceInstitutionId = institutionId;
  }

  const now = new Date();

  // Find source institution with geolocation
  let sourceInstitution = null;
  if (sourceInstitutionId) {
    sourceInstitution = await prisma.institution.findUnique({
      where: { id: sourceInstitutionId }
    });
  } else {
    // If admin didn't specify source, take first verified active institution
    sourceInstitution = await prisma.institution.findFirst({
      where: { isActive: true, verificationStatus: 'VERIFIED' }
    });
    if (sourceInstitution) {
      sourceInstitutionId = sourceInstitution.id;
    }
  }

  if (!sourceInstitution) {
    return {
      sourceInstitution: null,
      suggestions: [],
      message: 'No active source institution located.'
    };
  }

  // Find candidate near-expiry units at source institution
  const unitWhere = {
    institutionId: sourceInstitutionId,
    inventoryStatus: 'AVAILABLE',
    testingStatus: 'PASSED',
    releaseStatus: 'RELEASED',
    expiryDate: { gt: now }
  };

  if (componentType) {
    unitWhere.componentType = componentType;
  }

  const candidateUnits = await prisma.bloodUnit.findMany({
    where: unitWhere,
    orderBy: { expiryDate: 'asc' },
    take: 100
  });

  // Filter strictly for units with redistribution eligibility
  const eligibleNearExpiryUnits = [];
  for (const unit of candidateUnits) {
    const risk = evaluateUnitExpiryRisk(unit, now);
    if (risk.isNearExpiry && risk.canRedistribute) {
      eligibleNearExpiryUnits.push({
        unit,
        risk
      });
    }
  }

  if (eligibleNearExpiryUnits.length === 0) {
    return {
      sourceInstitution: {
        id: sourceInstitution.id,
        name: sourceInstitution.name,
        type: sourceInstitution.type
      },
      suggestions: [],
      message: 'No eligible near-expiry units meeting redistribution criteria at this time.'
    };
  }

  // Find potential participating recipient institutions (verified & active, excluding source)
  const recipientInstitutions = await prisma.institution.findMany({
    where: {
      id: { not: sourceInstitutionId },
      verificationStatus: 'VERIFIED',
      isActive: true
    }
  });

  // Calculate distance to each recipient
  const nearbyRecipients = [];
  for (const inst of recipientInstitutions) {
    const distanceKm = calculateHaversineDistance(
      sourceInstitution.latitude,
      sourceInstitution.longitude,
      inst.latitude,
      inst.longitude
    );

    if (distanceKm !== null && distanceKm <= maxDistanceKm) {
      nearbyRecipients.push({
        institution: inst,
        distanceKm
      });
    }
  }

  nearbyRecipients.sort((a, b) => a.distanceKm - b.distanceKm);

  // Fetch open blood requests from nearby hospitals to match demand
  const recipientIds = nearbyRecipients.map((r) => r.institution.id);
  const openRequests = await prisma.bloodRequest.findMany({
    where: {
      hospitalId: { in: recipientIds },
      status: { in: ['PENDING', 'VALIDATED', 'PARTIALLY_ALLOCATED'] }
    },
    include: {
      hospital: { select: { id: true, name: true, latitude: true, longitude: true } }
    }
  });

  const suggestions = [];

  for (const { unit, risk } of eligibleNearExpiryUnits) {
    let matchedOpenRequest = false;

    // Check if any nearby hospital has an open request compatible with this unit
    for (const req of openRequests) {
      const isCompat = evaluateCompatibility(
        unit.componentType,
        unit.aboGroup,
        unit.rhFactor,
        req.requestedComponent,
        req.requestedABO,
        req.requestedRh
      );

      if (isCompat.isCompatible) {
        const destRecipient = nearbyRecipients.find((r) => r.institution.id === req.hospitalId);
        const distanceKm = destRecipient ? destRecipient.distanceKm : 0;

        suggestions.push({
          id: `sug-${unit.id}-${req.id}`,
          priority: 'HIGH',
          priorityReason: `Direct open blood request match (${req.urgency}) at ${req.hospital.name}`,
          sourceInstitution: {
            id: sourceInstitution.id,
            name: sourceInstitution.name
          },
          targetInstitution: {
            id: req.hospital.id,
            name: req.hospital.name,
            type: 'HOSPITAL'
          },
          distanceKm,
          unit: {
            id: unit.id,
            unitCode: unit.unitCode,
            componentType: unit.componentType,
            aboGroup: unit.aboGroup,
            rhFactor: unit.rhFactor,
            volumeMl: unit.volumeMl,
            expiryDate: unit.expiryDate,
            hoursUntilExpiry: risk.hoursUntilExpiry,
            daysUntilExpiry: risk.daysUntilExpiry,
            severity: risk.severity
          },
          matchedRequest: {
            id: req.id,
            urgency: req.urgency,
            requestedQuantity: req.requestedQuantity,
            requiredBy: req.requiredBy
          },
          compatibility: isCompat,
          actionRequired: 'Source blood bank or hospital staff must initiate and approve an inter-institution transfer.'
        });

        matchedOpenRequest = true;
        break; // Match first eligible request per candidate unit
      }
    }

    // If no direct open request, but there are nearby institutions, create proactive redistribution suggestion
    if (!matchedOpenRequest && nearbyRecipients.length > 0) {
      const closestRecipient = nearbyRecipients[0];
      suggestions.push({
        id: `sug-${unit.id}-${closestRecipient.institution.id}`,
        priority: 'MEDIUM',
        priorityReason: `Proactive regional rebalancing to nearby facility (${closestRecipient.distanceKm} km)`,
        sourceInstitution: {
          id: sourceInstitution.id,
          name: sourceInstitution.name
        },
        targetInstitution: {
          id: closestRecipient.institution.id,
          name: closestRecipient.institution.name,
          type: closestRecipient.institution.type
        },
        distanceKm: closestRecipient.distanceKm,
        unit: {
          id: unit.id,
          unitCode: unit.unitCode,
          componentType: unit.componentType,
          aboGroup: unit.aboGroup,
          rhFactor: unit.rhFactor,
          volumeMl: unit.volumeMl,
          expiryDate: unit.expiryDate,
          hoursUntilExpiry: risk.hoursUntilExpiry,
          daysUntilExpiry: risk.daysUntilExpiry,
          severity: risk.severity
        },
        matchedRequest: null,
        compatibility: {
          isCompatible: true,
          matchType: 'PROACTIVE_REBALANCING'
        },
        actionRequired: 'Staff review required. Initiate transfer if destination facility confirms intake capacity.'
      });
    }

    if (suggestions.length >= limit) {
      break;
    }
  }

  try {
    broadcastWsEvent('EXPIRY_UPDATED', {
      expiredUnitsMarked,
      alertsCreated,
      activeAlertsTotal
    });
    if (expiredUnitsMarked > 0) {
      broadcastWsEvent('INVENTORY_UPDATED');
    }
  } catch (e) {}

  return {
    sourceInstitution: {
      id: sourceInstitution.id,
      name: sourceInstitution.name,
      type: sourceInstitution.type
    },
    totalCandidateUnits: eligibleNearExpiryUnits.length,
    suggestionsCount: suggestions.length,
    suggestions,
    regulatoryNotice: 'Redistribution recommendations are decision-support suggestions only. All inventory transfers require clinical verification and human authorization through the authorized Transfer workflow.'
  };
}

