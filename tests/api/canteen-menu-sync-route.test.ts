import { beforeEach, describe, expect, it, vi } from "vitest";

const { syncEnabledCanteenMenuSources } = vi.hoisted(() => ({
  syncEnabledCanteenMenuSources: vi.fn(),
}));

vi.mock("@/lib/canteen-menu-source-sync", () => ({
  syncEnabledCanteenMenuSources,
  isMenuSourceSyncFailure: (result: { status: string }) =>
    [
      "blocked",
      "provider-failure",
      "source-unavailable",
      "internal-failure",
      "superseded",
    ].includes(result.status),
}));

import { GET } from "@/app/api/cron/canteen-menu-sync/route";

describe("canteen menu sync cron route", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    syncEnabledCanteenMenuSources.mockReset();
  });

  it("fails closed when no cron secret is configured", async () => {
    vi.stubEnv("CRON_SECRET", "");

    const response = await GET(
      new Request("http://localhost/api/cron/canteen-menu-sync"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "NOT_CONFIGURED" });
    expect(syncEnabledCanteenMenuSources).not.toHaveBeenCalled();
  });

  it("rejects a missing or incorrect bearer secret", async () => {
    vi.stubEnv("CRON_SECRET", "menu-sync-secret");

    for (const authorization of [undefined, "Bearer wrong-secret"]) {
      const response = await GET(
        new Request("http://localhost/api/cron/canteen-menu-sync", {
          headers: authorization ? { authorization } : undefined,
        }),
      );
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toEqual({ error: "UNAUTHORIZED" });
    }
    expect(syncEnabledCanteenMenuSources).not.toHaveBeenCalled();
  });

  it("returns a multi-status summary when one source fails", async () => {
    vi.stubEnv("CRON_SECRET", "menu-sync-secret");
    syncEnabledCanteenMenuSources.mockResolvedValue([
      {
        sourceId: "source-ok",
        canteenId: "canteen-ok",
        status: "unchanged",
        itemCount: 10,
      },
      {
        sourceId: "source-failed",
        canteenId: "canteen-failed",
        runId: "run-failed",
        status: "blocked",
        code: "MENU_SYNC_IDENTITY_CHURN",
      },
    ]);

    const response = await GET(
      new Request("http://localhost/api/cron/canteen-menu-sync", {
        headers: { authorization: "Bearer menu-sync-secret" },
      }),
    );

    expect(response.status).toBe(207);
    await expect(response.json()).resolves.toMatchObject({
      synced: 2,
      failed: 1,
    });
    expect(syncEnabledCanteenMenuSources).toHaveBeenCalledOnce();
  });
});
