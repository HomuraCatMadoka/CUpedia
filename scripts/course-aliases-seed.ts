// courseAliases 种子：版本对齐的「旧课号 → 新课号」映射（见 docs/adr/0005「版本对齐」）。
// handbook 主修骨架按入学年份编写，成员课号可能已改名；ingest-skeleton 摄取时先过此表重映射，
// 未命中再按 ADR 决议标 missing=true（占位 + 黄色告警，绝不静默隐藏）。
//
// 来源核验（非猜测）：每对都对照自爬官方目录 courses.json 实测——旧 subject 在本科集内 0 门课
// （即已整体改名），保号新码确实存在于本科集，且旧码在目录 requirements 原文中被引用过。
// 覆盖 5 组已证的整段 subject 改名：DSME→DOTE、ENER→EEEN、CSC→CSCI、CCAN→CLCC、CPTH→CLCP。
// 非保号改名（如 LEDC→CLED 换号）与目标歧义者（ESGS→ESSC/EESC）暂不纳入，留待 #164/#165 细化。

export type CourseAliasSeed = { oldCode: string; newCode: string };

export const COURSE_ALIASES: CourseAliasSeed[] = [
  // CCAN → CLCC（中国语言文学·当代）
  { oldCode: "CCAN1113", newCode: "CLCC1113" },
  { oldCode: "CCAN1133", newCode: "CLCC1133" },
  { oldCode: "CCAN1703", newCode: "CLCC1703" },
  { oldCode: "CCAN2213", newCode: "CLCC2213" },
  { oldCode: "CCAN2223", newCode: "CLCC2223" },
  { oldCode: "CCAN2233", newCode: "CLCC2233" },
  { oldCode: "CCAN2243", newCode: "CLCC2243" },
  { oldCode: "CCAN2703", newCode: "CLCC2703" },
  { oldCode: "CCAN3313", newCode: "CLCC3313" },
  { oldCode: "CCAN3323", newCode: "CLCC3323" },
  { oldCode: "CCAN3333", newCode: "CLCC3333" },
  { oldCode: "CCAN3343", newCode: "CLCC3343" },
  { oldCode: "CCAN3703", newCode: "CLCC3703" },
  { oldCode: "CCAN4413", newCode: "CLCC4413" },
  // CPTH → CLCP（中国语言文学·古典）
  { oldCode: "CPTH1113", newCode: "CLCP1113" },
  { oldCode: "CPTH1123", newCode: "CLCP1123" },
  { oldCode: "CPTH1133", newCode: "CLCP1133" },
  { oldCode: "CPTH1153", newCode: "CLCP1153" },
  { oldCode: "CPTH2213", newCode: "CLCP2213" },
  { oldCode: "CPTH2223", newCode: "CLCP2223" },
  { oldCode: "CPTH2233", newCode: "CLCP2233" },
  { oldCode: "CPTH2243", newCode: "CLCP2243" },
  { oldCode: "CPTH2253", newCode: "CLCP2253" },
  { oldCode: "CPTH2703", newCode: "CLCP2703" },
  { oldCode: "CPTH3313", newCode: "CLCP3313" },
  { oldCode: "CPTH3323", newCode: "CLCP3323" },
  { oldCode: "CPTH3333", newCode: "CLCP3333" },
  { oldCode: "CPTH3353", newCode: "CLCP3353" },
  { oldCode: "CPTH3703", newCode: "CLCP3703" },
  { oldCode: "CPTH4413", newCode: "CLCP4413" },
  { oldCode: "CPTH4433", newCode: "CLCP4433" },
  { oldCode: "CPTH4443", newCode: "CLCP4443" },
  { oldCode: "CPTH4453", newCode: "CLCP4453" },
  { oldCode: "CPTH4533", newCode: "CLCP4533" },
  { oldCode: "CPTH4773", newCode: "CLCP4773" },
  // CSC → CSCI（计算机科学）
  { oldCode: "CSC1510", newCode: "CSCI1510" },
  { oldCode: "CSC2520", newCode: "CSCI2520" },
  // DSME → DOTE（决策科学与企业经济）
  { oldCode: "DSME1030", newCode: "DOTE1030" },
  { oldCode: "DSME1040", newCode: "DOTE1040" },
  { oldCode: "DSME2011", newCode: "DOTE2011" },
  { oldCode: "DSME2021", newCode: "DOTE2021" },
  { oldCode: "DSME2040", newCode: "DOTE2040" },
  { oldCode: "DSME2051", newCode: "DOTE2051" },
  // ENER → EEEN（能源工程）
  { oldCode: "ENER2020", newCode: "EEEN2020" },
  { oldCode: "ENER3030", newCode: "EEEN3030" },
  { oldCode: "ENER4010", newCode: "EEEN4010" },
  { oldCode: "ENER4050", newCode: "EEEN4050" },
  { oldCode: "ENER4060", newCode: "EEEN4060" },
];
