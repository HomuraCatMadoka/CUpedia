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

let mint: Mint | null = null;

function getMint(): Mint {
  if (!mint) mint = new Mint(loadLexiconWords());
  return mint;
}

/** True when `text` contains at least one lexicon hit. */
export function containsSensitiveContent(text: string): boolean {
  return !getMint().verify(text);
}

/** Throws `SENSITIVE_CONTENT` when the text hits the lexicon. */
export function assertNoSensitiveContent(text: string): void {
  if (containsSensitiveContent(text)) {
    throw new Error(SENSITIVE_CONTENT_ERROR);
  }
}

/** Test helper — pass `null` to reload the default lexicon on next check. */
export function resetSensitiveMatcherForTests(words: string[] | null): void {
  mint = words === null ? null : new Mint(words);
}
