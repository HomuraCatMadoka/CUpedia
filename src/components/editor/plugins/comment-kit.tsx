"use client";

import {
  getDraftCommentKey,
  getCommentKeyId,
  isCommentKey,
} from "@platejs/comment";
import { CommentPlugin } from "@platejs/comment/react";
import { CommentLeaf } from "@/components/ui/comment-leaf";

function safeNodeId(leaf: Record<string, unknown> | null) {
  if (!leaf) return undefined;
  const keys = Object.keys(leaf);
  if (keys.includes(getDraftCommentKey())) return undefined;
  const ids: string[] = [];
  keys.forEach((key) => {
    if (!isCommentKey(key) || key === getDraftCommentKey()) return;
    ids.push(getCommentKeyId(key));
  });
  return ids.at(-1);
}

export const CommentKit = [
  CommentPlugin.configure({
    node: { component: CommentLeaf, isDecoration: false },
  }).extend({
    api: {
      comment: {
        nodeId: safeNodeId as never,
      },
    },
  }),
];
