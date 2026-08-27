import { describe, expect, it } from "vitest";
import { assertCanonicalIdentityActivationFingerprint } from "@/lib/canteen-menu-identity-rollout";

describe("canonical identity production activation", () => {
  it("accepts only the exact reviewed dry-run fingerprint", () => {
    const fingerprint = "a".repeat(64);
    expect(() =>
      assertCanonicalIdentityActivationFingerprint(fingerprint, fingerprint),
    ).not.toThrow();
    expect(() =>
      assertCanonicalIdentityActivationFingerprint(fingerprint, "b".repeat(64)),
    ).toThrow("REVIEWED_DRY_RUN_FINGERPRINT_CHANGED");
    expect(() =>
      assertCanonicalIdentityActivationFingerprint("approved", fingerprint),
    ).toThrow("INVALID_REVIEWED_DRY_RUN_FINGERPRINT");
  });
});
