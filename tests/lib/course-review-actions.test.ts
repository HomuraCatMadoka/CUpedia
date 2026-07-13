import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ref #177 — course-review MVP data layer.
//
// The catalog reads hit the real `courses` table and the rating/review/like
// tables; here we stub `@/db` with a thenable chain whose terminal `await`
// pulls the next queued result, and `@/lib/auth-guard` for the viewer. Tests
// assert the *external behavior* PRD #177 pins down — auth gating, one vote
// per user (upsert), author/admin withdraw rights, like de-dup, input
// validation, and the aggregate null-vs-average — not the SQL shape.

const {
  mockRequireAuth,
  mockGetOptionalUser,
  dbQueue,
  dbSelect,
  dbInsert,
  dbUpdate,
  dbDelete,
  dbTransaction,
  dbChain,
} = vi.hoisted(() => {
  const queue: unknown[] = [];
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "limit",
    "orderBy",
    "groupBy",
    "values",
    "innerJoin",
    "leftJoin",
    "set",
    "returning",
    "onConflictDoUpdate",
  ];
  for (const m of methods) chain[m] = vi.fn(() => chain);
  // Terminal await: shift the next queued rows (default: empty result set).
  chain.then = (onF: (v: unknown) => unknown, onR?: (e: unknown) => unknown) =>
    Promise.resolve(queue.length ? queue.shift() : []).then(onF, onR);
  return {
    mockRequireAuth: vi.fn(),
    mockGetOptionalUser: vi.fn(),
    dbQueue: queue,
    dbSelect: vi.fn(() => chain),
    dbInsert: vi.fn(() => chain),
    dbUpdate: vi.fn(() => chain),
    dbDelete: vi.fn(() => chain),
    dbTransaction: vi.fn(),
    dbChain: chain,
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth-guard", () => ({
  requireAuth: (...a: unknown[]) => mockRequireAuth(...a),
  getOptionalUser: (...a: unknown[]) => mockGetOptionalUser(...a),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => dbSelect(),
    insert: () => dbInsert(),
    update: () => dbUpdate(),
    delete: () => dbDelete(),
    transaction: (callback: (tx: unknown) => unknown) =>
      dbTransaction(callback),
  },
}));

import {
  submitCourseReview,
  deleteCourseReviewSubmission,
  toggleLike,
  getCourseRatingState,
  getCourseReviews,
  getCourses,
  searchProfessors,
  getCourseEnrollmentHistory,
} from "@/lib/course-review-actions";
import { formatCourseCode } from "@/app/(main)/courses/course-types";

const COURSE = {
  code: "CSCI3150",
  subject: "CSCI",
  title: "Introduction to Operating Systems",
  units: "3",
  description: "",
  terms: [],
};

/** Queue rows that successive `await db…` calls will resolve to, in order. */
function queueRows(...rows: unknown[]) {
  dbQueue.push(...rows);
}

const values = () => dbChain.values as Mock;

beforeEach(() => {
  vi.clearAllMocks();
  dbQueue.length = 0;
  mockRequireAuth.mockResolvedValue({ id: "u1", role: "user" });
  mockGetOptionalUser.mockResolvedValue(null);
  dbTransaction.mockImplementation(
    async (
      callback: (tx: {
        insert: () => typeof dbChain;
        update: () => typeof dbChain;
        delete: () => typeof dbChain;
      }) => unknown,
    ) =>
      callback({
        insert: () => dbInsert(),
        update: () => dbUpdate(),
        delete: () => dbDelete(),
      }),
  );
});

const SUBMISSION = {
  academicYear: "2025-26",
  term: "Term 2" as const,
  professorId: "p1",
  score: 4.5,
};

