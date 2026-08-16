import { describe, expect, it } from "vitest";
import { parseMenuIdentityTransitionArtifact } from "@/lib/canteen-menu-identity-transition";
import aigens112891 from "../../docs/operations/artifacts/canteen-menu-identity-transition-aigens-112891-v3.json";

describe("reviewed canteen menu identity-transition artifacts", () => {
  it("fully classifies the CU CAFE 112891 beverage removals", () => {
    const artifact = parseMenuIdentityTransitionArtifact(aigens112891);

    expect(artifact.source).toMatchObject({
      provider: "aigens",
      externalOwnerId: null,
      externalStoreId: "112891",
    });
    expect(artifact.audit.snapshotCompleteness).toBe("complete");
    expect(artifact.audit.summary).toEqual({
      existingCount: 111,
      incomingCount: 51,
      missingIdentityCount: 60,
      newIdentityCount: 0,
      replacementCandidateCount: 0,
      additionCount: 0,
      removalCount: 60,
      ambiguityCount: 0,
    });
    expect(artifact.decisions.snapshotScope).toMatchObject({
      status: "complete",
    });
    expect(artifact.decisions.replacements).toEqual([]);
    expect(artifact.decisions.additions).toEqual([]);
    expect(artifact.decisions.ambiguities).toEqual([]);

    const auditedRemovals = new Set(
      artifact.audit.removals.map(
        (removal) =>
          `${removal.itemId}\u0000${removal.evidence.externalProductId}`,
      ),
    );
    const reviewedRemovals = new Set(
      artifact.decisions.removals.map(
        (removal) => `${removal.itemId}\u0000${removal.externalProductId}`,
      ),
    );
    expect(reviewedRemovals).toEqual(auditedRemovals);
    expect(reviewedRemovals.size).toBe(60);
  });
});
