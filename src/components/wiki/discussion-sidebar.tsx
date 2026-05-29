"use client";

import { useTransition } from "react";
import { nanoid } from "nanoid";
import { useEditorRef } from "platejs/react";
import {
  BaseCommentPlugin,
  getCommentKey,
  getDraftCommentKey,
} from "@platejs/comment";
import { useDiscussions } from "./discussion-context";
import { DiscussionThread, NewCommentForm } from "./discussion-popover";
import { createDiscussion } from "@/lib/discussion-actions";

export function DiscussionSidebar({ pageId }: { pageId: string }) {
  const { discussions, activeCommentId, setActiveCommentId, refresh } =
    useDiscussions();
  const editor = useEditorRef();
  const [, startTransition] = useTransition();

  const commentApi = editor.getApi(BaseCommentPlugin);
  const commentTf = editor.getTransforms(BaseCommentPlugin);

  const activeDiscussion = activeCommentId
    ? discussions.find((d) => d.commentMarkId === activeCommentId)
    : null;

  const isDraft = activeCommentId === "draft";

  const handleNewComment = (content: string) => {
    startTransition(async () => {
      const commentId = nanoid(10);
      try {
        const id = await createDiscussion(pageId, commentId, content);
        if (id) {
          editor.tf.withoutNormalizing(() => {
            const draftNodes = commentApi.comment.nodes({ isDraft: true });
            for (const [node] of draftNodes) {
              editor.tf.setNodes(
                {
                  [getDraftCommentKey()]: undefined,
                  [getCommentKey(commentId)]: true,
                },
                { at: [], match: (n) => n === node },
              );
            }
          });
          setActiveCommentId(commentId);
          refresh();
        }
      } catch {
        commentTf.comment.removeMark();
        setActiveCommentId(null);
      }
    });
  };

  const handleCancelDraft = () => {
    commentTf.comment.removeMark();
    setActiveCommentId(null);
  };

  if (!activeCommentId) {
    const unresolvedCount = discussions.filter((d) => !d.resolved).length;
    if (unresolvedCount === 0) return null;

    return (
      <div className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">
          批注 ({unresolvedCount})
        </h3>
        {discussions
          .filter((d) => !d.resolved)
          .map((d) => (
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
    );
  }

  if (isDraft) {
    return (
      <NewCommentForm
        onSubmit={handleNewComment}
        onCancel={handleCancelDraft}
      />
    );
  }

  if (activeDiscussion) {
    return (
      <DiscussionThread discussion={activeDiscussion} onUpdate={refresh} />
    );
  }

  return null;
}
