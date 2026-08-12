import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { broadcastDueAnnouncements } = vi.hoisted(() => ({
  broadcastDueAnnouncements: vi.fn(),
}));

vi.mock("@/lib/announcement-broadcast", () => ({
  broadcastDueAnnouncements,
}));

import { GET } from "@/app/api/cron/announcements/route";

describe("GET /api/cron/announcements", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = "test-cron-secret";
    broadcastDueAnnouncements.mockResolvedValue(2);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
  });

  it("fails closed when the cron secret is not configured", async () => {
    delete process.env.CRON_SECRET;

    const response = await GET(
      new Request("http://localhost/api/cron/announcements"),
    );

    expect(response.status).toBe(503);
    expect(broadcastDueAnnouncements).not.toHaveBeenCalled();
  });

  it("rejects requests without the Vercel cron bearer token", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/announcements"),
    );

    expect(response.status).toBe(401);
    expect(broadcastDueAnnouncements).not.toHaveBeenCalled();
  });

  it("broadcasts a bounded batch for an authorized cron invocation", async () => {
    const response = await GET(
      new Request("http://localhost/api/cron/announcements", {
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ processed: 2 });
    expect(broadcastDueAnnouncements).toHaveBeenCalledOnce();
  });
});
