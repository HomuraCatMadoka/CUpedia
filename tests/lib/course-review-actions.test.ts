import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";

// ref #177 — course-review MVP data layer.
//
// The catalog reads hit the real `courses` table and the rating/review/like
// tables; here we stub `@/db` with a thenable chain whose terminal `await`
// pulls the next queued result, and `@/lib/auth-guard` for the viewer. Tests
// assert the *external behavior* PRD #177 pins down — auth gating, the 5-min
// cooldown, author/admin withdraw rights, like de-dup, input validation, and
// the aggregate null-vs-average — not the SQL shape.

const {
  mockRequireAuth,
  mockGetOptionalUser,
  dbQueue,
  dbSelect,
  dbInsert,
  dbDelete,
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
    dbDelete: vi.fn(() => chain),
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
    delete: () => dbDelete(),
  },
}));

import {
  submitCourseRating,
  addReview,
  deleteReview,
  toggleLike,
  getCourseRatingState,
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
});

describe("submitCourseRating", () => {
  it("拒绝未登录用户", async () => {
    mockRequireAuth.mockRejectedValue(new Error("未登录"));
    await expect(submitCourseRating("CSCI3150", 8)).rejects.toThrow();
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("拒绝越界分数（不触库）", async () => {
    await expect(submitCourseRating("CSCI3150", 11)).rejects.toThrow(/0 到 10/);
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("冷却期内拒绝再次打分", async () => {
    queueRows([COURSE], [{ createdAt: new Date() }]); // findCourse, last rating (recent)
    await expect(submitCourseRating("CSCI3150", 8)).rejects.toThrow(/打分/);
    expect(dbInsert).not.toHaveBeenCalled();
  });

  it("冷却已过则写入四舍五入后的分数", async () => {
    queueRows([COURSE], []); // findCourse, no prior rating
    await expect(submitCourseRating("CSCI3150", 8.47)).resolves.toBeUndefined();
    expect(dbInsert).toHaveBeenCalledOnce();
    expect(values()).toHaveBeenCalledWith(
      expect.objectContaining({
        courseCode: "CSCI3150",
        userId: "u1",
        score: 8.5,
      }),
    );
  });

  it("课程不存在时报错", async () => {
    queueRows([]); // findCourse → none
    await expect(submitCourseRating("NOPE0000", 8)).rejects.toThrow(
      /课程不存在/,
    );
  });
});

describe("addReview", () => {
  it("拒绝未登录用户", async () => {
    mockRequireAuth.mockRejectedValue(new Error("未登录"));
    await expect(addReview("CSCI3150", "好课")).rejects.toThrow();
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("拒绝空内容（不触库）", async () => {
    await expect(addReview("CSCI3150", "   ")).rejects.toThrow(/不能为空/);
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("拒绝超长内容（不触库）", async () => {
    await expect(addReview("CSCI3150", "a".repeat(2001))).rejects.toThrow(
      /过长/,
    );
    expect(dbSelect).not.toHaveBeenCalled();
  });

  it("正常发表：trim 后写入", async () => {
    queueRows([COURSE]); // findCourse
    await expect(addReview("CSCI3150", "  很清楚  ")).resolves.toBeUndefined();
    expect(dbInsert).toHaveBeenCalledOnce();
    expect(values()).toHaveBeenCalledWith(
      expect.objectContaining({
        courseCode: "CSCI3150",
        userId: "u1",
        content: "很清楚",
      }),
    );
  });
});

describe("deleteReview", () => {
  it("拒绝未登录用户", async () => {
    mockRequireAuth.mockRejectedValue(new Error("未登录"));
    await expect(deleteReview("r1")).rejects.toThrow();
    expect(dbDelete).not.toHaveBeenCalled();
  });

  it("评论不存在时报错", async () => {
    queueRows([]); // review lookup → none
    await expect(deleteReview("r1")).rejects.toThrow(/评论不存在/);
  });

  it("非本人非管理员无权撤回", async () => {
    queueRows([{ userId: "other", courseCode: "CSCI3150" }]);
    await expect(deleteReview("r1")).rejects.toThrow(/无权/);
    expect(dbDelete).not.toHaveBeenCalled();
  });

  it("本人可撤回", async () => {
    queueRows([{ userId: "u1", courseCode: "CSCI3150" }], []);
    await expect(deleteReview("r1")).resolves.toBeUndefined();
    expect(dbDelete).toHaveBeenCalledOnce();
  });

  it("管理员可撤回他人评论", async () => {
    mockRequireAuth.mockResolvedValue({ id: "admin", role: "admin" });
    queueRows([{ userId: "other", courseCode: "CSCI3150" }], []);
    await expect(deleteReview("r1")).resolves.toBeUndefined();
    expect(dbDelete).toHaveBeenCalledOnce();
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
  it("无人评分且未登录：aggregate 为 null、不可打分", async () => {
    queueRows([COURSE], [{ avg: null, cnt: 0 }]); // findCourse, ratingAgg
    const state = await getCourseRatingState("CSCI3150");
    expect(state).toMatchObject({
      aggregateRating: null,
      ratingCount: 0,
      canRate: false,
      cooldownSeconds: 0,
      myRatingCount: 0,
    });
  });

  it("已评分且在冷却期：给出均值与剩余秒数", async () => {
    mockGetOptionalUser.mockResolvedValue({ id: "u1", role: "user" });
    queueRows(
      [COURSE], // findCourse
      [{ avg: "8", cnt: 2 }], // ratingAgg
      [{ score: 8, createdAt: new Date() }], // my ratings (recent)
    );
    const state = await getCourseRatingState("CSCI3150");
    expect(state?.aggregateRating).toBe(8);
    expect(state?.ratingCount).toBe(2);
    expect(state?.canRate).toBe(false);
    expect(state?.cooldownSeconds).toBeGreaterThan(0);
    expect(state?.lastScore).toBe(8);
    expect(state?.myRatingCount).toBe(1);
  });

  it("未知课程返回 null", async () => {
    queueRows([]); // findCourse → none
    await expect(getCourseRatingState("NOPE0000")).resolves.toBeNull();
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
