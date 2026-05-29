"use client";

import { usePlateEditor, Plate } from "platejs/react";

import { BasicNodesKit } from "@/components/editor/plugins/basic-nodes-kit";
import { CalloutKit } from "@/components/editor/plugins/callout-kit";
import { CodeBlockKit } from "@/components/editor/plugins/code-block-kit";
import { CommentKit } from "@/components/editor/plugins/comment-kit";
import { LinkKit } from "@/components/editor/plugins/link-kit";
import { MathBaseKit } from "@/components/editor/plugins/math-base-kit";
import { ListKit } from "@/components/editor/plugins/list-kit";
import { MediaKit } from "@/components/editor/plugins/media-kit";
import { TableKit } from "@/components/editor/plugins/table-kit";
import { BaseTocKit } from "@/components/editor/plugins/toc-base-kit";
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit";
import {
  DiscussionProvider,
  useDiscussions,
} from "@/components/wiki/discussion-context";
import { DiscussionThread } from "@/components/wiki/discussion-popover";
import { EditorContainer, Editor } from "@/components/ui/editor";
import type { Discussion } from "@/lib/discussion-actions";
import type { PlateValue } from "@/lib/plate-utils";

export function WikiRenderer({
  value,
  pageId,
  discussions = [],
  canComment = false,
}: {
  value: PlateValue;
  pageId?: string;
  discussions?: Discussion[];
  canComment?: boolean;
}) {
  const editor = usePlateEditor({
    plugins: [
      ...BasicNodesKit,
      ...CalloutKit,
      ...CodeBlockKit,
      ...CommentKit,
      ...LinkKit,
      ...ListKit,
      ...MathBaseKit,
      ...MediaKit,
      ...TableKit,
      ...BaseTocKit,
      ...MarkdownKit,
    ],
    value,
  });

  return (
    <Plate editor={editor} readOnly>
      <DiscussionProvider
        pageId={pageId ?? ""}
        initialDiscussions={discussions}
      >
        <div className="flex gap-4">
          <div className="min-w-0 flex-1">
            <EditorContainer>
              <Editor variant="fullWidth" />
            </EditorContainer>
          </div>
          <ReadOnlyDiscussionSidebar canComment={canComment} />
        </div>
      </DiscussionProvider>
    </Plate>
  );
}

function ReadOnlyDiscussionSidebar({ canComment }: { canComment: boolean }) {
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
