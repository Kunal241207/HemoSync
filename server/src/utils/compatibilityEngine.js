/**
 * HemoSync Deterministic Blood Compatibility Engine
 * Version: v1.0-clinical-standard
 * 
 * Implements deterministic, versioned, component-specific compatibility matrices
 * for Red Blood Cells, Fresh Frozen Plasma, and Platelets.
 * 
 * Safety Rules:
 * 1. Red-cell compatibility rules MUST NEVER be used for plasma or platelets.
 * 2. If an unapproved or unknown profile is encountered, manual review is mandated (no guessing).
 * 3. Generative AI is strictly prohibited from making clinical compatibility decisions.
 */

export const CLINICAL_RULES_VERSION = 'v1.0-clinical-standard';

/**
 * RED BLOOD CELLS (PRBC) COMPATIBILITY MATRIX
 * Recipient antibodies attack donor red blood cell antigens.
 * O- is Universal Red Cell Donor. AB+ is Universal Red Cell Recipient.
 */
export const RED_CELL_COMPATIBILITY = {
  'O_NEGATIVE': [
    { abo: 'O', rh: 'NEGATIVE', isIdentical: true }
  ],
  'O_POSITIVE': [
    { abo: 'O', rh: 'POSITIVE', isIdentical: true },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false }
  ],
  'A_NEGATIVE': [
    { abo: 'A', rh: 'NEGATIVE', isIdentical: true },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false }
  ],
  'A_POSITIVE': [
    { abo: 'A', rh: 'POSITIVE', isIdentical: true },
    { abo: 'A', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'O', rh: 'POSITIVE', isIdentical: false },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false }
  ],
  'B_NEGATIVE': [
    { abo: 'B', rh: 'NEGATIVE', isIdentical: true },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false }
  ],
  'B_POSITIVE': [
    { abo: 'B', rh: 'POSITIVE', isIdentical: true },
    { abo: 'B', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'O', rh: 'POSITIVE', isIdentical: false },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false }
  ],
  'AB_NEGATIVE': [
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: true },
    { abo: 'A', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'B', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false }
  ],
  'AB_POSITIVE': [
    { abo: 'AB', rh: 'POSITIVE', isIdentical: true },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'A', rh: 'POSITIVE', isIdentical: false },
    { abo: 'A', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'B', rh: 'POSITIVE', isIdentical: false },
    { abo: 'B', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'O', rh: 'POSITIVE', isIdentical: false },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false }
  ]
};

/**
 * FRESH FROZEN PLASMA (FFP) COMPATIBILITY MATRIX
 * Inverse of Red Cells. Donor plasma contains antibodies against recipient red cell antigens.
 * AB is Universal Plasma Donor (no anti-A or anti-B antibodies).
 * O is Universal Plasma Recipient (plasma with antibodies cannot harm O cells which lack A/B antigens).
 * Rh factor in plasma is non-cellular and generally compatible regardless of RhD.
 */
export const PLASMA_COMPATIBILITY = {
  'O_NEGATIVE': [
    { abo: 'O', rh: 'NEGATIVE', isIdentical: true },
    { abo: 'O', rh: 'POSITIVE', isIdentical: false },
    { abo: 'A', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'A', rh: 'POSITIVE', isIdentical: false },
    { abo: 'B', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'B', rh: 'POSITIVE', isIdentical: false },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'AB', rh: 'POSITIVE', isIdentical: false }
  ],
  'O_POSITIVE': [
    { abo: 'O', rh: 'POSITIVE', isIdentical: true },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'A', rh: 'POSITIVE', isIdentical: false },
    { abo: 'A', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'B', rh: 'POSITIVE', isIdentical: false },
    { abo: 'B', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'AB', rh: 'POSITIVE', isIdentical: false },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false }
  ],
  'A_NEGATIVE': [
    { abo: 'A', rh: 'NEGATIVE', isIdentical: true },
    { abo: 'A', rh: 'POSITIVE', isIdentical: false },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'AB', rh: 'POSITIVE', isIdentical: false }
  ],
  'A_POSITIVE': [
    { abo: 'A', rh: 'POSITIVE', isIdentical: true },
    { abo: 'A', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'AB', rh: 'POSITIVE', isIdentical: false },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false }
  ],
  'B_NEGATIVE': [
    { abo: 'B', rh: 'NEGATIVE', isIdentical: true },
    { abo: 'B', rh: 'POSITIVE', isIdentical: false },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'AB', rh: 'POSITIVE', isIdentical: false }
  ],
  'B_POSITIVE': [
    { abo: 'B', rh: 'POSITIVE', isIdentical: true },
    { abo: 'B', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'AB', rh: 'POSITIVE', isIdentical: false },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false }
  ],
  'AB_NEGATIVE': [
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: true },
    { abo: 'AB', rh: 'POSITIVE', isIdentical: false }
  ],
  'AB_POSITIVE': [
    { abo: 'AB', rh: 'POSITIVE', isIdentical: true },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false }
  ]
};

/**
 * PLATELETS COMPATIBILITY MATRIX
 * Platelets express ABO antigens. Primary goal is ABO-identical, secondary is compatible plasma/ABO.
 * Rh-negative recipients should ideally receive Rh-negative platelets (or anti-D prophylaxis).
 */
