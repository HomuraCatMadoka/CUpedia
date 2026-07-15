/**
 * Danmaku content filters — mirrors bilibili's player "keyword + regex" gate
 * (community block lists / DanmakuFlameMaster shielding), kept as a small
 * campus-safe default rather than importing a huge public video block XML.
 */

export type DanmakuBlockHit =
  | { kind: "keyword"; matched: string }
  | { kind: "regex"; matched: string };

/** Exact / substring keywords (lowercase compare after NFKC). */
const KEYWORD_BLOCKS = [
  "加微信",
  "加vx",
  "加v",
  "加VX",
  "加V",
  "微信号",
  "微信群",
  "qq群",
  "QQ群",
  "企鹅群",
  "日结",
  "日赚",
  "兼职刷单",
  "免费黄片",
  "约炮",
  "操你",
  "草泥马",
  "操你妈",
  "去死",
  "去死吧",
];

/** Regex rules (bilibili-style type=1 filters), avoid catastrophic backtracking. */
const REGEX_BLOCKS: Array<{ name: string; re: RegExp }> = [
  { name: "url", re: /https?:\/\/\S+/i },
  { name: "www", re: /\bwww\.\S+/i },
  { name: "wechat_id", re: /(?:微信|wx|vx|v信)\s*[:：]?\s*[a-z0-9_-]{4,}/i },
  { name: "qq_id", re: /(?:qq|扣扣)\s*[:：]?\s*\d{5,12}/i },
  { name: "phone", re: /(?:\+?852[-\s]?)?(?:5|6|9)\d{7}\b|(?:\+?86[-\s]?)?1[3-9]\d{9}\b/ },
  // Same char repeated (刷屏) — e.g. 哈哈哈哈哈哈 or aaaaaaaa
  { name: "repeat_char", re: /(.)\1{5,}/u },
  // Mostly punctuation / emoticon spam
  { name: "punct_spam", re: /^[\s\p{P}\p{S}]{6,}$/u },
];

function normalizeForBlock(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function findDanmakuBlock(content: string): DanmakuBlockHit | null {
  const raw = content.trim();
  if (!raw) return null;

  const normalized = normalizeForBlock(raw);
  for (const word of KEYWORD_BLOCKS) {
    if (normalized.includes(normalizeForBlock(word))) {
      return { kind: "keyword", matched: word };
    }
  }

  for (const { name, re } of REGEX_BLOCKS) {
    if (re.test(raw) || re.test(normalized)) {
      return { kind: "regex", matched: name };
    }
  }
  return null;
}

export function assertDanmakuNotBlocked(content: string): void {
  if (findDanmakuBlock(content)) {
    throw new Error("DANMAKU_BLOCKED");
  }
}
