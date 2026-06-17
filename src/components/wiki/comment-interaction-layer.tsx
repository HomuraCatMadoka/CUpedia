"use client";

import { useEffect } from "react";

import { useDiscussions } from "@/components/wiki/discussion-context";

// Single client island for the read view's static comment highlights. The leaves
// render server-side with data-comment-id, so no Slate editor crosses the RSC
// boundary (#170). This layer never receives the editor: it delegates clicks to
// the discussion context and reflects the active thread by toggling
// data-comment-active on the matching highlight spans.
export function CommentInteractionLayer() {
  const { activeCommentId, setActiveCommentId } = useDiscussions();

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      const el = target?.closest<HTMLElement>("[data-comment-id]");
      const id = el?.dataset.commentId;
      if (!id || id === "draft") return;
      setActiveCommentId(id === activeCommentId ? null : id);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [activeCommentId, setActiveCommentId]);

  useEffect(() => {
    for (const el of document.querySelectorAll<HTMLElement>(
      "[data-comment-id]",
    )) {
      el.toggleAttribute(
        "data-comment-active",
        el.dataset.commentId === activeCommentId,
      );
    }
  }, [activeCommentId]);

  return null;
}
