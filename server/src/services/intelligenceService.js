import { prisma } from '../config/db.js';
import { generateComponentForecast, getDailyHistoricalDemand } from './forecastService.js';
import { median, medianAbsoluteDeviation, mean } from '../utils/mathUtils.js';
import { calculateHaversineDistance } from '../utils/haversine.js';
import { evaluateCompatibility } from '../utils/compatibilityEngine.js';
import { evaluateUnitExpiryRisk } from '../utils/expiryThresholds.js';
import { logger } from '../utils/logger.js';
import { notifyInstitutionStaff } from './notificationService.js';

/**
 * AI-2: Shortage Risk Projection Service
 * Compares projected forecast demand against current eligible inventory,
 * confirmed inbound transfers, committed allocations, and near-term expiry.
 */
export async function getShortageProjections(actorUser, query = {}) {
  const { days = 7, institutionId } = query;
  const horizonDays = parseInt(days, 10) === 30 ? 30 : 7;

  let targetInstitutionId = null;
  if (actorUser.role !== 'PLATFORM_ADMIN') {
    if (!actorUser.institutionId) {
      const error = new Error('User is not associated with an institution');
      error.statusCode = 403;
      throw error;
    }
    targetInstitutionId = actorUser.institutionId;
  } else if (institutionId) {
    targetInstitutionId = institutionId;
  }

  // Get institution details
  const institution = targetInstitutionId
    ? await prisma.institution.findUnique({ where: { id: targetInstitutionId } })
    : await prisma.institution.findFirst({ where: { type: 'HOSPITAL', isActive: true, verificationStatus: 'VERIFIED' } });

  if (!institution) {
    return {
      institution: null,
      projections: [],
      message: 'No active institution found.'
    };
  }

  const now = new Date();
  const horizonEnd = new Date(now.getTime() + horizonDays * 86400000);
  const components = ['RED_BLOOD_CELLS', 'PLATELETS', 'PLASMA'];
  const projections = [];

  for (const compType of components) {
    // 1. Forecast Demand over horizon
    const forecast = await generateComponentForecast({
      institutionId: institution.id,
      componentType: compType,
      horizonDays
    });

    const projectedDemand = forecast.totalPredictedDemand;

    // 2. Usable on-hand inventory (unexpired, released, passed testing, available)
    const onHandUnits = await prisma.bloodUnit.findMany({
      where: {
        institutionId: institution.id,
        componentType: compType,
        inventoryStatus: 'AVAILABLE',
        testingStatus: 'PASSED',
        releaseStatus: 'RELEASED',
        expiryDate: { gt: now }
      }
    });

    const usableOnHand = onHandUnits.length;

    // 3. Units expiring before horizon end
    const expiringBeforeHorizon = onHandUnits.filter(
      (u) => new Date(u.expiryDate) <= horizonEnd
    ).length;

    // 4. Confirmed Inbound Transfers
    const inboundTransfers = await prisma.transfer.findMany({
      where: {
        destinationInstitutionId: institution.id,
        status: { in: ['APPROVED', 'RESERVED', 'DISPATCHED'] }
      },
      include: {
        transferUnits: {
          include: {
            bloodUnit: { select: { id: true, componentType: true } }
          }
        }
      }
    });

    let confirmedInbound = 0;
    for (const t of inboundTransfers) {
      for (const tu of t.transferUnits) {
        if (tu.bloodUnit.componentType === compType) {
          confirmedInbound++;
        }
      }
    }

    // 5. Committed Outbound Allocations / Transfers
    const outboundTransfers = await prisma.transfer.findMany({
      where: {
        sourceInstitutionId: institution.id,
        status: { in: ['REQUESTED', 'APPROVED', 'RESERVED'] }
      },
      include: {
        transferUnits: {
          include: {
            bloodUnit: { select: { id: true, componentType: true } }
          }
        }
      }
    });

    let committedOutbound = 0;
    for (const t of outboundTransfers) {
      for (const tu of t.transferUnits) {
        if (tu.bloodUnit.componentType === compType) {
          committedOutbound++;
        }
      }
    }

    // 6. Net Projected Balance
    // Net = usableOnHand + confirmedInbound - committedOutbound - expiringBeforeHorizon - projectedDemand
    const netProjectedBalance =
      Math.round(
        (usableOnHand + confirmedInbound - committedOutbound - expiringBeforeHorizon - projectedDemand) * 10
      ) / 10;

    // 7. Transparent risk status determination
    let riskStatus = 'LOW';
    let riskReason = 'Projected inventory exceeds forecasted demand with an adequate safety buffer.';

    if (!forecast.isSufficientData) {
      riskStatus = 'INSUFFICIENT_DATA';
      riskReason = 'Insufficient historical observations to establish a validated demand forecast.';
    } else if (netProjectedBalance < 0) {
      riskStatus = 'HIGH';
      riskReason = `Projected deficit of ${Math.abs(netProjectedBalance)} units within ${horizonDays} days. Immediate inventory replenishment or inter-facility transfer recommended.`;
      
      // Module 12: Trigger shortage warning notification
      notifyInstitutionStaff(institution.id, {
        type: 'SHORTAGE_WARNING',
        title: 'Projected Blood Component Shortage Warning',
        message: `High risk shortage projected for ${compType.replace(/_/g, ' ')} within ${horizonDays} days (deficit: ${Math.abs(netProjectedBalance)} units).`,
        metadata: { componentType: compType, horizonDays, deficit: Math.abs(netProjectedBalance) }
      }).catch((err) => logger.warn(`Failed to broadcast shortage warning: ${err.message}`));
    } else if (netProjectedBalance < projectedDemand * 0.4) {
      riskStatus = 'MEDIUM';
      riskReason = `Projected safety buffer is narrow (${netProjectedBalance} units remaining). Monitor closely.`;
    }

    projections.push({
      componentType: compType,
      horizonDays,
      riskStatus,
      riskReason,
      projectedDemand,
      usableOnHand,
      confirmedInbound,
      committedOutbound,
      expiringBeforeHorizon,
      netProjectedBalance,
      modelUsed: forecast.modelSelected,
      calculationTime: now.toISOString()
    });
  }

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      type: institution.type
    },
    horizonDays,
    projections,
    disclaimer:
      'Shortage risk projections are automated planning support estimates based on statistical forecast models and current database stock. Staff must review clinical urgency before placing transfer orders.'
  };
}