export const PLATELETS_COMPATIBILITY = {
  'O_NEGATIVE': [
    { abo: 'O', rh: 'NEGATIVE', isIdentical: true },
    { abo: 'O', rh: 'POSITIVE', isIdentical: false },
    { abo: 'A', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'B', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false }
  ],
  'O_POSITIVE': [
    { abo: 'O', rh: 'POSITIVE', isIdentical: true },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'A', rh: 'POSITIVE', isIdentical: false },
    { abo: 'B', rh: 'POSITIVE', isIdentical: false },
    { abo: 'AB', rh: 'POSITIVE', isIdentical: false }
  ],
  'A_NEGATIVE': [
    { abo: 'A', rh: 'NEGATIVE', isIdentical: true },
    { abo: 'A', rh: 'POSITIVE', isIdentical: false },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false }
  ],
  'A_POSITIVE': [
    { abo: 'A', rh: 'POSITIVE', isIdentical: true },
    { abo: 'A', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'AB', rh: 'POSITIVE', isIdentical: false },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'O', rh: 'POSITIVE', isIdentical: false },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false }
  ],
  'B_NEGATIVE': [
    { abo: 'B', rh: 'NEGATIVE', isIdentical: true },
    { abo: 'B', rh: 'POSITIVE', isIdentical: false },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false }
  ],
  'B_POSITIVE': [
    { abo: 'B', rh: 'POSITIVE', isIdentical: true },
    { abo: 'B', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'AB', rh: 'POSITIVE', isIdentical: false },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'O', rh: 'POSITIVE', isIdentical: false },
    { abo: 'O', rh: 'NEGATIVE', isIdentical: false }
  ],
  'AB_NEGATIVE': [
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: true },
    { abo: 'AB', rh: 'POSITIVE', isIdentical: false },
    { abo: 'A', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'B', rh: 'NEGATIVE', isIdentical: false }
  ],
  'AB_POSITIVE': [
    { abo: 'AB', rh: 'POSITIVE', isIdentical: true },
    { abo: 'AB', rh: 'NEGATIVE', isIdentical: false },
    { abo: 'A', rh: 'POSITIVE', isIdentical: false },
    { abo: 'B', rh: 'POSITIVE', isIdentical: false },
    { abo: 'O', rh: 'POSITIVE', isIdentical: false }
  ]
};

function buildProfileKey(abo, rh) {
  return `${abo}_${rh}`.toUpperCase();
}

/**
 * Returns compatible donor profiles for a given component type and recipient ABO/Rh.
 * Returns null if the configuration is not defined (triggering mandatory manual review).
 */
export function getCompatibleDonorProfiles(componentType, recipientABO, recipientRh) {
  const key = buildProfileKey(recipientABO, recipientRh);

  switch (componentType) {
    case 'RED_BLOOD_CELLS':
      return RED_CELL_COMPATIBILITY[key] || null;
    case 'PLASMA':
      return PLASMA_COMPATIBILITY[key] || null;
    case 'PLATELETS':
      return PLATELETS_COMPATIBILITY[key] || null;
    default:
      return null;
  }
}

/**
 * Evaluates deterministic clinical compatibility between a request and a candidate blood unit.
 * Strictly separates component rules and handles unknown configurations safely.
 */
export function evaluateCompatibility(
  requestedComponent,
  recipientABO,
  recipientRh,
  donorComponent,
  donorABO,
  donorRh
) {
  // 1. Component mismatch is an absolute hard blocker
  if (requestedComponent !== donorComponent) {
    return {
      compatible: false,
      isIdentical: false,
      manualReviewRequired: false,
      reason: `Component mismatch: Requested ${requestedComponent} but donor unit is ${donorComponent}`,
      clinicalRuleVersion: CLINICAL_RULES_VERSION
    };
  }

  // 2. Fetch component-specific compatibility matrix
  const compatibleProfiles = getCompatibleDonorProfiles(requestedComponent, recipientABO, recipientRh);

  if (!compatibleProfiles) {
    return {
      compatible: false,
      isIdentical: false,
      manualReviewRequired: true,
      reason: `No approved clinical compatibility rule configured for component ${requestedComponent} and profile ${recipientABO} ${recipientRh}`,
      clinicalRuleVersion: CLINICAL_RULES_VERSION
    };
  }

  // 3. Check if donor profile is in the approved compatible set
  const match = compatibleProfiles.find(
    (p) => p.abo === donorABO && p.rh === donorRh
  );

  if (match) {
    const isIdentical = recipientABO === donorABO && recipientRh === donorRh;
    return {
      compatible: true,
      isIdentical,
      manualReviewRequired: false,
      reason: isIdentical
        ? `Identical match: ${donorABO}${donorRh === 'POSITIVE' ? '+' : '-'}`
        : `Clinically compatible alternative (${donorABO}${donorRh === 'POSITIVE' ? '+' : '-'} for ${recipientABO}${recipientRh === 'POSITIVE' ? '+' : '-'}) under standard ${requestedComponent} matrix`,
      clinicalRuleVersion: CLINICAL_RULES_VERSION
    };
  }

  return {
    compatible: false,
    isIdentical: false,
    manualReviewRequired: false,
    reason: `Incompatible: ${donorABO}${donorRh === 'POSITIVE' ? '+' : '-'} cannot be given to ${recipientABO}${recipientRh === 'POSITIVE' ? '+' : '-'} for ${requestedComponent}`,
    clinicalRuleVersion: CLINICAL_RULES_VERSION
  };
}

