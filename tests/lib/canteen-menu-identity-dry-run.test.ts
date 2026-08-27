import { describe, expect, it } from "vitest";
import { buildCanonicalIdentityDryRunReport } from "@/lib/canteen-menu-identity-dry-run";

describe("canonical identity production dry-run", () => {
  it("reports deterministic survivor and history impact without actor identifiers", () => {
    const report = buildCanonicalIdentityDryRunReport({
      generatedAt: new Date("2026-08-27T00:00:00Z"),
      items: [
        {
          id: "00000000-0000-4000-8000-000000000002",
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          name: "紙包飲品",
          normalizedName: null,
          isAvailable: true,
          createdAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "00000000-0000-4000-8000-000000000001",
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          name: "紙包飲品",
          normalizedName: "紙包飲品",
          isAvailable: false,
          createdAt: new Date("2025-01-01T00:00:00Z"),
        },
      ],
      offerings: [
        {
          menuItemId: "00000000-0000-4000-8000-000000000002",
          externalProductId: "new-id",
        },
        {
          menuItemId: "00000000-0000-4000-8000-000000000001",
          externalProductId: "old-id",
        },
      ],
      comments: [
        {
          id: "comment-1",
          menuItemId: "00000000-0000-4000-8000-000000000002",
        },
      ],
      votes: [
        {
          id: "vote-old",
          menuItemId: "00000000-0000-4000-8000-000000000001",
          userId: "private-user",
          anonymousSessionId: null,
          vote: "like",
          createdAt: new Date("2026-01-01T00:00:00Z"),
          updatedAt: new Date("2026-01-01T00:00:00Z"),
        },
        {
          id: "vote-new",
          menuItemId: "00000000-0000-4000-8000-000000000002",
          userId: "private-user",
          anonymousSessionId: null,
          vote: "dislike",
          createdAt: new Date("2026-02-01T00:00:00Z"),
          updatedAt: new Date("2026-02-02T00:00:00Z"),
        },
      ],
    });

    expect(report).toEqual({
      generatedAt: "2026-08-27T00:00:00.000Z",
      mode: "read-only",
      fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
      mergeGroupCount: 1,
      groups: [
        {
          canteenId: "canteen-1",
          menuSourceId: "source-1",
          normalizedName: "紙包飲品",
          survivorItemId: "00000000-0000-4000-8000-000000000001",
          mergedItemIds: ["00000000-0000-4000-8000-000000000002"],
          externalProductIds: ["new-id", "old-id"],
          activeRowsBefore: 1,
          inactiveRowsBefore: 1,
          commentsMoved: 1,
          voteRowsBefore: 2,
          duplicateVoteActors: 1,
          conflictingVoteActors: 1,
          voteRowsDeleted: 1,
          voteRowsMoved: 1,
        },
      ],
      totals: {
        retiredItems: 1,
        commentsMoved: 1,
        voteRowsDeleted: 1,
        voteRowsMoved: 1,
      },
    });
    expect(JSON.stringify(report)).not.toContain("private-user");
  });
});
