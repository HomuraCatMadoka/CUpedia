/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CourseFilters,
  MobileCourseSort,
} from "@/components/courses/course-filters";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/courses",
  useSearchParams: () => new URLSearchParams("subject=ELED&page=3"),
}));

beforeEach(() => {
  push.mockReset();
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  delete (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView;
});

describe("CourseFilters", () => {
  it("使用服务端传入的数据库学科名显示当前筛选", () => {
    render(
      <CourseFilters
        subject="ELED"
        subjects={[
          {
            subject: "ELED",
            name: "English Language Education",
            count: 17,
          },
        ]}
      />,
    );

    expect(screen.getAllByText("ELED English Language Education")).toHaveLength(
      2,
    );
  });

  it("用具体标签展示已应用筛选，不在筛选按钮显示计数", () => {
    render(<CourseFilters credits="other" level="3000" subjects={[]} />);

    expect(screen.getAllByRole("button", { name: "筛选" })).toHaveLength(2);
    expect(screen.queryByRole("button", { name: "筛选 · 2" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "4+ 学分" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "3000 年级" })).toHaveLength(
      2,
    );
  });

  it("关闭抽屉时按网址状态更新移动端筛选按钮样式", () => {
    const { rerender } = render(<CourseFilters credits="3" subjects={[]} />);
    const activeTrigger = screen.getAllByRole("button", { name: "筛选" })[0];
    expect(activeTrigger.className).toContain("bg-muted");

    rerender(<CourseFilters subjects={[]} />);

    const clearedTrigger = screen.getAllByRole("button", { name: "筛选" })[0];
    expect(clearedTrigger.className).toContain("bg-background");
    expect(clearedTrigger.className).not.toContain("bg-muted");
  });

  it("展开后保留完整官方英文名，并提供原生悬停文本", () => {
    const name = "Entrepreneurship & Innovation";
    render(<CourseFilters subjects={[{ subject: "EPIN", name, count: 16 }]} />);

    const subjectTriggers = screen.getAllByRole("button", {
      name: "全部学科",
    });
    expect(subjectTriggers).toHaveLength(2);
    fireEvent.click(subjectTriggers[1]);

    const label = screen.getByText(name);
    expect(label.getAttribute("title")).toBe(name);
    expect(label.className).toContain("line-clamp-2");
  });

  it("切换到最近更新排序，并在导航时重置页码", () => {
    render(<CourseFilters subjects={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "最近更新" }));

    expect(push).toHaveBeenCalledWith("/courses?subject=ELED&sort=latest");
  });

  it("评价最多是默认排序，选择后从网址移除 sort 参数", () => {
    render(<CourseFilters sort="latest" subjects={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "评价最多" }));

    expect(push).toHaveBeenCalledWith("/courses?subject=ELED");
  });

  it("移动端学科入口只显示虚化的全部学科，不显示学科计数", () => {
    render(<CourseFilters subjects={[]} />);

    const triggers = screen.getAllByRole("button", { name: "全部学科" });
    expect(triggers).toHaveLength(2);
    expect(within(triggers[0]).getByText("全部学科").className).toContain(
      "text-muted-foreground",
    );
    expect(screen.queryByText(/约 130 个学科/)).toBeNull();
  });

  it("在移动端独立学科抽屉中搜索并选择学科", async () => {
    render(
      <CourseFilters
        subjects={[{ subject: "CSCI", name: "Computer Science", count: 53 }]}
      />,
    );

    const subjectTriggers = screen.getAllByRole("button", {
      name: "全部学科",
    });
    fireEvent.click(subjectTriggers[0]);

    const dialog = await screen.findByRole("dialog", { name: "选择学科" });
    fireEvent.change(
      within(dialog).getByPlaceholderText("搜索学科代码或名称…"),
      { target: { value: "CSCI" } },
    );
    fireEvent.click(within(dialog).getByText("CSCI"));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/courses?subject=CSCI"),
    );
  });

  it("在移动端筛选抽屉中点击选项后立即应用", async () => {
    render(<CourseFilters subjects={[]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "筛选" })[0]);

    const dialog = await screen.findByRole("dialog", { name: "筛选课程" });
    fireEvent.click(within(dialog).getByRole("button", { name: "3" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/courses?subject=ELED&credits=3"),
    );

    fireEvent.click(within(dialog).getByRole("button", { name: "3000" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/courses?subject=ELED&credits=3&level=3000",
      ),
    );
    expect(
      within(dialog).queryByRole("button", { name: "查看课程" }),
    ).toBeNull();
    expect(
      within(dialog)
        .getByRole("button", { name: "3" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      within(dialog)
        .getByRole("button", { name: "3000" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });

  it("在桌面端统一筛选学分和课程等级后一次应用", async () => {
    render(<CourseFilters subjects={[]} />);

    fireEvent.click(screen.getAllByRole("button", { name: "筛选" })[1]);

    const popover = await screen.findByRole("dialog");
    fireEvent.click(within(popover).getByRole("button", { name: "2" }));
    fireEvent.click(within(popover).getByRole("button", { name: "4000" }));
    fireEvent.click(within(popover).getByRole("button", { name: "查看课程" }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(
        "/courses?subject=ELED&credits=2&level=4000",
      ),
    );
  });
});

describe("MobileCourseSort", () => {
  it("从移动端排序菜单切换到最近更新，并重置页码", () => {
    render(<MobileCourseSort sort="rating-count" />);

    fireEvent.click(screen.getByRole("button", { name: /排序.*评价最多/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "最近更新" }));

    expect(push).toHaveBeenCalledWith("/courses?subject=ELED&sort=latest");
  });
});
