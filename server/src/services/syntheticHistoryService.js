import { prisma } from '../config/db.js';
import { createSeededRng, samplePoisson } from '../utils/mathUtils.js';
import { logger } from '../utils/logger.js';

const ABO_RH_DISTRIBUTION = [
  { abo: 'O', rh: 'POSITIVE', weight: 0.38 },
  { abo: 'A', rh: 'POSITIVE', weight: 0.34 },
  { abo: 'B', rh: 'POSITIVE', weight: 0.09 },
  { abo: 'O', rh: 'NEGATIVE', weight: 0.07 },
  { abo: 'A', rh: 'NEGATIVE', weight: 0.06 },
  { abo: 'AB', rh: 'POSITIVE', weight: 0.03 },
  { abo: 'B', rh: 'NEGATIVE', weight: 0.02 },
  { abo: 'AB', rh: 'NEGATIVE', weight: 0.01 }
];

const COMPONENT_DISTRIBUTION = [
  { type: 'RED_BLOOD_CELLS', baseDailyMean: 8, weight: 0.65 },
  { type: 'PLATELETS', baseDailyMean: 3, weight: 0.20 },
  { type: 'PLASMA', baseDailyMean: 4, weight: 0.15 }
];

// Day-of-week multiplier (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
// Clinical elective surgeries typically peak Tuesday-Thursday
const DOW_MULTIPLIERS = [0.65, 1.15, 1.25, 1.20, 1.10, 0.85, 0.70];

/**
 * Generates 180+ days of reproducible synthetic clinical blood request history.
 *
 * @param {Object} options
 * @param {number} [options.days=180] Number of historical days
 * @param {number} [options.seed=424242] Integer seed for RNG reproducibility
 * @param {boolean} [options.force=false] Clear and reseed if true
 * @returns {Promise<Object>} Seeding summary
 */
export async function seedSyntheticRequestHistory(options = {}) {
  const { days = 180, seed = 424242, force = false } = options;
  const rng = createSeededRng(seed);

  logger.info(`🩸 Generating ${days} days of reproducible synthetic request history (seed: ${seed})...`);

  // Find participating hospitals
  const hospitals = await prisma.institution.findMany({
    where: { type: 'HOSPITAL', verificationStatus: 'VERIFIED' },
    include: {
      users: { where: { role: 'HOSPITAL_STAFF', isActive: true }, take: 1 }
    }
  });

  if (hospitals.length === 0) {
    throw new Error('No verified hospital institutions found. Seed institutions first.');
  }

  // Check if historical requests already exist
  const existingCount = await prisma.bloodRequest.count({
    where: { isSynthetic: true }
  });

  if (existingCount >= 200 && !force) {
    logger.info(`Synthetic history already populated (${existingCount} requests). Skipping regeneration.`);
    return {
      message: 'Synthetic history already populated',
      existingRequests: existingCount,
      daysProvided: days
    };
  }

  if (force && existingCount > 0) {
    logger.info('Force reseed requested: removing previous synthetic request records...');
    await prisma.bloodRequest.deleteMany({
      where: { isSynthetic: true }
    });
  }

  const now = new Date();
  const createdRequests = [];

  // Designated synthetic spike days (e.g. mass casualty incident or holiday weekend trauma)
  const spikeDayOffsets = [15, 45, 92, 134];

  for (let dayOffset = days; dayOffset >= 1; dayOffset--) {
    const calendarDate = new Date(now.getTime() - dayOffset * 86400000);
    calendarDate.setUTCHours(10, 0, 0, 0);
    const dayOfWeek = calendarDate.getUTCDay();
    const dowFactor = DOW_MULTIPLIERS[dayOfWeek];
    const isSpikeDay = spikeDayOffsets.includes(dayOffset);

    for (const hospital of hospitals) {
      const creator = hospital.users[0];
      if (!creator) continue;

      for (const comp of COMPONENT_DISTRIBUTION) {
        // Poisson count models discrete daily demand around the clinical mean.
        let meanCount = comp.baseDailyMean * dowFactor;
        if (isSpikeDay) {
          meanCount *= 2.8; // Trauma emergency spike
        }

        const totalUnitsForComp = samplePoisson(meanCount, rng);

        if (totalUnitsForComp === 0) continue;

        // Break into discrete requests (e.g. 1 to 4 units per patient request)
        let remainingUnits = totalUnitsForComp;
        while (remainingUnits > 0) {
          const reqQty = Math.min(remainingUnits, Math.floor(rng() * 3) + 1);
          remainingUnits -= reqQty;

          // Pick blood group according to population distribution
          const rBlood = rng();
          let cumWeight = 0;
          let selectedGroup = ABO_RH_DISTRIBUTION[0];
          for (const item of ABO_RH_DISTRIBUTION) {
            cumWeight += item.weight;
            if (rBlood <= cumWeight) {
              selectedGroup = item;
              break;
            }
          }

          // Pick urgency
          const rUrg = rng();
          let urgency = 'ROUTINE';
          if (isSpikeDay || rUrg > 0.85) urgency = 'EMERGENCY';
          else if (rUrg > 0.60) urgency = 'URGENT';

          // Status: 85% FULFILLED, 8% PARTIALLY_ALLOCATED, 5% CANCELLED, 2% UNFULFILLED
          const rStatus = rng();
          let status = 'FULFILLED';
          if (rStatus > 0.98) status = 'UNFULFILLED';
          else if (rStatus > 0.93) status = 'CANCELLED';
          else if (rStatus > 0.85) status = 'PARTIALLY_ALLOCATED';

          const requestTimestamp = new Date(calendarDate.getTime() + Math.floor(rng() * 10 * 3600000));
          const requiredByTimestamp = new Date(requestTimestamp.getTime() + (urgency === 'EMERGENCY' ? 2 : 24) * 3600000);

          createdRequests.push({
            hospitalId: hospital.id,
            createdById: creator.id,
            requestedComponent: comp.type,
            requestedABO: selectedGroup.abo,
            requestedRh: selectedGroup.rh,
            requestedQuantity: reqQty,
            urgency,
            status,
            requiredBy: requiredByTimestamp,
            reason: isSpikeDay ? 'Synthetic Mass Casualty Exercise / Trauma Spike' : 'Synthetic Routine Clinical Demand',
            isSynthetic: true,
            createdAt: requestTimestamp,
            updatedAt: requestTimestamp
          });
        }
      }
    }
  }

  // Insert in batches of 200
  logger.info(`Saving ${createdRequests.length} synthetic blood request records to PostgreSQL...`);
  const batchSize = 200;
  for (let i = 0; i < createdRequests.length; i += batchSize) {
    const chunk = createdRequests.slice(i, i + batchSize);
    await prisma.bloodRequest.createMany({
      data: chunk
    });
  }

  logger.info(`✅ Successfully seeded ${createdRequests.length} synthetic requests covering ${days} historical days.`);

  return {
    success: true,
    requestsCreated: createdRequests.length,
    daysCovered: days,
    hospitalsInvolved: hospitals.length,
    seedUsed: seed
  };
}

