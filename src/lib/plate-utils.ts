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
