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

const { command, subscribe, refresh } = vi.hoisted(() => ({
  command: vi.fn(),
  subscribe: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/campus-map/map-note-actions", () => ({
  commandCampusMapNoteAction: (...args: unknown[]) => command(...args),
  setCampusMapNoteSubscriptionAction: (...args: unknown[]) =>
    subscribe(...args),
}));

import { CampusMapNoteControls } from "@/components/campus-map/map-note-controls";

beforeEach(() => {
  vi.clearAllMocks();
  subscribe.mockResolvedValue({ status: "subscribed" });
});

afterEach(cleanup);

describe("CampusMapNoteControls", () => {
  it("submits a comment from the keyboard, announces success, refreshes, and restores focus", async () => {
    command.mockResolvedValue({
      status: "commented",
      noteId: "8952c528-4ec6-4694-9ff0-0d10b28f78f1",
      eventId: "d098f5c7-8672-4a44-a0bd-2b17cc4dcb60",
      revision: 5,
    });
    render(
      <CampusMapNoteControls
        noteId="8952c528-4ec6-4694-9ff0-0d10b28f78f1"
        revision={4}
        status="open"
        subscribed={false}
      />,
    );

    const comment = screen.getByLabelText("添加评论");
    fireEvent.change(comment, { target: { value: "现场已经核对。" } });
    fireEvent.submit(comment.closest("form")!);

    await waitFor(() => expect(command).toHaveBeenCalledOnce());
    expect(command.mock.calls[0][0]).toMatchObject({
      kind: "comment",
      noteId: "8952c528-4ec6-4694-9ff0-0d10b28f78f1",
      comment: "现场已经核对。",
    });
    expect((await screen.findByRole("status")).textContent).toContain(
      "评论已发布",
    );
    expect(refresh).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toBe(comment));
  });

  it("announces a stale revision conflict and refreshes the current note", async () => {
    command.mockResolvedValue({
      status: "conflict",
      code: "note-revision-conflict",
      noteId: "8952c528-4ec6-4694-9ff0-0d10b28f78f1",
      expectedRevision: 4,
      currentRevision: 5,
      currentStatus: "closed",
    });
    render(
      <CampusMapNoteControls
        noteId="8952c528-4ec6-4694-9ff0-0d10b28f78f1"
        revision={4}
        status="open"
        subscribed
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "标记为已解决" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("备注刚被其他人更新，已载入最新状态");
    expect(refresh).toHaveBeenCalledOnce();
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it("lets a signed-in viewer unsubscribe without changing note history", async () => {
    subscribe.mockResolvedValue({ status: "unsubscribed" });
    render(
      <CampusMapNoteControls
        noteId="8952c528-4ec6-4694-9ff0-0d10b28f78f1"
        revision={4}
        status="open"
        subscribed
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "取消订阅" }));

    await waitFor(() =>
      expect(subscribe).toHaveBeenCalledWith(
        "8952c528-4ec6-4694-9ff0-0d10b28f78f1",
        false,
      ),
    );
    expect((await screen.findByRole("status")).textContent).toContain(
      "已取消订阅",
    );
    expect(command).not.toHaveBeenCalled();
  });
});
