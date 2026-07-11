// 「分院帽」志愿推荐：纯函数，移植自 lorasbb/College-Hat 的客户端 JS 算法。
//
// 评分方向：推荐指数（越高越好）。某因素名次 i（1 最好、9 最差）在该优先级
// 拿到 (10 - i) × 权重；避雷每命中一项 -50；总分 <= 0 归零。
// 志愿排序特规（中/大书院差 1/≤2 分、逸夫尽量不排最后、避雷整体压到末尾）
// 全部保留，仅翻转比较方向。

import {
  AVOID_FACTORS,
  AVOID_REASON_LABEL,
  COLLEGES,
  FLAGS,
  LARGE_COLLEGE_IDS,
  MIDDLE_COLLEGE_IDS,
  RANKINGS,
  SHAW_ID,
  SMALL_COLLEGE_IDS,
  WEIGHTS,
  type AvoidFactor,
  type CollegeId,
  type College,
  type MajorGroup,
  type ScoredFactor,
} from "./data";

const SMALL_SET = new Set<CollegeId>(SMALL_COLLEGE_IDS);
const MIDDLE_SET = new Set<CollegeId>(MIDDLE_COLLEGE_IDS);
const LARGE_SET = new Set<CollegeId>(LARGE_COLLEGE_IDS);

/** 原始优先级权重（位置 0/1/2），未填的位置在 computeWeights 里被置 0 并等比放大。 */
const RAW_WEIGHTS = [
  WEIGHTS.firstPriority,
  WEIGHTS.secondPriority,
  WEIGHTS.thirdPriority,
] as const;

/** 是否「冲小书院 / 不想去 / 无所谓」。 */
export type SmallCollegePreference = "aim" | "avoid" | "indifferent";

export interface RecommendInput {
  majorGroup: MajorGroup;
  /**
   * 三个看重因素，依次对应第 1 / 2 / 3 优先级。第 1 个必填；第 2、3 个允许
   * 填 "" 表示「不填」。若第 2 为 "" 则第 3 必为 ""（不允许跳位）。
   */
  priorities: [ScoredFactor, ScoredFactor | "", ScoredFactor | ""];
  avoids: AvoidFactor[];
  /** 小书院意愿题。默认 indifferent = 沿用既有志愿分配机制。 */
  smallCollegePreference?: SmallCollegePreference;
}

export interface ScoredCollege extends College {
  /** 推荐指数，越高越好；避雷惩罚后 <=0 归零。 */
  score: number;
  ranks: { p1: number; p2: number; p3: number };
  reasons: string[];
  avoidHits: AvoidFactor[];
}

/** 取名次；缺失一律记 9（最差），与原实现一致。 */
function getRank(
  criterion: ScoredFactor,
  group: MajorGroup | "ALL",
  collegeId: CollegeId,
): number {
  const table =
    RANKINGS[`${criterion}::${group}`] ?? RANKINGS[`${criterion}::ALL`] ?? {};
  const n = Number(table[collegeId]);
  return Number.isFinite(n) ? n : 9;
}

function getAvoidHits(
  collegeId: CollegeId,
  avoids: AvoidFactor[],
): AvoidFactor[] {
  const collegeFlags = FLAGS[collegeId];
  return avoids.filter((a) => (collegeFlags?.[a] ?? "N") === "Y");
}

/**
 * 按填写情况把非空位置的原始权重等比放大到合计 10，保证评分一致性。
 * - 3 项填满：5 / 3 / 2（和 10）
 * - 仅填前 2 项：6.25 / 3.75 / 0（和 10）
 * - 仅填第 1 项：10 / 0 / 0
 */
export function computeWeights(
  priorities: ReadonlyArray<ScoredFactor | "">,
): [number, number, number] {
  const filledIdx = priorities
    .map((p, i) => (p !== "" ? i : -1))
    .filter((i) => i >= 0);
  const rawSum = filledIdx.reduce((s, i) => s + RAW_WEIGHTS[i], 0);
  const scale = rawSum > 0 ? 10 / rawSum : 0;
  return [0, 1, 2].map((i) =>
    priorities[i] !== "" ? RAW_WEIGHTS[i] * scale : 0,
  ) as [number, number, number];
}

