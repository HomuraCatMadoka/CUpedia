import { describe, it, expect } from "vitest";
import {
  recommend,
  validatePriorities,
  type RecommendInput,
} from "@/lib/college-picker/recommend";
import { COLLEGES, SMALL_COLLEGE_IDS } from "@/lib/college-picker/data";

// 「分院帽」评分与志愿排序：忠实移植自 lorasbb/College-Hat，
// 黄金输出经 scratchpad/harness.js 验证。术语见 docs/college-picker/CONTEXT.md。

const order = (input: RecommendInput) => recommend(input).map((c) => c.id);
const ALL_IDS = COLLEGES.map((c) => c.id);
const SMALL = new Set<string>(SMALL_COLLEGE_IDS);

/** 六个覆盖各专业大类 / 避雷组合的黄金场景，钉死忠实移植的输出。 */
const GOLDEN: { label: string; input: RecommendInput; expected: string[] }[] = [
  {
    label: "工科 · 通勤/住宿/保宿 · 无避雷",
    input: {
      majorGroup: "engineering",
      priorities: [
        "Commute_Time",
        "Accommodation_Environment",
        "Hostel_Guarantee",
      ],
      avoids: [],
    },
    expected: ["mc", "cc", "uc", "shho", "cwc", "lws", "na", "sc", "wys"],
  },
  {
    label: "文科 · 住宿/交换/通勤 · 无避雷 (Shaw 垫底)",
    input: {
      majorGroup: "arts",
      priorities: [
        "Accommodation_Environment",
        "Exchange_Opportunity",
        "Commute_Time",
      ],
      avoids: [],
    },
    expected: ["mc", "uc", "cc", "cwc", "na", "lws", "shho", "wys", "sc"],
  },
  {
    label: "商科 · 保宿/通勤/交换 · 避雷[面试,笔试]",
    input: {
      majorGroup: "business",
      priorities: ["Hostel_Guarantee", "Commute_Time", "Exchange_Opportunity"],
      avoids: ["Admission_Interview", "Admission_Written_Test"],
    },
    expected: ["cc", "uc", "sc", "shho", "mc", "na", "wys", "lws", "cwc"],
  },
  {
    label: "理科 · 通勤/住宿/交换 · 避雷[FYP]",
    input: {
      majorGroup: "science",
      priorities: [
        "Commute_Time",
        "Accommodation_Environment",
        "Exchange_Opportunity",
      ],
      avoids: ["College_FYP"],
    },
    expected: ["mc", "na", "lws", "shho", "sc", "cc", "uc", "wys", "cwc"],
  },
  {
    label: "社科 · 住宿/保宿/交换 · 避雷[FYP,宗教,面试,笔试]",
    input: {
      majorGroup: "social_science",
      priorities: [
        "Accommodation_Environment",
        "Hostel_Guarantee",
        "Exchange_Opportunity",
      ],
      avoids: [
        "College_FYP",
        "Religious_Element",
        "Admission_Interview",
        "Admission_Written_Test",
      ],
    },
    expected: ["lws", "na", "sc", "mc", "shho", "uc", "wys", "cc", "cwc"],
  },
  {
    label: "工科 · 交换/住宿/保宿 · 无避雷",
    input: {
      majorGroup: "engineering",
      priorities: [
        "Exchange_Opportunity",
        "Accommodation_Environment",
        "Hostel_Guarantee",
      ],
      avoids: [],
    },
    expected: ["mc", "cc", "uc", "shho", "cwc", "na", "sc", "wys", "lws"],
  },
];

describe("recommend — 评分公式 (rank1×5 + rank2×3 + rank3×2)", () => {
  it("按加权名次给书院打分", () => {
    // 工科 · 通勤/住宿/保宿 · 无避雷
    // 晨兴 mc：通勤::engineering=2、住宿::ALL=1、保宿::ALL=2
    // score = 2×5 + 1×3 + 2×2 = 17
    const result = recommend({
      majorGroup: "engineering",
      priorities: [
        "Commute_Time",
        "Accommodation_Environment",
        "Hostel_Guarantee",
      ],
      avoids: [],
    });
    const mc = result.find((c) => c.id === "mc");
    expect(mc?.score).toBe(17);
  });

  it("避雷命中会叠加惩罚分 (每命中一项 +50)", () => {
    // 理科 · 通勤/住宿/交换 · 避雷[FYP]；崇基 cc 命中 FYP
    // 基础分：通勤::science=3、住宿::ALL=7、交换::ALL=1 → 3×5+7×3+1×2 = 38
    // 命中一项避雷 → +50 = 88
    const withAvoid = recommend({
      majorGroup: "science",
      priorities: [
        "Commute_Time",
        "Accommodation_Environment",
        "Exchange_Opportunity",
      ],
      avoids: ["College_FYP"],
    });
    expect(withAvoid.find((c) => c.id === "cc")?.score).toBe(88);
  });
});

