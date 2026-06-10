// Mock course dataset for the CUpedia course-review feature.
//
// This is the ONLY place course facts live today. When a real backend
// (or scraper) becomes available, replace the consumers of `MOCK_COURSES`
// in `course-actions.ts` — the `Course` shape is the contract.
//
// Fields (a)(b)(d) — code / title / credits — are hand-curated from real
// CUHK offerings. Field (c) — `rating` (推荐指数) — is mock data: a random
// 0–10 value with one decimal, baked in so it stays stable across renders.

export type Faculty = "ERG" | "SCI" | "ARTS" | "BA" | "Others";

export const FACULTY_LABELS: Record<Faculty, string> = {
  ERG: "工程学院 (ERG)",
  SCI: "理学院 (SCI)",
  ARTS: "文学院 (ARTS)",
  BA: "商学院 (BA)",
  Others: "其他 (Others)",
};

export const FACULTY_ORDER: Faculty[] = ["ERG", "SCI", "ARTS", "BA", "Others"];

export type Course = {
  /** Course code, four letters + four digits, no space (e.g. "CSCI3150"). */
  code: string;
  /** Subject prefix shown as an eyebrow label (e.g. "CSCI"). */
  subject: string;
  /** Full course title. */
  title: string;
  /** Credit units. */
  credits: number;
  /** Owning faculty bucket. */
  faculty: Faculty;
  /** 推荐指数 — mock data, 0–10 with one decimal. */
  rating: number;
  /** Short description shown on the detail page. */
  description: string;
};

/** Format a stored code ("CSCI3150") for display ("CSCI 3150"). */
export function formatCourseCode(code: string): string {
  const m = code.match(/^([A-Za-z]{4})(\d{4})$/);
  return m ? `${m[1]} ${m[2]}` : code;
}

