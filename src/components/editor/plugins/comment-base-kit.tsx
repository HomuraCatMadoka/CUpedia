import { BaseCommentPlugin } from "@platejs/comment";
import { CommentLeafStatic } from "@/components/ui/comment-leaf-static";

export const CommentBaseKit = [
  BaseCommentPlugin.withComponent(CommentLeafStatic),
];
