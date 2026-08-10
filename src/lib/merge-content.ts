import { diff3Merge } from "node-diff3";

import { parseContent, type PlateValue } from "./plate-utils";

/** Sentinel woven between block keys; a NUL char never collides with a
 * canonical key (which always serializes a block object as `{…}`). */
const BLOCK_SEPARATOR = "\u0000";
const BLOCK_OCCURRENCE_SEPARATOR = "\u0001";
const BLOCK_ID_PREFIX = "\u0002";
const TEXT_BLOCK_TYPES = new Set([
  "p",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
]);

export interface ContentMergeResult {
  clean: boolean;
  /** Merged Plate JSON, present only when `clean` is true. */
  content?: string;
}

/**
 * Three-way merge of Plate JSON contents at the top-level block granularity.
 * Stable top-level block ids define identity when all three descendants share
 * them; legacy documents fall back to a canonical key (recursively key-sorted,
 * with editor ids stripped) plus occurrence among equal blocks. node-diff3
 * merges those structural token sequences and the clean result is reassembled
 * from the original block objects. Staying in JSON makes this lossless — rich
 * nodes (callout / equation / toc / table) survive byte-for-byte — where the
 * former markdown bridge silently downgraded them.
 * A conflict inside a plain text block gets one more conservative merge pass at
 * text-leaf granularity, so independent formatting changes in one paragraph do
 * not become false conflicts. Rich/nested nodes still fall back to manual
 * resolution. Kept async so callers and the interface are unchanged.
 */
export async function threeWayMergeContent(input: {
  base: string;
  mine: string;
  theirs: string;
}): Promise<ContentMergeResult> {
  const baseValue = parseContent(input.base) as PlateValue;
  const mineValue = parseContent(input.mine) as PlateValue;
  const theirValue = parseContent(input.theirs) as PlateValue;
  if (canMergeByBlockIdentity(baseValue, mineValue, theirValue)) {
    return mergeByBlockIdentity(baseValue, mineValue, theirValue);
  }

  // Canonical content identifies equality for diff3, while the occurrence
  // suffix keeps two equal-looking blocks as two distinct editor nodes.
  // Registered base → theirs → mine so mine wins on ties without collapsing
  // repeated blocks onto the last object's id.
  const byToken = new Map<string, unknown>();
  const keysOf = (value: PlateValue): string[] => {
    const keys: string[] = [];
    const occurrences = new Map<string, number>();
    for (const block of value) {
      const canonical = canonicalKey(block);
      const occurrence = occurrences.get(canonical) ?? 0;
      occurrences.set(canonical, occurrence + 1);
      const token = `${canonical}${BLOCK_OCCURRENCE_SEPARATOR}${occurrence}`;
      byToken.set(token, block);
      // Interleave a stable separator between blocks so edits to two *adjacent*
      // distinct blocks keep an unchanged element between them; without it the
      // two changes collapse into one diff3 hunk and conflict. This restores
      // the auto-merge the markdown bridge got for free from blank lines, while
      // staying in JSON.
      if (keys.length > 0) keys.push(BLOCK_SEPARATOR);
      keys.push(token);
    }
    return keys;
  };

  const baseKeys = keysOf(baseValue);
  const theirKeys = keysOf(theirValue);
  const mineKeys = keysOf(mineValue);

  const regions = diff3Merge(mineKeys, baseKeys, theirKeys, {
    excludeFalseConflicts: true,
  });
  const merged: unknown[] = [];
  for (const region of regions) {
    if (region.ok) {
      merged.push(
        ...region.ok
          .filter((key) => key !== BLOCK_SEPARATOR)
          .map((key) => byToken.get(key)),
      );
      continue;
    }

    const conflict = region.conflict;
    if (!conflict) continue;
    const baseBlock = singleBlock(conflict.o, byToken);
    const mineBlock = singleBlock(conflict.a, byToken);
    const theirBlock = singleBlock(conflict.b, byToken);
    const resolved = mergeTextBlock(baseBlock, mineBlock, theirBlock);
    if (!resolved) return { clean: false };
    merged.push(resolved);
  }
  return { clean: true, content: JSON.stringify(merged) };
}

type BlockIdentityMaps = {
  base: Map<string, unknown>;
  mine: Map<string, unknown>;
  theirs: Map<string, unknown>;
};

function blockIds(value: PlateValue): string[] | undefined {
  const ids: string[] = [];
  const unique = new Set<string>();
  for (const block of value) {
    if (!block || typeof block !== "object") return undefined;
    const id = (block as { id?: unknown }).id;
    if (typeof id !== "string" || id.length === 0 || unique.has(id)) {
      return undefined;
    }
    unique.add(id);
    ids.push(id);
  }
  return ids;
}

