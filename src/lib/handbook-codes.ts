// 课号串 → 全课号数组。裸数字继承前一个 subject（"EPIN1010, 1020" → 两门 EPIN）；
// 课号内被插的空格剥掉（"EP IN2010" → "EPIN2010"）；占位/待定（"*LAWS2XXX"）与散文跳过。
export function expandCodes(text: string): string[] {
  const out: string[] = [];
  let subject: string | null = null;
  let outerSubject: string | null = null;
  const tokens = text
    .replace(/\b([A-Z]{2})\s+([A-Z]{2})(?=\s?\d)/g, "$1$2")
    .replace(/([A-Z]{3,4})\[[A-Z]{3,4}\](\d{4})/gi, "$1$2")
    .replace(/\b\d{4}\s+(?:or|and)\s+above\b/gi, "")
    .replace(/(\d{4})\s+\d+\s+units?\s+from\s+/gi, "$1, ")
    .split(/[,;/]|\bOR\b|\bAND\b|&/i)
    .map((token) =>
      token
        .replace(/\s+/g, " ")
        .replace(/\s*\[[^\]]+\]\s*/g, " ")
        .replace(/(?:\[[a-z]\]|[#†‡*])+\s*$/gi, "")
        .replace(/(?:\s+[a-z]|\s*@)+\s*$/gi, "")
        .trim(),
    )
    .filter(Boolean);
  for (const token of tokens) {
    const opensGroup = token.trimEnd().endsWith("(");
    const closesGroup = token.includes(")");
    const normalized = token
      .replace(/\([a-z]\)/gi, "")
      .replace(/[()]/g, "")
      .replace(/[#†‡*]+\s*$/g, "")
      .trim();
    const restoreSubject = () => {
      if (!closesGroup || outerSubject == null) return;
      subject = outerSubject;
      outerSubject = null;
    };
    const matches = [
      ...normalized.matchAll(
        /([A-Z]{3,4})\s?(\d(?:\s?\d){3})|^(\d(?:\s?\d){3})(?!\d)/gi,
      ),
    ];
    for (const match of matches) {
      if (match[1]) subject = match[1].replace(/\s/g, "").toUpperCase();
      if (subject)
        out.push(subject + (match[2] ?? match[3]).replace(/\s/g, ""));
    }
    if (opensGroup && subject) outerSubject = subject;
    restoreSubject();
  }
  return [...new Set(out)];
}
