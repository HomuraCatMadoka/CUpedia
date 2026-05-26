import {
  BaseH1Plugin,
  BaseH2Plugin,
  BaseH3Plugin,
  BaseH4Plugin,
  BaseH5Plugin,
  BaseH6Plugin,
  BaseBlockquotePlugin,
  BaseHorizontalRulePlugin,
  BaseBoldPlugin,
  BaseItalicPlugin,
  BaseUnderlinePlugin,
  BaseCodePlugin,
  BaseStrikethroughPlugin,
} from "@platejs/basic-nodes";
import { BaseCodeBlockPlugin, BaseCodeLinePlugin } from "@platejs/code-block";
import { BaseLinkPlugin } from "@platejs/link";
import { BaseListPlugin } from "@platejs/list";
import { BaseImagePlugin } from "@platejs/media";
import {
  BaseTablePlugin,
  BaseTableRowPlugin,
  BaseTableCellPlugin,
  BaseTableCellHeaderPlugin,
} from "@platejs/table";
import { MarkdownPlugin } from "@platejs/markdown";
import { createSlateEditor, BaseParagraphPlugin } from "platejs";
import remarkGfm from "remark-gfm";

function createHeadlessEditor() {
  return createSlateEditor({
    plugins: [
      BaseParagraphPlugin,
      BaseH1Plugin,
      BaseH2Plugin,
      BaseH3Plugin,
      BaseH4Plugin,
      BaseH5Plugin,
      BaseH6Plugin,
      BaseBlockquotePlugin,
      BaseHorizontalRulePlugin,
      BaseBoldPlugin,
      BaseItalicPlugin,
      BaseUnderlinePlugin,
      BaseCodePlugin,
      BaseStrikethroughPlugin,
      BaseCodeBlockPlugin,
      BaseCodeLinePlugin,
      BaseLinkPlugin,
      BaseListPlugin,
      BaseImagePlugin,
      BaseTablePlugin,
      BaseTableRowPlugin,
      BaseTableCellPlugin,
      BaseTableCellHeaderPlugin,
      MarkdownPlugin.configure({
        options: { remarkPlugins: [remarkGfm] },
      }),
    ],
  });
}

import type { Value } from "platejs";

export type PlateValue = Value;

function isPlateJson(content: string): boolean {
  if (!content.startsWith("[")) return false;
  try {
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) && parsed.length > 0 && "type" in parsed[0];
  } catch {
    return false;
  }
}

export function deserializeContent(content: string): PlateValue {
  if (!content.trim())
    return [{ type: "p", children: [{ text: "" }] }] as PlateValue;
  if (isPlateJson(content)) return JSON.parse(content) as PlateValue;

  const editor = createHeadlessEditor();
  return editor.api.markdown.deserialize(content) as PlateValue;
}

export function serializeToMarkdown(value: PlateValue): string {
  const editor = createHeadlessEditor();
  return editor.api.markdown.serialize({ value } as never);
}