describe("validatePriorities — 三个看重因素必须选满且互不相同", () => {
  it("三个不同因素：通过", () => {
    expect(
      validatePriorities([
        "Commute_Time",
        "Accommodation_Environment",
        "Hostel_Guarantee",
      ]),
    ).toEqual({ ok: true });
  });

  it("有重复：不通过并给出提示", () => {
    const r = validatePriorities([
      "Commute_Time",
      "Commute_Time",
      "Hostel_Guarantee",
    ]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBeTruthy();
  });

  it("未选满（有空位）：不通过并给出提示", () => {
    const r = validatePriorities(["Commute_Time", "", "Hostel_Guarantee"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBeTruthy();
  });
});

describe("recommend — 完整志愿排序 (黄金回归)", () => {
  it.each(GOLDEN)("$label", ({ input, expected }) => {
    expect(order(input)).toEqual(expected);
  });
});

describe("recommend — 不重不漏 (九所书院各一次)", () => {
  it.each(GOLDEN)("$label", ({ input }) => {
    const ids = order(input);
    expect(ids).toHaveLength(9);
    expect(new Set(ids)).toEqual(new Set(ALL_IDS));
  });
});

describe("recommend — 避雷命中只后移不删除", () => {
  it("勾选[FYP]：命中书院被整体压到末尾，仍在列表里且带命中标注", () => {
    // FYP=Y：崇基 cc、联合 uc、敬文 cwc、伍宜孙 wys
    const result = recommend({
      majorGroup: "science",
      priorities: [
        "Commute_Time",
        "Accommodation_Environment",
        "Exchange_Opportunity",
      ],
      avoids: ["College_FYP"],
    });
    const ids = result.map((c) => c.id);

    // 一所都没消失
    expect(ids).toHaveLength(9);

    // 所有命中书院排在所有未命中书院之后
    const lastClean = Math.max(
      ...result
        .filter((c) => c.avoidHits.length === 0)
        .map((c) => ids.indexOf(c.id)),
    );
    const firstHit = Math.min(
      ...result
        .filter((c) => c.avoidHits.length > 0)
        .map((c) => ids.indexOf(c.id)),
    );
    expect(lastClean).toBeLessThan(firstHit);

    // 命中书院带上 avoidHits 与可读的命中原因
    const cc = result.find((c) => c.id === "cc")!;
    expect(cc.avoidHits).toContain("College_FYP");
    expect(cc.reasons.some((r) => r.includes("命中"))).toBe(true);
  });

  it("避雷原因文案按规范序输出，不随用户勾选顺序（忠实原实现）", () => {
    // cc 同时命中 FYP + 宗教；即便用非规范序勾选，原因仍应是 [FYP, 宗教]。
    const result = recommend({
      majorGroup: "science",
      priorities: [
        "Commute_Time",
        "Accommodation_Environment",
        "Exchange_Opportunity",
      ],
      avoids: ["Religious_Element", "College_FYP"],
    });
    const cc = result.find((c) => c.id === "cc")!;
    const hitReasons = cc.reasons.filter((r) => r.startsWith("命中"));
    expect(hitReasons).toEqual(["命中：不要书院 FYP", "命中：不要宗教元素"]);
  });
});

describe("recommend — 小书院志愿特规", () => {
  it.each(GOLDEN)("$label：前三志愿最多一所小书院", ({ input }) => {
    const top3 = order(input).slice(0, 3);
    const smallCount = top3.filter((id) => SMALL.has(id)).length;
    expect(smallCount).toBeLessThanOrEqual(1);
  });
});

describe("recommend — 逸夫 (Shaw) 尽量不排最后：仅同分才换位", () => {
  it("文科场景：Shaw 与倒数第二不同分 → 规则无法触发，Shaw 垫底", () => {
    const result = recommend({
      majorGroup: "arts",
      priorities: [
        "Accommodation_Environment",
        "Exchange_Opportunity",
        "Commute_Time",
      ],
      avoids: [],
    });
    const last = result[result.length - 1];
    const secondLast = result[result.length - 2];
    expect(last.id).toBe("sc");
    expect(last.score).not.toBe(secondLast.score);
  });

  it("商科避雷场景：Shaw 不在末尾时，末位由避雷命中的书院占据", () => {
    const result = recommend({
      majorGroup: "business",
      priorities: ["Hostel_Guarantee", "Commute_Time", "Exchange_Opportunity"],
      avoids: ["Admission_Interview", "Admission_Written_Test"],
    });
    expect(result[result.length - 1].id).toBe("cwc");
  });
});
