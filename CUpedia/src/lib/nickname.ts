const CONTROL_CHAR_RE = /[\p{Cc}\p{Cf}]/u;

export function normalizeNickname(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

function countGraphemes(str: string): number {
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("en", { granularity: "grapheme" });
    let count = 0;
    for (const _ of segmenter.segment(str)) count++;
    return count;
  }
  return Array.from(str).length;
}

export function validateNickname(
  input: string
): { ok: true; nickname: string } | { ok: false; error: string } {
  if (CONTROL_CHAR_RE.test(input)) {
    return { ok: false, error: "昵称不能包含控制字符" };
  }
  const nickname = normalizeNickname(input);
  const len = countGraphemes(nickname);
  if (len < 2) {
    return { ok: false, error: "昵称至少需要 2 个字符" };
  }
  if (len > 20) {
    return { ok: false, error: "昵称最多 20 个字符" };
  }
  return { ok: true, nickname };
}
