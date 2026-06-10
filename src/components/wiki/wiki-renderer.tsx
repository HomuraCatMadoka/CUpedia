"use client";

import { CommentInteractionLayer } from "@/components/wiki/comment-interaction-layer";
import { DiscussionProvider } from "@/components/wiki/discussion-context";
import { ReadOnlyDiscussionSidebar } from "@/components/wiki/read-only-discussion-sidebar";
import type { Discussion } from "@/lib/discussion-actions";

export function WikiRenderer({
  children,
  pageId,
  discussions = [],
  canComment = false,
}: {
  children: React.ReactNode;
  pageId?: string;
  discussions?: Discussion[];
  canComment?: boolean;
}) {
  return (
    <DiscussionProvider pageId={pageId ?? ""} initialDiscussions={discussions}>
      <CommentInteractionLayer />
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">{children}</div>
        <ReadOnlyDiscussionSidebar canComment={canComment} />
      </div>
    </DiscussionProvider>
  );
}
