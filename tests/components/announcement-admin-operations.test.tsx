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
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createAnnouncement: vi.fn(),
  deleteAnnouncement: vi.fn(),
  updateAnnouncement: vi.fn(),
}));

vi.mock("@/lib/announcement-actions", () => mocks);

import { useAnnouncementAdminOperations } from "@/components/admin/announcement-admin-operations";
import {
  EMPTY_ANNOUNCEMENT_FORM,
  announcementToFormState,
  useAnnouncementAdminEditor,
} from "@/components/admin/use-announcement-admin-editor";
import type { AnnouncementLifecycle } from "@/lib/announcement-lifecycle";
import type { AdminAnnouncement } from "@/lib/announcement-types";

const NOW = new Date("2026-08-12T12:00:00.000Z");
const draft: AdminAnnouncement = {
  id: "00000000-0000-4000-a400-000000000001",
  title: "测试公告",
  content: "测试正文",
  priority: 0,
  publishedAt: null,
  withdrawnAt: null,
  expiresAt: null,
  notificationSentAt: null,
  notifyOnPublish: false,
  updatedAt: "2026-08-12T10:00:00.000Z",
};

function Harness({
  selected = null,
  lifecycle = "draft",
  onDeletedSelection = vi.fn(),
}: {
  selected?: AdminAnnouncement | null;
  lifecycle?: AnnouncementLifecycle;
  onDeletedSelection?: () => void;
}) {
  const editor = useAnnouncementAdminEditor({
    initialForm: selected
      ? announcementToFormState(selected, NOW)
      : {
          ...EMPTY_ANNOUNCEMENT_FORM,
          title: "测试公告",
          content: "测试正文",
        },
    initiallyOpen: true,
  });
  const operations = useAnnouncementAdminOperations({
    selected,
    lifecycle,
    lifecycleNow: NOW,
    editor,
    onRefresh: vi.fn(),
    onDeletedSelection,
  });

  return (
    <>
      <form onSubmit={operations.handleSubmit}>
        <button type="submit" name="intent" value="publish">
          发布
        </button>
        <button type="submit" name="intent" value="save">
          保存
        </button>
      </form>
      <button type="button" onClick={operations.openSettings}>
        设置
      </button>
      <button type="button" onClick={operations.requestWithdraw}>
        撤回
      </button>
      <button type="button" onClick={operations.requestDelete}>
        删除
      </button>
      {operations.dialogs}
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("useAnnouncementAdminOperations", () => {
  it("publishes immediately and delegates the one-time notification choice", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /发送站内通知/ }));
    fireEvent.click(screen.getByRole("button", { name: "确认发布" }));

    await waitFor(() =>
      expect(mocks.createAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({
          published: true,
          publishAt: null,
          sendNotification: true,
        }),
      ),
    );
  });

  it("schedules without offering or retaining a notification intent", async () => {
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    fireEvent.click(screen.getByRole("radio", { name: "定时发布" }));
    expect(screen.queryByRole("checkbox", { name: /发送站内通知/ })).toBeNull();
    fireEvent.change(screen.getByLabelText("计划发布时间"), {
      target: { value: "2099-08-13T18:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: "确认排期" }));

    await waitFor(() =>
      expect(mocks.createAnnouncement).toHaveBeenCalledWith(
        expect.objectContaining({
          published: true,
          publishAt: new Date("2099-08-13T18:00").toISOString(),
          sendNotification: false,
        }),
      ),
    );
  });

  it("cancels a future schedule back to draft", async () => {
    const scheduled = {
      ...draft,
      publishedAt: "2099-08-13T10:00:00.000Z",
    };
    render(<Harness selected={scheduled} lifecycle="scheduled" />);

    fireEvent.click(screen.getByRole("button", { name: "设置" }));
    fireEvent.click(screen.getByRole("radio", { name: "取消排期" }));
    fireEvent.click(screen.getByRole("button", { name: "保存为草稿" }));

    await waitFor(() =>
      expect(mocks.updateAnnouncement).toHaveBeenCalledWith(
        scheduled.id,
        expect.objectContaining({
          published: false,
          publishAt: null,
          sendNotification: false,
        }),
      ),
    );
  });

  it("republishes a withdrawn announcement without another notification", async () => {
    const withdrawn = {
      ...draft,
      publishedAt: "2026-08-10T10:00:00.000Z",
      withdrawnAt: "2026-08-11T10:00:00.000Z",
      notifyOnPublish: true,
    };
    render(<Harness selected={withdrawn} lifecycle="withdrawn" />);

    fireEvent.click(screen.getByRole("button", { name: "发布" }));
    expect(screen.queryByRole("checkbox", { name: /发送站内通知/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "确认发布" }));

    await waitFor(() =>
      expect(mocks.updateAnnouncement).toHaveBeenCalledWith(
        withdrawn.id,
        expect.objectContaining({
          published: true,
          publishAt: null,
          sendNotification: false,
        }),
      ),
    );
  });

  it("withdraws a public announcement while retaining the notification record", async () => {
    const published = {
      ...draft,
      publishedAt: "2026-08-10T10:00:00.000Z",
      notificationSentAt: "2026-08-10T10:00:00.000Z",
      notifyOnPublish: true,
    };
    render(<Harness selected={published} lifecycle="published" />);

    fireEvent.click(screen.getByRole("button", { name: "撤回" }));
    expect(screen.getByRole("alertdialog").textContent).toContain(
      "既有通知会保留为发布记录",
    );
    fireEvent.click(screen.getByRole("button", { name: "确认撤回" }));

    await waitFor(() =>
      expect(mocks.updateAnnouncement).toHaveBeenCalledWith(
        published.id,
        expect.objectContaining({ published: false, sendNotification: false }),
      ),
    );
  });

  it("deletes a draft and clears the selected editor", async () => {
    const onDeletedSelection = vi.fn();
    render(
      <Harness selected={draft} onDeletedSelection={onDeletedSelection} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByRole("alertdialog").textContent).toContain(
      "此操作不可恢复",
    );
    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    await waitFor(() =>
      expect(mocks.deleteAnnouncement).toHaveBeenCalledWith(draft.id),
    );
    expect(onDeletedSelection).toHaveBeenCalledOnce();
  });
});