/** 只有「上课通勤」按专业大类查名次，其余用 ALL。 */
function scoreCollege(
  college: College,
  group: MajorGroup,
  priorities: [ScoredFactor, ScoredFactor | "", ScoredFactor | ""],
  avoids: AvoidFactor[],
): ScoredCollege {
  const [p1, p2, p3] = priorities;
  const g1 = p1 === "Commute_Time" ? group : "ALL";
  const g2 = p2 === "Commute_Time" ? group : "ALL";
  const g3 = p3 === "Commute_Time" ? group : "ALL";
  const [w1, w2, w3] = computeWeights(priorities);

  const r1 = getRank(p1, g1, college.id);
  const r2 = p2 !== "" ? getRank(p2, g2, college.id) : 0;
  const r3 = p3 !== "" ? getRank(p3, g3, college.id) : 0;
  const ranks = { p1: r1, p2: r2, p3: r3 };

  let score =
    (10 - r1) * w1 + (10 - r2) * w2 + (10 - r3) * w3;

  const avoidHits = getAvoidHits(college.id, avoids);
  if (avoidHits.length) score -= WEIGHTS.hardFilterPenalty * avoidHits.length;
  if (score <= 0) score = 0;

  // 原因文案按 AVOID_FACTORS 的规范序输出（忠实原实现的四条定序 if），
  // 不跟随用户勾选顺序——勿改回 avoidHits.map。
  const reasons = AVOID_FACTORS.filter((f) => avoidHits.includes(f.id)).map(
    (f) => AVOID_REASON_LABEL[f.id],
  );

  return { ...college, score, ranks, reasons, avoidHits };
}

/** 主排序：推荐指数降序（越高越好），同分按书院 id 稳定。 */
function baseComparator(a: ScoredCollege, b: ScoredCollege): number {
  if (a.score !== b.score) return b.score - a.score;
  return a.id.localeCompare(b.id);
}

function isBlockedByAvoids(college: ScoredCollege): boolean {
  return college.avoidHits.length > 0;
}

/** 逐个志愿名次比较（p1 → p2 → p3 → id）；名次越小越好，方向不变。 */
function compareByPriorityRanks(a: ScoredCollege, b: ScoredCollege): number {
  if ((a.ranks.p1 || 9) !== (b.ranks.p1 || 9))
    return (a.ranks.p1 || 9) - (b.ranks.p1 || 9);
  if ((a.ranks.p2 || 9) !== (b.ranks.p2 || 9))
    return (a.ranks.p2 || 9) - (b.ranks.p2 || 9);
  if ((a.ranks.p3 || 9) !== (b.ranks.p3 || 9))
    return (a.ranks.p3 || 9) - (b.ranks.p3 || 9);
  return a.id.localeCompare(b.id);
}

function isMiddleLargePair(a: ScoredCollege, b: ScoredCollege): boolean {
  const aMiddle = MIDDLE_SET.has(a.id);
  const bMiddle = MIDDLE_SET.has(b.id);
  const aLarge = LARGE_SET.has(a.id);
  const bLarge = LARGE_SET.has(b.id);
  return (aMiddle && bLarge) || (aLarge && bMiddle);
}

/**
 * 前三志愿候选比较：中/大书院差 1 分时按看重因素定序；差 ≤2 分时先中后大；
 * 否则回到推荐指数（降序）。刻意保留原实现（非严格弱序，当前数据实测 0 触发）。
 */
function compareTopThreeCandidates(a: ScoredCollege, b: ScoredCollege): number {
  const scoreGap = Math.abs(a.score - b.score);

  if (isMiddleLargePair(a, b) && scoreGap === 1) {
    const priorityDiff = compareByPriorityRanks(a, b);
    if (priorityDiff !== 0) return priorityDiff;
  }

  if (a.score !== b.score) return b.score - a.score;

  if (isMiddleLargePair(a, b) && scoreGap <= 2) {
    if (MIDDLE_SET.has(a.id) && LARGE_SET.has(b.id)) return -1;
    if (LARGE_SET.has(a.id) && MIDDLE_SET.has(b.id)) return 1;
  }

  return compareByPriorityRanks(a, b);
}

/** 从 list 中原地取出指定书院（splice），取不到返回 null。 */
function takeById(
  list: ScoredCollege[],
  collegeId: CollegeId,
): ScoredCollege | null {
  const index = list.findIndex((x) => x.id === collegeId);
  if (index < 0) return null;
  return list.splice(index, 1)[0];
}

