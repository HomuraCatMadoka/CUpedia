// 「分院帽」(College Picker) 数据层。
//
// 忠实移植自 lorasbb/College-Hat（原为 Python 读 6 张 CSV 生成静态页）。
// 这里把 CSV 一次性转成类型化 TS 常量，弃用 Python 构建。名次表 / flags /
// 权重的数值一比一保留，改动会直接改变推荐结果——请勿「优化」。
// 术语见 docs/college-picker/CONTEXT.md。

/** 九所书院的稳定标识（同时用于同分时的 localeCompare tie-break）。 */
export type CollegeId =
  | "cc"
  | "na"
  | "uc"
  | "sc"
  | "mc"
  | "shho"
  | "cwc"
  | "wys"
  | "lws";

/** 专业大类（5 个粗分桶；医科 / 跨学科不在数据覆盖内，故不可选）。 */
export type MajorGroup =
  | "engineering"
  | "science"
  | "business"
  | "social_science"
  | "arts";

/** 看重因素（加分项）：依次加权 5 / 3 / 2。 */
export type ScoredFactor =
  | "Commute_Time"
  | "Accommodation_Environment"
  | "Hostel_Guarantee"
  | "Exchange_Opportunity";

/** 避雷因素：命中不删除，只把书院压到志愿末尾。 */
export type AvoidFactor =
  | "College_FYP"
  | "Religious_Element"
  | "Admission_Interview"
  | "Admission_Written_Test";

/** 其他看重因素（选填，勾选后给推荐指数加固定分，不参与名次加权）。 */
export type BonusFactor = "MTR_Distance" | "Par_Room";

export interface College {
  id: CollegeId;
  nameZh: string;
  nameEn: string;
  shortCode: string;
}

export const COLLEGES: readonly College[] = [
  {
    id: "cc",
    nameZh: "崇基学院",
    nameEn: "Chung Chi College",
    shortCode: "CC",
  },
  {
    id: "na",
    nameZh: "新亚书院",
    nameEn: "New Asia College",
    shortCode: "NA",
  },
  {
    id: "uc",
    nameZh: "联合书院",
    nameEn: "United College",
    shortCode: "UC",
  },
  {
    id: "sc",
    nameZh: "逸夫书院",
    nameEn: "Shaw College",
    shortCode: "SC",
  },
  {
    id: "mc",
    nameZh: "晨兴书院",
    nameEn: "Morningside College",
    shortCode: "MC",
  },
  {
    id: "shho",
    nameZh: "善衡书院",
    nameEn: "S. H. Ho College",
    shortCode: "SHHO",
  },
  {
    id: "cwc",
    nameZh: "敬文书院",
    nameEn: "C. W. Chu College",
    shortCode: "CWC",
  },
  {
    id: "wys",
    nameZh: "伍宜孙书院",
    nameEn: "Wu Yee Sun College",
    shortCode: "WYS",
  },
  {
    id: "lws",
    nameZh: "和声书院",
    nameEn: "Lee Woo Sing College",
    shortCode: "LWS",
  },
];

export interface MajorGroupOption {
  id: MajorGroup;
  nameZh: string;
  notes: string;
}

export const MAJOR_GROUPS: readonly MajorGroupOption[] = [
  { id: "engineering", nameZh: "工科", notes: "工程学院或主要在工程区上课" },
  { id: "science", nameZh: "理科", notes: "理学院或主要在理科区上课" },
  { id: "business", nameZh: "商科", notes: "商学院或主要在商学院周边上课" },
  { id: "social_science", nameZh: "社科", notes: "社会科学学院" },
  { id: "arts", nameZh: "文科", notes: "文学院" },
];

export interface FactorOption<T extends string> {
  id: T;
  nameZh: string;
}

/** 可选的看重因素，展示顺序即建议的第 1 / 2 / 3 志愿加权顺序。 */
export const SCORED_FACTORS: readonly FactorOption<ScoredFactor>[] = [
  { id: "Commute_Time", nameZh: "上课通勤" },
  { id: "Accommodation_Environment", nameZh: "住宿环境" },
  { id: "Hostel_Guarantee", nameZh: "保宿机会" },
];

/** 可勾选的避雷因素。 */
export const AVOID_FACTORS: readonly FactorOption<AvoidFactor>[] = [
  { id: "College_FYP", nameZh: "书院 FYP / 毕业要求" },
  { id: "Religious_Element", nameZh: "宗教元素" },
  { id: "Admission_Interview", nameZh: "入学面试" },
  { id: "Admission_Written_Test", nameZh: "入学笔试" },
];

/** 可勾选的其他看重因素（选填，给推荐指数加固定分）。 */
export const BONUS_FACTORS: readonly FactorOption<BonusFactor>[] = [
  { id: "MTR_Distance", nameZh: "离港铁距离" },
  { id: "Par_Room", nameZh: "大一能选舍友 par 房" },
];

/**
 * 勾选某其他因素时，给各书院推荐指数加的固定分。
 * prompt 里写作 ws / shaw，对应实际 id lws / sc。
 */
export const BONUS_VALUES: Record<
  BonusFactor,
  Partial<Record<CollegeId, number>>