/** Use ids only when both descendants demonstrably share the base identity. */
function canMergeByBlockIdentity(
  base: PlateValue,
  mine: PlateValue,
  theirs: PlateValue,
): boolean {
  const baseIds = blockIds(base);
  const mineIds = blockIds(mine);
  const theirIds = blockIds(theirs);
  if (!baseIds || !mineIds || !theirIds || baseIds.length === 0) return false;

  const baseSet = new Set(baseIds);
  const sharesBaseIdentity = (ids: string[]) =>
    ids.length === 0 || ids.some((id) => baseSet.has(id));
  return sharesBaseIdentity(mineIds) && sharesBaseIdentity(theirIds);
}

function identifiedSequence(value: PlateValue, target: Map<string, unknown>) {
  const keys: string[] = [];
  for (const block of value) {
    const id = (block as unknown as { id: string }).id;
    const token = `${BLOCK_ID_PREFIX}${id}`;
    target.set(token, block);
    if (keys.length > 0) keys.push(BLOCK_SEPARATOR);
    keys.push(token);
  }
  return keys;
}

function mergeByBlockIdentity(
  base: PlateValue,
  mine: PlateValue,
  theirs: PlateValue,
): ContentMergeResult {
  const maps: BlockIdentityMaps = {
    base: new Map(),
    mine: new Map(),
    theirs: new Map(),
  };
  const baseKeys = identifiedSequence(base, maps.base);
  const mineKeys = identifiedSequence(mine, maps.mine);
  const theirKeys = identifiedSequence(theirs, maps.theirs);

  // Deleting a block and editing that same block are competing intentions.
  // diff3 sees only the identity sequence, so guard this content-level case
  // explicitly before merging structural changes.
  for (const token of baseKeys) {
    if (token === BLOCK_SEPARATOR) continue;
    const baseBlock = maps.base.get(token)!;
    const mineBlock = maps.mine.get(token);
    const theirBlock = maps.theirs.get(token);
    if (
      (mineBlock === undefined &&
        theirBlock !== undefined &&
        !sameValue(baseBlock, theirBlock)) ||
      (theirBlock === undefined &&
        mineBlock !== undefined &&
        !sameValue(baseBlock, mineBlock))
    ) {
      return { clean: false };
    }
  }

  const regions = diff3Merge(mineKeys, baseKeys, theirKeys, {
    excludeFalseConflicts: true,
  });
  if (regions.some((region) => region.conflict)) return { clean: false };

  const merged: unknown[] = [];
  for (const token of regions.flatMap((region) => region.ok ?? [])) {
    if (token === BLOCK_SEPARATOR) continue;
    const resolution = resolveIdentifiedBlock(token, maps);
    if (!resolution.clean) return { clean: false };
    merged.push(resolution.block);
  }
  return { clean: true, content: JSON.stringify(merged) };
}

function resolveIdentifiedBlock(
  token: string,
  maps: BlockIdentityMaps,
): { clean: true; block: unknown } | { clean: false } {
  const base = maps.base.get(token);
  const mine = maps.mine.get(token);
  const theirs = maps.theirs.get(token);

  if (base === undefined) {
    if (mine === undefined) return { clean: true, block: theirs };
    if (theirs === undefined || sameValue(mine, theirs)) {
      return { clean: true, block: mine };
    }
    return { clean: false };
  }
  if (mine === undefined) return { clean: true, block: theirs };
  if (theirs === undefined) return { clean: true, block: mine };
  if (sameValue(mine, theirs) || sameValue(theirs, base)) {
    return { clean: true, block: mine };
  }
  if (sameValue(mine, base)) return { clean: true, block: theirs };

  const merged = mergeTextBlock(base, mine, theirs);
  return merged ? { clean: true, block: merged } : { clean: false };
}

function singleBlock(
  keys: string[],
  byKey: Map<string, unknown>,
): unknown | undefined {
  const blocks = keys
    .filter((key) => key !== BLOCK_SEPARATOR)
    .map((key) => byKey.get(key));
  return blocks.length === 1 ? blocks[0] : undefined;
}

type TextLeaf = { text: string; [key: string]: unknown };
type TextBlock = { children: TextLeaf[]; [key: string]: unknown };

