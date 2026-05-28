import { parseContent } from "./plate-utils";

export type Heading = { id: string; text: string; level: 2 | 3 };

export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type SlateNode = {
  type?: string;
  text?: string;
  children?: SlateNode[];
};

function extractText(node: SlateNode): string {
  if (typeof node.text === "string") return node.text;
  if (!node.children) return "";
  return node.children.map(extractText).join("");
}

export function extractHeadingsFromNodes(nodes: SlateNode[]): Heading[] {
  const headings: Heading[] = [];
  const seen = new Map<string, number>();

  for (const node of nodes) {
    if (node.type !== "h2" && node.type !== "h3") continue;
    const text = extractText(node);
    if (!text.trim()) continue;

    let id = headingSlug(text);
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count}`;

    headings.push({ id, text, level: node.type === "h2" ? 2 : 3 });
  }

  return headings;
}

export function extractHeadings(content: string): Heading[] {
  if (!content.trim()) return [];
  const nodes = parseContent(content) as SlateNode[];
  return extractHeadingsFromNodes(nodes);
}
