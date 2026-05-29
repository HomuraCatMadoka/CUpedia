"use client";

import { BaseCommentPlugin } from "@platejs/comment";
import { MessageSquarePlusIcon } from "lucide-react";
import { useEditorRef } from "platejs/react";
import { useDiscussions } from "@/components/wiki/discussion-context";
import { ToolbarButton } from "./toolbar";

export function CommentToolbarButton() {
  const editor = useEditorRef();
  const { setActiveCommentId } = useDiscussions();
  const commentTf = editor.getTransforms(BaseCommentPlugin);

  return (
    <ToolbarButton
      tooltip="批注 (⌘+⇧+M)"
      onClick={() => {
        commentTf.comment.setDraft();
        setActiveCommentId("draft");
      }}
    >
      <MessageSquarePlusIcon />
    </ToolbarButton>
  );
}
