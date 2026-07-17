import { readFileSync } from "node:fs";
import { join } from "node:path";
import Mint from "mint-filter";

export const SENSITIVE_CONTENT_ERROR = "SENSITIVE_CONTENT";

/**
 * Publish-time gate: when off, `assertNoSensitiveContent` is a no-op.
 * Default ON; set `SENSITIVE_CONTENT_FILTER=false` (or 0/off/no) to disable.
 */
export function isSensitiveContentFilterEnabled(): boolean {
  const raw = process.env.SENSITIVE_CONTENT_FILTER;
  if (raw == null) return true;
  const value = raw.trim().toLowerCase();
  if (value === "") return true;
  return value !== "0" && value !== "false" && value !== "off" && value !== "no";
}

const LEXICON_FILES = [
  "sensitive-words-politics.txt",
  "sensitive-words-porn.txt",
  "sensitive-words-violence.txt",
  "sensitive-words-guns.txt",
  "sensitive-words-urls.txt",
] as const;

/** Strip path/port/query so URL lexicon entries match on hostname only. */
function normalizeUrlLexiconEntry(raw: string): string | null {
  let host = raw.trim();
  if (!host) return null;
  host = host.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  host = host.split(/[/?#]/, 1)[0] ?? "";
  if (/:\d+$/.test(host)) host = host.replace(/:\d+$/, "");
  host = host.trim().toLowerCase();
  return host.length >= 2 ? host : null;
}

function loadLexiconWords(): string[] {
  const dir = join(process.cwd(), "src", "data");
  const words = new Set<string>();
  for (const file of LEXICON_FILES) {
    const text = readFileSync(join(dir, file), "utf8");
    const isUrlList = file === "sensitive-words-urls.txt";
    for (const line of text.split(/\r?\n/)) {
      const word = isUrlList
        ? normalizeUrlLexiconEntry(line)
        : line.trim() || null;
      if (word && word.length >= 2) words.add(word);
    }
  }
  return [...words];
}

type SensitiveMatcher = {
  words: string[];
  mint: Mint;
  numericTerms: RegExp[];
};

function createMatcher(words: string[]): SensitiveMatcher {
  return {
    words,
    mint: new Mint(words.filter((word) => !/^\d+$/.test(word))),
    numericTerms: words
      .filter((word) => /^\d+$/.test(word))
      .map((word) => new RegExp(`(?<!\\d)${word}(?!\\d)`)),
  };
}

let matcher: SensitiveMatcher | null = null;
const matcherExceptions = new Map<string, SensitiveMatcher>();

function getMatcher(): SensitiveMatcher {
  if (!matcher) matcher = createMatcher(loadLexiconWords());
  return matcher;
}

/** True when `text` contains at least one lexicon hit. */
export function containsSensitiveContent(
  text: string,
  exceptions: readonly string[] = [],
): boolean {
  let current = getMatcher();
  if (exceptions.length > 0) {
    const key = [...new Set(exceptions)].sort().join("\0");
    let exceptionMatcher = matcherExceptions.get(key);
    if (!exceptionMatcher) {
      const ignored = new Set(exceptions);
      exceptionMatcher = createMatcher(
        current.words.filter((word) => !ignored.has(word)),
      );
      matcherExceptions.set(key, exceptionMatcher);
    }
    current = exceptionMatcher;
  }
  return (
    !current.mint.verify(text) ||
    current.numericTerms.some((pattern) => pattern.test(text))
  );
}

/** Throws `SENSITIVE_CONTENT` when the filter is on and the text hits the lexicon. */
export function assertNoSensitiveContent(
  text: string,
  exceptions: readonly string[] = [],
): void {
  if (!isSensitiveContentFilterEnabled()) return;
  if (containsSensitiveContent(text, exceptions)) {
    throw new Error(SENSITIVE_CONTENT_ERROR);
  }
}

/** Test helper — pass `null` to reload the default lexicon on next check. */
export function resetSensitiveMatcherForTests(words: string[] | null): void {
  matcherExceptions.clear();
  matcher = words === null ? null : createMatcher(words);
}
