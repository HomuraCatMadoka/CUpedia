import { parse, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

export type HandbookRequirementRow = {
  marker: string;
  text: string;
  units: number | null;
};

export type HandbookRequirementTable = {
  totalUnits: number | null;
  rows: HandbookRequirementRow[];
};

export type HandbookRequirementSection = {
  marker: string;
  heading: string;
  units: number | null;
  rows: HandbookRequirementRow[];
};

const clean = (value: string | null | undefined) =>
  (value ?? "").replace(/\s+/g, " ").trim();

const text = (node: Node): string => {
  if ("value" in node) return node.value;
  return "childNodes" in node ? node.childNodes.map(text).join(" ") : "";
};

const elements = (node: Node, tagName: string): Element[] => {
  const found: Element[] = [];
  if ("tagName" in node && node.tagName === tagName) found.push(node);
  if ("childNodes" in node) {
    for (const child of node.childNodes)
      found.push(...elements(child, tagName));
  }
  return found;
};

const rows = (table: Element): Element[] => {
  const found: Element[] = [];
  const visit = (node: Node) => {
    if (node !== table && "tagName" in node && node.tagName === "table") return;
    if ("tagName" in node && node.tagName === "tr") found.push(node);
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(table);
  return found;
};

const cells = (row: Element) =>
  row.childNodes.filter(
    (node): node is Element =>
      "tagName" in node && (node.tagName === "td" || node.tagName === "th"),
  );

export function extractPrincipalRequirementTable(
  html: string,
): HandbookRequirementTable | null {
  const document = parse(html);
  const candidates = elements(document, "table")
    .filter((table) => {
      const ownRows = rows(table);
      return (
        /minimum of\s+\d+(?:\s*\[[^\]]+\])?\s*units/i.test(
          clean(text(table)),
        ) &&
        ownRows.some((row) => /^\d+\s*\.$/.test(clean(text(cells(row)[0]))))
      );
    })
    .map((table) => {
      const heading = clean(text(rows(table)[0]));
      const score =
        heading === "Major Programme Requirement"
          ? 2
          : /^Major Programme Requirement\b(?!\s*\()/i.test(heading)
            ? 1
            : 0;
      return { table, score };
    });
  const table = candidates.sort(
    (a, b) => b.score - a.score || rows(b.table).length - rows(a.table).length,
  )[0]?.table;
  if (!table) return null;

  const total = clean(text(table)).match(
    /minimum of\s+(\d+)(?:\s*\[[^\]]+\])?\s*units/i,
  );
  const result: HandbookRequirementRow[] = [];
  let started = false;
  for (const row of rows(table)) {
    const values = cells(row).map((cell) => clean(text(cell)));
    const marker = values[0] ?? "";
    const value =
      values.length > 1
        ? values.slice(1, -1).join(" ").trim()
        : (values[0] ?? "");
    const unitsText = values.length > 1 ? values.at(-1)! : "";
    const combined = values.join(" ").trim();
    if (!started) {
      started = /^\d+\s*\.$/.test(marker);
      if (!started) continue;
    }
    if (
      /^(?:Total\s*:|Explanatory Notes?\s*:)/i.test(combined) ||
      /^Streams$/i.test(combined)
    ) {
      break;
    }
    if (!marker && !value && !unitsText) continue;
    const units = unitsText.match(/^(\d+)(?:\s*\[[a-z]\])?$/i);
    result.push({
      marker,
      text: value,
      units: units ? Number(units[1]) : null,
    });
  }
  return { totalUnits: total ? Number(total[1]) : null, rows: result };
}

export function groupRequirementSections(
  table: HandbookRequirementTable,
): HandbookRequirementSection[] {
  const sections: HandbookRequirementSection[] = [];
  for (const row of table.rows) {
    if (/^\d+\s*\.\s*$/.test(row.marker)) {
      const embeddedUnits = row.text.match(/^(.*?):\s*(\d{1,3})\s*$/);
      const heading = (embeddedUnits?.[1] ?? row.text)
        .replace(/\bC\s+ourses\b/gi, "Courses")
        .replace(/\s*\([^)]*(?:units?|level)[^)]*\)\s*(?:\[[a-z]\])?\s*$/i, "")
        .replace(/\s*\[[a-z]\]\s*$/i, "")
        .replace(/:\s*$/, "")
        .trim();
      sections.push({
        marker: row.marker.replace(/\s/g, ""),
        heading,
        units: row.units ?? (embeddedUnits ? Number(embeddedUnits[2]) : null),
        rows: [],
      });
      continue;
    }
    sections.at(-1)?.rows.push(row);
  }
  return sections;
}
