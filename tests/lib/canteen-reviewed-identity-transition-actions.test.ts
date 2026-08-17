import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  execute: vi.fn(),
  getStaleDetails: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: (...args: unknown[]) => mocks.requireAdmin(...args),
}));
vi.mock("@/lib/canteen-reviewed-identity-transition", () => ({
  executeReviewedIdentityTransition: (...args: unknown[]) =>
    mocks.execute(...args),
  isReviewedIdentityTransitionKey: (value: unknown) =>
    value === "aigens-102830" || value === "aigens-112891",
  listReviewedIdentityTransitions: () => [
    { key: "aigens-102830", externalStoreId: "102830" },
    { key: "aigens-112891", externalStoreId: "112891" },
  ],
}));
vi.mock("@/lib/canteen-menu-identity-transition", () => ({
  getMenuIdentityTransitionStaleDetails: (...args: unknown[]) =>
    mocks.getStaleDetails(...args),
}));
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));

import { executeReviewedIdentityTransitionAction } from "@/lib/canteen-reviewed-identity-transition-actions";

const EXECUTION = {
  sourceId: "source-1",
  transition: {
    status: "applied" as const,
    itemCount: 154,
    createdCount: 87,
    updatedCount: 53,
    deactivatedCount: 2,
  },
  retry: {
    status: "unchanged" as const,
    code: "MENU_SYNC_UNCHANGED" as const,
    itemCount: 154,
  },
};

describe("executeReviewedIdentityTransitionAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAdmin.mockResolvedValue({ id: "admin-1", role: "admin" });
    mocks.execute.mockResolvedValue(EXECUTION);
    mocks.getStaleDetails.mockReturnValue(null);
  });

  it("authorizes before validating or executing", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Admin access required"));

    await expect(executeReviewedIdentityTransitionAction(null)).rejects.toThrow(
      "Admin access required",
    );
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("rejects non-allowlisted transitions and mismatched confirmation", async () => {
    await expect(
      executeReviewedIdentityTransitionAction({
        key: "aigens-999999",
        confirmation: "999999",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "REVIEWED_TRANSITION_NOT_ALLOWED",
    });
    await expect(
      executeReviewedIdentityTransitionAction({
        key: "aigens-102830",
        confirmation: "112891",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "REVIEWED_TRANSITION_CONFIRMATION_MISMATCH",
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("does not mistake inherited object properties for allowlisted keys", async () => {
    await expect(
      executeReviewedIdentityTransitionAction({
        key: "toString",
        confirmation: "toString",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "REVIEWED_TRANSITION_NOT_ALLOWED",
    });
    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("executes the exact reviewed transition and refreshes health facts", async () => {
    await expect(
      executeReviewedIdentityTransitionAction({
        key: "aigens-102830",
        confirmation: " 102830 ",
      }),
    ).resolves.toEqual({ ok: true, execution: EXECUTION });

    expect(mocks.execute).toHaveBeenCalledWith("aigens-102830");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/canteen-sync");
  });

  it("returns only a normalized error code when transition execution fails", async () => {
    mocks.execute.mockRejectedValue(
      new Error("MENU_SYNC_STALE https://private.example/token=secret"),
    );

    await expect(
      executeReviewedIdentityTransitionAction({
        key: "aigens-102830",
        confirmation: "102830",
      }),
    ).resolves.toEqual({ ok: false, code: "MENU_SYNC_STALE" });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns bounded stale diagnostics without refreshing health facts", async () => {
    const diagnostic = {
      existingMatches: true,
      incomingMatches: false,
      currentSummary: {
        existingCount: 81,
        incomingCount: 67,
        missingIdentityCount: 53,
        newIdentityCount: 39,
        replacementCandidateCount: 0,
        canonicalizationCandidateCount: 53,
        mergeCandidateCount: 0,
        additionCount: 39,
        removalCount: 0,
        ambiguityCount: 0,
      },
      currentScope: {
        categoryCount: 13,
        groupCount: 24,
        categoryPeriodCodes: ["B"],
      },
    };
    const error = new Error(
      "MENU_IDENTITY_TRANSITION_STALE https://private.example/token=secret",
    );
    mocks.execute.mockRejectedValue(error);
    mocks.getStaleDetails.mockImplementation((candidate) =>
      candidate === error ? diagnostic : null,
    );

    await expect(
      executeReviewedIdentityTransitionAction({
        key: "aigens-102830",
        confirmation: "102830",
      }),
    ).resolves.toEqual({
      ok: false,
      code: "MENU_IDENTITY_TRANSITION_STALE",
      diagnostic,
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
    expect(JSON.stringify(diagnostic)).not.toContain("private.example");
  });
});
