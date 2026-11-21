/**
 * Expiry Thresholds and Component Shelf-Life Configurations
 *
 * Different blood components have distinct shelf lives and operational risk profiles:
 * - PLATELETS: 5 days total shelf life (room temp 20-24°C with agitation).
 *     Redistribution window: must have at least 12 hours remaining.
 * - RED_BLOOD_CELLS: 42 days total shelf life (refrigerated 1-6°C).
 *     Redistribution window: must have at least 36 hours remaining.
 * - PLASMA: 365 days / 1 year total shelf life (frozen <= -18°C).
 *     Redistribution window: must have at least 48 hours remaining.
 */

export const EXPIRY_THRESHOLDS = {
  PLATELETS: {
    shelfLifeDays: 5,
    criticalHours: 24,       // <= 1 day left
    highHours: 48,           // <= 2 days left
    mediumHours: 72,         // <= 3 days left
    redistributionMinHours: 12 // Minimum remaining shelf-life for safe inter-facility transit
  },
  RED_BLOOD_CELLS: {
    shelfLifeDays: 42,
    criticalHours: 72,       // <= 3 days left
    highHours: 168,          // <= 7 days left
    mediumHours: 336,        // <= 14 days left
    redistributionMinHours: 36 // Minimum remaining shelf-life for safe inter-facility transit
  },
  PLASMA: {
    shelfLifeDays: 365,
    criticalHours: 168,      // <= 7 days left
    highHours: 720,          // <= 30 days left
    mediumHours: 1440,       // <= 60 days left
    redistributionMinHours: 48 // Minimum remaining shelf-life for safe inter-facility transit
  }
};

/**
 * Returns configuration for a given component type with fallback.
 */
export function getComponentThresholds(componentType) {
  return EXPIRY_THRESHOLDS[componentType] || EXPIRY_THRESHOLDS.RED_BLOOD_CELLS;
}

/**
 * Calculates detailed expiry risk metrics for a blood unit relative to server reference UTC date.
 *
 * @param {Object} unit Blood unit object containing expiryDate and componentType
 * @param {Date} referenceDate UTC reference date (defaults to now)
 * @returns {Object} Expiry risk evaluation
 */
export function evaluateUnitExpiryRisk(unit, referenceDate = new Date()) {
  const expiryTime = new Date(unit.expiryDate).getTime();
  const refTime = new Date(referenceDate).getTime();
  const diffMs = expiryTime - refTime;
  const hoursUntilExpiry = diffMs / (1000 * 60 * 60);
  const daysUntilExpiry = diffMs / (1000 * 60 * 60 * 24);

  const thresholds = getComponentThresholds(unit.componentType);

  if (hoursUntilExpiry <= 0) {
    return {
      isExpired: true,
      isNearExpiry: false,
      severity: 'CRITICAL',
      hoursUntilExpiry: Math.max(0, Math.round(hoursUntilExpiry * 10) / 10),
      daysUntilExpiry: Math.max(0, Math.round(daysUntilExpiry * 10) / 10),
      canRedistribute: false,
      redistributionBlockReason: 'Unit is already expired',
      thresholds
    };
  }

  let severity = 'LOW';
  let isNearExpiry = false;

  if (hoursUntilExpiry <= thresholds.criticalHours) {
    severity = 'CRITICAL';
    isNearExpiry = true;
  } else if (hoursUntilExpiry <= thresholds.highHours) {
    severity = 'HIGH';
    isNearExpiry = true;
  } else if (hoursUntilExpiry <= thresholds.mediumHours) {
    severity = 'MEDIUM';
    isNearExpiry = true;
  }

  // Near-expiry redistribution candidate assessment:
  // Must be available, testing passed, released, and have sufficient transit window
  const hasTransitWindow = hoursUntilExpiry >= thresholds.redistributionMinHours;
  let canRedistribute = false;
  let redistributionBlockReason = null;

  if (!isNearExpiry) {
    redistributionBlockReason = 'Unit is not yet approaching expiry';
  } else if (!hasTransitWindow) {
    redistributionBlockReason = `Insufficient remaining shelf life (${Math.round(hoursUntilExpiry)}h < minimum ${thresholds.redistributionMinHours}h transit window)`;
  } else if (unit.inventoryStatus !== 'AVAILABLE') {
    redistributionBlockReason = `Unit status is '${unit.inventoryStatus}' (must be AVAILABLE)`;
  } else if (unit.testingStatus !== 'PASSED') {
    redistributionBlockReason = `Testing status is '${unit.testingStatus}' (must be PASSED)`;
  } else if (unit.releaseStatus !== 'RELEASED') {
    redistributionBlockReason = `Release status is '${unit.releaseStatus}' (must be RELEASED)`;
  } else {
    canRedistribute = true;
  }

  return {
    isExpired: false,
    isNearExpiry,
    severity,
    hoursUntilExpiry: Math.round(hoursUntilExpiry * 10) / 10,
    daysUntilExpiry: Math.round(daysUntilExpiry * 10) / 10,
    canRedistribute,
    redistributionBlockReason,
    thresholds
  };
}

