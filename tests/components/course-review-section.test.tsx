/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  refresh,
  search,
  submit,
  deleteSubmission,
  getDeletionImpact,
  createReply,
  getReplies,
  toggleLike,
  toastSuccess,
  toastError,
} = vi.hoisted(() => ({
  refresh: vi.fn(),
  search: vi.fn(),
  submit: vi.fn(),
  deleteSubmission: vi.fn(),
  getDeletionImpact: vi.fn(),
  createReply: vi.fn(),
  getReplies: vi.fn(),
  toggleLike: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh, push: vi.fn() }),
}));
vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

vi.mock("@/lib/course-review-actions", () => ({
  createCourseReviewReply: (...args: unknown[]) => createReply(...args),
  deleteCourseReviewReply: vi.fn(),
  deleteCourseReviewSubmission: (...args: unknown[]) =>
    deleteSubmission(...args),
  getCourseReviewDeletionImpact: (...args: unknown[]) =>
    getDeletionImpact(...args),
  getCourseReviewReplies: (...args: unknown[]) => getReplies(...args),
  searchProfessors: (...args: unknown[]) => search(...args),
  submitCourseReview: (...args: unknown[]) => submit(...args),
  toggleLike: (...args: unknown[]) => toggleLike(...args),
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

const REVIEW = {
  id: "review",
  content: "值得推荐",
  createdAt: new Date().toISOString(),
  isEdited: false,
  replyCount: 0,
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
};

beforeEach(() => {
  vi.clearAllMocks();
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

describe("CourseReviewSection", () => {
  it("立即切换点赞状态，并以服务端计数完成保存", async () => {
    let finishLike: (count: number) => void = () => {};
    toggleLike.mockReturnValue(
      new Promise<number>((resolve) => {
        finishLike = resolve;
      }),
    );
    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={[
          {
            ...REVIEW,
            id: "review-like",
            likeCount: 2,
          },
        ]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional={false}
      />,
    );

    const like = screen.getByRole("button", { name: "点赞" });
    fireEvent.click(like);

    expect(like.getAttribute("aria-pressed")).toBe("true");
    expect(like.textContent).toContain("3");
    expect((like as HTMLButtonElement).disabled).toBe(true);
    expect(refresh).not.toHaveBeenCalled();

    finishLike(4);
    await waitFor(() => {
      expect(like.textContent).toContain("4");
      expect((like as HTMLButtonElement).disabled).toBe(false);
    });

    toggleLike.mockResolvedValueOnce(3);
    fireEvent.click(like);
    expect(like.getAttribute("aria-pressed")).toBe("false");
    expect(like.textContent).toContain("3");
    await waitFor(() =>
      expect((like as HTMLButtonElement).disabled).toBe(false),
    );
  });

  it("点赞保存失败时回滚并提示重试", async () => {
    toggleLike.mockRejectedValue(new Error("写入失败"));
    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={[
          {
            ...REVIEW,
            id: "review-rollback",
            likeCount: 3,
            likedByMe: true,
          },
        ]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional={false}
      />,
    );

    const like = screen.getByRole("button", { name: "点赞" });
    fireEvent.click(like);
    expect(like.getAttribute("aria-pressed")).toBe("false");
    expect(like.textContent).toContain("2");

    await waitFor(() => {
      expect(like.getAttribute("aria-pressed")).toBe("true");
      expect(like.textContent).toContain("3");
      expect(toastError).toHaveBeenCalledWith("取消点赞失败，请重试");
    });
  });

  it("管理员删除评论时编辑器保持可用", async () => {
    let finishDelete: () => void = () => {};
    getDeletionImpact.mockResolvedValue({ kind: "none" });
    deleteSubmission.mockReturnValue(
      new Promise<void>((resolve) => {
        finishDelete = resolve;
      }),
    );
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);

    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={[{ ...REVIEW, canAdminDelete: true }]}
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

    const submitButton = screen.getByRole("button", { name: "提交测评" });
    fireEvent.click(screen.getByTitle("删除整条投稿"));

    await waitFor(() => expect(deleteSubmission).toHaveBeenCalled());
    expect((submitButton as HTMLButtonElement).disabled).toBe(false);
    expect(
      (screen.getByRole("button", { name: "点赞" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    finishDelete();
    confirm.mockRestore();
  });

  it("编辑器保存时评论交互保持可用", async () => {
    let finishSubmit: (result: {
      newAchievementNotices: [];
    }) => void = () => {};
    submit.mockReturnValue(
      new Promise<{ newAchievementNotices: [] }>((resolve) => {
        finishSubmit = resolve;
      }),
    );

    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={[{ ...REVIEW, canAdminDelete: true }]}
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
      expect(screen.getByRole("button", { name: "保存中…" })).toBeTruthy(),
    );
    expect(
      (screen.getByTitle("删除整条投稿") as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: "点赞" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);

    finishSubmit({ newAchievementNotices: [] });
  });

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
    const professorSearch = screen.getByLabelText("搜索任课教授");
    fireEvent.change(professorSearch, {
      target: { value: "Professor" },
    });
    await waitFor(() =>
      expect(
        screen.getByRole("option", { name: "Professor LEE" }),
      ).toBeTruthy(),
    );
    expect(screen.queryByRole("button", { name: "Professor CHAN" })).toBeNull();
    fireEvent.keyDown(professorSearch, { key: "ArrowDown" });
    fireEvent.keyDown(professorSearch, { key: "Enter" });
    expect(
      screen.getByRole("button", { name: "移除 Professor LEE" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "4.5 星" }));
    fireEvent.click(screen.getByRole("button", { name: "提交测评" }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        "BIOL4310",
        expect.objectContaining({ professorIds: ["p1", "p2", "p3"] }),
      ),
    );
  });

  it("从教授详情进入时锁定教授并写入课程测评", async () => {
    submit.mockResolvedValue({ newAchievementNotices: [] });
    const requiredProfessor = {
      id: "person-1",
      publicId: "9e831ca8-67fd-4706-aee5-36e5be2cbfa5",
      name: "Professor CHAN",
      rating: null,
      ratingCount: 0,
      terms: [],
      tags: [],
    };
    render(
      <CourseReviewSection
        code="CSCI2100"
        reviews={[]}
        ratingState={RATING_STATE}
        professorStats={[requiredProfessor]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional={false}
        prefillProfessor={requiredProfessor}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开始填写" }));
    expect(screen.getByText("已绑定")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "移除 Professor CHAN" }),
    ).toBeNull();
    fireEvent.change(screen.getByLabelText("学年"), {
      target: { value: "2025-26" },
    });
    fireEvent.change(screen.getByLabelText("学期"), {
      target: { value: "Term 1" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "4.5 星" }));
    fireEvent.click(screen.getByRole("button", { name: "提交测评" }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith(
        "CSCI2100",
        expect.objectContaining({ professorIds: ["person-1"] }),
      ),
    );
  });

  it("只显示最后一次教授搜索的结果", async () => {
    let finishOld: (value: { id: string; name: string }[]) => void = () => {};
    let finishNew: (value: { id: string; name: string }[]) => void = () => {};
    search.mockImplementation(
      (_code: string, query: string) =>
        new Promise((resolve) => {
          if (query === "old") finishOld = resolve;
          if (query === "new") finishNew = resolve;
        }),
    );
    render(
      <CourseReviewSection
        code="CSCI2100"
        reviews={[]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "开始填写" }));
    const input = screen.getByLabelText("搜索任课教授");
    fireEvent.change(input, { target: { value: "old" } });
    fireEvent.change(input, { target: { value: "new" } });

    await act(async () => finishNew([{ id: "new", name: "New Result" }]));
    expect(screen.getByRole("option", { name: "New Result" })).toBeTruthy();

    await act(async () => finishOld([{ id: "old", name: "Old Result" }]));
    expect(screen.queryByRole("option", { name: "Old Result" })).toBeNull();
    expect(screen.getByRole("option", { name: "New Result" })).toBeTruthy();
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
    expect(authorAchievements.className).toContain("gap-1");
    expect(authorIdentity?.children[0]?.contains(aliceLink)).toBe(true);
    expect(
      [...authorAchievements.querySelectorAll("svg")].map((badge) =>
        badge.getAttribute("data-badge-tier"),
      ),
    ).toEqual(["gold", "silver", "bronze"]);
  });

  it("顶层测评的头像大小不受称号影响", () => {
    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={[
          {
            ...REVIEW,
            id: "titled-author",
            content: "佩戴称号的评论",
            authorNickname: "陈同学",
            authorShowcaseId: "00000000-0000-4000-a000-000000000101",
            authorEquippedTitle: {
              displayName: "山城夜行观察家",
              badgeCode: "NEWT",
            },
          },
          {
            ...REVIEW,
            id: "untitled-author",
            content: "没有称号的评论",
            authorNickname: "黄同学",
            authorShowcaseId: "00000000-0000-4000-a000-000000000102",
            authorEquippedTitle: null,
          },
        ]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated={false}
        professorOptional={false}
      />,
    );

    const titledCard = screen.getByText("佩戴称号的评论").closest("li");
    const untitledCard = screen.getByText("没有称号的评论").closest("li");
    expect(
      titledCard?.querySelector('[data-slot="avatar"]')?.className,
    ).toContain("size-20");
    expect(
      untitledCard?.querySelector('[data-slot="avatar"]')?.className,
    ).toContain("size-20");
  });

  it("顶层测评保持原有卡片结构", () => {
    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={[
          {
            ...REVIEW,
            id: "forum-layout",
            content: "正文从固定内容栏开始",
            authorNickname: "林同学",
            authorShowcaseId: "00000000-0000-4000-a000-000000000103",
            authorEquippedTitle: {
              displayName: "跨学科探索者",
              badgeCode: "EXPL",
            },
          },
        ]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated={false}
        professorOptional={false}
      />,
    );

    const body = screen.getByText("正文从固定内容栏开始");
    const card = body.closest("li");
    const authorIdentity = card?.querySelector('[data-comment-level="review"]');

    expect(card?.className).not.toContain("grid-cols");
    expect(card?.className).toContain("p-5");
    expect(authorIdentity).toBeTruthy();
    expect(card?.contains(body)).toBe(true);
  });

  it("回复只展示昵称，不渲染头像、称号或成就", async () => {
    getReplies.mockResolvedValue({
      replies: [
        {
          id: "signed-reply",
          reviewId: "review-with-replies",
          content: "回复保留完整身份",
          createdAt: new Date().toISOString(),
          authorNickname: "郭同学",
          authorShowcaseId: "00000000-0000-4000-a000-000000000104",
          canDelete: false,
        },
        {
          id: "anonymous-reply",
          reviewId: "review-with-replies",
          content: "匿名原作者回复",
          createdAt: new Date().toISOString(),
          authorNickname: null,
          authorShowcaseId: null,
          canDelete: false,
        },
        {
          id: "untitled-reply",
          reviewId: "review-with-replies",
          content: "署名但未佩戴称号的回复",
          createdAt: new Date().toISOString(),
          authorNickname: "何同学",
          authorShowcaseId: "00000000-0000-4000-a000-000000000106",
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
            ...REVIEW,
            id: "review-with-replies",
            replyCount: 3,
          },
        ]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "回复 3" }));
    const replies = await screen.findByRole("region", { name: "评论回复" });
    expect(replies.querySelector('[data-slot="avatar"]')).toBeNull();
    expect(within(replies).queryByRole("img")).toBeNull();
    expect(
      (
        await within(replies).findByRole("link", { name: "郭同学" })
      ).getAttribute("href"),
    ).toBe(
      "/courses/achievements/showcase/00000000-0000-4000-a000-000000000104",
    );
    expect(within(replies).getByText("匿名用户")).toBeTruthy();
    expect(within(replies).queryByLabelText("回复者成就")).toBeNull();
    for (const reply of within(replies).getAllByRole("listitem")) {
      expect(reply.className).toContain("py-2");
    }
  });

  it("桌面回复使用紧凑身份行和单栏正文", async () => {
    const replyBody = "reply-without-breaks-".repeat(20);
    getReplies.mockResolvedValue({
      replies: [
        {
          id: "forum-reply",
          reviewId: "review-for-reply-layout",
          content: replyBody,
          createdAt: new Date().toISOString(),
          authorNickname: "周同学",
          authorShowcaseId: "00000000-0000-4000-a000-000000000105",
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
            ...REVIEW,
            id: "review-for-reply-layout",
            replyCount: 1,
          },
        ]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "回复 1" }));
    const body = await screen.findByText(replyBody);
    const reply = body.closest("li");
    const authorRegion = reply?.querySelector('[data-slot="reply-author"]');
    const contentRegion = reply?.querySelector('[data-slot="reply-content"]');

    expect(reply?.className).not.toContain("grid-cols");
    expect(authorRegion).toBeTruthy();
    expect(contentRegion?.contains(body)).toBe(true);
    expect(body.className).toContain("[overflow-wrap:anywhere]");
  });

  it("长评论在正文栏断行且原生交互控件保留键盘焦点", () => {
    const longContent = "course-review-without-breaks-".repeat(20);
    render(
      <CourseReviewSection
        code="MATH1010"
        reviews={[
          {
            ...REVIEW,
            id: "long-content",
            content: longContent,
            canAdminDelete: true,
          },
        ]}
        ratingState={RATING_STATE}
        professorStats={[]}
        academicYears={["2025-26"]}
        isAuthenticated
        professorOptional={false}
      />,
    );

    const body = screen.getByText(longContent);
    const like = screen.getByRole("button", { name: "点赞" });
    const reply = screen.getByRole("button", { name: "回复 0" });
    const remove = screen.getByTitle("删除整条投稿");

    expect(body.className).toContain("[overflow-wrap:anywhere]");
    expect(like.className).toContain("focus-visible:ring-2");
    expect(reply.className).toContain("focus-visible:ring-2");
    expect(remove.className).toContain("focus-visible:ring-2");
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
