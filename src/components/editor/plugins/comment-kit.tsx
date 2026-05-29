"use client";

import { CommentPlugin } from "@platejs/comment/react";
import { CommentLeaf } from "@/components/ui/comment-leaf";

export const CommentKit = [
  CommentPlugin.configure({
    node: { component: CommentLeaf, isDecoration: false },
  }),
];
