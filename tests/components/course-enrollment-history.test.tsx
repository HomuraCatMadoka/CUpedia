/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CourseEnrollmentHistory } from "@/components/courses/course-enrollment-history";
import type { CourseEnrollmentView } from "@/lib/course-review-actions";

const HISTORY: CourseEnrollmentView[] = [
  {
    academicYear: "2024-25",
    term: "Term 1",
    section: "OLD",
    enrolled: 12,
    quota: 20,
    instructors: ["Professor Past"],
  },
  ...Array.from({ length: 3 }, (_, index) => ({
    academicYear: "2025-26",
    term: "Term 1",
    section: `A${index + 1}`,
    enrolled: 15 + index,
    quota: 20,
    instructors: [`Professor Autumn ${index + 1}`],
  })),
  ...Array.from({ length: 12 }, (_, index) => ({
    academicYear: "2025-26",
    term: "Term 2",
    section: `B${index + 1}`,
    enrolled: 18,
    quota: 20,
    instructors: [
      index === 11 ? "Dr. Target" : `Professor Spring ${index + 1}`,
    ],
  })),
];

afterEach(cleanup);

describe("CourseEnrollmentHistory", () => {
  it("默认展示最新学年和学期的前 10 个 Section，并可展开其余记录", () => {
    render(<CourseEnrollmentHistory enrollmentHistory={HISTORY} />);

    expect((screen.getByLabelText("学年") as HTMLSelectElement).value).toBe(
      "2025-26",
    );
    expect(
      screen
        .getByRole("button", { name: "Term 2" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getAllByTestId("enrollment-row")).toHaveLength(10);
    expect(screen.getByText("显示 10 / 12 个 Section")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "查看其余 2 个" }));

    expect(screen.getAllByTestId("enrollment-row")).toHaveLength(12);
    expect(screen.getByRole("button", { name: "收起记录" })).toBeTruthy();
  });

  it("可切换学期并按 Section 或任课教授筛选", () => {
    render(<CourseEnrollmentHistory enrollmentHistory={HISTORY} />);

    fireEvent.click(screen.getByRole("button", { name: "Term 1" }));
    expect(screen.getAllByTestId("enrollment-row")).toHaveLength(3);
    expect(screen.getByText("Section A1")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Term 2" }));
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "target" },
    });
    expect(screen.getAllByTestId("enrollment-row")).toHaveLength(1);
    expect(screen.getByText("Dr. Target")).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "B2" },
    });
    expect(screen.getAllByTestId("enrollment-row")).toHaveLength(1);
    expect(screen.getByText("Section B2")).toBeTruthy();
  });
});
