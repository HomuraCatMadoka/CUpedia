import { parseContent, type PlateValue } from "./plate-utils";

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

// The read view renders the page title in its header, so a body whose first h1
// repeats it shows the title twice. Drop that h1 for display only (stored
// content is untouched). The first h1 may trail a leading toc node, so scan for
// it rather than assuming index 0; only strip when it matches the title. #149
export function stripTitleHeading(
  value: PlateValue,
  title: string,
): PlateValue {
  const idx = value.findIndex((n) => (n as SlateNode).type === "h1");
  if (idx === -1) return value;
  if (extractText(value[idx] as SlateNode).trim() !== title.trim())
    return value;
  return [...value.slice(0, idx), ...value.slice(idx + 1)];
}
