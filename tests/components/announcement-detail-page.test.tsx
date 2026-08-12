/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getPublicAnnouncement: vi.fn(),
}));

vi.mock("@/lib/announcement-queries", () => ({
  getPublicAnnouncement: mocks.getPublicAnnouncement,
}));

import AnnouncementDetailPage from "@/app/(main)/announcements/[id]/page";

describe("AnnouncementDetailPage", () => {
  it("explains unavailable announcement links instead of showing a generic 404", async () => {
    mocks.getPublicAnnouncement.mockResolvedValue(null);

    render(
      await AnnouncementDetailPage({
        params: Promise.resolve({
          id: "00000000-0000-4000-a100-000000000001",
        }),
      }),
    );

    expect(screen.getByRole("heading", { name: "公告不存在" })).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "返回全部公告" }).getAttribute("href"),
    ).toBe("/announcements");
  });
});
