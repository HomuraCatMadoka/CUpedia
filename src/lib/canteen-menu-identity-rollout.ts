export function assertCanonicalIdentityActivationFingerprint(
  expectedFingerprint: string,
  actualFingerprint: string,
): void {
  if (!/^[0-9a-f]{64}$/.test(expectedFingerprint)) {
    throw new Error("INVALID_REVIEWED_DRY_RUN_FINGERPRINT");
  }
  if (expectedFingerprint !== actualFingerprint) {
    throw new Error("REVIEWED_DRY_RUN_FINGERPRINT_CHANGED");
  }
}
