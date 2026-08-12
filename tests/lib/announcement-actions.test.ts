import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const returning = vi.fn();
  const where = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where }));
  const update = vi.fn(() => ({ set }));
  const values = vi.fn(() => ({ returning }));
  const insert = vi.fn(() => ({ values }));
  const limit = vi.fn();
  const selectWhere = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where: selectWhere }));
  const select = vi.fn(() => ({ from }));
  const execute = vi.fn();
  const tx = { insert, update, select, execute };
  return {
    requireAdmin: vi.fn(),
    revalidatePath: vi.fn(),
    transaction: vi.fn(async (callback: (value: typeof tx) => unknown) =>
      callback(tx),
    ),
    returning,
    where,
    set,
    update,
    values,
    insert,
    limit,
    execute,
  };
});

vi.mock("@/lib/auth-guard", () => ({
  requireAdmin: (...args: unknown[]) => mocks.requireAdmin(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => mocks.revalidatePath(...args),
}));

vi.mock("@/db", () => ({
  db: {
    transaction: (callback: (value: unknown) => unknown) =>
      mocks.transaction(callback as never),
  },
}));

import {
  createAnnouncement,
  updateAnnouncement,
} from "@/lib/announcement-actions";

const baseInput = {
  title: "迎新资料已更新",
  content: "请查看最新入学指南。",
  priority: 20,
  expiresAt: null,
  publishAt: null,
  published: false,
  sendNotification: false,
};
const announcementId = "00000000-0000-4000-a100-000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireAdmin.mockResolvedValue({ id: "admin-1", role: "admin" });
  mocks.returning
    .mockResolvedValueOnce([{ id: announcementId, title: "迎新资料已更新" }])
    .mockResolvedValue([]);
  mocks.execute.mockResolvedValue(undefined);
});

describe("announcement admin actions", () => {
  it("creates a draft without broadcasting a notification", async () => {
    await expect(createAnnouncement(baseInput)).resolves.toEqual({
      id: announcementId,
    });

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "迎新资料已更新",
        publishedAt: null,
        createdBy: "admin-1",
      }),
    );
    expect(mocks.execute).not.toHaveBeenCalled();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/");
  });

  it("broadcasts once when a new announcement is published with notification enabled", async () => {
    mocks.returning
      .mockReset()
      .mockResolvedValueOnce([{ id: announcementId, title: "迎新资料已更新" }])
      .mockResolvedValueOnce([
        {
          id: announcementId,
          title: "迎新资料已更新",
          actorId: "admin-1",
        },
      ]);
    await createAnnouncement({
      ...baseInput,
      published: true,
      sendNotification: true,
    });

    expect(mocks.execute).toHaveBeenCalledOnce();
    expect(mocks.set).toHaveBeenCalledWith({
      notificationSentAt: expect.any(Date),
    });
  });

  it("does not rebroadcast an announcement whose notification was already sent", async () => {
    mocks.limit.mockResolvedValue([
      {
        publishedAt: new Date("2026-08-12T10:00:00Z"),
        notificationSentAt: new Date("2026-08-12T10:00:00Z"),
      },
    ]);

    await updateAnnouncement(announcementId, {
      ...baseInput,
      published: true,
      sendNotification: true,
    });

    expect(mocks.execute).not.toHaveBeenCalled();
  });

  it("stores a future publication time instead of publishing immediately", async () => {
    const publishAt = "2026-09-01T10:00:00.000Z";

    await createAnnouncement({
      ...baseInput,
      published: true,
      publishAt,
    });

    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({ publishedAt: new Date(publishAt) }),
    );
  });

  it("publishes an existing schedule immediately when its time is cleared", async () => {
    const scheduledAt = new Date("2026-09-01T10:00:00.000Z");
    mocks.limit.mockResolvedValue([
      {
        publishedAt: scheduledAt,
        withdrawnAt: null,
        notificationSentAt: null,
      },
    ]);

    await updateAnnouncement(announcementId, {
      ...baseInput,
      published: true,
      publishAt: null,
    });

    const update = (mocks.set.mock.calls as unknown[][])
      .map((call) => call[0] as { publishedAt?: Date } | undefined)
      .find((value) => value?.publishedAt !== undefined);
    expect(update).toBeDefined();
    if (!update?.publishedAt) throw new Error("missing publication update");
    expect(update.publishedAt).toBeInstanceOf(Date);
    expect(update.publishedAt.getTime()).not.toBe(scheduledAt.getTime());
  });

  it("clears notification delivery when cancelling a scheduled publication", async () => {
    mocks.limit.mockResolvedValue([
      {
        publishedAt: new Date("2099-09-01T10:00:00.000Z"),
        withdrawnAt: null,
        expiresAt: null,
        notificationSentAt: null,
      },
    ]);

    await updateAnnouncement(announcementId, {
      ...baseInput,
      published: false,
      sendNotification: false,
    });

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedAt: null,
        withdrawnAt: null,
        notifyOnPublish: false,
      }),
    );
  });

  it("keeps publication and notification history when withdrawing", async () => {
    const originalPublication = new Date("2026-08-11T10:00:00Z");
    mocks.limit.mockResolvedValue([
      {
        publishedAt: originalPublication,
        withdrawnAt: null,
        notificationSentAt: null,
      },
    ]);

    await updateAnnouncement(announcementId, {
      ...baseInput,
      published: false,
    });

    expect(mocks.set).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedAt: originalPublication,
        withdrawnAt: expect.any(Date),
      }),
    );
  });

  it("does not enable notifications when republishing a withdrawn announcement", async () => {
    const originalPublication = new Date("2026-08-11T10:00:00Z");
    mocks.limit.mockResolvedValue([
      {
        publishedAt: originalPublication,
        withdrawnAt: new Date("2026-08-11T12:00:00Z"),
        notifyOnPublish: true,
        notificationSentAt: null,
      },
    ]);

    await updateAnnouncement(announcementId, {
      ...baseInput,
      published: true,
      sendNotification: true,
    });

    const announcementUpdate = (mocks.set.mock.calls as unknown[][])
      .map((call) => call[0] as { notifyOnPublish?: boolean } | undefined)
      .find((value) => value && "notifyOnPublish" in value);
    expect(announcementUpdate?.notifyOnPublish).toBe(false);
    expect(mocks.execute).not.toHaveBeenCalled();
  });
});
