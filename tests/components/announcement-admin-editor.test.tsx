/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AnnouncementAdminEditor } from "@/components/admin/announcement-admin-editor";
import {
  EMPTY_ANNOUNCEMENT_FORM,
  announcementToFormState,
  useAnnouncementAdminEditor,
} from "@/components/admin/use-announcement-admin-editor";
import type { AdminAnnouncement } from "@/lib/announcement-types";

const selected: AdminAnnouncement = {
  id: "00000000-0000-4000-a400-000000000001",
  title: "现有公告",
  content: "正文",
  priority: 10,
  publishedAt: null,
  withdrawnAt: null,
  expiresAt: null,
  notificationSentAt: null,
  notifyOnPublish: false,
  updatedAt: "2026-08-11T10:00:00.000Z",
};

function Harness({ onSubmit = vi.fn() }: { onSubmit?: () => void }) {
  const editor = useAnnouncementAdminEditor({
    initialForm: {
      ...EMPTY_ANNOUNCEMENT_FORM,
      title: selected.title,
      content: selected.content,
      priority: "10",
    },
    initiallyOpen: true,
  });
  return (
    <>
      <AnnouncementAdminEditor
        selected={selected}
        lifecycle="draft"
        isAlreadyPublic={false}
        isPending={false}
        editor={editor}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
        onReturnToList={editor.close}
        onOpenSettings={vi.fn()}
        onDelete={vi.fn()}
        onWithdraw={vi.fn()}
      />
      <button
        type="button"
        onClick={() =>
          editor.reportError(new Error("标题不能为空"), "保存失败")
        }
      >
        字段错误
      </button>
      <button
        type="button"
        onClick={() =>
          editor.reportError(new Error("保存暂不可用"), "保存失败")
        }
      >
        通用错误
      </button>
      <button type="button" onClick={() => editor.markSaved(editor.form)}>
        标记已保存
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("AnnouncementAdminEditor", () => {
  it("initializes values and owns dirty/reset presentation", () => {
    render(<Harness />);

    expect((screen.getByLabelText("标题") as HTMLInputElement).value).toBe(
      "现有公告",
    );
    expect((screen.getByLabelText("正文") as HTMLTextAreaElement).value).toBe(
      "正文",
    );
    fireEvent.change(screen.getByLabelText("标题"), {
      target: { value: "修改后" },
    });
    expect(screen.getAllByText("未保存").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "标记已保存" }));
    expect(screen.queryByText("未保存")).toBeNull();
  });

  it("submits through the focused editor form", () => {
    const onSubmit = vi.fn();
    render(<Harness onSubmit={onSubmit} />);

    fireEvent.click(screen.getByRole("button", { name: "保存草稿" }));

    expect(onSubmit).toHaveBeenCalledOnce();
  });

  it("delegates mobile return and hides the editor", () => {
    const view = render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "返回公告列表" }));

    expect(view.container.querySelector("form")?.className).toContain(
      "hidden lg:block",
    );
  });

  it("maps server errors to a field and focuses it", () => {
    let nextFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextFrame = callback;
      return 1;
    });
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "字段错误" }));
    (nextFrame as FrameRequestCallback | null)?.(0);

    expect(screen.getByLabelText("标题").getAttribute("aria-invalid")).toBe(
      "true",
    );
    expect(screen.getByRole("alert").textContent).toBe("标题不能为空");
    expect(document.activeElement).toBe(screen.getByLabelText("标题"));
  });

  it("announces and focuses non-field errors", () => {
    let nextFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      nextFrame = callback;
      return 1;
    });
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "通用错误" }));
    (nextFrame as FrameRequestCallback | null)?.(0);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("保存暂不可用");
    expect(document.activeElement).toBe(alert);
  });
});

describe("announcementToFormState", () => {
  it.each([
    {
      name: "scheduled",
      announcement: {
        ...selected,
        priority: 50,
        publishedAt: "2099-08-13T10:00:00.000Z",
        expiresAt: "2099-08-14T10:00:00.000Z",
        notifyOnPublish: true,
      },
      expected: {
        priority: "50",
        publicationMode: "scheduled",
        hasPublishAt: true,
        hasExpiresAt: true,
        sendNotification: true,
      },
    },
    {
      name: "withdrawn",
      announcement: {
        ...selected,
        publishedAt: "2026-08-10T10:00:00.000Z",
        withdrawnAt: "2026-08-11T10:00:00.000Z",
        expiresAt: "2026-08-12T10:00:00.000Z",
        notifyOnPublish: true,
      },
      expected: {
        priority: "10",
        publicationMode: "draft",
        hasPublishAt: false,
        hasExpiresAt: false,
        sendNotification: false,
      },
    },
    {
      name: "already notified",
      announcement: {
        ...selected,
        publishedAt: "2026-08-10T10:00:00.000Z",
        notificationSentAt: "2026-08-10T10:00:00.000Z",
        notifyOnPublish: true,
      },
      expected: {
        priority: "10",
        publicationMode: "immediate",
        hasPublishAt: true,
        hasExpiresAt: false,
        sendNotification: false,
      },
    },
  ])("preserves $name lifecycle values", ({ announcement, expected }) => {
    const form = announcementToFormState(
      announcement,
      new Date("2026-08-12T12:00:00.000Z"),
    );

    expect(form.title).toBe(announcement.title);
    expect(form.content).toBe(announcement.content);
    expect(form.priority).toBe(expected.priority);
    expect(form.publicationMode).toBe(expected.publicationMode);
    expect(Boolean(form.publishAt)).toBe(expected.hasPublishAt);
    expect(Boolean(form.expiresAt)).toBe(expected.hasExpiresAt);
    expect(form.sendNotification).toBe(expected.sendNotification);
  });
});
