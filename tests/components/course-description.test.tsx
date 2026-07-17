/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CourseDescription } from "@/components/courses/course-description";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(50);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(100);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("CourseDescription", () => {
  it("为溢出的移动端简介提供可访问的触控展开按钮", async () => {
    render(<CourseDescription text="一段超过四行的课程简介" />);

    const expand = await screen.findByRole("button", { name: "展开" });
    expect(expand.getAttribute("aria-expanded")).toBe("false");
    expect(expand.classList.contains("min-h-11")).toBe(true);
    expect(expand.classList.contains("min-w-11")).toBe(true);

    fireEvent.click(expand);

    expect(
      screen
        .getByRole("button", { name: "收起" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
  });
});
