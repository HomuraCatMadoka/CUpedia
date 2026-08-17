import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  execute: vi.fn(),
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
});
