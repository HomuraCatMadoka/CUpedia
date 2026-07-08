import { normalizeStaticValue, type Value } from "platejs";

export type PlateValue = Value;

/**
 * Assign deterministic `static-NNNN` ids (and a fixed metadata timestamp) to a
 * value before it is handed to `usePlateEditor`. The edit page renders the
 * `"use client"` editor during SSR *and* re-creates it on hydration; without
 * this both passes backfill their own random nanoid node ids, so React reports
 * a hydration mismatch (e.g. `data-table-cell-id`) and the editor can crash
 * into the error boundary (#204). Running the same source value through this
 * deterministic normalization on both sides yields identical ids. The read
 * path solved the same class of bug differently (server-only `createSlateEditor`
 * + `EditorStatic`, #147); the edit path is interactive so it keeps the client
 * editor and stabilizes the value instead.
 */
export function normalizeInitialValue(
  value: PlateValue | undefined,
): PlateValue | undefined {
  if (value === undefined) return value;
  return normalizeStaticValue(value) as PlateValue;
}

const EMPTY_VALUE: PlateValue = [
  { type: "p", children: [{ text: "" }] },
] as PlateValue;

export function parseContent(content: string): PlateValue {
  if (!content.trim()) return EMPTY_VALUE;
  try {
    return JSON.parse(content) as PlateValue;
  } catch {
    // Legacy/non-JSON (e.g. raw markdown) content: degrade to a plain-text
    // paragraph instead of crashing the editor/render route.
    return [{ type: "p", children: [{ text: content }] }] as PlateValue;
  }
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
  let nodes: Node[];
  try {
    nodes = JSON.parse(content) as Node[];
  } catch {
    return content;
  }
  return nodes.map((n) => collectText(n.children ?? [])).join("\n");
}

async function createHeadlessEditor() {
  const { createSlateEditor, BaseParagraphPlugin } = await import("platejs");
  const { MarkdownPlugin, remarkMdx } = await import("@platejs/markdown");
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
  const { BaseCalloutPlugin } = await import("@platejs/callout");
  const { BaseTocPlugin } = await import("@platejs/toc");
  const { BaseEquationPlugin, BaseInlineEquationPlugin } =
    await import("@platejs/math");
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
  const remarkMath = (await import("remark-math")).default;
  const { calloutMarkdownRules } =
    await import("@/components/editor/plugins/markdown-kit");

  return createSlateEditor({
    plugins: [
      BaseParagraphPlugin,
      BaseCalloutPlugin,
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
      BaseTocPlugin,
      BaseEquationPlugin,
      BaseInlineEquationPlugin,
      MarkdownPlugin.configure({
        options: {
          remarkPlugins: [remarkGfm, remarkMdx, remarkMath],
          rules: calloutMarkdownRules,
        },
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
