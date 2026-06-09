import { createSlateEditor } from "platejs";

import { BaseBasicBlocksKit } from "@/components/editor/plugins/basic-blocks-base-kit";
import { BaseBasicMarksKit } from "@/components/editor/plugins/basic-marks-base-kit";
import { BaseCalloutKit } from "@/components/editor/plugins/callout-base-kit";
import { BaseCodeBlockKit } from "@/components/editor/plugins/code-block-base-kit";
import { CommentBaseKit } from "@/components/editor/plugins/comment-base-kit";
import { BaseLinkKit } from "@/components/editor/plugins/link-base-kit";
import { BaseListKit } from "@/components/editor/plugins/list-base-kit";
import { MathBaseKit } from "@/components/editor/plugins/math-base-kit";
import { BaseMediaKit } from "@/components/editor/plugins/media-base-kit";
import { BaseTableKit } from "@/components/editor/plugins/table-base-kit";
import { BaseTocKit } from "@/components/editor/plugins/toc-base-kit";
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit";
import { EditorStatic } from "@/components/ui/editor-static";
import type { PlateValue } from "@/lib/plate-utils";

const staticPlugins = [
  ...BaseBasicBlocksKit,
  ...BaseBasicMarksKit,
  ...BaseCalloutKit,
  ...BaseCodeBlockKit,
  ...CommentBaseKit,
  ...BaseLinkKit,
  ...BaseListKit,
  ...MathBaseKit,
  ...BaseMediaKit,
  ...BaseTableKit,
  ...BaseTocKit,
  ...MarkdownKit,
];

// Server Component: createSlateEditor runs once on the server, so the node ids
// Plate backfills are fixed in the SSR payload. The client never re-creates the
// editor, eliminating the SSR↔CSR id mismatch (#147). Interactive comment
// leaves embedded in the output hydrate from these server-computed props.
export function WikiStaticContent({ value }: { value: PlateValue }) {
  const editor = createSlateEditor({ plugins: staticPlugins, value });
  return <EditorStatic editor={editor} variant="none" className="text-base" />;
}
