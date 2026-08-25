import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  execute: vi.fn(),
  fetchMenu: vi.fn(),
  applyTransition: vi.fn(),
  syncSource: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/db", () => ({
  db: {
    query: { canteenMenuSources: { findFirst: mocks.findFirst } },
    execute: mocks.execute,
  },
}));
vi.mock("@/lib/canteen-menu-source-adapters", () => ({
  fetchMenuFromProvider: (...args: unknown[]) => mocks.fetchMenu(...args),
}));
vi.mock("@/lib/canteen-menu-sync-store", () => ({
  applyApprovedMenuIdentityTransition: (...args: unknown[]) =>
    mocks.applyTransition(...args),
}));
vi.mock("@/lib/canteen-menu-source-sync", () => ({
  syncCanteenMenuSource: (...args: unknown[]) => mocks.syncSource(...args),
}));

import {
  executeReviewedIdentityTransition,
  isReviewedIdentityTransitionKey,
  listReviewedIdentityTransitions,
} from "@/lib/canteen-reviewed-identity-transition";

const SOURCE = {
  id: "5a12f2e2-e829-4454-8bf1-33c344de67da",
  canteenId: "canteen-1",
  provider: "aigens" as const,
  externalOwnerId: null,
  externalStoreId: "102830",
  config: {},
  enabled: true,
  legacyTakeoverAt: null,
};

describe("reviewed identity transition executor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findFirst.mockResolvedValue(SOURCE);
    mocks.execute.mockResolvedValue({
      rows: [{ database_now: "2026-08-24T04:00:00.000Z" }],
    });
    mocks.fetchMenu.mockResolvedValue({
      snapshotCompleteness: "partial",
      scopeEvidence: {},
      takeOverLegacyItems: false,
      items: [{ externalProductId: "product-1" }],
    });
    mocks.applyTransition.mockResolvedValue({
      plan: {
        actions: [
          { action: "create" },
          { action: "update" },
          { action: "reactivate" },
          { action: "deactivate" },
        ],
      },
      canonicalState: { input: { items: [{}, {}, {}] } },
    });
    mocks.syncSource.mockResolvedValue({
      sourceId: SOURCE.id,
      status: "unchanged",
      code: "MENU_SYNC_UNCHANGED",
      itemCount: 3,
    });
  });

  it("derives the UI facts from the checked-in reviewed artifacts", () => {
    expect(listReviewedIdentityTransitions()).toEqual([
      expect.objectContaining({
        key: "aigens-102830",
        externalStoreId: "102830",
        existingCount: 81,
        incomingCount: 160,
        replacementCount: 0,
        canonicalizationCount: 53,
        mergeCount: 0,
        additionCount: 93,
        removalCount: 2,
      }),
      expect.objectContaining({
        key: "aigens-112891",
        externalStoreId: "112891",
        existingCount: 111,
        incomingCount: 32,
        replacementCount: 0,
        canonicalizationCount: 12,
        mergeCount: 41,
        additionCount: 2,
        removalCount: 0,
      }),
      expect.objectContaining({
        key: "ichef-uqft-kwxu",
        provider: "ichef",
        externalStoreId: "UQftKWxU",
        existingCount: 51,
        incomingCount: 51,
        replacementCount: 51,
        canonicalizationCount: 0,
        mergeCount: 0,
        additionCount: 0,
        removalCount: 0,
      }),
    ]);
    expect(isReviewedIdentityTransitionKey("toString")).toBe(false);
  });

  it("fetches, applies the reviewed artifact, then performs an ordinary retry", async () => {
    await expect(
      executeReviewedIdentityTransition("aigens-102830"),
    ).resolves.toEqual({
      sourceId: SOURCE.id,
      transition: {
        status: "applied",
        itemCount: 3,
        createdCount: 1,
        updatedCount: 2,
        deactivatedCount: 1,
      },
      retry: {
        status: "unchanged",
        code: "MENU_SYNC_UNCHANGED",
        itemCount: 3,
      },
    });

    expect(mocks.fetchMenu).toHaveBeenCalledWith(SOURCE, {
      observedAt: new Date("2026-08-24T04:00:00.000Z"),
      syncWindowKey: "2026-08-24/lunch",
      mealPeriod: "lunch",
    });
    expect(mocks.applyTransition).toHaveBeenCalledWith(
      SOURCE.id,
      expect.objectContaining({ takeOverLegacyItems: false }),
      expect.objectContaining({
        schemaVersion: 5,
        source: expect.objectContaining({ externalStoreId: "102830" }),
      }),
    );
    expect(mocks.syncSource).toHaveBeenCalledWith(SOURCE.id);
    expect(mocks.applyTransition.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.syncSource.mock.invocationCallOrder[0],
    );
  });

  it("preserves a committed transition result when the ordinary retry throws", async () => {
    mocks.syncSource.mockRejectedValue(
      new Error("UPSTREAM_HTTP_503 https://private.example/token=secret"),
    );

    const result = await executeReviewedIdentityTransition("aigens-102830");

    expect(result.transition.status).toBe("applied");
    expect(result.retry).toEqual({
      status: "internal-failure",
      code: "UPSTREAM_HTTP_503",
    });
    expect(JSON.stringify(result)).not.toContain("private.example");
  });

  it("does not retry when the reviewed transition fails before committing", async () => {
    mocks.applyTransition.mockRejectedValue(new Error("MENU_SYNC_STALE"));

    await expect(
      executeReviewedIdentityTransition("aigens-102830"),
    ).rejects.toThrow("MENU_SYNC_STALE");
    expect(mocks.syncSource).not.toHaveBeenCalled();
  });
});
