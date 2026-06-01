import { merge } from "node-diff3";

import { fromMarkdown, toMarkdown } from "@/lib/plate-utils";

export interface MergeInput {
  base: string;
  mine: string;
  theirs: string;
}

export interface MergeOutput {
  clean: boolean;
  merged: string;
}

/**
 * Line-level three-way merge of Markdown text. `clean` is false when both
 * sides edit the same region, signalling a fall back to manual resolution.
 */
export function mergeMarkdown({ base, mine, theirs }: MergeInput): MergeOutput {
  const result = merge(split(mine), split(base), split(theirs), {
    excludeFalseConflicts: true,
  });
  return { clean: !result.conflict, merged: result.result.join("\n") };
}

function split(text: string): string[] {
  return text.split("\n");
}

export interface ContentMergeResult {
  clean: boolean;
  /** Merged Plate JSON, present only when `clean` is true. */
  content?: string;
}

/**
 * Three-way merge of Plate JSON contents via Markdown serialization: the
 * structured JSON is lowered to Markdown so diff3 can merge by line, then the
 * clean result is parsed back to JSON. Returns `clean: false` on overlap.
 */
export async function threeWayMergeContent(input: {
  base: string;
  mine: string;
  theirs: string;
}): Promise<ContentMergeResult> {
  const [base, mine, theirs] = await Promise.all([
    toMarkdown(input.base),
    toMarkdown(input.mine),
    toMarkdown(input.theirs),
  ]);
  const result = mergeMarkdown({ base, mine, theirs });
  if (!result.clean) return { clean: false };
  return { clean: true, content: await fromMarkdown(result.merged) };
}
