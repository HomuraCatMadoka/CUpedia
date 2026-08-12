/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
  refresh: vi.fn(),
}));

const SERVER_NOW = "2026-08-12T12:00:00.000Z";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/announcement-actions", () => ({
  createAnnouncement: mocks.createAnnouncement,
  deleteAnnouncement: mocks.deleteAnnouncement,
  updateAnnouncement: mocks.updateAnnouncement,
}));

import { AnnouncementAdminPanel } from "@/components/admin/announcement-admin-panel";
import type { AdminAnnouncement } from "@/lib/announcement-types";

const published: AdminAnnouncement = {
  id: "00000000-0000-4000-a100-000000000001",
  title: "已发布公告",
  content: "正文",
  priority: 10,
  publishedAt: "2026-08-11T10:00:00.000Z",
  withdrawnAt: null,
  expiresAt: null,
  notificationSentAt: "2026-08-11T10:00:00.000Z",
  notifyOnPublish: true,
  updatedAt: "2026-08-11T10:00:00.000Z",
};

const scheduled: AdminAnnouncement = {
  ...published,
  id: "00000000-0000-4000-a100-000000000002",
  title: "待发布公告",
  publishedAt: "2099-08-13T10:00:00.000Z",
  notificationSentAt: null,
};

const withdrawn: AdminAnnouncement = {
  ...published,
  id: "00000000-0000-4000-a100-000000000003",
  title: "已撤回公告",
  withdrawnAt: "2026-08-12T10:00:00.000Z",
};

const expired: AdminAnnouncement = {
  ...published,
  id: "00000000-0000-4000-a100-000000000004",
  title: "到期公告",
  expiresAt: "2026-08-12T10:00:00.000Z",
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/");
});

