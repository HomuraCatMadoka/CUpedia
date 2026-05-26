"use client";

import { usePlateEditor, Plate } from "platejs/react";

import { BasicNodesKit } from "@/components/editor/plugins/basic-nodes-kit";
import { CodeBlockKit } from "@/components/editor/plugins/code-block-kit";
import { LinkKit } from "@/components/editor/plugins/link-kit";
import { ListKit } from "@/components/editor/plugins/list-kit";
import { MediaKit } from "@/components/editor/plugins/media-kit";
import { TableKit } from "@/components/editor/plugins/table-kit";
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit";
import { EditorContainer, Editor } from "@/components/ui/editor";
import type { PlateValue } from "@/lib/plate-utils";

export function WikiRenderer({ value }: { value: PlateValue }) {
  const editor = usePlateEditor({
    plugins: [
      ...BasicNodesKit,
      ...CodeBlockKit,
      ...LinkKit,
      ...ListKit,
      ...MediaKit,
      ...TableKit,
      ...MarkdownKit,
    ],
    value,
  });

  return (
    <Plate editor={editor} readOnly>
      <EditorContainer>
        <Editor variant="fullWidth" />
      </EditorContainer>
    </Plate>
  );
}
