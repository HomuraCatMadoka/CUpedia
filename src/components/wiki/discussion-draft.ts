"use client";

import { BaseCommentPlugin, getDraftCommentKey } from "@platejs/comment";
import type { PlateEditor } from "platejs/react";

export function serializeContentWithoutDraftComments(value: unknown) {
  const draftKey = getDraftCommentKey();
  const commentKey = BaseCommentPlugin.key;

  const removeDraftMarks = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) {
      return candidate
        .filter(
          (item) =>
            !(
              item &&
              typeof item === "object" &&
              (item as Record<string, unknown>).type === "wiki_link_input"
            ),
        )
        .map(removeDraftMarks);
    }
    if (!candidate || typeof candidate !== "object") return candidate;

    const record = candidate as Record<string, unknown>;
    const isDraft = Boolean(record[draftKey]);
    const hasPersistedComment = Object.entries(record).some(
      ([key, value]) =>
        key !== draftKey && key.startsWith(`${commentKey}_`) && Boolean(value),
    );
    return Object.fromEntries(
      Object.entries(record)
        .filter(
          ([key]) =>
            key !== draftKey &&
            !(isDraft && !hasPersistedComment && key === commentKey),
        )
        .map(([key, nested]) => [key, removeDraftMarks(nested)]),
    );
  };

  return JSON.stringify(removeDraftMarks(value));
}

export function clearDraftCommentMarks(editor: PlateEditor) {
  const commentApi = editor.getApi(BaseCommentPlugin);

  editor.tf.withoutNormalizing(() => {
    for (const [node] of commentApi.comment.nodes({ isDraft: true })) {
      editor.tf.setNodes(
        { [getDraftCommentKey()]: undefined },
        { at: [], match: (candidate) => candidate === node },
      );
    }
  });
}