/** 推荐指数最高（最好）的未被避雷的小书院。 */
function pickTopSmall(scored: ScoredCollege[]): ScoredCollege | null {
  return (
    scored
      .filter((x) => SMALL_SET.has(x.id) && !isBlockedByAvoids(x))
      .sort(baseComparator)[0] || null
  );
}

/** 决定第一志愿（indifferent 路径）：第一志愿只保留得分最高的小书院。 */
function pickFirstChoice(
  remaining: ScoredCollege[],
): ScoredCollege | null {
  const topSmall = pickTopSmall(remaining);
  if (topSmall) {
    const picked = takeById(remaining, topSmall.id)!;
    picked.reasons = picked.reasons.concat("第一志愿只保留得分最高的小书院");
    return picked;
  }

  if (remaining.length) return remaining.shift()!;
  return null;
}

/**
 * 决定第一志愿（aim 路径）：强制为小书院。优先取推荐指数最高且未命中避雷的
 * 小书院；若三所小书院全部命中避雷，则退取推荐指数最高的小书院（即使命中）。
 */
function pickFirstChoiceAim(
  remaining: ScoredCollege[],
  blocked: ScoredCollege[],
): ScoredCollege | null {
  const cleanSmall = remaining
    .filter((x) => SMALL_SET.has(x.id))
    .sort(baseComparator);
  let picked = cleanSmall[0] || null;
  if (!picked) {
    // 极端兜底：三所小书院全部命中避雷时，从 blocked 里取最好的小书院。
    const blockedSmall = blocked
      .filter((x) => SMALL_SET.has(x.id))
      .sort(baseComparator);
    picked = blockedSmall[0] || null;
    if (picked) takeById(blocked, picked.id);
  }
  if (picked) {
    takeById(remaining, picked.id);
    picked.reasons = picked.reasons.concat(
      "已选「冲小书院」，第一志愿强制为小书院",
    );
  }
  return picked;
}

/** 决定第二、三志愿（恒从中/大书院里选，返回 0–2 所）。不改动传入数组。 */
function pickSecondThird(nonSmallSorted: ScoredCollege[]): ScoredCollege[] {
  const pool = nonSmallSorted.filter((x) => !isBlockedByAvoids(x)).slice();
  if (pool.length < 2) return pool;

  const bestMiddle =
    pool.filter((x) => MIDDLE_SET.has(x.id)).sort(baseComparator)[0] || null;
  const bestLarge =
    pool.filter((x) => LARGE_SET.has(x.id)).sort(baseComparator)[0] || null;

  if (
    bestMiddle &&
    bestLarge &&
    Math.abs(bestMiddle.score - bestLarge.score) === 1
  ) {
    const chosenByPriority = [bestMiddle, bestLarge].sort(
      compareTopThreeCandidates,
    );
    const priorityChosen: ScoredCollege[] = [];
    for (const cand of chosenByPriority) {
      const pick = takeById(pool, cand.id);
      if (pick) {
        pick.reasons = pick.reasons.concat(
          "中/大书院只差 1 分时，按你选的因素顺序决定先后",
        );
        priorityChosen.push(pick);
      }
    }
    if (priorityChosen.length === 2) return priorityChosen;
  }

  if (
    bestMiddle &&
    bestLarge &&
    Math.abs(bestMiddle.score - bestLarge.score) <= 2
  ) {
    const chosen: ScoredCollege[] = [];
    const middlePick = takeById(pool, bestMiddle.id);
    if (middlePick) {
      middlePick.reasons =
        middlePick.reasons.concat("第二志愿分差接近时先放中书院");
      chosen.push(middlePick);
    }
    const largePick = takeById(pool, bestLarge.id);
    if (largePick) {
      largePick.reasons =
        largePick.reasons.concat("第三志愿分差接近时再放大书院");
      chosen.push(largePick);
    }
    if (chosen.length === 2) return chosen;
  }

  const second = pool.shift();
  const third = pool.shift();
  if (second)
    second.reasons = second.reasons.concat("第二志愿按中/大书院得分排序");
  if (third)
    third.reasons = third.reasons.concat("第三志愿按中/大书院得分排序");
  return [second, third].filter(Boolean) as ScoredCollege[];
}

