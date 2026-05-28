import { MarkdownPlugin, convertNodesSerialize } from "@platejs/markdown";
import remarkGfm from "remark-gfm";

const VARIANT_LABEL: Record<string, string> = {
  note: "NOTE",
  info: "NOTE",
  tip: "TIP",
  success: "TIP",
  warning: "WARNING",
  error: "CAUTION",
};

export const calloutMarkdownRules = {
  callout: {
    serialize: (
      node: { variant?: string; children?: unknown[] },
      opts: unknown,
    ) => {
      const label = VARIANT_LABEL[node.variant ?? "note"] ?? "NOTE";
      const inner = convertNodesSerialize(
        (node.children ?? []) as never,
        opts as never,
        false,
      );
      return {
        type: "blockquote" as const,
        children: [
          {
            type: "paragraph" as const,
            children: [{ type: "text" as const, value: `[!${label}]` }],
          },
          ...inner,
        ],
      };
    },
  },
};

export const MarkdownKit = [
  MarkdownPlugin.configure({
    options: {
      remarkPlugins: [remarkGfm],
      rules: calloutMarkdownRules,
    },
  }),
];
