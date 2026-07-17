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

const { mockDelete, mockImpact, mockRefresh } = vi.hoisted(() => ({
  mockDelete: vi.fn(),
  mockImpact: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
vi.mock("@/lib/course-review-actions", () => ({
  deleteCourseReviewSubmission: (...args: unknown[]) => mockDelete(...args),
  getCourseReviewDeletionImpact: (...args: unknown[]) => mockImpact(...args),
}));

import { MyCourseReviewHistory } from "@/components/courses/my-course-review-history";

const ITEM = {
  ratingId: "rating-1",
  courseCode: "CSCI3150",
  courseTitle: "Operating Systems",
  score: 4.5,
  academicYear: "2025-26",
  term: "Term 2" as const,
  professorName: "Ada Lovelace",
  tags: ["作业多"],
  isAnonymous: false,
  content: "讲得很清楚",
  updatedAt: "2026-01-02T03:04:05.000Z",
};

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("MyCourseReviewHistory", () => {
  it("renders the empty state", () => {
    render(<MyCourseReviewHistory items={[]} />);

    expect(screen.getByText("你还没有评价过课程。")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "浏览课程" }).getAttribute("href"),
    ).toBe("/courses");
  });

  it("shows offering context and current content without achievement allocation", () => {
    render(<MyCourseReviewHistory items={[ITEM]} />);

    expect(screen.getByText("2025-26")).toBeTruthy();
    expect(screen.getByText(/Term 2/)).toBeTruthy();
    expect(screen.getByText(/Ada Lovelace/)).toBeTruthy();
    expect(screen.getByText("讲得很清楚")).toBeTruthy();
    expect(screen.queryByText(/已用于|成就证据|MATH 铜标/)).toBeNull();
    expect(
      screen.getByRole("link", { name: "编辑" }).getAttribute("href"),
    ).toContain("/courses/CSCI3150?from=%2Fcourses%2Fmy-reviews#course-review");
  });

  it("confirms deletion and refreshes the private list", async () => {
    mockImpact.mockResolvedValue({ kind: "preserved" });
    mockDelete.mockResolvedValue(undefined);
    render(<MyCourseReviewHistory items={[ITEM]} />);

    fireEvent.click(screen.getByRole("button", { name: "删除" }));
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    await screen.findByRole("button", { name: "确认删除" });
    fireEvent.click(screen.getByRole("button", { name: "确认删除" }));

    await waitFor(() =>
      expect(mockDelete).toHaveBeenCalledWith(
        "CSCI3150",
        { id: "rating-1", type: "rating" },
        "preserved",
      ),
    );
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("only warns about achievements when deletion really downgrades one", async () => {
    mockImpact.mockResolvedValue({ kind: "downgraded", nextTier: "silver" });
    render(<MyCourseReviewHistory items={[ITEM]} />);

    fireEvent.click(screen.getByRole("button", { name: "删除" }));

    expect(await screen.findByText(/将降为银标/)).toBeTruthy();
  });
});