/**
 * AI-3: Surplus and Expiry Exposure Service
 * Identifies units at risk of expiring before expected historical consumption.
 */
export async function getSurplusAndExpiryExposure(actorUser, query = {}) {
  const { institutionId, componentType } = query;

  let targetInstitutionId = null;
  if (actorUser.role !== 'PLATFORM_ADMIN') {
    if (!actorUser.institutionId) {
      const error = new Error('User is not associated with an institution');
      error.statusCode = 403;
      throw error;
    }
    targetInstitutionId = actorUser.institutionId;
  } else if (institutionId) {
    targetInstitutionId = institutionId;
  }

  const institution = targetInstitutionId
    ? await prisma.institution.findUnique({ where: { id: targetInstitutionId } })
    : await prisma.institution.findFirst({ where: { isActive: true, verificationStatus: 'VERIFIED' } });

  if (!institution) {
    return {
      institution: null,
      surplusAnalytics: [],
      candidateNearExpiryUnits: []
    };
  }

  const now = new Date();
  const components = componentType ? [componentType] : ['RED_BLOOD_CELLS', 'PLATELETS', 'PLASMA'];
  const surplusAnalytics = [];
  const candidateNearExpiryUnits = [];

  for (const comp of components) {
    // 7-day forecast demand
    const forecast = await generateComponentForecast({
      institutionId: institution.id,
      componentType: comp,
      horizonDays: 7
    });

    const dailyExpectedDemand = forecast.totalPredictedDemand / 7;

    // Available units sorted FEFO
    const units = await prisma.bloodUnit.findMany({
      where: {
        institutionId: institution.id,
        componentType: comp,
        inventoryStatus: 'AVAILABLE',
        testingStatus: 'PASSED',
        releaseStatus: 'RELEASED',
        expiryDate: { gt: now }
      },
      orderBy: { expiryDate: 'asc' }
    });

    let cumulativeStock = 0;
    let predictedSurplusUnits = 0;
    let nearExpiryExposureCount = 0;

    for (let i = 0; i < units.length; i++) {
      const unit = units[i];
      cumulativeStock++;

      const risk = evaluateUnitExpiryRisk(unit, now);
      const daysLeft = risk.daysUntilExpiry;
      const expectedConsumptionBeforeExpiry = daysLeft * dailyExpectedDemand;

      // If unit position in FEFO queue exceeds expected demand before its expiry date,
      // it is at exposure risk
      if (cumulativeStock > expectedConsumptionBeforeExpiry) {
        predictedSurplusUnits++;
      }

      if (risk.isNearExpiry) {
        nearExpiryExposureCount++;
        candidateNearExpiryUnits.push({
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
          institutionName: institution.name
        });
      }
    }

    surplusAnalytics.push({
      componentType: comp,
      totalAvailableUnits: units.length,
      nearExpiryExposureCount,
      predictedSurplusUnits,
      dailyForecastDemand: Math.round(dailyExpectedDemand * 10) / 10,
      exposureStatus: nearExpiryExposureCount > 0 ? (predictedSurplusUnits > 0 ? 'SURPLUS_AT_RISK' : 'MODERATE_MONITOR') : 'BALANCED',
      explanation: `${units.length} available units; estimated daily consumption is ${Math.round(dailyExpectedDemand * 10) / 10} units.`
    });
  }

  return {
    institution: {
      id: institution.id,
      name: institution.name,
      type: institution.type
    },
    surplusAnalytics,
    candidateNearExpiryUnits: candidateNearExpiryUnits.slice(0, 50),
    notice: 'Surplus and expiry exposure analytics are probabilistic planning models. Never discard or ship units without clinical and operational review.'
  };
}

