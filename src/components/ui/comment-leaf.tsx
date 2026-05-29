"use client";

import type { TCommentText } from "platejs";
import type { PlateLeafProps } from "platejs/react";
import { PlateLeaf } from "platejs/react";
import { commentLeafId } from "@/lib/comment-leaf-id";
import { useDiscussions } from "@/components/wiki/discussion-context";
import { cn } from "@/lib/utils";

export function CommentLeaf(props: PlateLeafProps<TCommentText>) {
  const { children, leaf, text } = props;
  const { activeCommentId, setActiveCommentId } = useDiscussions();

  const leafId = commentLeafId(leaf ?? text);
  const isActive = leafId !== null && leafId === activeCommentId;

  return (
    <PlateLeaf
      {...props}
      className={cn(
        "border-b-2 border-yellow-400 bg-yellow-100/40 cursor-pointer dark:bg-yellow-900/20",
        isActive && "bg-yellow-200/60 dark:bg-yellow-800/40",
      )}
    >
      <span
        onClick={() => {
          if (leafId && leafId !== "draft") {
            setActiveCommentId(isActive ? null : leafId);
          }
        }}
      >
        {children}
      </span>
    </PlateLeaf>
  );
}
