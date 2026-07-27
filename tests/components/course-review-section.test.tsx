/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { refresh, search, submit, createReply, getReplies, toastSuccess } =
  vi.hoisted(() => ({
    refresh: vi.fn(),
    search: vi.fn(),
    submit: vi.fn(),
    createReply: vi.fn(),
    getReplies: vi.fn(),
    toastSuccess: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: toastSuccess } }));

vi.mock("@/lib/course-review-actions", () => ({
  createCourseReviewReply: (...args: unknown[]) => createReply(...args),
  deleteCourseReviewReply: vi.fn(),
  deleteCourseReviewSubmission: vi.fn(),
  getCourseReviewReplies: (...args: unknown[]) => getReplies(...args),
  searchProfessors: (...args: unknown[]) => search(...args),
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

  it("按历史任教学期推荐并提交多位教授", async () => {
    submit.mockResolvedValue({ newAchievementNotices: [] });
    search.mockResolvedValue([
      { id: "p1", name: "Professor CHAN" },
      { id: "p3", name: "Professor LEE" },
    ]);
    const professorStats = ["Professor CHAN", "Professor WONG"].map(
      (name, index) => ({
        id: `p${index + 1}`,
        name,
        rating: null,
        ratingCount: 0,
        terms: [
          {
            academicYear: "2025-26",
            term: "Term 1" as const,
            rating: null,
            ratingCount: 0,
          },
        ],
        tags: [],
      }),
    );
    render(
      <CourseReviewSection
        code="BIOL4310"
        reviews={[]}
        ratingState={RATING_STATE}
        professorStats={professorStats}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开始填写" }));
    fireEvent.change(screen.getByLabelText("学年"), {
      target: { value: "2025-26" },
    });
    fireEvent.change(screen.getByLabelText("学期"), {
      target: { value: "Term 1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "+ Professor CHAN" }));
    fireEvent.click(screen.getByRole("button", { name: "+ Professor WONG" }));
    expect(screen.getByText("已选择 2 位教授")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "移除 Professor CHAN" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "移除 Professor WONG" }),
    ).toBeTruthy();
    fireEvent.change(screen.getByLabelText("搜索任课教授"), {
      target: { value: "Professor" },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Professor LEE" }),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: "Professor CHAN" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "4.5 星" }));
    fireEvent.click(screen.getByRole("button", { name: "提交测评" }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        "BIOL4310",
        expect.objectContaining({ professorIds: ["p1", "p2"] }),
      ),
    );
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
      content: `测评内容 ${index + 1}`,
      createdAt: new Date(2026, 6, 17, 10, index).toISOString(),
      isEdited: false,
      replyCount: 0,
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
            content: "署名投稿",
            createdAt: new Date().toISOString(),
            isEdited: false,
            replyCount: 0,
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
            authorEquippedTitle: {
              displayName: "牛顿",
              badgeCode: "NEWT",
            },
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
            content: "匿名投稿",
            createdAt: new Date().toISOString(),
            isEdited: false,
            replyCount: 0,
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
    expect(screen.getByText("牛顿")).toBeTruthy();
    expect(screen.getByText("匿名用户")).toBeTruthy();
    const authorAchievements = screen.getByLabelText("作者成就");
    expect(screen.getAllByLabelText("作者成就")).toHaveLength(1);
    const authorIdentity = aliceLink.parentElement?.parentElement;
    expect(authorIdentity?.className).toContain("min-w-0");
    expect(authorIdentity?.contains(authorAchievements)).toBe(true);
    expect(authorAchievements.className).toContain("mt-1");
    expect(authorAchievements.className).toContain("items-end");
    expect(authorIdentity?.children[0]?.contains(aliceLink)).toBe(true);
    expect(authorIdentity?.children[1]).toBe(authorAchievements);
    expect(
      [...authorAchievements.querySelectorAll("svg")].map((badge) =>
        badge.getAttribute("data-badge-tier"),
      ),
    ).toEqual(["gold", "silver", "bronze"]);
  });

  it("loads one-level replies only after expanding the reply count", async () => {
    getReplies.mockResolvedValue({
      replies: [
        {
          id: "reply-1",
          reviewId: "review-1",
          content: "补充说明",
          createdAt: new Date().toISOString(),
          authorNickname: "Bob",
          authorShowcaseId: null,
          authorAchievements: [],
          authorAvatarUrl: null,
          authorEquippedTitle: null,
          canDelete: false,
        },
      ],
      hasMore: false,
    });
    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={[
          {
            id: "review-1",
            content: "原评论",
            createdAt: new Date().toISOString(),
            isEdited: true,
            replyCount: 1,
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
            authorShowcaseId: null,
            authorAchievements: [],
          },
        ]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional={false}
      />,
    );

    expect(screen.getByText("已编辑")).toBeTruthy();
    expect(screen.queryByText("补充说明")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "回复 1" }));

    await waitFor(() => expect(getReplies).toHaveBeenCalledWith("review-1", 0));
    const replies = await screen.findByRole("region", { name: "评论回复" });
    expect(within(replies).getByText("补充说明")).toBeTruthy();
    expect(within(replies).queryByTitle("点赞")).toBeNull();
  });

  it("publishes a plain-text reply and appends the created oldest-first page", async () => {
    getReplies
      .mockResolvedValueOnce({ replies: [], hasMore: false })
      .mockResolvedValueOnce({
        replies: [
          {
            id: "reply-1",
            reviewId: "review-1",
            content: "谢谢补充",
            createdAt: new Date().toISOString(),
            authorNickname: "TestUser",
            authorShowcaseId: null,
            authorAchievements: [],
            authorAvatarUrl: null,
            authorEquippedTitle: null,
            canDelete: true,
          },
        ],
        hasMore: false,
      });
    createReply.mockResolvedValue({ id: "reply-1" });
    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={[
          {
            id: "review-1",
            content: "原评论",
            createdAt: new Date().toISOString(),
            isEdited: false,
            replyCount: 0,
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
            authorShowcaseId: null,
            authorAchievements: [],
          },
        ]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "回复 0" }));
    const input = await screen.findByRole("textbox", { name: "回复内容" });
    fireEvent.change(input, { target: { value: "谢谢补充" } });
    fireEvent.click(screen.getByRole("button", { name: "发布回复" }));

    await waitFor(() =>
      expect(createReply).toHaveBeenCalledWith("review-1", "谢谢补充"),
    );
    expect(await screen.findByText("谢谢补充")).toBeTruthy();
    expect(screen.getByRole("button", { name: "回复 1" })).toBeTruthy();
  });

  it("keeps older pages loadable when publishing after the first 20 replies", async () => {
    const reply = (index: number) => ({
      id: `reply-${index}`,
      reviewId: "review-1",
      content: `回复 ${index}`,
      createdAt: new Date().toISOString(),
      authorNickname: "TestUser",
      authorShowcaseId: null,
      authorAchievements: [],
      authorAvatarUrl: null,
      authorEquippedTitle: null,
      canDelete: false,
    });
    getReplies
      .mockResolvedValueOnce({
        replies: Array.from({ length: 20 }, (_, index) => reply(index + 1)),
        hasMore: true,
      })
      .mockResolvedValueOnce({
        replies: [reply(51)],
        hasMore: false,
      })
      .mockResolvedValueOnce({
        replies: Array.from({ length: 20 }, (_, index) => reply(index + 21)),
        hasMore: true,
      });
    createReply.mockResolvedValue({ id: "reply-51" });
    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={[
          {
            id: "review-1",
            content: "原评论",
            createdAt: new Date().toISOString(),
            isEdited: false,
            replyCount: 50,
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
            authorShowcaseId: null,
            authorAchievements: [],
          },
        ]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "回复 50" }));
    const input = await screen.findByRole("textbox", { name: "回复内容" });
    fireEvent.change(input, { target: { value: "新回复" } });
    fireEvent.click(screen.getByRole("button", { name: "发布回复" }));

    await waitFor(() =>
      expect(createReply).toHaveBeenCalledWith("review-1", "新回复"),
    );
    fireEvent.click(await screen.findByRole("button", { name: "加载更多" }));
    await waitFor(() =>
      expect(getReplies).toHaveBeenLastCalledWith("review-1", 20),
    );
  });

  it("reveals and expands a notification-targeted review regardless of the initial limit", async () => {
    getReplies.mockResolvedValue({ replies: [], hasMore: false });
    const reviews = Array.from({ length: 12 }, (_, index) => ({
      id: `review-${index + 1}`,
      content: `测评内容 ${index + 1}`,
      createdAt: new Date().toISOString(),
      isEdited: false,
      replyCount: index === 11 ? 41 : 0,
      likeCount: 0,
      likedByMe: false,
      canAdminDelete: false,
      professorId: null,
      professorName: null,
      academicYear: "2025-26",
      term: "Term 1" as const,
      score: 5,
      tags: [],
      authorNickname: "Alice",
      authorShowcaseId: null,
      authorAchievements: [],
    }));

    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={reviews}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional={false}
        targetReviewId="review-12"
        targetReplyId="reply-41"
        targetReplyOffset={40}
      />,
    );

    expect(screen.getByText("测评内容 12")).toBeTruthy();
    await waitFor(() =>
      expect(getReplies).toHaveBeenCalledWith("review-12", 40),
    );
    expect(screen.getByRole("region", { name: "评论回复" })).toBeTruthy();
  });
});
