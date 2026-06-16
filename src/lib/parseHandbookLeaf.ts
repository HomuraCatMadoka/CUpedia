// Handbook 叶子页解析（#162）：把 CUHK handbook 的主修/辅修学习计划页（view_document.aspx
// 的 Word 导出 HTML）解析成 MajorSkeleton。来源裁定见 ADR 0005「决议（#157）」。
//
// 这些页是 Word-to-HTML：内联标记极脏、课号被插空格（"EP IN2010"）、电脑无法靠 DOM 选择器稳定
// 取值。故按两条线解析：narrative 纯文本给类目形态/学分/选 N；底部 Course List 表给权威名册。
// 纯模块，无 IO（HTML 由调用方读入）。

export type HandbookCourse = { code: string; title: string; units: number };

export type CategoryKind = "required" | "one-of" | "basket";

export type HandbookCategory = {
  name: string;
  kind: CategoryKind;
  unitsRequired: number | null;
  pickN: number | null;
  members: string[]; // 已展开的全课号
};

export type MajorSkeleton = {
  title: string;
  programmeKind: "major" | "minor" | null;
  totalUnits: number | null;
  categories: HandbookCategory[];
  courseList: HandbookCourse[];
};

const WORD_NUM: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

// HTML → 归一化纯文本：去标签、解实体、压空白。
function stripTags(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 课号串 → 全课号数组。裸数字继承前一个 subject（"EPIN1010, 1020" → 两门 EPIN）；
// 课号内被插的空格剥掉（"EP IN2010" → "EPIN2010"）；占位/待定（"*LAWS2XXX"）与散文跳过。
export function expandCodes(text: string): string[] {
  const out: string[] = [];
  let subject: string | null = null;
  const tokens = text
    .split(/[,;]|\bOR\b|\bAND\b|&/i)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  for (const tok of tokens) {
    // 尾部锚定：课号常黏在散文后（"6 units GLBS2101"），整块不等于课号
    const full = tok.match(/\*?([A-Z]{3,4})\s?(\d{4})\s*$/i);
    if (full) {
      subject = full[1].toUpperCase();
      out.push(subject + full[2]);
      continue;
    }
    const bare = tok.match(/^(\d{4})$/);
    if (bare && subject) out.push(subject + bare[1]);
    // 其余（"GLBS courses at 3000 or above level"、"*LAWS2XXX" 等）无法枚举，跳过
  }
  return out;
}

// Course List 表：1-cell 行是分组标题、3-cell 行是课程；课号去内插空格。
// Word 嵌套表 + 多个含 "Course Code" 的候选表，取产出课程行最多的那张。
function parseCourseList(html: string): HandbookCourse[] {
  let best: HandbookCourse[] = [];
  for (const table of html.match(/<table[^>]*>[\s\S]*?<\/table>/gi) ?? []) {
    if (!/Course\s*Code/i.test(stripTags(table))) continue;
    const courses: HandbookCourse[] = [];
    for (const row of table.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? []) {
      const cells = [...row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(
        (m) => stripTags(m[1]),
      );
      if (cells.length < 3) continue;
      const code = cells[0].replace(/\s+/g, "").toUpperCase();
      if (!/^[A-Z]{3,4}\d{4}$/.test(code)) continue; // 跳过表头/标题行
      courses.push({ code, title: cells[1], units: parseFloat(cells[2]) || 0 });
    }
    if (courses.length > best.length) best = courses;
  }
  return best;
}

// 程序标题：取 "Applicable to students admitted" 之前的片段，去掉前导 subject code，折叠 Word 重复。
function parseTitle(text: string): string {
  let head = text.split(/Applicable to students admitted/i)[0].trim();
  head = head.replace(/^[A-Z]{3,4}\s+/, "").trim(); // 前导 GDRS/EPIN 程序码
  const half = head.length / 2;
  if (head.slice(0, half).trim() === head.slice(half).trim()) {
    head = head.slice(0, half).trim();
  }
  return head;
}

// 从一段类目文本判定形态：required / one-of / basket。
function classify(
  label: string,
  body: string,
  pickN: number | null,
): CategoryKind {
  if (/required/i.test(label) && !/from the following|any\b/i.test(body)) {
    return "required";
  }
  if (pickN === 1 || /\bany one\b|\bselect one\b|\bchoose one\b/i.test(body)) {
    return "one-of";
  }
  return "basket";
}

// 把 narrative 切成类目项。顶层 "N. Name:"、子项 "(x) ..."；只发射带课号的叶子。
function parseCategories(narrative: string): HandbookCategory[] {
  const core = narrative
    .split(/Course List/i)[0]
    .split(/Explanatory Notes|Total\s*:/i)[0];
  const start = core.search(/as follows\s*:/i);
  const body =
    start >= 0
      ? core.slice(start + core.match(/as follows\s*:/i)![0].length)
      : core;

  const markers = [...body.matchAll(/(\d+)\.\s|\(([a-z])\)\s/g)];
  const cats: HandbookCategory[] = [];
  let topName = "";
  for (let i = 0; i < markers.length; i++) {
    const seg = body.slice(
      markers[i].index!,
      markers[i + 1]?.index ?? body.length,
    );
    const isLetter = markers[i][2] !== undefined;
    const label = seg
      .split(/:/)[0]
      .replace(/\[[a-z]\]/gi, "")
      .trim();
    const members = expandCodes(seg);

    if (!isLetter && members.length === 0) {
      topName = label.replace(/^\d+\.\s*/, ""); // 父级，仅记名
      continue;
    }
    if (members.length === 0) continue;

    const pickWord = seg.match(/\bany\s+(one|two|three|four|five|six|\d+)\b/i);
    const pickN = pickWord
      ? (WORD_NUM[pickWord[1].toLowerCase()] ?? parseInt(pickWord[1], 10))
      : null;
    const units = seg.match(/(\d+)\s*(?:to\s*\d+\s*)?units?|:\s*(\d+)\b/i);
    const unitsRequired = units ? parseInt(units[1] ?? units[2], 10) : null;

    const name = isLetter
      ? `${topName} (${markers[i][2]})`.trim()
      : label.replace(/^\d+\.\s*/, "");
    cats.push({
      name,
      kind: classify(name, seg, pickN),
      unitsRequired,
      pickN,
      members,
    });
  }
  return cats;
}

export function parseHandbookLeaf(html: string): MajorSkeleton {
  const text = stripTags(html);
  const totalMatch = text.match(/minimum of\s+(\d+)\s+units/i);
  const kindMatch = text.match(/\b(major|minor)\s+programme/i);
  return {
    title: parseTitle(text),
    programmeKind: kindMatch
      ? (kindMatch[1].toLowerCase() as "major" | "minor")
      : null,
    totalUnits: totalMatch ? parseInt(totalMatch[1], 10) : null,
    categories: parseCategories(text),
    courseList: parseCourseList(html),
  };
}