/** Merge only flat text blocks. Nested inline/rich nodes remain conservative. */
function mergeTextBlock(
  base: unknown,
  mine: unknown,
  theirs: unknown,
): TextBlock | undefined {
  if (!isTextBlock(base) || !isTextBlock(mine) || !isTextBlock(theirs)) {
    return undefined;
  }

  const baseAttrs = blockAttributes(base);
  const mergedAttrs = mergeAttributes(
    baseAttrs,
    blockAttributes(mine),
    blockAttributes(theirs),
  );
  if (!mergedAttrs) return undefined;

  const byKey = new Map<string, TextLeaf>();
  const baseTokens = tokenizeTextLeaves(base.children);
  const mineTokens = tokenizeTextLeaves(mine.children);
  const theirTokens = tokenizeTextLeaves(theirs.children);
  const sameText =
    baseTokens.length === mineTokens.length &&
    baseTokens.length === theirTokens.length &&
    textOf(baseTokens) === textOf(mineTokens) &&
    textOf(baseTokens) === textOf(theirTokens);

  if (sameText) {
    const tokens: TextLeaf[] = [];
    for (let index = 0; index < baseTokens.length; index += 1) {
      const text = baseTokens[index].text;
      const baseMarks = leafMarks(baseTokens[index]);
      const mineMarks = leafMarks(mineTokens[index]);
      const theirMarks = leafMarks(theirTokens[index]);
      const marks = mergeAttributes(baseMarks, mineMarks, theirMarks);
      if (!marks) return undefined;
      tokens.push({ text, ...marks });
    }
    return {
      ...mergedAttrs,
      ...(typeof mine.id === "string" ? { id: mine.id } : {}),
      children: coalesceTextLeaves(tokens),
    };
  }

  const keysOf = (tokens: TextLeaf[]) =>
    tokens.map((token) => {
      const key = canonicalKey(token);
      byKey.set(key, token);
      return key;
    });

  const result = diff3Merge(
    keysOf(mineTokens),
    keysOf(baseTokens),
    keysOf(theirTokens),
    { excludeFalseConflicts: true },
  );
  if (result.some((region) => region.conflict)) return undefined;

  const tokens = result.flatMap((region) =>
    (region.ok ?? []).map((key) => byKey.get(key)!),
  );
  const id = typeof mine.id === "string" ? { id: mine.id } : {};
  return { ...mergedAttrs, ...id, children: coalesceTextLeaves(tokens) };
}

function blockAttributes(block: TextBlock): Record<string, unknown> {
  const attributes: Record<string, unknown> = { ...block };
  delete attributes.children;
  delete attributes.id;
  return attributes;
}

function leafMarks(leaf: TextLeaf): Record<string, unknown> {
  const marks: Record<string, unknown> = { ...leaf };
  delete marks.text;
  return marks;
}

function tokenizeTextLeaves(leaves: TextLeaf[]): TextLeaf[] {
  return leaves.flatMap((leaf) =>
    leaf.text === ""
      ? [{ ...leaf }]
      : Array.from(leaf.text, (text) => ({ ...leaf, text })),
  );
}

function textOf(tokens: TextLeaf[]): string {
  return tokens.map((token) => token.text).join("");
}

function mergeAttributes(
  base: Record<string, unknown>,
  mine: Record<string, unknown>,
  theirs: Record<string, unknown>,
): Record<string, unknown> | undefined {
  const merged: Record<string, unknown> = {};
  const keys = new Set([
    ...Object.keys(base),
    ...Object.keys(mine),
    ...Object.keys(theirs),
  ]);
  for (const key of keys) {
    const baseValue = base[key];
    const mineValue = mine[key];
    const theirValue = theirs[key];
    let value: unknown;
    if (sameValue(mineValue, theirValue)) value = mineValue;
    else if (sameValue(mineValue, baseValue)) value = theirValue;
    else if (sameValue(theirValue, baseValue)) value = mineValue;
    else return undefined;
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

function sameValue(left: unknown, right: unknown): boolean {
  return canonicalKey(left) === canonicalKey(right);
}

function isTextBlock(value: unknown): value is TextBlock {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { type?: unknown; children?: unknown };
  const children = candidate.children;
  return (
    typeof candidate.type === "string" &&
    TEXT_BLOCK_TYPES.has(candidate.type) &&
    Array.isArray(children) &&
    children.length > 0 &&
    children.every(
      (child) =>
        child !== null &&
        typeof child === "object" &&
        typeof (child as { text?: unknown }).text === "string",
    )
  );
}

function coalesceTextLeaves(tokens: TextLeaf[]): TextLeaf[] {
  const leaves: TextLeaf[] = [];
  for (const token of tokens) {
    const { text, ...marks } = token;
    const previous = leaves.at(-1);
    if (previous) {
      const { text: previousText, ...previousMarks } = previous;
      if (canonicalKey(marks) === canonicalKey(previousMarks)) {
        previous.text = previousText + text;
        continue;
      }
    }
    leaves.push({ ...token });
  }
  return leaves;
}

/** Stable semantic value of a node: key-sorted without editor-only ids. */
function canonicalKey(block: unknown): string {
  return JSON.stringify(canonicalize(block));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      // `id` is load-bearing for editor selection and drag/drop, but it is not
      // semantic content. Occurrence tokens preserve distinct block instances
      // while keeping client-specific ids out of equality comparisons.
      if (key === "id") continue;
      out[key] = canonicalize(source[key]);
    }
    return out;
  }
  return value;
}
