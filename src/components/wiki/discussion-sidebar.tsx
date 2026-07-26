"use client";

import { useRef, useTransition } from "react";
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
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";
import { clearDraftCommentMarks } from "@/components/wiki/discussion-draft";
import { useMediaQuery } from "@/hooks/use-media-query";

export function DiscussionSidebar({
  compactComposer = false,
  pageId,
}: {
  compactComposer?: boolean;
  pageId: string;
}) {
  const {
    discussions,
    activeCommentId,
    setActiveCommentId,
    setPanelOpen,
    refresh,
  } = useDiscussions();
  const editor = useEditorRef();
  const [isPending, startTransition] = useTransition();
  const submittingRef = useRef(false);
  const { ensureContributorSetup } = useContributorSetup();
  const mobileLayout = useMediaQuery("(max-width: 767px)");

  const commentApi = editor.getApi(BaseCommentPlugin);
  const commentTf = editor.getTransforms(BaseCommentPlugin);

  const activeDiscussion = activeCommentId
    ? discussions.find((d) => d.commentMarkId === activeCommentId)
    : null;

  const isDraft = activeCommentId === "draft";

  const handleNewComment = (content: string) => {
    if (submittingRef.current) return;
    submittingRef.current = true;
    startTransition(async () => {
      try {
        if (!(await ensureContributorSetup())) return;
        const commentId = nanoid(10);
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
      } finally {
        submittingRef.current = false;
      }
    });
  };

  const handleCancelDraft = () => {
    clearDraftCommentMarks(editor);
    setActiveCommentId(null);
    setPanelOpen(false);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        editor.tf.focus({ retries: 5 });
      });
    });
  };

  if (!activeCommentId) {
    const unresolvedCount = discussions.filter((d) => !d.resolved).length;
    if (unresolvedCount === 0) {
      return <p className="text-sm text-muted-foreground">暂无批注</p>;
    }

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
              className="min-h-11 rounded-lg border p-2 text-left text-sm hover:bg-muted/50"
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
        compact={compactComposer && mobileLayout}
        submitting={isPending}
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