describe("submitCourseReview", () => {
  it("拒绝未登录用户", async () => {
    mockRequireAuth.mockRejectedValue(new Error("未登录"));
    await expect(submitCourseReview("CSCI3150", SUBMISSION)).rejects.toThrow();
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it.each([0, 0.6, 5.5])("拒绝无效半星分数 %s（不触库）", async (score) => {
    await expect(
      submitCourseReview("CSCI3150", { ...SUBMISSION, score }),
    ).rejects.toThrow(/0.5 到 5 星/);
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("拒绝模糊学年和无效学期", async () => {
    await expect(
      submitCourseReview("CSCI3150", {
        ...SUBMISSION,
        academicYear: "去年",
      }),
    ).rejects.toThrow(/明确学年/);
    await expect(
      submitCourseReview("CSCI3150", {
        ...SUBMISSION,
        term: "Term 3" as never,
      }),
    ).rejects.toThrow(/有效学期/);
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("仅评分时写入开课经历，不生成空评论", async () => {
    queueRows([COURSE], [{ id: "p1", name: "Professor CHAN" }], [], []);
    await expect(
      submitCourseReview("CSCI3150", SUBMISSION),
    ).resolves.toBeUndefined();
    expect(dbInsert).toHaveBeenCalledOnce();
    expect(values()).toHaveBeenCalledWith(
      expect.objectContaining({
        courseCode: "CSCI3150",
        userId: "u1",
        score: 4.5,
        academicYear: "2025-26",
        term: "Term 2",
        professorId: "p1",
        professorNameSnapshot: "Professor CHAN",
      }),
    );
  });

  it("同一用户重复投稿是更新评分（upsert，一人一票）", async () => {
    queueRows([COURSE], [{ id: "p1", name: "Professor CHAN" }], [], []);
    await submitCourseReview("CSCI3150", SUBMISSION);
    const onConflict = dbChain.onConflictDoUpdate as Mock;
    expect(onConflict).toHaveBeenCalledOnce();
    expect(onConflict).toHaveBeenCalledWith(
      expect.objectContaining({
        set: expect.objectContaining({ score: 4.5, term: "Term 2" }),
      }),
    );
  });

  it("含评论时原子写入评分和匿名评论快照", async () => {
    queueRows([COURSE], [{ id: "p1", name: "Professor CHAN" }], [], [], []);
    await submitCourseReview("CSCI3150", {
      ...SUBMISSION,
      content: "  很清楚  ",
    });
    expect(dbInsert).toHaveBeenCalledTimes(2);
    expect(values()).toHaveBeenLastCalledWith(
      expect.objectContaining({
        content: "很清楚",
        score: 4.5,
        academicYear: "2025-26",
        term: "Term 2",
        professorNameSnapshot: "Professor CHAN",
      }),
    );
  });

  it("编辑已有投稿时原位更新评论", async () => {
    queueRows(
      [COURSE],
      [{ id: "p1", name: "Professor CHAN" }],
      [{ id: "r1" }],
      [],
      [],
    );
    await submitCourseReview("CSCI3150", {
      ...SUBMISSION,
      content: "更新后的内容",
    });
    expect(dbUpdate).toHaveBeenCalledOnce();
    expect(dbInsert).toHaveBeenCalledOnce();
    expect(dbChain.set).toHaveBeenCalledWith(
      expect.objectContaining({ content: "更新后的内容", score: 4.5 }),
    );
  });

  it("清空评论时保留评分并删除评论", async () => {
    queueRows(
      [COURSE],
      [{ id: "p1", name: "Professor CHAN" }],
      [{ id: "r1" }],
      [],
      [],
    );
    await submitCourseReview("CSCI3150", { ...SUBMISSION, content: "   " });
    expect(dbInsert).toHaveBeenCalledOnce();
    expect(dbDelete).toHaveBeenCalledOnce();
  });

  it("拒绝目录外或未任教该课程的教授", async () => {
    queueRows([COURSE], []);
    await expect(submitCourseReview("CSCI3150", SUBMISSION)).rejects.toThrow(
      /教授目录/,
    );
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("课程不存在时报错", async () => {
    queueRows([]); // findCourse → none
    await expect(submitCourseReview("NOPE0000", SUBMISSION)).rejects.toThrow(
      /课程不存在/,
    );
  });
});

describe("searchProfessors", () => {
  it("返回目录中的规范姓名", async () => {
    queueRows([{ id: "p1", name: "Professor CHAN" }]);
    await expect(searchProfessors("csci 3150", "chan")).resolves.toEqual([
      { id: "p1", name: "Professor CHAN" },
    ]);
  });
});

describe("getCourseEnrollmentHistory", () => {
  it("按班别分别返回主组件人数，避免重复计算导修课", async () => {
    const capturedAt = new Date("2026-07-13T00:00:00Z");
    queueRows([
      {
        academicYear: "2025-26",
        term: "Term 2",
        classCode: "CSCI2100A",
        component: "LEC",
        quota: 150,
        vacancy: 76,
        instructors: ["Professor LEUNG"],
        capturedAt,
      },
      {
        academicYear: "2025-26",
        term: "Term 2",
        classCode: "CSCI2100A",
        component: "TUT",
        quota: 80,
        vacancy: 30,
        instructors: ["Tutor A"],
        capturedAt,
      },
      {
        academicYear: "2025-26",
        term: "Term 2",
        classCode: "CSCI2100A",
        component: "TUT",
        quota: 80,
        vacancy: 56,
        instructors: ["Tutor B"],
        capturedAt,
      },
      {
        academicYear: "2025-26",
        term: "Term 2",
        classCode: "CSCI2100B",
        component: "LEC",
        quota: 150,
        vacancy: 4,
        instructors: ["Professor WANG"],
        capturedAt,
      },
    ]);
    await expect(getCourseEnrollmentHistory("csci 2100")).resolves.toEqual([
      {
        academicYear: "2025-26",
        term: "Term 2",
        section: "A",
        enrolled: 74,
        quota: 150,
        instructors: ["Professor LEUNG"],
      },
      {
        academicYear: "2025-26",
        term: "Term 2",
        section: "B",
        enrolled: 146,
        quota: 150,
        instructors: ["Professor WANG"],
      },
    ]);
  });
});

describe("deleteCourseReviewSubmission", () => {
  it("拒绝未登录用户", async () => {
    mockRequireAuth.mockRejectedValue(new Error("未登录"));
    await expect(deleteCourseReviewSubmission("CSCI3150")).rejects.toThrow();
    expect(dbDelete).not.toHaveBeenCalled();
  });

  it("投稿不存在时报错", async () => {
    queueRows([]); // review lookup → none
    await expect(
      deleteCourseReviewSubmission("CSCI3150", { id: "r1", type: "review" }),
    ).rejects.toThrow(/投稿不存在/);
  });

  it("非本人非管理员无权撤回", async () => {
    queueRows([{ userId: "other", courseCode: "CSCI3150" }]);
    await expect(
      deleteCourseReviewSubmission("CSCI3150", { id: "r1", type: "review" }),
    ).rejects.toThrow(/无权/);
    expect(dbDelete).not.toHaveBeenCalled();
  });

  it("本人可删除整条投稿", async () => {
    queueRows([], []);
    await expect(
      deleteCourseReviewSubmission("CSCI3150"),
    ).resolves.toBeUndefined();
    expect(dbDelete).toHaveBeenCalledTimes(2);
  });

  it("管理员可通过评论删除他人的整条投稿", async () => {
    mockRequireAuth.mockResolvedValue({ id: "admin", role: "admin" });
    queueRows([{ userId: "other", courseCode: "CSCI3150" }], [], []);
    await expect(
      deleteCourseReviewSubmission("CSCI3150", { id: "r1", type: "review" }),
    ).resolves.toBeUndefined();
    expect(dbDelete).toHaveBeenCalledTimes(2);
  });

  it("管理员可删除他人的仅评分投稿", async () => {
    mockRequireAuth.mockResolvedValue({ id: "admin", role: "admin" });
    queueRows([{ userId: "other", courseCode: "CSCI3150" }], [], []);
    await expect(
      deleteCourseReviewSubmission("CSCI3150", {
        id: "rating1",
        type: "rating",
      }),
    ).resolves.toBeUndefined();
    expect(dbDelete).toHaveBeenCalledTimes(2);
  });
});

describe("toggleLike", () => {
  it("拒绝未登录用户", async () => {
    mockRequireAuth.mockRejectedValue(new Error("未登录"));
    await expect(toggleLike("r1")).rejects.toThrow();
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("评论不存在时报错", async () => {
    queueRows([]); // review lookup → none
    await expect(toggleLike("r1")).rejects.toThrow(/评论不存在/);
  });

  it("未点赞则新增点赞并返回新计数", async () => {
    queueRows(
      [{ courseCode: "CSCI3150" }], // review
      [], // existing like → none
      [], // insert like (awaited)
      [{ cnt: 1 }], // recount
    );
    await expect(toggleLike("r1")).resolves.toBe(1);
    expect(dbInsert).toHaveBeenCalledOnce();
    expect(dbDelete).not.toHaveBeenCalled();
  });

  it("已点赞则取消（去重，不重复插入）", async () => {
    queueRows(
      [{ courseCode: "CSCI3150" }], // review
      [{ userId: "u1" }], // existing like
      [], // delete like (awaited)
      [{ cnt: 0 }], // recount
    );
    await expect(toggleLike("r1")).resolves.toBe(0);
    expect(dbDelete).toHaveBeenCalledOnce();
    expect(dbInsert).not.toHaveBeenCalled();
  });
});

describe("getCourseRatingState", () => {
  it("无人评分且未登录：aggregate 为 null", async () => {
    queueRows([COURSE], [{ avg: null, cnt: 0 }]); // findCourse, ratingAgg
    const state = await getCourseRatingState("CSCI3150");
    expect(state).toMatchObject({
      aggregateRating: null,
      ratingCount: 0,
      lastScore: null,
      lastAcademicYear: null,
      lastTerm: null,
      lastProfessor: null,
      lastContent: "",
      myRatingCount: 0,
    });
  });

  it("已评分：给出均值与我的评分", async () => {
    mockGetOptionalUser.mockResolvedValue({ id: "u1", role: "user" });
    queueRows(
      [COURSE], // findCourse
      [{ avg: "4.25", cnt: 2 }], // ratingAgg
      [
        {
          score: 4.5,
          academicYear: "2025-26",
          term: "Term 2",
          professorId: "p1",
          professorName: "Professor CHAN",
        },
      ], // my rating
      [{ content: "很清楚" }], // latest own review
    );
    const state = await getCourseRatingState("CSCI3150");
    expect(state?.aggregateRating).toBe(4.3);
    expect(state?.ratingCount).toBe(2);
    expect(state?.lastScore).toBe(4.5);
    expect(state?.lastAcademicYear).toBe("2025-26");
    expect(state?.lastTerm).toBe("Term 2");
    expect(state?.lastProfessor).toEqual({
      id: "p1",
      name: "Professor CHAN",
    });
    expect(state?.lastContent).toBe("很清楚");
    expect(state?.myRatingCount).toBe(1);
  });

  it("未知课程返回 null", async () => {
    queueRows([]); // findCourse → none
    await expect(getCourseRatingState("NOPE0000")).resolves.toBeNull();
  });
});

describe("getCourseReviews", () => {
  it("管理员可看到没有评论的评分投稿管理卡片", async () => {
    mockGetOptionalUser.mockResolvedValue({ id: "admin", role: "admin" });
    queueRows(
      [COURSE],
      [],
      [
        {
          id: "rating1",
          userId: "other",
          createdAt: new Date("2026-07-13T00:00:00Z"),
          professorName: "Professor CHAN",
          academicYear: "2025-26",
          term: "Term 2",
          score: 4.5,
        },
      ],
    );
    await expect(getCourseReviews("CSCI3150")).resolves.toEqual([
      expect.objectContaining({
        id: "rating1",
        isRatingOnly: true,
        canAdminDelete: true,
        score: 4.5,
      }),
    ]);
  });
});

describe("getCourses（学科筛选 #267）", () => {
  const limit = () => dbChain.limit as Mock;

  it("选定 subject 时返回该学科全部课程，不设 48 上限", async () => {
    const many = Array.from({ length: 60 }, (_, i) => ({
      code: `CSCI${1000 + i}`,
      subject: "CSCI",
      title: `Course ${i}`,
      units: "3",
      description: "",
      terms: [],
    }));
    queueRows(many, [], []); // 课程行, buildViews 的 ratingAgg, reviewAgg
    const result = await getCourses({ subject: "CSCI" });
    expect(result).toHaveLength(60);
    expect(result.every((c) => c.subject === "CSCI")).toBe(true);
    expect(limit()).not.toHaveBeenCalled(); // 无分页截断
  });

  it("未选 subject（默认落地页）仍套用 48 上限", async () => {
    queueRows([], [], [{ ...COURSE }], [], []); // ratingAgg, reviewAgg, 目录头, buildViews×2
    await getCourses({});
    expect(limit()).toHaveBeenCalledWith(48);
  });
});

describe("formatCourseCode", () => {
  it("在 4 字母学科与数字之间插入空格", () => {
    expect(formatCourseCode("CSCI3150")).toBe("CSCI 3150");
  });

  it("保留课号尾部字母后缀", () => {
    expect(formatCourseCode("ENGG1110A")).toBe("ENGG 1110A");
  });

  it("无法解析时原样返回", () => {
    expect(formatCourseCode("cs101")).toBe("cs101");
  });
});
