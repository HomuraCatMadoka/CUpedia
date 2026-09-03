import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const { cleanup } = vi.hoisted(() => ({ cleanup: vi.fn() }));

vi.mock("@/lib/campus-map/place-photos", () => ({
  cleanupCampusMapPlacePhotoAssets: cleanup,
}));

import { GET } from "@/app/api/internal/campus-map/place-photo-cleanup/route";

function request(token?: string) {
  return new Request(
    "http://localhost/api/internal/campus-map/place-photo-cleanup",
    { headers: token ? { authorization: `Bearer ${token}` } : {} },
  );
}

describe("Campus Map place-photos cleanup cron (#818)", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "cleanup-test-secret");
    cleanup.mockReset();
  });

  it("rejects callers without the deployment cron secret", async () => {
    const response = await GET(request());
    expect(response.status).toBe(401);
    expect(cleanup).not.toHaveBeenCalled();
  });

  it("uses a Hobby-compatible daily schedule as a reconciliation safety net", () => {
    const vercel = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as { crons?: Array<{ path: string; schedule: string }> };
    expect(vercel.crons).toContainEqual({
      path: "/api/internal/campus-map/place-photo-cleanup",
      schedule: "17 0 * * *",
    });
  });

  it("drains bounded batches without a later user request", async () => {
    cleanup
      .mockResolvedValueOnce({ deleted: 50 })
      .mockResolvedValueOnce({ deleted: 2 });
    const response = await GET(request("cleanup-test-secret"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ deleted: 52 });
    expect(cleanup).toHaveBeenCalledTimes(2);
    expect(cleanup).toHaveBeenCalledWith({ limit: 50 });
  });

  it("does not expose storage details when cleanup fails", async () => {
    cleanup.mockRejectedValueOnce(new Error("secret object key"));
    const response = await GET(request("cleanup-test-secret"));
    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "CLEANUP_FAILED" });
  });
});
