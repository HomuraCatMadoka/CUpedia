import { getCommentKeyId, getCommentKeys } from "@platejs/comment";
import type { TCommentText } from "platejs";

/** Last inline comment id on a comment text node, or null. */
export function commentLeafId(node?: TCommentText | null): string | null {
  if (!node) return null;
  const keys = getCommentKeys(node);
  return keys.length > 0 ? getCommentKeyId(keys[keys.length - 1]) : null;
}
