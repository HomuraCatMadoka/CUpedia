"use client";

import { useRef } from "react";
import type { TCommentText } from "platejs";
import type { SlateLeafProps } from "platejs/static";
import { SlateLeaf } from "platejs/static";

import { commentLeafId } from "@/lib/comment-leaf-id";
import { useDiscussions } from "@/components/wiki/discussion-context";
import { cn } from "@/lib/utils";

export function CommentLeafStatic(props: SlateLeafProps<TCommentText>) {
  const { children, leaf } = props;
  const { activeCommentId, setActiveCommentId } = useDiscussions();

  const leafId = commentLeafId(leaf);
  const isActive = leafId !== null && leafId === activeCommentId;
  const clickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleClick = (e: React.MouseEvent) => {
    // Clear any pending single-click timeout
    if (clickTimerRef.current) {
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }

    // Only handle single clicks; wait to confirm it's not a double-click
    if (e.detail === 1) {
      clickTimerRef.current = setTimeout(() => {
        clickTimerRef.current = null;
        if (leafId && leafId !== "draft") {
          setActiveCommentId(isActive ? null : leafId);
        }
      }, 250);
    }
  };

  return (
    <SlateLeaf
      {...props}
      className={cn(
        "cursor-pointer border-b-2 border-yellow-400 bg-yellow-100/40 dark:bg-yellow-900/20",
        isActive && "bg-yellow-200/60 dark:bg-yellow-800/40",
      )}
    >
      <span onClick={handleClick}>
        {children}
      </span>
    </SlateLeaf>
  );
}
