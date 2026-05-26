import { MarkdownPlugin } from "@platejs/markdown";
import remarkGfm from "remark-gfm";

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm],
    },
  }),
];
