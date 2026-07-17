/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/course-review-actions", () => ({
  deleteCourseReviewSubmission: vi.fn(),
  searchProfessors: vi.fn(),
  submitCourseReview: vi.fn(),
  toggleLike: vi.fn(),
}));

import { CourseReviewSection } from "@/components/courses/course-review-section";

const RATING_STATE = {
  aggregateRating: null,
  ratingCount: 0,
  lastScore: null,
  lastAcademicYear: null,
  lastTerm: null,
  lastProfessor: null,
  lastContent: "",
  lastTags: [],
  lastIsAnonymous: false,
  myRatingCount: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("CourseReviewSection", () => {
  it("无任课教授课程在教授留空时也可提交", () => {
    render(
      <CourseReviewSection
        code="GEUC2214"
        reviews={[]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional
      />,
    );

    expect(screen.queryByLabelText("学年")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "开始填写" }));

    expect(screen.getByText("课程资料未列任课教授，可留空")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("学年"), {
      target: { value: "2025-26" },
    });
    fireEvent.change(screen.getByLabelText("学期"), {
      target: { value: "Term 1" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "4.5 星" }));

    expect(
      (screen.getByRole("button", { name: "提交测评" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("测评很多时默认只渲染 10 条，并按批次继续展开", () => {
    const reviews = Array.from({ length: 12 }, (_, index) => ({
      id: `review-${index}`,
      isRatingOnly: false,
      content: `测评内容 ${index + 1}`,
      createdAt: new Date(2026, 6, 17, 10, index).toISOString(),
      likeCount: 0,
      likedByMe: false,
      canAdminDelete: false,
      professorId: null,
      professorName: null,
      academicYear: "2025-26",
      term: "Term 2" as const,
      score: 4,
      tags: [],
      authorNickname: `同学 ${index + 1}`,
    }));

    render(
      <CourseReviewSection
        code="ELTU1001"
        reviews={reviews}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated={false}
        professorOptional={false}
      />,
    );

    expect(screen.getAllByRole("listitem")).toHaveLength(10);
    expect(screen.queryByText("测评内容 11")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "再看 2 条测评" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getByText("测评内容 12")).toBeTruthy();
  });
});
