/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseFilters } from "@/components/courses/course-filters";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/courses",
  useSearchParams: () => new URLSearchParams("subject=ELED"),
}));

beforeEach(() => {
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

  it("展开后保留完整官方英文名，并提供原生悬停文本", () => {
    const name = "Entrepreneurship & Innovation";
    render(<CourseFilters subjects={[{ subject: "EPIN", name, count: 16 }]} />);

    fireEvent.click(screen.getByRole("button", { name: "全部学科" }));

    const label = screen.getByText(name);
    expect(label.getAttribute("title")).toBe(name);
    expect(label.className).toContain("line-clamp-2");
  });
});
