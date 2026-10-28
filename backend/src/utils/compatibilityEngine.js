/** Versioned component-specific compatibility rules; unknown profiles require manual review. */

export const CLINICAL_RULES_VERSION = 'v1.0-clinical-standard';

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

/** Evaluates compatibility using the approved matrix for the requested component. */
export function evaluateCompatibility(
  requestedComponent,
  recipientABO,
  recipientRh,
  donorComponent,
  donorABO,
  donorRh
) {
  if (requestedComponent !== donorComponent) {
    return {
      compatible: false,
      isIdentical: false,
      manualReviewRequired: false,
      reason: `Component mismatch: Requested ${requestedComponent} but donor unit is ${donorComponent}`,
      clinicalRuleVersion: CLINICAL_RULES_VERSION
    };
  }

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