/**
 * AI-4: Constrained Redistribution Recommendations
 * Ranks redistribution opportunities using multi-factor constrained scoring.
 */
export async function getRankedRedistributionSuggestions(actorUser, query = {}) {
  const { requestId, maxDistanceKm = 100 } = query;

  let request = null;
  if (requestId) {
    request = await prisma.bloodRequest.findUnique({
      where: { id: requestId },
      include: {
        hospital: { select: { id: true, name: true, latitude: true, longitude: true } }
      }
    });
    if (!request) {
      const error = new Error(`Blood request with ID ${requestId} not found`);
      error.statusCode = 404;
      throw error;
    }
  }

  // Find candidate participating source institutions
  const candidateSources = await prisma.institution.findMany({
    where: {
      verificationStatus: 'VERIFIED',
      isActive: true
    }
  });

  const suggestions = [];
  const now = new Date();

  // If request is provided: find matching surplus units from other institutions
  if (request) {
    const destHospital = request.hospital;

    for (const source of candidateSources) {
      if (source.id === request.hospitalId) continue;

      const distanceKm = calculateHaversineDistance(
        source.latitude,
        source.longitude,
        destHospital.latitude,
        destHospital.longitude
      );

      if (distanceKm === null || distanceKm > maxDistanceKm) continue;

      // Find unreserved, released, passed units at source
      const candidateUnits = await prisma.bloodUnit.findMany({
        where: {
          institutionId: source.id,
          componentType: request.requestedComponent,
          inventoryStatus: 'AVAILABLE',
          testingStatus: 'PASSED',
          releaseStatus: 'RELEASED',
          expiryDate: { gt: now }
        },
        orderBy: { expiryDate: 'asc' },
        take: 20
      });

      for (const unit of candidateUnits) {
        // Deterministic clinical compatibility hard check
        const compat = evaluateCompatibility(
          unit.componentType,
          unit.aboGroup,
          unit.rhFactor,
          request.requestedComponent,
          request.requestedABO,
          request.requestedRh
        );

        if (!compat.isCompatible) continue;

        const risk = evaluateUnitExpiryRisk(unit, now);

        // Hard constraint: Unit must have sufficient transit window
        const isTransitEligible = risk.canRedistribute;
        const reviewStatus = isTransitEligible ? 'ELIGIBLE' : 'MANUAL_REVIEW';

        // Transparent scoring algorithm (0 to 100)
        // Score = 40 (compatibility & match) + 30 * (1 - distance / maxDist) + 20 * (urgency) + 10 * (expiry urgency)
        const distanceScore = Math.max(0, 30 * (1 - distanceKm / maxDistanceKm));
        const urgencyScore = request.urgency === 'EMERGENCY' ? 20 : request.urgency === 'URGENT' ? 12 : 5;
        const expiryScore = risk.isNearExpiry ? 10 : 5;
        const totalScore = Math.round((40 + distanceScore + urgencyScore + expiryScore) * 10) / 10;

        suggestions.push({
          id: `rank-${unit.id}-${request.id}`,
          rankingScore: totalScore,
          scoreBreakdown: {
            compatibilityMatch: 40,
            distanceProximity: Math.round(distanceScore * 10) / 10,
            requestUrgency: urgencyScore,
            expiryUrgency: expiryScore
          },
          reviewStatus,
          manualReviewReason: !isTransitEligible ? risk.redistributionBlockReason : null,
          sourceInstitution: {
            id: source.id,
            name: source.name,
            type: source.type
          },
          destinationHospital: {
            id: destHospital.id,
            name: destHospital.name
          },
          distanceKm,
          bloodUnit: {
            id: unit.id,
            unitCode: unit.unitCode,
            componentType: unit.componentType,
            aboGroup: unit.aboGroup,
            rhFactor: unit.rhFactor,
            expiryDate: unit.expiryDate,
            hoursUntilExpiry: risk.hoursUntilExpiry,
            severity: risk.severity
          },
          targetRequest: {
            id: request.id,
            urgency: request.urgency,
            requestedQuantity: request.requestedQuantity,
            requiredBy: request.requiredBy
          },
          compatibility: compat
        });
      }
    }
  }

  // Sort descending by ranking score
  suggestions.sort((a, b) => b.rankingScore - a.rankingScore);

  return {
    requestId: request?.id || null,
    totalSuggestions: suggestions.length,
    suggestions: suggestions.slice(0, 25),
    notice: 'Redistribution rankings are decision support suggestions. Staff must manually create and approve transfers through the Transfer coordination workflow.'
  };
}

