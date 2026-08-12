/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useUnsavedAnnouncementNavigation } from "@/components/admin/use-unsaved-announcement-navigation";

function NavigationHarness({ isDirty }: { isDirty: boolean }) {
  const { confirmDiscardChanges } = useUnsavedAnnouncementNavigation({
    isDirty,
  });

  return (
    <>
      <button type="button" onClick={confirmDiscardChanges}>
        本地切换
      </button>
      <a href="/admin/users">内部链接</a>
      <a href="https://example.com">外部链接</a>
      <a href="/admin/users" target="_blank">
        新标签页
      </a>
      <a href="/export" download>
        下载
      </a>
    </>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, "", "/admin/announcements");
});

describe("useUnsavedAnnouncementNavigation", () => {
  it("protects browser unload and local state transitions while dirty", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<NavigationHarness isDirty />);

    const unload = new Event("beforeunload", { cancelable: true });
    expect(window.dispatchEvent(unload)).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "本地切换" }));
    expect(confirm).toHaveBeenCalledWith(
      "当前公告有未保存更改，确定要放弃这些更改吗？",
    );
  });

  it("blocks ordinary same-origin links but preserves native link variants", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<NavigationHarness isDirty />);

    expect(
      fireEvent.click(screen.getByRole("link", { name: "内部链接" })),
    ).toBe(false);
    expect(
      fireEvent.click(screen.getByRole("link", { name: "外部链接" })),
    ).toBe(true);
    expect(
      fireEvent.click(screen.getByRole("link", { name: "新标签页" })),
    ).toBe(true);
    expect(fireEvent.click(screen.getByRole("link", { name: "下载" }))).toBe(
      true,
    );
    expect(
      fireEvent.click(screen.getByRole("link", { name: "内部链接" }), {
        ctrlKey: true,
      }),
    ).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("restores the guard after a cancelled history traversal", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const pushState = vi.spyOn(window.history, "pushState");
    render(<NavigationHarness isDirty />);

    fireEvent.popState(window, { state: {} });

    expect(pushState).toHaveBeenCalledTimes(2);
    expect(window.history.state).toHaveProperty(
      "cupediaAnnouncementNavigationGuardToken",
    );
  });

  it("continues an accepted history traversal", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<NavigationHarness isDirty />);

    fireEvent.popState(window, { state: {} });

    expect(back).toHaveBeenCalledOnce();
  });

  it("reuses an existing guard and follows current dirty state", () => {
    window.history.replaceState(
      { cupediaAnnouncementNavigationGuardToken: "existing-guard" },
      "",
      "/admin/announcements",
    );
    const pushState = vi.spyOn(window.history, "pushState");
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const view = render(<NavigationHarness isDirty={false} />);

    expect(pushState).not.toHaveBeenCalled();
    expect(
      fireEvent.click(screen.getByRole("link", { name: "内部链接" })),
    ).toBe(true);

    view.rerender(<NavigationHarness isDirty />);
    expect(
      fireEvent.click(screen.getByRole("link", { name: "内部链接" })),
    ).toBe(false);
    expect(confirm).toHaveBeenCalledOnce();
  });
});
