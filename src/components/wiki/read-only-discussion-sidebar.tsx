"use client";

import { useDiscussions } from "@/components/wiki/discussion-context";
import { DiscussionThread } from "@/components/wiki/discussion-popover";

export function ReadOnlyDiscussionSidebar({
  canComment,
}: {
  canComment: boolean;
}) {
  const { discussions, activeCommentId, setActiveCommentId, refresh } =
    useDiscussions();

  const active = activeCommentId
    ? discussions.find((d) => d.commentMarkId === activeCommentId)
    : null;

  if (active) {
    return (
      <div className="w-72 shrink-0">
        <DiscussionThread
          discussion={active}
          onUpdate={refresh}
          readOnly={!canComment}
        />
      </div>
    );
  }

  const unresolved = discussions.filter((d) => !d.resolved);
  if (unresolved.length === 0) return null;

  return (
    <div className="w-72 shrink-0">
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          批注 ({unresolved.length})
        </h3>
        {unresolved.map((d) => (
          <button
            key={d.id}
            onClick={() => setActiveCommentId(d.commentMarkId)}
            className="rounded-lg border p-2 text-left text-sm hover:bg-muted/50"
          >
            <span className="font-medium">{d.user.nickname}</span>
            <span className="text-muted-foreground">: {d.content}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
