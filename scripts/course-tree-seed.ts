// 课程技能树 S3(#163)开发 / CI 种子:最小、确定性的课程 + 双主修骨架。
// 供 localhost 手测与 e2e(全量 4828 门只在 prod,本地/CI 不灌)。真实 CUHK 课号,
// 固定 uuid + onConflict → 幂等。数据形态刻意覆盖 required / one-of / basket 三类目,
// 且 basket 里放 1 个 courses 表缺失的成员(GESC1000)以走通「占位灰显」路径。

export type SeedCourse = {
  code: string;
  subject: string;
  title: string;
  units: string; // numeric 列传字符串
  terms: string[];
  description: string;
};

export type SeedMember = { code: string; missing?: boolean };

export type SeedCategory = {
  id: string;
  name: string;
  kind: "required" | "one-of" | "basket";
  unitsRequired: string | null;
  pickN: number | null;
  members: SeedMember[];
};

export type SeedMajor = {
  id: string;
  name: string;
  faculty: string | null;
  totalUnits: string | null;
  normativeYears: number;
  handbookYear: string;
  categories: SeedCategory[];
};

export const COURSE_SEED_MAJOR_IDS = {
  cs: "c0000000-0000-4000-8000-000000000001",
  math: "c0000000-0000-4000-8000-000000000002",
} as const;

export const SEED_COURSES: SeedCourse[] = [
  {
    code: "CSCI1130",
    subject: "CSCI",
    title: "Introduction to Computing Using Java",
    units: "3",
    terms: ["T1"],
    description: "以 Java 入门程序设计:变量、控制流、对象、递归与基础算法。",
  },
  {
    code: "CSCI1120",
    subject: "CSCI",
    title: "Introduction to Computing Using C++",
    units: "3",
    terms: ["T2"],
    description: "以 C++ 入门程序设计:指针、内存、结构与面向对象初步。",
  },
  {
    code: "CSCI2100",
    subject: "CSCI",
    title: "Data Structures",
    units: "3",
    terms: ["T1"],
    description: "线性表、树、图、哈希与排序检索的基础数据结构与复杂度分析。",
  },
  {
    code: "CSCI2720",
    subject: "CSCI",
    title: "Building Web Applications",
    units: "3",
    terms: ["T2"],
    description: "前后端 Web 应用构建:HTTP、数据库、REST 与前端交互。",
  },
  {
    code: "CSCI3130",
    subject: "CSCI",
    title: "Formal Languages and Automata Theory",
    units: "3",
    terms: ["T1"],
    description: "正则语言、上下文无关文法、自动机与可计算性初步。",
  },
  {
    code: "CSCI3230",
    subject: "CSCI",
    title: "Fundamentals of Artificial Intelligence",
    units: "3",
    terms: ["T2"],
    description: "搜索、知识表示、机器学习与神经网络基础。",
  },
  {
    code: "CSCI4180",
    subject: "CSCI",
    title: "Introduction to Cloud Computing and Storage",
    units: "3",
    terms: ["T1"],
    description: "分布式存储、MapReduce、虚拟化与云服务架构。",
  },
  {
    code: "MATH1510",
    subject: "MATH",
    title: "Calculus for Engineers",
    units: "3",
    terms: ["T1"],
    description: "单变量微积分:极限、导数、积分及其工程应用。",
  },
  {
    code: "MATH1030",
    subject: "MATH",
    title: "Linear Algebra I",
    units: "3",
    terms: ["T2"],
    description: "向量空间、矩阵、线性方程组、行列式与特征值。",
  },
  {
    code: "STAT2001",
    subject: "STAT",
    title: "Basic Concepts in Statistics and Probability I",
    units: "3",
    terms: ["T1"],
    description: "概率、随机变量、常见分布与统计推断入门。",
  },
  {
    code: "ENGG2020",
    subject: "ENGG",
    title: "Digital Logic and Systems",
    units: "3",
    terms: ["T2"],
    description: "布尔代数、组合与时序逻辑、有限状态机与数字系统设计。",
  },
];

export const SEED_MAJORS: SeedMajor[] = [
  {
    id: COURSE_SEED_MAJOR_IDS.cs,
    name: "Computer Science (Seed)",
    faculty: "Engineering",
    totalUnits: "99",
    normativeYears: 4,
    handbookYear: "2023-24",
    categories: [
      {
        id: "ca000000-0000-4000-8000-000000000011",
        name: "Required Core",
        kind: "required",
        unitsRequired: "12",
        pickN: null,
        members: [
          { code: "CSCI1130" },
          { code: "CSCI1120" },
          { code: "CSCI2100" },
          { code: "ENGG2020" },
        ],
      },
      {
        id: "ca000000-0000-4000-8000-000000000012",
        name: "Mathematics Requirement",
        kind: "one-of",
        unitsRequired: null,
        pickN: 1,
        members: [{ code: "MATH1510" }, { code: "MATH1030" }],
      },
      {
        id: "ca000000-0000-4000-8000-000000000013",
        name: "Advanced Electives",
        kind: "basket",
        unitsRequired: "9",
        pickN: null,
        members: [
          { code: "CSCI3130" },
          { code: "CSCI3230" },
          { code: "CSCI4180" },
          { code: "STAT2001" },
          // courses 表里没有这门 → 占位灰显,覆盖 missing 路径
          { code: "GESC1000", missing: true },
        ],
      },
    ],
  },
  {
    id: COURSE_SEED_MAJOR_IDS.math,
    name: "Mathematics (Seed)",
    faculty: "Science",
    totalUnits: "90",
    normativeYears: 4,
    handbookYear: "2023-24",
    categories: [
      {
        id: "ca000000-0000-4000-8000-000000000021",
        name: "Core Analysis & Algebra",
        kind: "required",
        unitsRequired: "6",
        pickN: null,
        members: [{ code: "MATH1510" }, { code: "MATH1030" }],
      },
      {
        id: "ca000000-0000-4000-8000-000000000022",
        name: "Applied Electives",
        kind: "basket",
        unitsRequired: "6",
        pickN: null,
        members: [{ code: "STAT2001" }, { code: "CSCI2100" }],
      },
    ],
  },
];
