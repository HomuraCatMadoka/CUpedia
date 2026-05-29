import type { SlateLeafProps } from "platejs/static";
import { SlateLeaf } from "platejs/static";

export function CommentLeafStatic(props: SlateLeafProps) {
  return (
    <SlateLeaf
      {...props}
      className="border-b-2 border-yellow-400 bg-yellow-100/40 dark:bg-yellow-900/20"
    >
      {props.children}
    </SlateLeaf>
  );
}