export const MOCK_COURSES: Course[] = [
  // ── 工程学院 (ERG) ──
  {
    code: "CSCI1130",
    subject: "CSCI",
    title: "Introduction to Computing Using Java",
    credits: 3,
    faculty: "ERG",
    rating: 8.3,
    description: "面向初学者的 Java 程序设计入门，涵盖基本语法、面向对象与简单算法。",
  },
  {
    code: "CSCI2100",
    subject: "CSCI",
    title: "Data Structures",
    credits: 3,
    faculty: "ERG",
    rating: 9.6,
    description: "数组、链表、树、图、哈希表等核心数据结构及其复杂度分析。",
  },
  {
    code: "CSCI3100",
    subject: "CSCI",
    title: "Software Engineering",
    credits: 3,
    faculty: "ERG",
    rating: 8.1,
    description: "软件开发生命周期、需求分析、设计模式、测试与团队协作实践。",
  },
  {
    code: "CSCI3150",
    subject: "CSCI",
    title: "Introduction to Operating Systems",
    credits: 3,
    faculty: "ERG",
    rating: 9.4,
    description: "进程与线程、内存管理、文件系统与并发控制等操作系统基础。",
  },
  {
    code: "CENG3420",
    subject: "CENG",
    title: "Computer Organization and Design",
    credits: 3,
    faculty: "ERG",
    rating: 7.5,
    description: "指令集体系结构、流水线、存储层级与处理器设计原理。",
  },
  {
    code: "AIST2010",
    subject: "AIST",
    title: "Introduction to Artificial Intelligence and Machine Learning",
    credits: 3,
    faculty: "ERG",
    rating: 8.8,
    description: "搜索、知识表示、监督学习与神经网络等人工智能核心概念。",
  },
  {
    code: "IERG2080",
    subject: "IERG",
    title: "Building Blocks of Modern Computing Systems",
    credits: 3,
    faculty: "ERG",
    rating: 6.9,
    description: "现代计算系统的软硬件基础，面向信息工程方向。",
  },

  // ── 理学院 (SCI) ──
  {
    code: "MATH1010",
    subject: "MATH",
    title: "University Mathematics",
    credits: 3,
    faculty: "SCI",
    rating: 6.2,
    description: "微积分基础：极限、导数、积分及其应用。",
  },
  {
    code: "MATH1510",
    subject: "MATH",
    title: "Calculus for Engineers",
    credits: 3,
    faculty: "SCI",
    rating: 7.2,
    description: "面向工程学生的微积分，强调计算技巧与工程应用。",
  },
  {
    code: "MATH2010",
    subject: "MATH",
    title: "Advanced Calculus I",
    credits: 3,
    faculty: "SCI",
    rating: 5.8,
    description: "多元微积分：偏导数、多重积分与向量分析。",
  },
  {
    code: "PHYS1110",
    subject: "PHYS",
    title: "Engineering Physics: Mechanics",
    credits: 3,
    faculty: "SCI",
    rating: 6.7,
    description: "经典力学：运动学、牛顿定律、能量与动量守恒。",
  },
  {
    code: "STAT1011",
    subject: "STAT",
    title: "Introduction to Statistics",
    credits: 3,
    faculty: "SCI",
    rating: 7.9,
    description: "描述统计、概率分布、假设检验与回归入门。",
  },
  {
    code: "BIOL1110",
    subject: "BIOL",
    title: "Introduction to Cell and Molecular Biology",
    credits: 3,
    faculty: "SCI",
    rating: 7.1,
    description: "细胞结构、分子机制与遗传学基础。",
  },
  {
    code: "CHEM1070",
    subject: "CHEM",
    title: "Foundations of Modern Chemistry",
    credits: 3,
    faculty: "SCI",
    rating: 6.4,
    description: "原子结构、化学键、热力学与反应动力学基础。",
  },

  // ── 文学院 (ARTS) ──
  {
    code: "PHIL1110",
    subject: "PHIL",
    title: "Introduction to Logic",
    credits: 3,
    faculty: "ARTS",
    rating: 8.5,
    description: "命题逻辑、谓词逻辑与有效论证的形式化分析。",
  },
  {
    code: "LING1000",
    subject: "LING",
    title: "Introduction to Linguistics",
    credits: 3,
    faculty: "ARTS",
    rating: 8.0,
    description: "语音、语法、语义与语言演变的科学研究入门。",
  },
  {
    code: "HIST1010",
    subject: "HIST",
    title: "In the Making of the Modern World",
    credits: 3,
    faculty: "ARTS",
    rating: 7.3,
    description: "近代世界形成的关键历史进程与跨文化交流。",
  },
  {
    code: "MUSC1111",
    subject: "MUSC",
    title: "Introduction to Music Studies",
    credits: 3,
    faculty: "ARTS",
    rating: 8.7,
    description: "音乐元素、风格与历史脉络的赏析与分析。",
  },
  {
    code: "FAAS1120",
    subject: "FAAS",
    title: "Introduction to Visual Arts",
    credits: 3,
    faculty: "ARTS",
    rating: 9.1,
    description: "视觉艺术的媒介、形式与历史，结合作品赏析。",
  },
  {
    code: "TRAN1000",
    subject: "TRAN",
    title: "Introduction to Translation",
    credits: 3,
    faculty: "ARTS",
    rating: 7.6,
    description: "中英翻译的基本原则、技巧与跨文化考量。",
  },

  // ── 商学院 (BA) ──
  {
    code: "ACCT1111",
    subject: "ACCT",
    title: "Introductory Financial Accounting",
    credits: 3,
    faculty: "BA",
    rating: 6.8,
    description: "财务报表、复式记账与会计循环基础。",
  },
  {
    code: "MKTG2310",
    subject: "MKTG",
    title: "Marketing Management",
    credits: 3,
    faculty: "BA",
    rating: 8.2,
    description: "市场细分、定位、4P 组合与营销策略制定。",
  },
  {
    code: "FINA2010",
    subject: "FINA",
    title: "Financial Management",
    credits: 3,
    faculty: "BA",
    rating: 7.0,
    description: "时间价值、风险与回报、资本预算与融资决策。",
  },
  {
    code: "MGNT2110",
    subject: "MGNT",
    title: "Organizational Behaviour",
    credits: 3,
    faculty: "BA",
    rating: 8.4,
    description: "个体、群体与组织层面的行为与管理理论。",
  },
  {
    code: "DSME2011",
    subject: "DSME",
    title: "Managerial Economics",
    credits: 3,
    faculty: "BA",
    rating: 6.5,
    description: "供需、成本、市场结构与管理决策中的经济分析。",
  },
  {
    code: "DSME1030",
    subject: "DSME",
    title: "Business Information Systems",
    credits: 2,
    faculty: "BA",
    rating: 7.7,
    description: "商业信息系统、数据库与数字化运营基础。",
  },

  // ── 其他 (Others) ──
  {
    code: "UGFN1000",
    subject: "UGFN",
    title: "In Dialogue with Nature",
    credits: 3,
    faculty: "Others",
    rating: 7.4,
    description: "通识基础课程：研读自然科学经典文本与思想。",
  },
  {
    code: "UGFH1000",
    subject: "UGFH",
    title: "In Dialogue with Humanity",
    credits: 3,
    faculty: "Others",
    rating: 7.8,
    description: "通识基础课程：研读人文经典，探讨人类核心议题。",
  },
  {
    code: "UGEB2202",
    subject: "UGEB",
    title: "The World of Probability and Statistics",
    credits: 2,
    faculty: "Others",
    rating: 6.6,
    description: "通识：以生活实例理解概率与统计思维。",
  },
  {
    code: "PHED1031",
    subject: "PHED",
    title: "Badminton",
    credits: 1,
    faculty: "Others",
    rating: 9.3,
    description: "羽毛球基本技术、规则与体能训练。",
  },
  {
    code: "ELTU1001",
    subject: "ELTU",
    title: "Foundation English for University Studies",
    credits: 2,
    faculty: "Others",
    rating: 5.5,
    description: "大学学术英语的听说读写基础训练。",
  },
  {
    code: "CHLT1100",
    subject: "CHLT",
    title: "University Chinese: Practical Writing",
    credits: 1,
    faculty: "Others",
    rating: 6.0,
    description: "大学中文实用写作与表达训练。",
  },
  {
    code: "GESC1000",
    subject: "GESC",
    title: "College Foundations Seminar (Integrated)",
    credits: 6,
    faculty: "Others",
    rating: 8.9,
    description: "书院全人发展整合课程，跨学期高学分项目。",
  },
];