/**
 * 把打好分的书院排成 1–9 完整志愿：
 * - aim：第一志愿强制小书院（优先未避雷）。
 * - avoid：三所小书院整体压到第 7–9（按推荐指数降序），1–6 在非小书院里套用既有特规。
 * - indifferent：沿用既有志愿分配机制（第一志愿只保留一所小书院）。
 * - 避雷命中的书院整体压到末尾（不删除）。
 * - 逸夫（Shaw）尽量不排最后：仅当与倒数第二名同分才换位，否则垫底。
 */
function applyVolunteerOrdering(
  scored: ScoredCollege[],
  avoids: AvoidFactor[],
  pref: SmallCollegePreference,
): ScoredCollege[] {
  // B：小书院压到 7–9；1–6 在非小书院上递归套用 indifferent 流程。
  if (pref === "avoid") {
    const small = scored
      .filter((x) => SMALL_SET.has(x.id))
      .sort(baseComparator);
    const nonSmall = scored.filter((x) => !SMALL_SET.has(x.id));
    const ordered = applyVolunteerOrdering(nonSmall, avoids, "indifferent");
    small.forEach((x) =>
      x.reasons.push("已选「不想去小书院」，小书院排到第 7–9 志愿"),
    );
    ordered.push(...small);
    return ordered;
  }

  const blocked = scored
    .filter((x) => isBlockedByAvoids(x))
    .sort(baseComparator);
  const remaining = scored
    .filter((x) => !isBlockedByAvoids(x))
    .sort(baseComparator);
  const ordered: ScoredCollege[] = [];

  const firstChoice =
    pref === "aim"
      ? pickFirstChoiceAim(remaining, blocked)
      : pickFirstChoice(remaining);
  if (firstChoice) ordered.push(firstChoice);

  const nonSmallPool = remaining
    .filter((x) => !SMALL_SET.has(x.id))
    .sort(compareTopThreeCandidates);
  const secondThird = pickSecondThird(nonSmallPool);
  for (const picked of secondThird) {
    takeById(remaining, picked.id);
    ordered.push(picked);
  }

  remaining.sort(baseComparator);
  while (remaining.length > 0) ordered.push(remaining.shift()!);
  while (blocked.length > 0) ordered.push(blocked.shift()!);

  const last = ordered.length - 1;
  if (ordered.length && ordered[last].id === SHAW_ID) {
    for (let j = last - 1; j >= 0; j--) {
      if (ordered[j].score !== ordered[last].score) break;
      if (ordered[j].id !== SHAW_ID) {
        const temp = ordered[j];
        ordered[j] = ordered[last];
        ordered[last] = temp;
        ordered[j].reasons = ordered[j].reasons.concat(
          "同分时把 Shaw 往前挪，尽量不放最后",
        );
        ordered[last].reasons =
          ordered[last].reasons.concat("同分时尽量不把 Shaw 放最后");
        break;
      }
    }
  }

  return ordered;
}

/**
 * 校验三个看重因素：第 1 个必填；非空项互不重复；不允许跳位（第 2 为空则第 3 必为空）。
 */
export function validatePriorities(
  priorities: ReadonlyArray<ScoredFactor | "">,
): { ok: true } | { ok: false; message: string } {
  if (priorities.length !== 3) {
    return { ok: false, message: "请填写三个看重因素位" };
  }
  if (priorities[0] === "") {
    return { ok: false, message: "第一看重的点必须填写" };
  }
  // 不允许跳位：第 2 为空则第 3 必为空。
  if (priorities[1] === "" && priorities[2] !== "") {
    return {
      ok: false,
      message: "第二看重点留空时，第三看重点也必须留空（不允许跳位）",
    };
  }
  const filled = priorities.filter((p): p is ScoredFactor => p !== "");
  if (new Set(filled).size !== filled.length) {
    return { ok: false, message: "填写的看重因素不能重复，请选不同的" };
  }
  return { ok: true };
}

export function recommend(input: RecommendInput): ScoredCollege[] {
  const { majorGroup, priorities, avoids } = input;
  const pref = input.smallCollegePreference ?? "indifferent";
  const scored = COLLEGES.map((c) =>
    scoreCollege(c, majorGroup, priorities, avoids),
  );
  return applyVolunteerOrdering(scored, avoids, pref);
}
