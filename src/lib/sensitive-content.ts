import { readFileSync } from "node:fs";
import { join } from "node:path";
import Mint from "mint-filter";

export const SENSITIVE_CONTENT_ERROR = "SENSITIVE_CONTENT";

const LEXICON_FILES = [
  "sensitive-words-netease.txt",
  "sensitive-words-porn.txt",
  "sensitive-words-violence.txt",
  "sensitive-words-guns.txt",
] as const;

function loadLexiconWords(): string[] {
  const dir = join(process.cwd(), "src", "data");
  const words = new Set<string>();
  for (const file of LEXICON_FILES) {
    const text = readFileSync(join(dir, file), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const word = line.trim();
      if (word.length >= 2) words.add(word);
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

/** Throws `SENSITIVE_CONTENT` when the text hits the lexicon. */
export function assertNoSensitiveContent(
  text: string,
  exceptions: readonly string[] = [],
): void {
  if (containsSensitiveContent(text, exceptions)) {
    throw new Error(SENSITIVE_CONTENT_ERROR);
  }
}

/** Test helper — pass `null` to reload the default lexicon on next check. */
export function resetSensitiveMatcherForTests(words: string[] | null): void {
  matcherExceptions.clear();
  matcher = words === null ? null : createMatcher(words);
}
