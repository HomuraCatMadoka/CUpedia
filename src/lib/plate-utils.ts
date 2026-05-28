import type { Value } from "platejs";

export type PlateValue = Value;

const EMPTY_VALUE: PlateValue = [
  { type: "p", children: [{ text: "" }] },
] as PlateValue;

export function parseContent(content: string): PlateValue {
  if (!content.trim()) return EMPTY_VALUE;
  return JSON.parse(content) as PlateValue;
}

type Node = { text?: string; children?: Node[] };

function collectText(nodes: Node[]): string {
  const parts: string[] = [];
  for (const node of nodes) {
    if (typeof node.text === "string") {
      parts.push(node.text);
    } else if (node.children) {
      parts.push(collectText(node.children));
    }
  }
  return parts.join("");
}

export function extractText(content: string): string {
  if (!content.trim()) return "";
  const nodes = JSON.parse(content) as Node[];
  return nodes.map((n) => collectText(n.children ?? [])).join("\n");
}

async function createHeadlessEditor() {
  const { createSlateEditor, BaseParagraphPlugin } = await import("platejs");
  const { MarkdownPlugin } = await import("@platejs/markdown");
  const {
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
  } = await import("@platejs/basic-nodes");
  const { BaseCodeBlockPlugin, BaseCodeLinePlugin } =
    await import("@platejs/code-block");
  const { BaseLinkPlugin } = await import("@platejs/link");
  const { BaseListPlugin } = await import("@platejs/list");
  const { BaseImagePlugin } = await import("@platejs/media");
  const {
    BaseTablePlugin,
    BaseTableRowPlugin,
    BaseTableCellPlugin,
    BaseTableCellHeaderPlugin,
  } = await import("@platejs/table");
  const remarkGfm = (await import("remark-gfm")).default;

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

export async function toMarkdown(content: string): Promise<string> {
  if (!content.trim()) return "";
  const editor = await createHeadlessEditor();
  const value = JSON.parse(content) as PlateValue;
  return editor.api.markdown.serialize({ value } as never);
}

export async function fromMarkdown(markdown: string): Promise<string> {
  if (!markdown.trim()) return JSON.stringify(EMPTY_VALUE);
  const editor = await createHeadlessEditor();
  const value = editor.api.markdown.deserialize(markdown);
  return JSON.stringify(value);
}
