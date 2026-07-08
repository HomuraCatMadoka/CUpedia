import { merge } from "node-diff3";

import { parseContent, type PlateValue } from "@/lib/plate-utils";

/** Sentinel woven between block keys; a NUL char never collides with a
 * canonical key (which always serializes a block object as `{…}`). */
const BLOCK_SEPARATOR = "\u0000";

export interface ContentMergeResult {
  clean: boolean;
  /** Merged Plate JSON, present only when `clean` is true. */
  content?: string;
}

/**
 * Three-way merge of Plate JSON contents at the top-level block granularity.
 * Each block is reduced to a canonical key (recursively key-sorted, with the
 * volatile `id` stripped) and node-diff3 merges the three key sequences; the
 * clean result is reassembled from the original block objects. Staying in JSON
 * makes this lossless — rich nodes (callout / equation / toc / table) survive
 * byte-for-byte — where the former markdown bridge silently downgraded them.
 * `clean` is false when both sides edit the same block, signalling a fall back
 * to manual resolution. Kept async so callers and the interface are unchanged.
 */
export async function threeWayMergeContent(input: {
  base: string;
  mine: string;
  theirs: string;
}): Promise<ContentMergeResult> {
  // Canonical key -> original block, so the merged key sequence can be turned
  // back into real block objects. Registered base → theirs → mine so mine wins
  // on ties; unchanged blocks are canonically identical across sides, so the
  // winner is irrelevant there and only an edited block (unique to one side)
  // determines its own key.
  const byKey = new Map<string, unknown>();
  const keysOf = (raw: string): string[] => {
    const keys: string[] = [];
    for (const block of parseContent(raw) as PlateValue) {
      const key = canonicalKey(block);
      byKey.set(key, block);
      // Interleave a stable separator between blocks so edits to two *adjacent*
      // distinct blocks keep an unchanged element between them; without it the
      // two changes collapse into one diff3 hunk and conflict. This restores
      // the auto-merge the markdown bridge got for free from blank lines, while
      // staying in JSON.
      if (keys.length > 0) keys.push(BLOCK_SEPARATOR);
      keys.push(key);
    }
    return keys;
  };

  const baseKeys = keysOf(input.base);
  const theirKeys = keysOf(input.theirs);
  const mineKeys = keysOf(input.mine);

  const result = merge(mineKeys, baseKeys, theirKeys, {
    excludeFalseConflicts: true,
  });
  if (result.conflict) return { clean: false };

  const merged = result.result
    .filter((key) => key !== BLOCK_SEPARATOR)
    .map((key) => byKey.get(key));
  return { clean: true, content: JSON.stringify(merged) };
}

/** Stable identity of a block: key-sorted and stripped of volatile ids. */
function canonicalKey(block: unknown): string {
  return JSON.stringify(canonicalize(block));
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      // Strip `id` at every depth: no NodeId plugin is registered today, but
      // once one is, per-node ids would otherwise make every block a false
      // conflict. Defensive, not currently load-bearing.
      if (key === "id") continue;
      out[key] = canonicalize(source[key]);
    }
    return out;
  }
  return value;
}
