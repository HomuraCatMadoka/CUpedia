import type { TCommentText } from "platejs";
import type { SlateLeafProps } from "platejs/static";
import { SlateLeaf } from "platejs/static";

import { commentLeafId } from "@/lib/comment-leaf-id";
import { cn } from "@/lib/utils";

// Pure server component. PlateStatic injects the Slate editor onto every node's
// props, so a "use client" comment leaf would drag that function-laden editor
// across the server→client boundary and crash RSC serialization (#170). The
// highlight and data-comment-id render fully server-side; the click and active
// state are owned by the page-level CommentInteractionLayer island, which never
// receives the editor.
export function CommentLeafStatic(props: SlateLeafProps<TCommentText>) {
  const { children, leaf } = props;
  const leafId = commentLeafId(leaf);

  return (
    <SlateLeaf {...props}>
      <span
        data-comment-id={leafId ?? undefined}
        className={cn(
          "cursor-pointer border-b-2 border-yellow-400 bg-yellow-100/40 dark:bg-yellow-900/20",
          "data-[comment-active]:bg-yellow-200/60 dark:data-[comment-active]:bg-yellow-800/40",
        )}
      >
        {children}
      </span>
    </SlateLeaf>
  );
}