describe("AnnouncementAdminPanel", () => {
  it("groups offline announcements without hiding their lifecycle", () => {
    const drafts = Array.from({ length: 9 }, (_, index) => ({
      ...published,
      id: `00000000-0000-4000-a200-${String(index + 1).padStart(12, "0")}`,
      title: `草稿 ${index + 1}`,
      publishedAt: null,
      notificationSentAt: null,
      notifyOnPublish: false,
    }));
    render(
      <AnnouncementAdminPanel
        announcements={[expired, withdrawn, ...drafts]}
        serverNow={SERVER_NOW}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /已下线/ }));

    expect(
      screen.getByRole("button", { name: /到期公告/ }).textContent,
    ).toContain("已失效");
    expect(
      screen.getByRole("button", { name: /已撤回公告/ }).textContent,
    ).toContain("已撤回");
  });

  it("summarizes a published announcement and confirms withdrawal", () => {
    render(
      <AnnouncementAdminPanel
        announcements={[published]}
        serverNow={SERVER_NOW}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /已发布公告/ }));

    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.getByText("首次发布于", { exact: false })).toBeTruthy();
    expect(screen.getByText("已通知")).toBeTruthy();
    expect(screen.getByRole("button", { name: "保存更改" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "撤回" }));
    expect(screen.getByRole("alertdialog").textContent).toContain(
      "撤回这条公告？",
    );
    expect(screen.getByRole("button", { name: "确认撤回" })).toBeTruthy();
  });

  it("warns before discarding unsaved edits when switching announcements", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <AnnouncementAdminPanel
        announcements={[published, scheduled]}
        serverNow={SERVER_NOW}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /已发布公告/ }));
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "尚未保存的标题" },
    });
    fireEvent.click(screen.getByRole("button", { name: /待发布公告/ }));

    expect(confirm).toHaveBeenCalledWith(
      "当前公告有未保存更改，确定要放弃这些更改吗？",
    );
    expect((screen.getByLabelText("标题") as HTMLInputElement).value).toBe(
      "尚未保存的标题",
    );
    confirm.mockRestore();
  });

  it("blocks internal navigation while the form has unsaved edits", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <>
        <a href="/admin/users">用户管理</a>
        <AnnouncementAdminPanel announcements={[]} serverNow={SERVER_NOW} />
      </>,
    );
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "尚未保存的标题" },
    });

    const followed = fireEvent.click(
      screen.getByRole("link", { name: "用户管理" }),
    );

    expect(followed).toBe(false);
    expect(confirm).toHaveBeenCalledWith(
      "当前公告有未保存更改，确定要放弃这些更改吗？",
    );
    confirm.mockRestore();
  });

  it("blocks browser history navigation while the form has unsaved edits", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const pushState = vi.spyOn(window.history, "pushState");
    render(
      <AnnouncementAdminPanel announcements={[]} serverNow={SERVER_NOW} />,
    );
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "尚未保存的标题" },
    });

    fireEvent.popState(window);

    expect(confirm).toHaveBeenCalledWith(
      "当前公告有未保存更改，确定要放弃这些更改吗？",
    );
    expect(pushState).toHaveBeenCalledTimes(2);
    confirm.mockRestore();
    pushState.mockRestore();
  });

  it("reuses an existing history guard after returning to the admin page", () => {
    window.history.replaceState(
      { cupediaAnnouncementNavigationGuardToken: "existing-guard" },
      "",
      "/admin/announcements",
    );
    const pushState = vi.spyOn(window.history, "pushState");

    render(
      <AnnouncementAdminPanel announcements={[]} serverNow={SERVER_NOW} />,
    );

    expect(pushState).not.toHaveBeenCalled();
    pushState.mockRestore();
  });

  it("requires confirmation before immediate publication", () => {
    render(
      <AnnouncementAdminPanel announcements={[]} serverNow={SERVER_NOW} />,
    );

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "新公告" },
    });
    fireEvent.change(screen.getByLabelText("正文"), {
      target: { value: "公告正文" },
    });
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "发布…" }));

    expect(screen.getByRole("dialog").textContent).toContain("发布公告");
    expect(
      (screen.getByRole("radio", { name: "立即发布" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(mocks.createAnnouncement).not.toHaveBeenCalled();
  });

  it("treats republishing a withdrawn announcement as a fresh publication", () => {
    render(
      <AnnouncementAdminPanel
        announcements={[withdrawn]}
        serverNow={SERVER_NOW}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /已撤回公告/ }));

    expect(screen.queryByLabelText("计划发布时间")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "发布…" }));
    expect(screen.getByRole("radio", { name: "立即发布" })).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByText("更多设置")).toBeTruthy();
  });

  it("can cancel a schedule from the progressive publication dialog", () => {
    render(
      <AnnouncementAdminPanel
        announcements={[scheduled]}
        serverNow={SERVER_NOW}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /待发布公告/ }));
    fireEvent.click(screen.getByRole("button", { name: "发布设置…" }));
    expect(
      (screen.getByLabelText("计划发布时间") as HTMLInputElement).value,
    ).not.toBe("");

    fireEvent.click(screen.getByRole("radio", { name: "取消排期" }));

    expect(screen.queryByLabelText("计划发布时间")).toBeNull();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.getByRole("button", { name: "保存为草稿" })).toBeTruthy();
  });

  it("does not offer notification delivery for a scheduled publication", () => {
    render(
      <AnnouncementAdminPanel announcements={[]} serverNow={SERVER_NOW} />,
    );

    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "排期公告" },
    });
    fireEvent.change(screen.getByLabelText("正文"), {
      target: { value: "稍后自动显示" },
    });
    fireEvent.click(screen.getByRole("button", { name: "发布…" }));
    fireEvent.click(screen.getByRole("radio", { name: "定时发布" }));

    expect(screen.getByLabelText("计划发布时间")).toBeTruthy();
    expect(screen.queryByRole("checkbox", { name: /发送站内通知/ })).toBeNull();
  });

  it("restores a selected announcement from the URL-backed initial id", () => {
    render(
      <AnnouncementAdminPanel
        announcements={[published]}
        serverNow={SERVER_NOW}
        initialAnnouncementId={published.id}
      />,
    );

    expect((screen.getByLabelText("标题") as HTMLInputElement).value).toBe(
      "已发布公告",
    );
    expect(screen.getByText("首次发布于", { exact: false })).toBeTruthy();
  });
});
