import { describe, it, expect } from "vitest";
import {
  recommend,
  validatePriorities,
  computeWeights,
  computeSmallCollegeSpecialization,
  type RecommendInput,
} from "@/lib/college-picker/recommend";
import {
  COLLEGES,
  COLLEGE_CAPTURE,
  SMALL_COLLEGE_IDS,
  type ScoredFactor,
  type AvoidFactor,
} from "@/lib/college-picker/data";

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
    // C-i：最高分 mc(小书院) → 第一志愿；其余两所小书院→8-9；非小书院套用中/大特规。
    expected: ["mc", "cc", "uc", "lws", "na", "sc", "wys", "shho", "cwc"],
  },
  {
    label: "文科 · 住宿/交换/通勤 · 无避雷 (Shaw 在非小书院块末尾)",
    input: {
      majorGroup: "arts",
      priorities: [
        "Accommodation_Environment",
        "Exchange_Opportunity",
        "Commute_Time",
      ],
      avoids: [],
    },
    // C-i：mc(小书院)最高分→第一志愿；非小书院块末尾是 sc(逸夫)，小书院块 8-9。
    expected: ["mc", "uc", "cc", "na", "lws", "wys", "sc", "cwc", "shho"],
  },
  {
    label: "商科 · 保宿/通勤/交换 · 避雷[面试,笔试]",
    input: {
      majorGroup: "business",
      priorities: ["Hostel_Guarantee", "Commute_Time", "Exchange_Opportunity"],
      avoids: ["Admission_Interview", "Admission_Written_Test"],
    },
    // 面试命中 mc/cwc/lws，笔试命中 mc/shho/cwc/lws。
    // mc/cwc/lws 各中两项(-100)，shho 仅中笔试(-50)→27分。
    // 最高分 cc(65,非小)→C-ii：小书院→7-9；非小块 wys 现为干净书院不再归零。
    expected: ["cc", "uc", "sc", "na", "wys", "lws", "shho", "cwc", "mc"],
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
    // C-i：mc→第一志愿；非小书院块内避雷命中的 cc/uc/wys 排到该块末尾(5-7)；
    // 小书院块 8-9：shho(干净) → cwc(避雷)。
    expected: ["mc", "na", "lws", "sc", "cc", "uc", "wys", "shho", "cwc"],
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
    // 全部四项避雷：cc(FYP+宗教,-100), uc(FYP,-50), cwc(FYP+面试+笔试,-150),
    // wys(FYP,-50), mc(面试+笔试,-100), shho(笔试,-50), lws(面试+笔试,-100)。
    // 仅 na/sc 干净(均35)。na(id<sc)居首→C-ii：小书院→7-9；shho 现仅中一项(-50)→15分。
    expected: ["na", "sc", "cc", "lws", "uc", "wys", "shho", "cwc", "mc"],
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
    // C-i：mc(小书院)最高分→第一志愿；其余两所小书院→8-9。
    expected: ["mc", "cc", "uc", "na", "sc", "wys", "lws", "shho", "cwc"],
  },
];

describe("recommend — 推荐指数公式 ((10-rank1)×5 + (10-rank2)×3 + (10-rank3)×2 - 避雷×50)", () => {
  it("按加权名次给书院打推荐指数（越高越好）", () => {
    // 工科 · 通勤/住宿/保宿 · 无避雷
    // 晨兴 mc：通勤::engineering=2、住宿::ALL=1、保宿::ALL=2
    // score = (10-2)×5 + (10-1)×3 + (10-2)×2 = 40 + 27 + 16 = 83
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
    expect(mc?.score).toBe(83);
  });

  it("避雷命中会扣分 (每命中一项 -50)", () => {
    // 理科 · 通勤/住宿/交换 · 避雷[FYP]；崇基 cc 命中 FYP
    // 基础推荐指数：(10-3)×5 + (10-7)×3 + (10-1)×2 = 35 + 9 + 18 = 62
    // 命中一项避雷 → -50 = 12
    const withAvoid = recommend({
      majorGroup: "science",
      priorities: [
        "Commute_Time",
        "Accommodation_Environment",
        "Exchange_Opportunity",
      ],
      avoids: ["College_FYP"],
    });
    expect(withAvoid.find((c) => c.id === "cc")?.score).toBe(12);
  });

  it("推荐指数扣到 <=0 时归零", () => {
    // 社科 · 住宿/保宿/交换 · 避雷全部四项；崇基 cc 命中 FYP+宗教 两项
    // 基础：(10-4)×5+(10-6)×3+(10-1)×2 = 30+12+18 = 60；命中两项 -100 → -40 → 归零
    const result = recommend({
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
    });
    const cc = result.find((c) => c.id === "cc")!;
    expect(cc.avoidHits).toHaveLength(2);
    expect(cc.score).toBe(0);
  });
});

