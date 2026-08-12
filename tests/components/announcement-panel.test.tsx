/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { AnnouncementPanel } from "@/components/homepage/announcement-panel";

const announcements = [
  {
    id: "announcement-1",
    title: "第一条公告",
    content: "第一条正文",
    publishedAt: "2026-08-12T10:00:00.000Z",
  },
  {
    id: "announcement-2",
    title: "第二条公告",
    content: "第二条正文",
    publishedAt: "2026-08-11T10:00:00.000Z",
  },
  {
    id: "announcement-3",
    title: "第三条公告",
    content: "第三条正文",
    publishedAt: "2026-08-10T10:00:00.000Z",
  },
];

beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(cleanup);

describe("AnnouncementPanel", () => {
  it("uses dots without a visible fraction and links to the paginated archive", () => {
    render(<AnnouncementPanel announcements={announcements} total={12} />);

    expect(screen.getAllByRole("button", { name: /查看第/ })).toHaveLength(3);
    expect(screen.queryByText("1/3")).toBeNull();
    expect(
      screen.getByRole("link", { name: "全部公告（12）" }).getAttribute("href"),
    ).toBe("/announcements");
  });

  it("caps content at ten lines without reserving ten empty lines", () => {
    render(<AnnouncementPanel announcements={announcements} total={3} />);

    const paragraph = screen.getByText("第一条正文");
    const paragraphClasses = paragraph.className.split(" ");
    expect(paragraphClasses).toContain("max-h-60");
    expect(paragraphClasses).not.toContain("h-60");
    expect(screen.getByRole("article").className.split(" ")).not.toContain(
      "min-h-96",
    );
  });

  it("switches announcements with dots and horizontal touch gestures", () => {
    render(<AnnouncementPanel announcements={announcements} total={3} />);

    fireEvent.click(screen.getByRole("button", { name: /查看第 2 条公告/ }));
    expect(screen.getByRole("heading", { name: "第二条公告" })).toBeTruthy();

    const slide = screen.getByRole("article");
    fireEvent.touchStart(slide, { touches: [{ clientX: 180 }] });
    fireEvent.touchEnd(slide, { changedTouches: [{ clientX: 80 }] });
    expect(screen.getByRole("heading", { name: "第三条公告" })).toBeTruthy();
  });

  it("folds the entire region into a reversible compact row", () => {
    render(<AnnouncementPanel announcements={announcements} total={3} />);

    fireEvent.click(
      screen.getByRole("button", { name: /收起整个公告区：第一条公告/ }),
    );
    expect(screen.queryByText("第一条正文")).toBeNull();
    expect(screen.getByText("近期公告")).toBeTruthy();
    expect(screen.getByText("第一条公告")).toBeTruthy();
    fireEvent.click(
      screen.getByRole("button", { name: /展开公告：第一条公告/ }),
    );
    expect(screen.getByText("第一条正文")).toBeTruthy();
  });

  it("shows the detail link only when the fixed ten-line window overflows", () => {
    const clientHeight = vi
      .spyOn(HTMLElement.prototype, "clientHeight", "get")
      .mockReturnValue(240);
    const scrollHeight = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockReturnValue(300);

    render(<AnnouncementPanel announcements={[announcements[0]]} total={1} />);
    expect(screen.getByRole("link", { name: "查看详情" })).toBeTruthy();

    cleanup();
    scrollHeight.mockReturnValue(240);
    render(<AnnouncementPanel announcements={[announcements[0]]} total={1} />);
    expect(screen.queryByRole("link", { name: "查看详情" })).toBeNull();

    clientHeight.mockRestore();
    scrollHeight.mockRestore();
  });

  it("does not render an empty announcement shell", () => {
    const { container } = render(
      <AnnouncementPanel announcements={[]} total={0} />,
    );
    expect(container.innerHTML).toBe("");
  });
});
