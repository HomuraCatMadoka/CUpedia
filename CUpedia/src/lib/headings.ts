import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import type { Heading as MdastHeading, Text } from "mdast";

export type Heading = { id: string; text: string; level: 2 | 3 };

export function headingSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function extractHeadings(markdown: string): Heading[] {
  const tree = unified().use(remarkParse).parse(markdown);
  const headings: Heading[] = [];
  const seen = new Map<string, number>();

  visit(tree, "heading", (node: MdastHeading) => {
    if (node.depth !== 2 && node.depth !== 3) return;
    const text = node.children
      .filter((c): c is Text => c.type === "text")
      .map((c) => c.value)
      .join("");
    let id = headingSlug(text);
    const count = seen.get(id) ?? 0;
    seen.set(id, count + 1);
    if (count > 0) id = `${id}-${count}`;
    headings.push({ id, text, level: node.depth as 2 | 3 });
  });

  return headings;
}