describe("validatePriorities — 第一必填；非空不重复；不跳位", () => {
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

  it("第一看重点留空：不通过", () => {
    const r = validatePriorities(["", "Accommodation_Environment", ""]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("第一");
  });

  it("第二留空、第三也留空：通过（允许只填一个）", () => {
    expect(validatePriorities(["Commute_Time", "", ""])).toEqual({ ok: true });
  });

  it("第二留空但第三填写（跳位）：不通过", () => {
    const r = validatePriorities(["Commute_Time", "", "Hostel_Guarantee"]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toBeTruthy();
  });
});

describe("computeWeights — 非空权重等比放大到合计 10", () => {
  it("三项填满：5 / 3 / 2", () => {
    expect(
      computeWeights([
        "Commute_Time",
        "Accommodation_Environment",
        "Hostel_Guarantee",
      ]),
    ).toEqual([5, 3, 2]);
  });

  it("仅填前两项：6.25 / 3.75 / 0", () => {
    expect(
      computeWeights(["Commute_Time", "Accommodation_Environment", ""]),
    ).toEqual([6.25, 3.75, 0]);
  });

  it("仅填第一项：10 / 0 / 0", () => {
    expect(computeWeights(["Commute_Time", "", ""])).toEqual([10, 0, 0]);
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

describe("recommend — 避雷命中只后移不删除（分区内排末尾）", () => {
  it("勾选[FYP]：命中书院仍在列表里且带命中标注，且在各分区内排到该分区末尾", () => {
    // FYP=Y：崇基 cc、联合 uc、敬文 cwc、伍宜孙 wys
    // 本场景最高分为 mc(小书院) → C-i：小书院占 1 + 8/9，非小书院占 2-7。
    // 裁决：A/B/C 分区优先，避雷只在各分区内部把命中者排到该分区末尾。
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

    // 非小书院分区（槽 2-7，索引 1-6）：干净在前、命中在后
    const nonSmallRegion = result.slice(1, 7);
    const lastCleanNonSmall = Math.max(
      ...nonSmallRegion
        .filter((c) => c.avoidHits.length === 0)
        .map((c) => nonSmallRegion.indexOf(c)),
    );
    const firstHitNonSmall = Math.min(
      ...nonSmallRegion
        .filter((c) => c.avoidHits.length > 0)
        .map((c) => nonSmallRegion.indexOf(c)),
    );
    expect(lastCleanNonSmall).toBeLessThan(firstHitNonSmall);

    // 小书院分区（槽 8-9，索引 7-8）：干净 shho 在前、命中 cwc 在后
    const smallRegion = result.slice(7, 9);
    expect(smallRegion[0].avoidHits.length).toBe(0);
    expect(smallRegion[1].avoidHits.length).toBeGreaterThan(0);

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

describe("recommend — 小书院意愿题 (A/B/C)", () => {
  const baseInput = {
    majorGroup: "engineering" as const,
    priorities: [
      "Commute_Time",
      "Accommodation_Environment",
      "Hostel_Guarantee",
    ] as [ScoredFactor, ScoredFactor, ScoredFactor],
    avoids: [] as AvoidFactor[],
  };

  it("A · 冲小书院：第一志愿为推荐指数最高的小书院，其余两所排到 8–9", () => {
    const result = recommend({ ...baseInput, smallCollegePreference: "aim" });
    const smalls = result.filter((c) => SMALL.has(c.id));
    // 第一志愿是小书院
    expect(SMALL.has(result[0].id)).toBe(true);
    expect(result[0].reasons.some((r) => r.includes("冲小书院"))).toBe(true);
    // 第一志愿是三所小书院里推荐指数最高的
    const topSmallScore = Math.max(...smalls.map((c) => c.score));
    expect(result[0].score).toBe(topSmallScore);
    // 另两所小书院落在第 8–9 志愿
    const last2 = result.slice(7, 9).map((c) => c.id);
    expect(SMALL.has(last2[0])).toBe(true);
    expect(SMALL.has(last2[1])).toBe(true);
    // 2–7 全是非小书院
    const mid6 = result.slice(1, 7).map((c) => c.id);
    expect(mid6.every((id) => !SMALL.has(id))).toBe(true);
  });

  it("A · 最高分小书院命中避雷时，仍作为第一志愿（top_any）", () => {
    const result = recommend({
      majorGroup: "engineering",
      priorities: ["Commute_Time", "", ""],
      avoids: ["Admission_Written_Test"],
      smallCollegePreference: "aim",
    });

    expect(result[0].id).toBe("shho");
    expect(result[0].score).toBe(40);
    expect(result[0].avoidHits).toContain("Admission_Written_Test");
  });

  it("B · 不想去小书院：三所小书院整体排到第 7–9，且按推荐指数降序", () => {
    const result = recommend({
      ...baseInput,
      smallCollegePreference: "avoid",
    });
    const last3 = result.slice(6, 9).map((c) => c.id);
    expect(new Set(last3)).toEqual(new Set(["mc", "shho", "cwc"]));
    // 1–6 全是非小书院
    const top6 = result.slice(0, 6).map((c) => c.id);
    expect(top6.every((id) => !SMALL.has(id))).toBe(true);
    // 7–9 按推荐指数降序
    const scores = result.slice(6, 9).map((c) => c.score);
    expect(scores[0]).toBeGreaterThanOrEqual(scores[1]);
    expect(scores[1]).toBeGreaterThanOrEqual(scores[2]);
  });

  it("C · 无所谓：最高分书院为小书院 → 第一志愿为该小书院，其余两所→8–9", () => {
    const result = recommend({
      ...baseInput,
      smallCollegePreference: "indifferent",
    });
    // 既有黄金输出第一志愿是晨兴 mc（小书院且最高分）
    expect(result[0].id).toBe("mc");
    const last2 = result.slice(7, 9).map((c) => c.id);
    expect(SMALL.has(last2[0])).toBe(true);
    expect(SMALL.has(last2[1])).toBe(true);
  });

  it("C · 无所谓：最高分书院不是小书院 → 三所小书院排到第 7–9", () => {
    // 单因素「交换机会」：崇基 cc 交换第 1 → (10-1)*10=90，居全局最高（非小书院）。
    const result = recommend({
      majorGroup: "engineering",
      priorities: ["Exchange_Opportunity", "", ""],
      avoids: [],
      smallCollegePreference: "indifferent",
    });
    expect(result[0].id).toBe("cc");
    const last3 = result.slice(6, 9).map((c) => c.id);
    expect(new Set(last3)).toEqual(new Set(["mc", "shho", "cwc"]));
    const top6 = result.slice(0, 6).map((c) => c.id);
    expect(top6.every((id) => !SMALL.has(id))).toBe(true);
  });

  it("B 仍不重不漏：九所书院各一次", () => {
    const result = recommend({
      ...baseInput,
      smallCollegePreference: "avoid",
    });
    const ids = result.map((c) => c.id);
    expect(ids).toHaveLength(9);
    expect(new Set(ids)).toEqual(new Set(ALL_IDS));
  });
});

describe("recommend — 逸夫 (Shaw) 尽量不排最后：仅同分才换位（在非小书院分区内生效）", () => {
  it("文科场景：Shaw 与非小书院块倒数第二不同分 → 规则无法触发，Shaw 排在该块末尾", () => {
    // C-i：mc(小书院)最高分→第一志愿；非小书院块占槽 2-7，小书院块占 8-9。
    // Shaw(sc) 落在非小书院块末尾（槽 7），与前一名不同分 → 不换位。
    const result = recommend({
      majorGroup: "arts",
      priorities: [
        "Accommodation_Environment",
        "Exchange_Opportunity",
        "Commute_Time",
      ],
      avoids: [],
    });
    const nonSmallRegion = result.slice(1, 7); // 槽 2-7（索引 1-6）
    const last = nonSmallRegion[nonSmallRegion.length - 1];
    const secondLast = nonSmallRegion[nonSmallRegion.length - 2];
    expect(last.id).toBe("sc");
    expect(last.score).not.toBe(secondLast.score);
    // 全局末位由小书院块占据，不是 sc
    expect(result[result.length - 1].id).not.toBe("sc");
  });

  it("商科避雷场景：Shaw 不在末尾时，末位由避雷命中的书院占据", () => {
    const result = recommend({
      majorGroup: "business",
      priorities: ["Hostel_Guarantee", "Commute_Time", "Exchange_Opportunity"],
      avoids: ["Admission_Interview", "Admission_Written_Test"],
    });
    // 新命中名单下小书院块：shho 仅中笔试(-50→27)排小书院块首位，mc/cwc 各中两项(0 分)排末尾。
    expect(result[result.length - 1].id).toBe("mc");
    expect(result[result.length - 1].avoidHits.length).toBeGreaterThan(0);
  });
});

describe("recommend — 其他看重因素（加固定分）", () => {
  const base: RecommendInput = {
    majorGroup: "engineering",
    priorities: [
      "Commute_Time",
      "Accommodation_Environment",
      "Hostel_Guarantee",
    ],
    avoids: [],
  };

  it("未勾选任何其他因素时，分数与不传 bonusFactors 一致", () => {
    const a = recommend(base);
    const b = recommend({ ...base, bonusFactors: [] });
    expect(a.map((c) => c.id)).toEqual(b.map((c) => c.id));
    expect(a.map((c) => c.score)).toEqual(b.map((c) => c.score));
  });

  it("勾选「离港铁距离」：各书院按 BONUS_VALUES.MTR_Distance 加分", () => {
    const noBonus = recommend(base);
    const withMtr = recommend({ ...base, bonusFactors: ["MTR_Distance"] });
    const noMap = new Map(noBonus.map((c) => [c.id, c.score]));
    for (const c of withMtr) {
      // cc 通勤::engineering=3，base 52；+5 → 57
      expect(c.score).toBe(
        noMap.get(c.id)! +
          ({
            cc: 5,
            shho: 4,
            mc: 4,
            uc: 3,
            na: 3,
            cwc: 2.5,
            lws: 2,
            wys: 2,
            sc: 1,
          }[c.id] ?? 0),
      );
    }
  });

  it("勾选「大一能选舍友 par 房」：cc/shho/mc/wys 各 +5", () => {
    const withPar = recommend({ ...base, bonusFactors: ["Par_Room"] });
    const cc = withPar.find((c) => c.id === "cc")!;
    const shho = withPar.find((c) => c.id === "shho")!;
    const mc = withPar.find((c) => c.id === "mc")!;
    const uc = withPar.find((c) => c.id === "uc")!;
    // cc base 52 +5 = 57；shho base 81 +5 = 86；mc base 83 +5 = 88；uc base 52 +0 = 52
    expect(cc.score).toBe(57);
    expect(shho.score).toBe(86);
    expect(mc.score).toBe(88);
    expect(uc.score).toBe(52);
  });

  it("同时勾选两项：加分叠加，且 mc 仍因最高分居首（C-i）", () => {
    const result = recommend({
      ...base,
      bonusFactors: ["MTR_Distance", "Par_Room"],
    });
    // mc base 83 + MTR 4 + Par 5 = 92，仍是全局最高 → C-i 第一志愿
    expect(result[0].id).toBe("mc");
    expect(result[0].score).toBe(92);
  });

  it("加分可与避雷惩罚叠加：cc base 52 + MTR 5 - FYP 50 = 7", () => {
    const result = recommend({
      ...base,
      avoids: ["College_FYP"],
      bonusFactors: ["MTR_Distance"],
    });
    const cc = result.find((c) => c.id === "cc")!;
    expect(cc.score).toBe(7);
    expect(cc.avoidHits).toContain("College_FYP");
  });

  it("加分不会改变 A/B/C 分区：A 第一志愿仍为推荐指数最高的小书院", () => {
    const result = recommend({
      ...base,
      bonusFactors: ["MTR_Distance"],
      smallCollegePreference: "aim",
    });
    expect(SMALL.has(result[0].id)).toBe(true);
    const smalls = result.filter((c) => SMALL.has(c.id));
    expect(result[0].score).toBe(Math.max(...smalls.map((c) => c.score)));
  });
});

describe("recommend — 06 小书院精选专属评分", () => {
  const baseInput = {
    majorGroup: "engineering" as const,
    priorities: [
      "Commute_Time",
      "Accommodation_Environment",
      "Hostel_Guarantee",
    ] as [ScoredFactor, ScoredFactor, ScoredFactor],
    avoids: [] as AvoidFactor[],
  };

  it("computeSmallCollegeSpecialization：全选 A/A/A/A → 三院得分", () => {
    const spec = computeSmallCollegeSpecialization({
      q1: "A",
      q2: "A",
      q3: "A",
      q4: "A",
    });
    // q1A: cwc+25, shho+20, mc+10; q2A: shho+10; q3A: mc+10; q4A: cwc+10
    // cwc = 25+10 = 35; shho = 20+10 = 30; mc = 10+10 = 20
    expect(spec.cwc).toBe(35);
    expect(spec.shho).toBe(30);
    expect(spec.mc).toBe(20);
  });

  it("computeSmallCollegeSpecialization：全选 B/E/D/C → 均衡加分", () => {
    const spec = computeSmallCollegeSpecialization({
      q1: "B",
      q2: "E",
      q3: "D",
      q4: "C",
    });
    // q1B: all+20; q2E: all+7; q3D: all+7; q4C: mc+5, shho+5, cwc+7
    // mc = 20+7+7+5 = 39; shho = 20+7+7+5 = 39; cwc = 20+7+7+7 = 41
    expect(spec.mc).toBe(39);
    expect(spec.shho).toBe(39);
    expect(spec.cwc).toBe(41);
  });

  it("computeSmallCollegeSpecialization：(3) Q3A 与 Q3D 对 mc 的差异（已移除 −5 惩罚）", () => {
    const withA = computeSmallCollegeSpecialization({
      q1: "B",
      q2: "D",
      q3: "A",
      q4: "C",
    });
    const withD = computeSmallCollegeSpecialization({
      q1: "B",
      q2: "D",
      q3: "D",
      q4: "C",
    });
    // q3A: mc+10 vs q3D: mc+7 → 净差 3
    expect(withA.mc - withD.mc).toBe(3);
  });

  it("A + 06 答案：小书院最终推荐指数 = 原始×0.6 + 专属×1", () => {
    const result = recommend({
      ...baseInput,
      smallCollegePreference: "aim",
      smallCollegeAnswers: { q1: "A", q2: "A", q3: "A", q4: "A" },
    });
    // 原始分：mc=83, shho=81, cwc=43
    // 专属：cwc=35, shho=30, mc=20
    // 最终：shho=81×0.6+30×1=78.6; mc=83×0.6+20×1=69.8; cwc=43×0.6+35×1=60.8
    // 最高 = shho(78.6) → 第一志愿
    expect(result[0].id).toBe("shho");
    expect(result[0].score).toBeCloseTo(78.6, 1);
    // 第 8-9 志愿为另外两所小书院
    const last2 = result.slice(7, 9).map((c) => c.id);
    expect(SMALL.has(last2[0])).toBe(true);
    expect(SMALL.has(last2[1])).toBe(true);
  });

  it("A + 06 答案：非小书院评分不变", () => {
    const withoutAns = recommend({
      ...baseInput,
      smallCollegePreference: "aim",
    });
    const withAns = recommend({
      ...baseInput,
      smallCollegePreference: "aim",
      smallCollegeAnswers: { q1: "B", q2: "B", q3: "A", q4: "A" },
    });
    // 非小书院的 score 应一致
    for (const c of withAns) {
      if (!SMALL.has(c.id)) {
        const match = withoutAns.find((x) => x.id === c.id)!;
        expect(c.score).toBe(match.score);
      }
    }
  });

  it("A 无 06 答案：退化为原始推荐指数排序小书院", () => {
    const result = recommend({
      ...baseInput,
      smallCollegePreference: "aim",
    });
    expect(result[0].id).toBe("mc");
    expect(result[0].score).toBe(83);
  });

  it("非 A 路径不使用 06 答案", () => {
    const resultC = recommend({
      ...baseInput,
      smallCollegePreference: "indifferent",
      smallCollegeAnswers: { q1: "A", q2: "A", q3: "A", q4: "A" },
    });
    // C 路径忽略 smallCollegeAnswers，mc 仍为 83（原始分）
    const mc = resultC.find((c) => c.id === "mc")!;
    expect(mc.score).toBe(83);
  });
});

describe("COLLEGE_CAPTURE", () => {
  it("九所书院均有 2–4 条优缺点", () => {
    for (const college of COLLEGES) {
      const capture = COLLEGE_CAPTURE[college.id];
      expect(capture.pros.length).toBeGreaterThanOrEqual(2);
      expect(capture.pros.length).toBeLessThanOrEqual(4);
      expect(capture.cons.length).toBeGreaterThanOrEqual(2);
      expect(capture.cons.length).toBeLessThanOrEqual(4);
    }
  });

  it("和声书院有灰色备注", () => {
    expect(COLLEGE_CAPTURE.lws.remark).toMatch(/入学面试/);
  });
});
