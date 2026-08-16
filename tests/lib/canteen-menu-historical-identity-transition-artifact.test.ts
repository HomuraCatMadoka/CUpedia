import { describe, expect, it } from "vitest";
import { parseMenuIdentityTransitionArtifact } from "@/lib/canteen-menu-identity-transition";
import artifactInput from "../../docs/operations/artifacts/canteen-menu-identity-transition-aigens-102830-v3.json";

describe("historical Aigens identity transition artifact", () => {
  it("records the exact Production-shaped audit and keeps every ambiguity non-executable", () => {
    const artifact = parseMenuIdentityTransitionArtifact(artifactInput);

    expect(artifact.source).toMatchObject({
      provider: "aigens",
      externalOwnerId: null,
      externalStoreId: "102830",
    });
    expect(artifact.audit.summary).toEqual({
      existingCount: 81,
      incomingCount: 102,
      missingIdentityCount: 40,
      newIdentityCount: 61,
      replacementCandidateCount: 0,
      additionCount: 9,
      removalCount: 14,
      ambiguityCount: 26,
    });
    expect(artifact.audit.ambiguities).toHaveLength(26);
    expect(artifact.decisions).toEqual({
      snapshotScope: { status: "unreviewed", rationale: "" },
      replacements: [],
      additions: [],
      removals: [],
      ambiguities: [],
    });
  });
});
