// Hour-based thresholds; shelf-life values are in days.

export const EXPIRY_THRESHOLDS = {
  PLATELETS: {
    shelfLifeDays: 5,
    criticalHours: 24,
    highHours: 48,
    mediumHours: 72,
    redistributionMinHours: 12
  },
  RED_BLOOD_CELLS: {
    shelfLifeDays: 42,
    criticalHours: 72,
    highHours: 168,
    mediumHours: 336,
    redistributionMinHours: 36
  },
  PLASMA: {
    shelfLifeDays: 365,
    criticalHours: 168,
    highHours: 720,
    mediumHours: 1440,
    redistributionMinHours: 48
  }
};

/** Returns the component thresholds, defaulting to red blood cells. */
export function getComponentThresholds(componentType) {
  return EXPIRY_THRESHOLDS[componentType] || EXPIRY_THRESHOLDS.RED_BLOOD_CELLS;
}

/** Evaluates a unit's expiry risk relative to the reference date. */
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
