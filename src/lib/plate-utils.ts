import type { Value } from "platejs";

export type PlateValue = Value;

const EMPTY_VALUE: PlateValue = [
  { type: "p", children: [{ text: "" }] },
] as PlateValue;

export function parseContent(content: string): PlateValue {
  if (!content.trim()) return EMPTY_VALUE;
  return JSON.parse(content) as PlateValue;
}