/**
 * AI-5: Statistical Anomaly Detection & Review Workflow
 * Uses rolling median and Median Absolute Deviation (MAD) to detect sudden spikes or drops in requested demand.
 */
export async function detectAndRecordAnomalies(institutionId) {
  const components = ['RED_BLOOD_CELLS', 'PLATELETS', 'PLASMA'];
  const detectedEvents = [];

  for (const comp of components) {
    const history = await getDailyHistoricalDemand({
      institutionId,
      componentType: comp,
      lookbackDays: 60
    });

    if (history.length < 14) continue;

    const units = history.map((h) => h.unitsRequested);
    const med = median(units);
    const mad = medianAbsoluteDeviation(units);

    // Dynamic threshold: at least 3 units variation
    const effectiveMad = Math.max(mad, 2.0);
    const thresholdHigh = med + 2.8 * effectiveMad;
    const thresholdLow = Math.max(0, med - 2.8 * effectiveMad);

    // Check last 7 days for anomalies
    const recentDays = history.slice(-7);

    for (const day of recentDays) {
      let isAnomaly = false;
      let type = 'SPIKE';
      let reason = '';

      if (day.unitsRequested > thresholdHigh) {
        isAnomaly = true;
        type = 'SPIKE';
        reason = `Requested demand (${day.unitsRequested} units) exceeded historical statistical ceiling (${Math.round(thresholdHigh)} units; Median: ${med}, MAD: ${Math.round(mad * 10) / 10}). Possible mass casualty incident or unscheduled surgical surge.`;
      } else if (day.unitsRequested < thresholdLow && day.unitsRequested === 0 && med >= 5) {
        isAnomaly = true;
        type = 'DROP';
        reason = `Unusual drop in demand (0 units requested vs expected baseline median ${med}). Check hospital EHR connectivity or operational closure.`;
      }

      if (isAnomaly) {
        const eventDate = new Date(`${day.date}T00:00:00.000Z`);

        // Check if already recorded
        const existing = await prisma.anomalyEvent.findFirst({
          where: {
            institutionId,
            componentType: comp,
            date: eventDate
          }
        });

        if (!existing) {
          const created = await prisma.anomalyEvent.create({
            data: {
              institutionId,
              componentType: comp,
              date: eventDate,
              observedValue: day.unitsRequested,
              expectedMin: Math.round(thresholdLow * 10) / 10,
              expectedMax: Math.round(thresholdHigh * 10) / 10,
              anomalyType: type,
              status: 'OPEN',
              reason,
              modelVersion: 'v1.0-median-mad'
            }
          });
          detectedEvents.push(created);

          // Module 12: Trigger manual review required notification
          notifyInstitutionStaff(institutionId, {
            type: 'MANUAL_REVIEW_REQUIRED',
            title: 'Manual Review Required: Statistical Demand Anomaly',
            message: `Demand anomaly detected for ${comp.replace(/_/g, ' ')}. Observed: ${day.unitsRequested} units. Staff review required.`,
            metadata: { anomalyId: created.id, componentType: comp, observedValue: day.unitsRequested }
          }).catch((err) => logger.warn(`Failed to broadcast anomaly notification: ${err.message}`));
        }
      }
    }
  }

  return detectedEvents;
}

