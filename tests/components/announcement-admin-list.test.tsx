/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnouncementAdminList } from "@/components/admin/announcement-admin-list";
import type { AdminAnnouncement } from "@/lib/announcement-types";

const NOW = new Date("2026-08-12T12:00:00.000Z");

function announcement(
  index: number,
  overrides: Partial<AdminAnnouncement> = {},
): AdminAnnouncement {
  return {
    id: `00000000-0000-4000-a300-${String(index).padStart(12, "0")}`,
    title: `公告 ${index}`,
    content: "正文",
    priority: 0,
    publishedAt: null,
    withdrawnAt: null,
    expiresAt: null,
    notificationSentAt: null,
    notifyOnPublish: false,
    updatedAt: "2026-08-11T10:00:00.000Z",
    ...overrides,
  };
}

afterEach(cleanup);

describe("AnnouncementAdminList", () => {
  it("shows the empty state", () => {
    render(
      <AnnouncementAdminList
        announcements={[]}
        now={NOW}
        selectedId={null}
        hiddenOnMobile={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("还没有公告")).toBeTruthy();
  });

  it("searches and reports a no-match state", () => {
    render(
      <AnnouncementAdminList
        announcements={Array.from({ length: 11 }, (_, index) =>
          announcement(index + 1),
        )}
        now={NOW}
        selectedId={null}
        hiddenOnMobile={false}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByLabelText("搜索公告标题"), {
      target: { value: "不存在" },
    });

    expect(screen.getByText("没有符合当前条件的公告")).toBeTruthy();
  });

  it("marks the selected row and delegates selection", () => {
    const onSelect = vi.fn();
    const selected = announcement(1);
    render(
      <AnnouncementAdminList
        announcements={[selected]}
        now={NOW}
        selectedId={selected.id}
        hiddenOnMobile={false}
        onSelect={onSelect}
      />,
    );

    const row = screen.getByRole("button", { name: /公告 1/ });
    expect(row.className).toContain("border-foreground");
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(selected);
  });

  it("shows pending notification state", () => {
    render(
      <AnnouncementAdminList
        announcements={[
          announcement(1, {
            publishedAt: "2099-08-13T10:00:00.000Z",
            notifyOnPublish: true,
          }),
        ]}
        now={NOW}
        selectedId={null}
        hiddenOnMobile={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("待通知")).toBeTruthy();
  });

  it("pages ten announcements at a time", () => {
    render(
      <AnnouncementAdminList
        announcements={Array.from({ length: 11 }, (_, index) =>
          announcement(index + 1),
        )}
        now={NOW}
        selectedId={null}
        hiddenOnMobile={false}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByText("第 1 / 2 页")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /公告 11/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(screen.getByText("第 2 / 2 页")).toBeTruthy();
    expect(screen.getByRole("button", { name: /公告 11/ })).toBeTruthy();
  });

  it("groups offline rows while preserving canonical labels and counts", () => {
    const drafts = Array.from({ length: 9 }, (_, index) =>
      announcement(index + 1),
    );
    render(
      <AnnouncementAdminList
        announcements={[
          announcement(10, {
            title: "到期公告",
            publishedAt: "2026-08-10T10:00:00.000Z",
            expiresAt: "2026-08-12T10:00:00.000Z",
          }),
          announcement(11, {
            title: "撤回公告",
            publishedAt: "2026-08-10T10:00:00.000Z",
            withdrawnAt: "2026-08-12T10:00:00.000Z",
          }),
          ...drafts,
        ]}
        now={NOW}
        selectedId={null}
        hiddenOnMobile={false}
        onSelect={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /已下线2/ }));

    expect(
      screen.getByRole("button", { name: /到期公告/ }).textContent,
    ).toContain("已失效");
    expect(
      screen.getByRole("button", { name: /撤回公告/ }).textContent,
    ).toContain("已撤回");
  });
});
