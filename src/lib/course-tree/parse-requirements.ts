// 课程技能树 S4(#164):把 courses.requirements_raw 解析成先修/排斥/同修/备注。
// 先修句解析成课号的 AND-of-OR-组(组间 AND、组内 OR),正好对应下游「组内点任一即解锁」。
// 含 permission/equivalent/非课号 token 的碎片旁路降级为 warning,不硬塞成课号。
//
// 已知限制(全量 2562 门真实回归验证,范围内 446 门 CS 学科簇无静默整条丢边):
//   - OR-of-AND(如「(A and B) or (C and D)」)超出 AND-of-OR 模型,只捕获首个 AND 段,
//     退化为「连而不全」;#164 自由模式只连不拦,边偏少不影响点亮。
//   - 「[Alternative 2] Grade A- or above in …」等成绩条件型备选先修不建模(#164 无成绩),
//     主先修(Alternative 1)仍捕获。
//   - 「For … Majors only」「For New Undergraduate Curriculum …」等非课号资格备注不进 notes
//     (仅在范围外院系大量出现,对 CS 技能树无边意义)。
//   - 拼写变体(student 单数 / stu 缩写 / Preprequisite 笔误)不特判,集中在范围外院系。

/** OR 组:组内任一课满足即可。 */
export type PrereqGroup = { codes: string[] };

export type ParsedRequirements = {
  /** 组间 AND:全部组都要满足。 */
  prerequisites: PrereqGroup[];
  /** 排斥课号(反先修;#165 等价组用)。 */
  exclusions: string[];
  /** 同修(S4 当备注级,不画先修边)。 */
  corequisites: PrereqGroup[];
  /** 豁免/非课号限制等自由文本备注。 */
  notes: string[];
  /** 旁路(or equivalent / permission)或无法解析的碎片。 */
  warnings: string[];
};

/**
 * 从一段文字里按出现顺序抽课号,裸数字继承「最近出现的 subject」(初始默认 subjectHint):
 * "CSCI2100 or 2520 or ESTR2102" → CSCI2100 / CSCI2520 / ESTR2102。
 */
function resolveCodes(segment: string, subjectHint: string): string[] {
  const out: string[] = [];
  let lastSubject = subjectHint;
  const token = /([A-Z]{4})\s?(\d{4})|(\d{4})/g;
  let m: RegExpExecArray | null;
  while ((m = token.exec(segment)) !== null) {
    if (m[1]) {
      lastSubject = m[1];
      out.push(m[1] + m[2]);
    } else if (m[3]) {
      out.push(lastSubject + m[3]);
    }
  }
  return out;
}

// 旁路条款:含 equivalent / permission / consent 等无法建模成课号的从句。
const BYPASS = /\b(equivalent|permission|consent|approval)\b/i;

/**
 * 从 `from` 起取一段从句:先跳过前导空白(含换行,应对「关键词:\n内容」的多行排版),
 * 再截到首个句界(`.` / `;` / `\n`)为止。
 */
function clauseFrom(text: string, from: number): string {
  const lead = text.slice(from).match(/^\s*/)![0].length;
  const rest = text.slice(from + lead);
  const bound = rest.search(/[.;\n]/);
  return bound >= 0 ? rest.slice(0, bound) : rest;
}

export function parseRequirements(
  text: string,
  subjectHint: string,
): ParsedRequirements {
  const result: ParsedRequirements = {
    prerequisites: [],
    exclusions: [],
    corequisites: [],
    notes: [],
    warnings: [],
  };
  if (!text) return result;

  // 排斥段:「Not for students who have taken …」到句界为止(注意要 "who have taken",
  // 「Not for students of Faculty …」这类非课号限制不落这里,归 notes)。
  const excl = /not for students who have taken/gi;
  let e: RegExpExecArray | null;
  while ((e = excl.exec(text)) !== null) {
    const clause = clauseFrom(text, e.index + e[0].length);
    result.exclusions.push(...resolveCodes(clause, subjectHint));
  }

  // 先修段:Pre-requisite(s): 引导,到句号/分号/换行为止。
  const lead = /pre-?requisites?\s*:?/gi;
  let m: RegExpExecArray | null;
  while ((m = lead.exec(text)) !== null) {
    const clause = clauseFrom(text, m.index + m[0].length);
    // 旁路条款(or equivalent / permission …)无法建模成课号:记 warning,不硬塞。
    if (BYPASS.test(clause)) {
      result.warnings.push(`先修含旁路条款(未建模):${clause.trim()}`);
    }
    // 组间 AND:每个 AND 段 = 一个 OR 组(括号对 resolveCodes 只是噪音)。
    for (const part of clause.split(/\band\b/i)) {
      const codes = resolveCodes(part, subjectHint);
      if (codes.length) result.prerequisites.push({ codes });
    }
  }

  // 同修段:Co-requisite(s): / Corequisite: 引导(有无连字符都收)。S4 单独归类,
  // 不画先修边(同修不构成解锁前提),仍按 AND-of-OR 组保留结构。
  const coreqLead = /co-?requisites?\s*:?/gi;
  let c: RegExpExecArray | null;
  while ((c = coreqLead.exec(text)) !== null) {
    const clause = clauseFrom(text, c.index + c[0].length);
    if (BYPASS.test(clause)) {
      result.warnings.push(`同修含旁路条款(未建模):${clause.trim()}`);
    }
    for (const part of clause.split(/\band\b/i)) {
      const codes = resolveCodes(part, subjectHint);
      if (codes.length) result.corequisites.push({ codes });
    }
  }

  // 非课号限制备注:「Not for students of Faculty …」/「… majoring in …」这类身份/院系
  // 限制没有课号,不能进 exclusions,也不能静默丢;整句落 notes。用负向前瞻排除
  // 「Not for students who have taken …」(那句已由上面的 exclusion 段处理)。
  const nonCourseBan = /not for students\b(?!\s+who have taken)[^.;\n]*/gi;
  let b: RegExpExecArray | null;
  while ((b = nonCourseBan.exec(text)) !== null) {
    const note = b[0].trim();
    if (note) result.notes.push(note);
  }

  // 豁免备注:「For senior-year/2nd-year entrants, the prerequisite will be waived.」
  // 是自由文本限制,不建模成边;整句原样落 notes 供 UI 展示。
  const waiver = /[^.;\n]*\bwaived\b[^.;\n]*/gi;
  let w: RegExpExecArray | null;
  while ((w = waiver.exec(text)) !== null) {
    const note = w[0].trim();
    if (note) result.notes.push(note);
  }

  return result;
}