/**
 * Retrieves anomaly events with role-based scoping and filtering.
 */
export async function getAnomalyEvents(actorUser, filters = {}) {
  const { status, componentType, page = 1, limit = 20, institutionId } = filters;

  const where = {};
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

  if (status && status !== 'ALL') {
    where.status = status;
  }
  if (componentType) {
    where.componentType = componentType;
  }

  const pageNum = Math.max(1, parseInt(page, 10));
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
  const skip = (pageNum - 1) * limitNum;

  const [total, anomalies] = await Promise.all([
    prisma.anomalyEvent.count({ where }),
    prisma.anomalyEvent.findMany({
      where,
      skip,
      take: limitNum,
      orderBy: { date: 'desc' },
      include: {
        institution: { select: { id: true, name: true, type: true } },
        reviewedBy: { select: { id: true, name: true, email: true } }
      }
    })
  ]);

  return {
    anomalies,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1
    }
  };
}

/**
 * Reviews and updates status of an anomaly event (ACKNOWLEDGED, DISMISSED, RESOLVED).
 */
export async function reviewAnomalyEvent(actorUser, anomalyId, data) {
  const anomaly = await prisma.anomalyEvent.findUnique({
    where: { id: anomalyId }
  });

  if (!anomaly) {
    const error = new Error(`Anomaly event with ID ${anomalyId} not found`);
    error.statusCode = 404;
    throw error;
  }

  if (actorUser.role !== 'PLATFORM_ADMIN' && anomaly.institutionId !== actorUser.institutionId) {
    const error = new Error('Access denied: Cannot review anomaly belonging to another institution');
    error.statusCode = 403;
    throw error;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const res = await tx.anomalyEvent.update({
      where: { id: anomalyId },
      data: {
        status: data.status,
        reviewNotes: data.notes || null,
        reviewedById: actorUser.id,
        reviewedAt: new Date()
      },
      include: {
        institution: true,
        reviewedBy: { select: { id: true, name: true } }
      }
    });

    await tx.auditLog.create({
      data: {
        actorId: actorUser.id,
        institutionId: anomaly.institutionId,
        entityType: 'ANOMALY_EVENT',
        entityId: anomaly.id,
        action: 'UPDATE',
        metadata: {
          previousStatus: anomaly.status,
          newStatus: data.status,
          notes: data.notes
        }
      }
    });

    return res;
  });

  return updated;
}

/**
 * Retrieves persisted model evaluations and backtest metrics.
 */
export async function getModelEvaluations(actorUser, filters = {}) {
  const { componentType, horizonDays, institutionId } = filters;

  const where = {};
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
  if (horizonDays) where.horizonDays = parseInt(horizonDays, 10);

  const evaluations = await prisma.modelEvaluation.findMany({
    where,
    orderBy: { evaluatedAt: 'desc' },
    take: 50,
    include: {
      institution: { select: { id: true, name: true } }
    }
  });

  return evaluations;
}

