/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { push, getCount, getPage, markOne, markAll } = vi.hoisted(() => ({
  push: vi.fn(),
  getCount: vi.fn(),
  getPage: vi.fn(),
  markOne: vi.fn(),
  markAll: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/notification-actions", () => ({
  getUnreadNotificationCount: (...args: unknown[]) => getCount(...args),
  getNotifications: (...args: unknown[]) => getPage(...args),
  markNotificationRead: (...args: unknown[]) => markOne(...args),
  markAllNotificationsRead: (...args: unknown[]) => markAll(...args),
}));

import { NotificationCenter } from "@/components/layout/notification-center";

const unreadNotification = {
  id: "notification-1",
  kind: "course_review_reply" as const,
  actorNickname: "Alice",
  actorAvatarUrl: "/alice.png",
  courseCode: "CSCI3150",
  createdAt: "2026-07-27T10:00:00.000Z",
  href: "/courses/CSCI3150?review=review-1&reply=reply-1",
  read: false,
};

const announcementNotification = {
  id: "notification-announcement",
  kind: "announcement_published" as const,
  title: "迎新资料已更新",
  createdAt: "2026-08-12T10:00:00.000Z",
  href: "/announcements/announcement-1",
  read: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  getCount.mockResolvedValue(0);
  getPage.mockResolvedValue({ notifications: [], hasMore: false });
  markOne.mockResolvedValue(undefined);
  markAll.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe("NotificationCenter", () => {
  it("loads on page mount and formats the unread badge as 1–9 or 9+", async () => {
    getCount.mockResolvedValue(10);

    render(<NotificationCenter />);

    expect(await screen.findByText("9+")).toBeTruthy();
    expect(getCount).toHaveBeenCalledOnce();
  });

  it("hides a zero or failed count, then retries count and list when opened", async () => {
    getCount
      .mockRejectedValueOnce(new Error("count failed"))
      .mockResolvedValueOnce(2);
    getPage.mockResolvedValue({
      notifications: [unreadNotification],
      hasMore: false,
    });

    render(<NotificationCenter />);
    await waitFor(() => expect(getCount).toHaveBeenCalledOnce());
    expect(screen.queryByTestId("notification-badge")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "通知" }));

    expect(await screen.findByText("Alice")).toBeTruthy();
    expect(getCount).toHaveBeenCalledTimes(2);
    expect(getPage).toHaveBeenCalledWith(0);
  });

  it("shows distinct empty, loading, and retryable list states", async () => {
    let rejectPage!: (reason: Error) => void;
    getPage
      .mockReturnValueOnce(
        new Promise((_resolve, reject) => {
          rejectPage = reject;
        }),
      )
      .mockResolvedValueOnce({ notifications: [], hasMore: false });

    render(<NotificationCenter />);
    fireEvent.click(screen.getByRole("button", { name: "通知" }));
    expect(await screen.findByText("正在加载通知…")).toBeTruthy();

    rejectPage(new Error("list failed"));
    expect(await screen.findByText("通知加载失败")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(await screen.findByText("暂无通知")).toBeTruthy();
  });

  it("marks an item read before navigating to its deep link", async () => {
    getCount.mockResolvedValue(1);
    getPage.mockResolvedValue({
      notifications: [unreadNotification],
      hasMore: false,
    });
    let completeMark!: () => void;
    markOne.mockReturnValue(
      new Promise<void>((resolve) => {
        completeMark = resolve;
      }),
    );

    render(<NotificationCenter />);
    fireEvent.click(await screen.findByRole("button", { name: /通知/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Alice/ }));

    expect(markOne).toHaveBeenCalledWith("notification-1");
    expect(push).not.toHaveBeenCalled();
    completeMark();
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(unreadNotification.href),
    );
  });

  it("renders an announcement notification without an actor avatar", async () => {
    getPage.mockResolvedValue({
      notifications: [announcementNotification],
      hasMore: false,
    });

    render(<NotificationCenter />);
    fireEvent.click(screen.getByRole("button", { name: "通知" }));

    expect(await screen.findByText("新公告：迎新资料已更新")).toBeTruthy();
    expect(screen.queryByText("回复了你在")).toBeNull();
  });

  it("marks all unread history without showing a success message", async () => {
    getCount.mockResolvedValue(4);
    getPage.mockResolvedValue({
      notifications: [unreadNotification],
      hasMore: true,
    });

    render(<NotificationCenter />);
    fireEvent.click(await screen.findByRole("button", { name: /通知/ }));
    fireEvent.click(
      await screen.findByRole("button", { name: "全部标为已读" }),
    );

    await waitFor(() => expect(markAll).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.queryByTestId("notification-badge")).toBeNull(),
    );
    expect(screen.queryByText("全部通知已标为已读")).toBeNull();
  });

  it("does not race mark-all against an in-flight list refresh", async () => {
    getCount.mockResolvedValue(2);
    getPage.mockReturnValue(new Promise(() => undefined));

    render(<NotificationCenter />);
    fireEvent.click(
      await screen.findByRole("button", { name: "通知，2 条未读" }),
    );

    const markAllButton = await screen.findByRole("button", {
      name: "全部标为已读",
    });
    expect((markAllButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(markAllButton);
    expect(markAll).not.toHaveBeenCalled();
  });

  it("loads 10 notifications at a time and refreshes count on window focus", async () => {
    const firstPage = Array.from({ length: 10 }, (_, index) => ({
      ...unreadNotification,
      id: `notification-${index}`,
      read: true,
    }));
    getPage
      .mockResolvedValueOnce({ notifications: firstPage, hasMore: true })
      .mockResolvedValueOnce({ notifications: [], hasMore: false });

    render(<NotificationCenter />);
    fireEvent.click(screen.getByRole("button", { name: "通知" }));
    fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
    await waitFor(() => expect(getPage).toHaveBeenLastCalledWith(10));

    window.dispatchEvent(new Event("focus"));
    await waitFor(() => expect(getCount).toHaveBeenCalledTimes(3));
  });
});
