// 「分院帽」志愿推荐：纯函数，忠实移植自 lorasbb/College-Hat 的客户端 JS 算法。
// 行为一比一保留（含既定「怪规则」，见 recommend() 内注释与单测）。

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

export interface RecommendInput {
  majorGroup: MajorGroup;
  /** 三个看重因素，依次对应第 1 / 2 / 3 志愿加权（5 / 3 / 2）。 */
  priorities: [ScoredFactor, ScoredFactor, ScoredFactor];
  avoids: AvoidFactor[];
}

export interface ScoredCollege extends College {
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

/** 只有「上课通勤」按专业大类查名次，其余用 ALL。 */
function scoreCollege(
  college: College,
  group: MajorGroup,
  [p1, p2, p3]: [ScoredFactor, ScoredFactor, ScoredFactor],
  avoids: AvoidFactor[],
): ScoredCollege {
  const g1 = p1 === "Commute_Time" ? group : "ALL";
  const g2 = p2 === "Commute_Time" ? group : "ALL";
  const g3 = p3 === "Commute_Time" ? group : "ALL";
  const ranks = {
    p1: getRank(p1, g1, college.id),
    p2: getRank(p2, g2, college.id),
    p3: getRank(p3, g3, college.id),
  };
  let score =
    ranks.p1 * WEIGHTS.firstPriority +
    ranks.p2 * WEIGHTS.secondPriority +
    ranks.p3 * WEIGHTS.thirdPriority;

  const avoidHits = getAvoidHits(college.id, avoids);
  if (avoidHits.length) score += WEIGHTS.hardFilterPenalty * avoidHits.length;

  // 原因文案按 AVOID_FACTORS 的规范序输出（忠实原实现的四条定序 if），
  // 不跟随用户勾选顺序——勿改回 avoidHits.map。
  const reasons = AVOID_FACTORS.filter((f) => avoidHits.includes(f.id)).map(
    (f) => AVOID_REASON_LABEL[f.id],
  );

  return { ...college, score, ranks, reasons, avoidHits };
}

/** 主排序：分数升序（越低越好），同分按书院 id 稳定。 */
function baseComparator(a: ScoredCollege, b: ScoredCollege): number {
  if (a.score !== b.score) return a.score - b.score;
  return a.id.localeCompare(b.id);
}

function isBlockedByAvoids(college: ScoredCollege): boolean {
  return college.avoidHits.length > 0;
}

/** 勾选了「不要面试 / 不要笔试」时，第一志愿不优先放小书院。 */
function shouldDeprioritizeSmallColleges(avoids: AvoidFactor[]): boolean {
  return (
    avoids.includes("Admission_Interview") ||
    avoids.includes("Admission_Written_Test")
  );
}

function isMiddleLargePair(a: ScoredCollege, b: ScoredCollege): boolean {
  const aMiddle = MIDDLE_SET.has(a.id);
  const bMiddle = MIDDLE_SET.has(b.id);
  const aLarge = LARGE_SET.has(a.id);
  const bLarge = LARGE_SET.has(b.id);
  return (aMiddle && bLarge) || (aLarge && bMiddle);
}

/** 逐个志愿名次比较（p1 → p2 → p3 → id）。 */
function compareByPriorityRanks(a: ScoredCollege, b: ScoredCollege): number {
  if ((a.ranks.p1 || 9) !== (b.ranks.p1 || 9))
    return (a.ranks.p1 || 9) - (b.ranks.p1 || 9);
  if ((a.ranks.p2 || 9) !== (b.ranks.p2 || 9))
    return (a.ranks.p2 || 9) - (b.ranks.p2 || 9);
  if ((a.ranks.p3 || 9) !== (b.ranks.p3 || 9))
    return (a.ranks.p3 || 9) - (b.ranks.p3 || 9);
  return a.id.localeCompare(b.id);
}

/**
 * 前三志愿候选比较：中/大书院差 1 分时按看重因素定序；差 ≤2 分时先中后大；
 * 否则回到分数。刻意保留原实现（非严格弱序，当前数据实测 0 触发）。
 */
function compareTopThreeCandidates(a: ScoredCollege, b: ScoredCollege): number {
  const scoreGap = Math.abs(a.score - b.score);

  if (isMiddleLargePair(a, b) && scoreGap === 1) {
    const priorityDiff = compareByPriorityRanks(a, b);
    if (priorityDiff !== 0) return priorityDiff;
  }

  if (a.score !== b.score) return a.score - b.score;

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

/** 得分最低（最好）的未被避雷的小书院。 */
function pickTopSmall(scored: ScoredCollege[]): ScoredCollege | null {
  return (
    scored
      .filter((x) => SMALL_SET.has(x.id) && !isBlockedByAvoids(x))
      .sort(baseComparator)[0] || null
  );
}

/** 决定第一志愿；会从 remaining 中原地取走选中的书院。 */
function pickFirstChoice(
  remaining: ScoredCollege[],
  avoids: AvoidFactor[],
): ScoredCollege | null {
  if (shouldDeprioritizeSmallColleges(avoids)) {
    const nonSmallSorted = remaining
      .filter((x) => !SMALL_SET.has(x.id))
      .sort(compareTopThreeCandidates);
    const top = nonSmallSorted[0] || null;
    if (top) {
      const picked = takeById(remaining, top.id)!;
      picked.reasons = picked.reasons.concat(
        "已勾选不要面试/笔试，第一志愿不优先放小书院",
      );
      if (
        nonSmallSorted.length >= 2 &&
        isMiddleLargePair(nonSmallSorted[0], nonSmallSorted[1]) &&
        Math.abs(nonSmallSorted[0].score - nonSmallSorted[1].score) === 1
      ) {
        picked.reasons = picked.reasons.concat(
          "中/大书院只差 1 分时，按你选的因素顺序决定先后",
        );
      }
      return picked;
    }
  }

  const topSmall = pickTopSmall(remaining);
  if (topSmall) {
    const picked = takeById(remaining, topSmall.id)!;
    picked.reasons = picked.reasons.concat("第一志愿只保留得分最低的小书院");
    return picked;
  }

  if (remaining.length) return remaining.shift()!;
  return null;
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
 * - 避雷命中的书院整体压到末尾（不删除）。
 * - 第一志愿最多保留一所小书院；第二、三志愿恒从中/大书院里选。
 * - 逸夫（Shaw）尽量不排最后：仅当与倒数第二名同分才换位，否则垫底。
 */
function applyVolunteerOrdering(
  scored: ScoredCollege[],
  avoids: AvoidFactor[],
): ScoredCollege[] {
  const blocked = scored
    .filter((x) => isBlockedByAvoids(x))
    .sort(baseComparator);
  const remaining = scored
    .filter((x) => !isBlockedByAvoids(x))
    .sort(baseComparator);
  const ordered: ScoredCollege[] = [];

  const firstChoice = pickFirstChoice(remaining, avoids);
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
 * 校验三个看重因素：必须全部选满且互不相同（评分公式依赖三个不同权重位）。
 * 供页面在调用 recommend() 前拦住无效输入、给用户提示。
 */
export function validatePriorities(
  priorities: ReadonlyArray<ScoredFactor | "">,
): { ok: true } | { ok: false; message: string } {
  if (priorities.length !== 3 || priorities.some((p) => p === "")) {
    return { ok: false, message: "请把三个看重因素都选上" };
  }
  if (new Set(priorities).size !== 3) {
    return { ok: false, message: "三个看重因素不能重复，请选三个不同的" };
  }
  return { ok: true };
}

export function recommend(input: RecommendInput): ScoredCollege[] {
  const { majorGroup, priorities, avoids } = input;
  const scored = COLLEGES.map((c) =>
    scoreCollege(c, majorGroup, priorities, avoids),
  );
  return applyVolunteerOrdering(scored, avoids);
}
