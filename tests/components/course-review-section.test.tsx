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

const { refresh, submit, toastSuccess } = vi.hoisted(() => ({
  refresh: vi.fn(),
  submit: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

vi.mock("@/lib/course-review-actions", () => ({
  deleteCourseReviewSubmission: vi.fn(),
  searchProfessors: vi.fn(),
  submitCourseReview: (...args: unknown[]) => submit(...args),
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
  it("展示并互斥选择考勤要求标签", () => {
    render(
      <CourseReviewSection
        code="CSCI3150"
        reviews={[]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开始填写" }));

    expect(screen.getByText("考勤要求")).toBeTruthy();
    const required = screen.getByRole("button", { name: "要 attendance" });
    const notRequired = screen.getByRole("button", { name: "无 attendance" });

    fireEvent.click(required);
    expect(required.getAttribute("aria-pressed")).toBe("true");
    expect(notRequired.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(notRequired);
    expect(required.getAttribute("aria-pressed")).toBe("false");
    expect(notRequired.getAttribute("aria-pressed")).toBe("true");
  });

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

  it("首次满足成就条件时立即提示可以领取", async () => {
    submit.mockResolvedValue({
      newAchievementNotices: [
        { opportunityKey: "professional:rule:bronze", displayName: "数学铜标" },
      ],
    });
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
    fireEvent.click(screen.getByRole("button", { name: "开始填写" }));
    fireEvent.change(screen.getByLabelText("学年"), {
      target: { value: "2025-26" },
    });
    fireEvent.change(screen.getByLabelText("学期"), {
      target: { value: "Term 1" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "4.5 星" }));
    fireEvent.click(screen.getByRole("button", { name: "提交测评" }));

    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "可以领取「数学铜标」了",
        expect.objectContaining({ action: expect.any(Object) }),
      ),
    );
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
      authorShowcaseId: null,
      authorAchievements: [],
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

  it("署名投稿展示实时成就与橱窗入口，匿名投稿不泄露身份", () => {
    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={[
          {
            id: "signed",
            isRatingOnly: false,
            content: "署名投稿",
            createdAt: new Date().toISOString(),
            likeCount: 0,
            likedByMe: false,
            canAdminDelete: false,
            professorId: null,
            professorName: null,
            academicYear: "2025-26",
            term: "Term 1",
            score: 5,
            tags: [],
            authorNickname: "Alice",
            authorShowcaseId: "00000000-0000-4000-a000-000000000099",
            authorAchievements: [
              {
                id: "a2",
                displayName: "物理铜标",
                badgeCode: "PHYS",
                tier: "bronze",
                category: "professional",
                publicDescription: "",
                primary: false,
              },
              {
                id: "a1",
                displayName: "数学金标",
                badgeCode: "MATH",
                tier: "gold",
                category: "professional",
                publicDescription: "",
                primary: true,
              },
              {
                id: "a3",
                displayName: "经济银标",
                badgeCode: "ECON",
                tier: "silver",
                category: "professional",
                publicDescription: "",
                primary: false,
              },
            ],
          },
          {
            id: "anonymous",
            isRatingOnly: false,
            content: "匿名投稿",
            createdAt: new Date().toISOString(),
            likeCount: 0,
            likedByMe: false,
            canAdminDelete: false,
            professorId: null,
            professorName: null,
            academicYear: "2025-26",
            term: "Term 1",
            score: 4,
            tags: [],
            authorNickname: null,
            authorShowcaseId: null,
            authorAchievements: [],
          },
        ]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated={false}
        professorOptional={false}
      />,
    );

    const aliceLink = screen.getByRole("link", { name: "Alice" });
    expect(aliceLink.getAttribute("href")).toBe(
      "/courses/achievements/showcase/00000000-0000-4000-a000-000000000099",
    );
    expect(screen.getByRole("img", { name: "MATH 金级专业成就" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "ECON 银级专业成就" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "PHYS 铜级专业成就" })).toBeTruthy();
    expect(screen.getByText("匿名用户")).toBeTruthy();
    const authorAchievements = screen.getByLabelText("作者成就");
    expect(screen.getAllByLabelText("作者成就")).toHaveLength(1);
    const authorIdentity = aliceLink.parentElement?.parentElement;
    expect(authorIdentity?.className).toContain("flex");
    expect(authorIdentity?.contains(authorAchievements)).toBe(true);
    expect(
      [...authorAchievements.querySelectorAll("svg")].map((badge) =>
        badge.getAttribute("data-badge-tier"),
      ),
    ).toEqual(["gold", "silver", "bronze"]);
  });
});
