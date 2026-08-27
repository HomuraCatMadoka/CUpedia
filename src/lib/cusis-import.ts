import { parse, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

export type CusisImportDataset =
  | "current"
  | "history"
  | "cart"
  | "requirements";

export type PersonalCourseRecord = {
  courseCode: string;
  termLabel: string | null;
  academicYear: string | null;
  term: "1" | "2" | "summer" | null;
  status: "completed" | "in-progress" | "waitlisted" | "shopping-cart";
  sourceDataset: Exclude<CusisImportDataset, "requirements">;
};

export type RequirementSnapshotItem = {
  title: string;
  status: "satisfied" | "not-satisfied" | "in-progress" | "unknown";
  candidateCourseCodes: string[];
};

export type CusisImportSnapshot = {
  schemaVersion: "cusis-import-snapshot.v1";
  capturedAt: string;
  sourceKind: "peoplesoft-page-adapter";
  personalCourseRecords: PersonalCourseRecord[];
  requirementSnapshot: {
    items: RequirementSnapshotItem[];
  };
  datasets: Record<CusisImportDataset, CusisDatasetResult>;
};

export type CusisDatasetResult =
  | { status: "parsed"; itemCount: number }
  | { status: "not-provided"; itemCount: 0 }
  | {
      status: "unsupported-page";
      itemCount: 0;
      reason: "unrecognized-table-structure";
    };

export type ParseCusisImportInput = {
  capturedAt: string;
  pages: Partial<Record<CusisImportDataset, string>>;
};

type Table = { headers: string[]; rows: string[][] };

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
    for (const child of node.childNodes) {
      found.push(...elements(child, tagName));
    }
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

function extractTables(html: string): Table[] {
  return elements(parse(html), "table")
    .map((table) =>
      rows(table).map((row) => cells(row).map((cell) => clean(text(cell)))),
    )
    .filter((tableRows) => tableRows.length > 0)
    .map(([headers, ...tableRows]) => ({ headers, rows: tableRows }));
}

function headerIndex(headers: string[], aliases: RegExp[]) {
  return headers.findIndex((header) =>
    aliases.some((alias) => alias.test(header)),
  );
}

function courseCode(value: string) {
  const match = value.toUpperCase().match(/\b([A-Z]{4})\s?(\d{4}[A-Z]?)\b/);
  return match ? `${match[1]}${match[2]}` : null;
}

function courseCodes(value: string) {
  const found = new Set<string>();
  for (const match of value
    .toUpperCase()
    .matchAll(/\b([A-Z]{4})\s?(\d{4}[A-Z]?)\b/g)) {
    found.add(`${match[1]}${match[2]}`);
  }
  return [...found];
}

function courseStatus(
  dataset: "current" | "history" | "cart",
  value: string,
): PersonalCourseRecord["status"] {
  if (dataset === "cart") return "shopping-cart";
  if (/wait/i.test(value)) return "waitlisted";
  if (dataset === "current" || /in[ -]?progress|enrolled/i.test(value)) {
    return "in-progress";
  }
  return "completed";
}

function academicTerm(value: string) {
  const academicYear = value.match(/\b(20\d{2}-\d{2})\b/)?.[1] ?? null;
  const numbered = value.match(/\b(?:regular\s+)?term\s*([12])\b/i)?.[1];
  const term =
    numbered === "1" || numbered === "2"
      ? numbered
      : /\bsummer\b/i.test(value)
        ? "summer"
        : null;
  return { academicYear, term } as const;
}

function parseCourseTable(
  dataset: "current" | "history" | "cart",
  html: string,
) {
  const records: PersonalCourseRecord[] = [];
  let recognized = false;
  for (const table of extractTables(html)) {
    const courseIndex = headerIndex(table.headers, [/^class$/i, /^course$/i]);
    if (courseIndex < 0) continue;
    recognized = true;
    const termIndex = headerIndex(table.headers, [/^term$/i]);
    const statusIndex = headerIndex(table.headers, [/^status$/i]);
    for (const row of table.rows) {
      const code = courseCode(row[courseIndex] ?? "");
      if (!code) continue;
      const termLabel = termIndex >= 0 ? clean(row[termIndex]) || null : null;
      records.push({
        courseCode: code,
        termLabel,
        ...academicTerm(termLabel ?? ""),
        status: courseStatus(
          dataset,
          statusIndex >= 0 ? (row[statusIndex] ?? "") : "",
        ),
        sourceDataset: dataset,
      });
    }
  }
  return { recognized, records };
}

function requirementStatus(value: string): RequirementSnapshotItem["status"] {
  if (/not[ -]?satisfied|unsatisfied|incomplete/i.test(value)) {
    return "not-satisfied";
  }
  if (/in[ -]?progress/i.test(value)) return "in-progress";
  if (/satisfied|complete/i.test(value)) return "satisfied";
  return "unknown";
}

function parseRequirementsTable(html: string) {
  const items: RequirementSnapshotItem[] = [];
  let recognized = false;
  for (const table of extractTables(html)) {
    const titleIndex = headerIndex(table.headers, [/^requirement$/i]);
    const statusIndex = headerIndex(table.headers, [/^status$/i]);
    if (titleIndex < 0 || statusIndex < 0) continue;
    recognized = true;
    const coursesIndex = headerIndex(table.headers, [
      /^courses?$/i,
      /^course options?$/i,
    ]);
    for (const row of table.rows) {
      const title = clean(row[titleIndex]);
      if (!title) continue;
      items.push({
        title,
        status: requirementStatus(row[statusIndex] ?? ""),
        candidateCourseCodes:
          coursesIndex >= 0 ? courseCodes(row[coursesIndex] ?? "") : [],
      });
    }
  }
  return { recognized, items };
}

const missingDataset = () =>
  ({ status: "not-provided", itemCount: 0 }) as const;

/**
 * Converts one user-initiated, read-only CUSIS import into the stable Personal
 * Course Workspace format. Pages may be omitted or fail independently;
 * unrecognized markup is never reported as an empty dataset. The returned
 * snapshot intentionally excludes grades, cookies, raw HTML and PeopleSoft
 * page-state fields. `capturedAt` must be a canonical UTC ISO timestamp.
 */
export function parseCusisImportSnapshot(
  input: ParseCusisImportInput,
): CusisImportSnapshot {
  const capturedAt = new Date(input.capturedAt);
  if (
    Number.isNaN(capturedAt.valueOf()) ||
    capturedAt.toISOString() !== input.capturedAt
  ) {
    throw new Error("INVALID_CUSIS_CAPTURED_AT");
  }
  const current = input.pages.current
    ? parseCourseTable("current", input.pages.current)
    : null;
  const history = input.pages.history
    ? parseCourseTable("history", input.pages.history)
    : null;
  const cart = input.pages.cart
    ? parseCourseTable("cart", input.pages.cart)
    : null;
  const requirements = input.pages.requirements
    ? parseRequirementsTable(input.pages.requirements)
    : null;
  const datasetResult = (
    result: { recognized: boolean } | null,
    itemCount: number,
  ): CusisDatasetResult => {
    if (!result) return missingDataset();
    if (!result.recognized) {
      return {
        status: "unsupported-page",
        itemCount: 0,
        reason: "unrecognized-table-structure",
      };
    }
    return { status: "parsed", itemCount };
  };

  return {
    schemaVersion: "cusis-import-snapshot.v1",
    capturedAt: input.capturedAt,
    sourceKind: "peoplesoft-page-adapter",
    personalCourseRecords: [
      ...(current?.records ?? []),
      ...(history?.records ?? []),
      ...(cart?.records ?? []),
    ],
    requirementSnapshot: { items: requirements?.items ?? [] },
    datasets: {
      current: datasetResult(current, current?.records.length ?? 0),
      history: datasetResult(history, history?.records.length ?? 0),
      cart: datasetResult(cart, cart?.records.length ?? 0),
      requirements: datasetResult(
        requirements,
        requirements?.items.length ?? 0,
      ),
    },
  };
}
