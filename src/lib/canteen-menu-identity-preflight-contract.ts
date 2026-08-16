export const CANTEEN_MENU_IDENTITY_PREFLIGHT_CONTRACT = {
  contractVersion: "canteen-menu-identity-preconditions/v3",
  reportSchemaVersion: "canteen-menu-identity-preflight-report/v2",
  targetIssue: 643,
  sampleLimit: 5,
  transaction: {
    isolationLevel: "REPEATABLE READ",
    readOnly: true,
  },
  checkCodes: [
    "SOURCE_CANTEEN_OWNERSHIP_MISMATCH",
    "AUTHORITATIVE_IDENTITY_NULL_ASYMMETRY",
    "DUPLICATE_AUTHORITATIVE_IDENTITY",
    "ROLLOUT_SHADOW_MISMATCH",
    "UNSUPPORTED_LEGACY_IDENTITY",
    "MERGE_OR_UUID_REPLACEMENT_REQUIRED",
  ],
  diagnosticReasonCodes: [
    "source-owner",
    "authoritative-null-asymmetry",
    "shadow-null-asymmetry",
    "unsupported-source-namespace",
    "unsupported-product-key",
    "shadow-authoritative-disagreement",
    "duplicate-authoritative-identity",
    "multiple-uuids-one-authoritative-identity",
    "multiple-uuids-one-projected-identity",
  ],
  resultCodes: {
    safe: "PREFLIGHT_SAFE",
    unsafe: "PREFLIGHT_UNSAFE",
    configurationError: "PREFLIGHT_CONFIGURATION_ERROR",
    databaseError: "PREFLIGHT_DATABASE_ERROR",
  },
  exitCodes: {
    safe: 0,
    unsafe: 2,
    configurationError: 3,
    databaseError: 4,
  },
} as const;

export type CanteenMenuIdentityPreflightCheckCode =
  (typeof CANTEEN_MENU_IDENTITY_PREFLIGHT_CONTRACT.checkCodes)[number];

export type CanteenMenuIdentityPreflightReasonCode =
  (typeof CANTEEN_MENU_IDENTITY_PREFLIGHT_CONTRACT.diagnosticReasonCodes)[number];