> = {
  MTR_Distance: {
    cc: 5,
    shho: 4,
    mc: 4,
    uc: 3,
    na: 3,
    cwc: 2.5,
    lws: 2,
    wys: 2,
    sc: 1,
  },
  Par_Room: {
    cc: 5,
    shho: 5,
    mc: 5,
    uc: 0,
    na: 0,
    cwc: 0,
    lws: 0,
    wys: 5,
    sc: 0,
  },
};

/**
 * 名次表：key 为 `${因素}::${major_group | ALL}`，值把书院映射到 1–9 名次
 * （1 最好）。仅「上课通勤」按专业大类分开填；其余因素用 ALL。
 */
export const RANKINGS: Record<string, Partial<Record<CollegeId, number>>> = {
  "Commute_Time::engineering": {
    cc: 3,
    na: 5,
    uc: 4,
    sc: 7,
    mc: 2,
    shho: 1,
    cwc: 9,
    wys: 8,
    lws: 6,
  },
  "Commute_Time::science": {
    cc: 3,
    na: 4,
    uc: 5,
    sc: 8,
    mc: 2,
    shho: 1,
    cwc: 9,
    wys: 6,
    lws: 7,
  },
  "Commute_Time::business": {
    cc: 1,
    na: 6,
    uc: 5,
    sc: 9,
    mc: 3,
    shho: 2,
    cwc: 4,
    wys: 8,
    lws: 7,
  },
  "Commute_Time::social_science": {
    cc: 1,
    na: 5,
    uc: 2,
    sc: 9,
    mc: 3,
    shho: 4,
    cwc: 8,
    wys: 6,
    lws: 7,
  },
  "Commute_Time::arts": {
    cc: 3,
    na: 1,
    uc: 2,
    sc: 9,
    mc: 7,
    shho: 6,
    cwc: 8,
    wys: 5,
    lws: 4,
  },
  "Accommodation_Environment::ALL": {
    cc: 7,
    na: 8,
    uc: 6,
    sc: 9,
    mc: 1,
    shho: 4,
    cwc: 2,
    wys: 5,
    lws: 3,
  },
  "Hostel_Guarantee::ALL": {
    cc: 6,
    na: 7,
    uc: 5,
    sc: 4,
    mc: 2,
    shho: 1,
    cwc: 3,
    wys: 8,
    lws: 9,
  },
  "Exchange_Opportunity::ALL": {
    cc: 1,
    na: 2,
    uc: 3,
    sc: 4,
    mc: 5,
    shho: 6,
    cwc: 7,
    wys: 8,
    lws: 9,
  },
};

/** 每所书院的硬筛 flag（Y = 命中该特征）。 */
export const FLAGS: Record<CollegeId, Record<AvoidFactor, "Y" | "N">> = {
  cc: {
    College_FYP: "Y",
    Religious_Element: "Y",
    Admission_Interview: "N",
    Admission_Written_Test: "N",
  },
  na: {
    College_FYP: "N",
    Religious_Element: "N",
    Admission_Interview: "N",
    Admission_Written_Test: "N",
  },
  uc: {
    College_FYP: "Y",
    Religious_Element: "N",
    Admission_Interview: "N",
    Admission_Written_Test: "N",
  },
  sc: {
    College_FYP: "N",
    Religious_Element: "N",
    Admission_Interview: "N",
    Admission_Written_Test: "N",
  },
  mc: {
    College_FYP: "N",
    Religious_Element: "N",
    Admission_Interview: "Y",
    Admission_Written_Test: "Y",
  },
  shho: {
    College_FYP: "N",
    Religious_Element: "N",
    Admission_Interview: "Y",
    Admission_Written_Test: "Y",
  },
  cwc: {
    College_FYP: "Y",
    Religious_Element: "N",
    Admission_Interview: "Y",
    Admission_Written_Test: "Y",
  },
  wys: {
    College_FYP: "Y",
    Religious_Element: "N",
    Admission_Interview: "Y",
    Admission_Written_Test: "N",
  },
  lws: {
    College_FYP: "N",
    Religious_Element: "N",
    Admission_Interview: "N",
    Admission_Written_Test: "Y",
  },
};

/** 加权：第 1/2/3 志愿因素权重，以及每命中一项避雷的惩罚分。 */
export const WEIGHTS = {
  firstPriority: 5,
  secondPriority: 3,
  thirdPriority: 2,
  hardFilterPenalty: 50,
} as const;

/** 书院规模分组（志愿排序特规用）。 */
export const SMALL_COLLEGE_IDS: readonly CollegeId[] = ["mc", "shho", "cwc"];
export const MIDDLE_COLLEGE_IDS: readonly CollegeId[] = ["wys", "lws"];
export const LARGE_COLLEGE_IDS: readonly CollegeId[] = ["cc", "na", "uc", "sc"];

/** 逸夫书院（Shaw）——「尽量不排最后」弱规则的特例主体。 */
export const SHAW_ID: CollegeId = "sc";

/** 避雷命中时给用户看的原因文案（顺序固定，忠实原实现）。 */
export const AVOID_REASON_LABEL: Record<AvoidFactor, string> = {
  College_FYP: "命中：不要书院 FYP",
  Religious_Element: "命中：不要宗教元素",
  Admission_Interview: "命中：不要入学面试",
  Admission_Written_Test: "命中：不要入学笔试",
};
