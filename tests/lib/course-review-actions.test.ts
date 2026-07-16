import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";

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
  professorSearchCache,
} = vi.hoisted(() => {
  const queue: unknown[] = [];
  const searchCache = new Map<string, unknown>();
  const chain: Record<string, unknown> = {};
  const methods = [
    "from",
    "where",
    "limit",
    "orderBy",
    "groupBy",
    "offset",
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
    professorSearchCache: searchCache,
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  unstable_cache:
    (callback: (...args: unknown[]) => Promise<unknown>) =>
    async (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (!professorSearchCache.has(key)) {
        professorSearchCache.set(key, await callback(...args));
      }
      return professorSearchCache.get(key);
    },
}));
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
  getCourseProfessorStats,
  searchProfessors,
  getCourseEnrollmentHistory,
} from "@/lib/course-review-actions";
import { formatCourseCode } from "@/app/(main)/courses/course-types";
import { resetSensitiveMatcherForTests } from "@/lib/sensitive-content";

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
  professorSearchCache.clear();
  resetSensitiveMatcherForTests([]);
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

afterEach(() => resetSensitiveMatcherForTests(null));

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
        isAnonymous: false,
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
        set: expect.objectContaining({
          score: 4.5,
          term: "Term 2",
          isAnonymous: false,
        }),
      }),
    );
  });

  it("显式匿名时同步保存到评分与文字评论", async () => {
    queueRows([COURSE], [{ id: "p1", name: "Professor CHAN" }], [], [], []);

    await submitCourseReview("CSCI3150", {
      ...SUBMISSION,
      content: "保持匿名",
      isAnonymous: true,
    });

    expect(values()).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ isAnonymous: true }),
    );
    expect(values()).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ content: "保持匿名", isAnonymous: true }),
    );
  });

  it("拒绝畸形匿名选项", async () => {
    await expect(
      submitCourseReview("CSCI3150", {
        ...SUBMISSION,
        isAnonymous: "yes" as never,
      }),
    ).rejects.toThrow(/匿名选项格式无效/);
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("保存 preset 与规范化后的自定义标签", async () => {
    queueRows([COURSE], [{ id: "p1", name: "Professor CHAN" }], [], []);

    await submitCourseReview("CSCI3150", {
      ...SUBMISSION,
      tags: {
        workload: "hea",
        grade: "靓 grade",
        enrollment: "点击即送",
        custom: [" 讲解清晰 ", "考试   贴题", "讲解清晰"],
      },
    });

    expect(values()).toHaveBeenCalledWith(
      expect.objectContaining({
        tags: ["hea", "靓 grade", "点击即送", "讲解清晰", "考试 贴题"],
      }),
    );
  });

  it("拒绝超过五个自定义标签", async () => {
    await expect(
      submitCourseReview("CSCI3150", {
        ...SUBMISSION,
        tags: { custom: ["一", "二", "三", "四", "五", "六"] },
      }),
    ).rejects.toThrow(/最多 5 个/);
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("拒绝伪造 preset 标签", async () => {
    await expect(
      submitCourseReview("CSCI3150", {
        ...SUBMISSION,
        tags: { workload: "躺平" } as never,
      }),
    ).rejects.toThrow(/无效的课程体验标签/);
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("拒绝用自定义标签绕过 preset 单选限制", async () => {
    await expect(
      submitCourseReview("CSCI3150", {
        ...SUBMISSION,
        tags: { workload: "chur", custom: ["hea"] },
      }),
    ).rejects.toThrow(/自定义标签不能使用 preset/);
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it.each([{ custom: "hea" }, { custom: [42] }, { workload: ["chur", "hea"] }])(
    "拒绝畸形标签请求 %#",
    async (tags) => {
      await expect(
        submitCourseReview("CSCI3150", {
          ...SUBMISSION,
          tags: tags as never,
        }),
      ).rejects.toThrow(/标签格式无效/);
      expect(dbSelect).not.toHaveBeenCalled();
    },
  );

  it("拒绝超过十二个字符的自定义标签", async () => {
    await expect(
      submitCourseReview("CSCI3150", {
        ...SUBMISSION,
        tags: { custom: ["这是一个超过十二个字符的自定义标签"] },
      }),
    ).rejects.toThrow(/最多 12 个字符/);
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("拒绝包含敏感词的自定义标签", async () => {
    resetSensitiveMatcherForTests(["违禁样例词"]);
    await expect(
      submitCourseReview("CSCI3150", {
        ...SUBMISSION,
        tags: { custom: ["违禁样例词"] },
      }),
    ).rejects.toThrow("SENSITIVE_CONTENT");
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("允许包含课程领域常用词的自定义标签", async () => {
    resetSensitiveMatcherForTests(["考试"]);
    queueRows([COURSE], [{ id: "p1", name: "Professor CHAN" }], [], []);

    await expect(
      submitCourseReview("CSCI3150", {
        ...SUBMISSION,
        tags: { custom: ["考试贴题"] },
      }),
    ).resolves.toBeUndefined();
  });

  it("不豁免包含课程领域常用词的完整敏感词", async () => {
    resetSensitiveMatcherForTests(["考试作弊"]);

    await expect(
      submitCourseReview("CSCI3150", {
        ...SUBMISSION,
        tags: { custom: ["考试作弊"] },
      }),
    ).rejects.toThrow("SENSITIVE_CONTENT");
    expect(dbSelect).not.toHaveBeenCalled();
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
      isAnonymous: true,
    });
    expect(dbUpdate).toHaveBeenCalledOnce();
    expect(dbInsert).toHaveBeenCalledOnce();
    expect(dbChain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        content: "更新后的内容",
        score: 4.5,
        isAnonymous: true,
      }),
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

  it("拒绝目录外的教授", async () => {
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

  it("同一课程的连续姓名搜索复用教授目录", async () => {
    queueRows([
      { id: "p1", name: "Professor CHAN", courseCode: "CSCI3150" },
      { id: "p2", name: "Professor LEGACY", courseCode: null },
    ]);

    await expect(searchProfessors("CSCI3150", "chan")).resolves.toEqual([
      { id: "p1", name: "Professor CHAN" },
    ]);
    await expect(searchProfessors("CSCI3150", "legacy")).resolves.toEqual([
      { id: "p2", name: "Professor LEGACY" },
    ]);
    expect(dbSelect).toHaveBeenCalledOnce();
  });

  it("按姓名返回未关联当前课程的目录教授", async () => {
    queueRows([
      { id: "legacy", name: "Professor LEGACY", courseCode: null },
      { id: "current", name: "Professor CHAN", courseCode: "CSCI3150" },
    ]);
    await expect(searchProfessors("CSCI3150", "legacy")).resolves.toEqual([
      { id: "legacy", name: "Professor LEGACY" },
    ]);
  });

  it("姓名匹配相同时优先推荐曾任教当前课程的教授", async () => {
    queueRows([
      { id: "global", name: "Professor CHAN", courseCode: null },
      { id: "course", name: "Professor CHAN", courseCode: "CSCI3150" },
    ]);
    await expect(searchProfessors("CSCI3150", "chan")).resolves.toEqual([
      { id: "course", name: "Professor CHAN" },
      { id: "global", name: "Professor CHAN" },
    ]);
  });

  it("容忍多词姓名的轻微拼写错误且不推荐弱匹配", async () => {
    queueRows([
      { id: "target", name: "Professor CHAN Wing Kai", courseCode: null },
      { id: "other", name: "Professor KAI", courseCode: null },
    ]);
    await expect(searchProfessors("CSCI3150", "kai chna")).resolves.toEqual([
      { id: "target", name: "Professor CHAN Wing Kai" },
    ]);
  });

  it("支持中文教授姓名查询", async () => {
    queueRows([{ id: "seed", name: "测试教授 Chan", courseCode: "CSCI1130" }]);
    await expect(searchProfessors("CSCI1130", "测试教授")).resolves.toEqual([
      { id: "seed", name: "测试教授 Chan" },
    ]);
  });
});

describe("getCourseProfessorStats", () => {
  it("按当前课程和教授汇总非零标签计数", async () => {
    queueRows(
      [{ id: "p1", name: "Professor CHAN" }],
      [],
      [],
      [
        { professorId: "p1", tags: ["hea", "靓 grade", "讲解清晰"] },
        { professorId: "p1", tags: ["hea", "讲解清晰"] },
        { professorId: "p1", tags: ["chur", "讲解清晰"] },
      ],
    );

    await expect(getCourseProfessorStats("CSCI3150")).resolves.toEqual([
      expect.objectContaining({
        id: "p1",
        tags: [
          { label: "hea", count: 2 },
          { label: "chur", count: 1 },
          { label: "靓 grade", count: 1 },
          { label: "讲解清晰", count: 3 },
        ],
      }),
    ]);
  });

  it("返回教授 overall、任教学期均分和各自样本数", async () => {
    queueRows(
      [{ id: "p1", name: "Professor CHAN" }],
      [
        {
          professorId: "p1",
          academicYear: "2025-26",
          term: "Term 1",
          avg: "4.5",
          cnt: 2,
        },
        {
          professorId: "p1",
          academicYear: "2024-25",
          term: "Term 2",
          avg: "3.5",
          cnt: 1,
        },
      ],
      [
        {
          academicYear: "2025-26",
          term: "Term 1",
          instructors: ["Professor CHAN"],
        },
        {
          academicYear: "2023-24",
          term: "Summer",
          instructors: ["Professor CHAN"],
        },
      ],
    );

    await expect(getCourseProfessorStats("csci 3150")).resolves.toEqual([
      {
        id: "p1",
        name: "Professor CHAN",
        rating: 4.2,
        ratingCount: 3,
        tags: [],
        terms: [
          {
            academicYear: "2025-26",
            term: "Term 1",
            rating: 4.5,
            ratingCount: 2,
          },
          {
            academicYear: "2024-25",
            term: "Term 2",
            rating: 3.5,
            ratingCount: 1,
          },
          {
            academicYear: "2023-24",
            term: "Summer",
            rating: null,
            ratingCount: 0,
          },
        ],
      },
    ]);
  });

  it("保留并排序超过 10 个任教学期", async () => {
    const enrollments = ["2025-26", "2024-25", "2023-24", "2022-23"].flatMap(
      (academicYear) =>
        ["Term 1", "Term 2", "Summer"].map((term) => ({
          academicYear,
          term,
          instructors: ["Professor CHAN"],
        })),
    );
    queueRows([{ id: "p1", name: "Professor CHAN" }], [], enrollments);

    const [stats] = await getCourseProfessorStats("CSCI3150");
    expect(stats.terms).toHaveLength(12);
    expect(stats.terms[0]).toMatchObject({
      academicYear: "2025-26",
      term: "Term 1",
    });
    expect(stats.terms.at(-1)).toMatchObject({
      academicYear: "2022-23",
      term: "Summer",
    });
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
      lastIsAnonymous: false,
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
          tags: ["hea", "靓 grade", "讲解清晰"],
          isAnonymous: true,
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
    expect(state?.lastTags).toEqual(["hea", "靓 grade", "讲解清晰"]);
    expect(state?.lastIsAnonymous).toBe(true);
    expect(state?.myRatingCount).toBe(1);
  });

  it("未知课程返回 null", async () => {
    queueRows([]); // findCourse → none
    await expect(getCourseRatingState("NOPE0000")).resolves.toBeNull();
  });
});

describe("getCourseReviews", () => {
  it("公开评论展示同一投稿选择的标签", async () => {
    queueRows(
      [COURSE],
      [
        {
          id: "r1",
          content: "很清楚",
          createdAt: new Date("2026-07-13T00:00:00Z"),
          userId: "other",
          professorId: "p1",
          professorName: "Professor CHAN",
          academicYear: "2025-26",
          term: "Term 2",
          score: 4.5,
          tags: ["hea", "靓 grade", "讲解清晰"],
          authorNickname: "Alice",
        },
      ],
      [],
    );

    await expect(getCourseReviews("CSCI3150")).resolves.toEqual([
      expect.objectContaining({
        id: "r1",
        tags: ["hea", "靓 grade", "讲解清晰"],
        authorNickname: "Alice",
      }),
    ]);
  });

  it("匿名评论不向客户端返回作者昵称", async () => {
    queueRows(
      [COURSE],
      [
        {
          id: "r1",
          content: "不署名",
          createdAt: new Date("2026-07-13T00:00:00Z"),
          userId: "other",
          professorId: "p1",
          professorName: "Professor CHAN",
          academicYear: "2025-26",
          term: "Term 2",
          score: 4.5,
          tags: [],
          authorNickname: null,
        },
      ],
      [],
    );

    await expect(getCourseReviews("CSCI3150")).resolves.toEqual([
      expect.objectContaining({ id: "r1", authorNickname: null }),
    ]);
  });

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
  const offset = () => dbChain.offset as Mock;

  it("返回总课程数和当前页，课程目录不再被静默截断为 48 门", async () => {
    const firstPage = Array.from({ length: 48 }, (_, i) => ({
      code: `CSCI${1000 + i}`,
      subject: "CSCI",
      title: `Course ${i}`,
      units: "3",
      description: "",
      terms: [],
    }));
    queueRows([{ total: 60 }], firstPage, [], []);
    const result = await getCourses({ subject: "CSCI" });
    expect(result.total).toBe(60);
    expect(result.courses).toHaveLength(48);
    expect(result.courses.every((c) => c.subject === "CSCI")).toBe(true);
    expect(limit()).toHaveBeenCalledWith(48);
    expect(offset()).toHaveBeenCalledWith(0);
  });

  it("翻页时使用正确的目录偏移量", async () => {
    queueRows([{ total: 4828 }], [{ ...COURSE }], [], []);
    const result = await getCourses({ page: 2 });
    expect(result.page).toBe(2);
    expect(offset()).toHaveBeenCalledWith(48);
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
