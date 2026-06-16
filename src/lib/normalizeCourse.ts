// 课程归一化（#161）：把官方目录抓取的原始课程对象规整成稳定的 Course。
// 纯模块，无 IO。来源裁定见 ADR 0005「决议（#157）」。

export type RawCourse = {
  subject?: string;
  // 课号可能是 "1130"（纯数字）或 "CSCI1130"（含前缀），也可能带列表页残留括号
  code?: string;
  courseCode?: string;
  title?: string;
  units?: string | number;
  credits?: string | number;
  description?: string;
  requirements?: string;
  requirementsRaw?: string;
  // career 用于本科过滤："Undergraduate" / "Postgraduate" / "Research" …
  career?: string;
  // 开课学期/季节提示，可为数组（term 名）或单串
  terms?: string[] | string;
};

export type Course = {
  code: string; // 稳定锚点，全大写无空格，如 "CSCI1130"
  subject: string;
  title: string;
  units: number;
  description: string;
  terms: string[]; // 季节码，"T1" = 秋/上，"T2" = 春/下（忽略暑期与学年）
  requirementsRaw: string;
};

const UNDERGRAD = /undergrad/i;
const SUMMER = /summer/i;
const TERM1 = /\b(term\s*1|first\s*term|fall|autumn)\b/i;
const TERM2 = /\b(term\s*2|second\s*term|spring)\b/i;

// 列表页残留：标题尾部的 "** available as of …" 备注、首尾占位括号
function cleanText(s: string): string {
  return s.replace(/\s*\*\*[\s\S]*$/, "").trim();
}

// 课号 → 全大写无空格，必要时补 subject 前缀；剥离占位括号
function normalizeCode(rawCode: string, subject: string): string {
  const code = rawCode.replace(/[()\s]/g, "").toUpperCase();
  if (/^[A-Z]/.test(code)) return code; // 已含 subject 前缀
  return `${subject.toUpperCase()}${code}`;
}

// term 名/季节提示 → 去重季节码；暑期与学年一概忽略
function normalizeTerms(raw: RawCourse["terms"]): string[] {
  const items = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const seasons = new Set<string>();
  for (const item of items) {
    if (SUMMER.test(item)) continue;
    if (TERM1.test(item)) seasons.add("T1");
    if (TERM2.test(item)) seasons.add("T2");
  }
  return [...seasons];
}

function toUnits(raw: string | number | undefined): number {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const n = parseFloat(String(raw ?? "").trim());
  return Number.isFinite(n) ? n : 0;
}

// 返回 null = 非本科，过滤掉。career 缺省视为本科（官方目录侧只抓 UG）。
export function normalizeCourse(raw: RawCourse): Course | null {
  if (raw.career && !UNDERGRAD.test(raw.career)) return null;

  const subject = (raw.subject ?? "").trim().toUpperCase();
  const rawCode = (raw.code ?? raw.courseCode ?? "").trim();
  if (!rawCode) return null;

  return {
    code: normalizeCode(rawCode, subject),
    subject,
    title: cleanText(raw.title ?? ""),
    units: toUnits(raw.units ?? raw.credits),
    description: (raw.description ?? "").trim(),
    terms: normalizeTerms(raw.terms),
    requirementsRaw: (raw.requirementsRaw ?? raw.requirements ?? "").trim(),
  };
}
