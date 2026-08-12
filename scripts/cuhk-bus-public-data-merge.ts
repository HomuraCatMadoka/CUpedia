/**
 * Research snapshot generator for public CUHK bus data.
 *
 * Fetches public primary sources, retains content-addressed provenance, and
 * produces conservative merged entities. Raw source bodies are not persisted.
 */
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { parse } from "parse5";
import { format } from "prettier";

type HtmlNode = {
  nodeName: string;
  childNodes?: HtmlNode[];
  attrs?: Array<{ name: string; value: string }>;
  value?: string;
};

type WpItem = {
  id: number;
  slug: string;
  link: string;
  modified: string;
  date: string;
  title: { rendered: string };
};

type SourceSnapshot = {
  snapshotId: string;
  sourceId: string;
  kind: string;
  url: string;
  fetchedAt: string;
  sha256: string;
  byteLength: number;
  contentType: string | null;
  lastModified: string | null;
  licenseNote: string;
};

type FetchResult = {
  snapshot: SourceSnapshot;
  bytes: Uint8Array;
  headers: Headers;
};

type OfficialStop = {
  stopId: string;
  officialPostId: number;
  slug: string;
  nameEn: string;
  nameZhHant: string;
  modifiedAt: string;
  sourceRef: string;
  sourceRefZhHant: string;
};

type MatchResult = {
  status: "auto" | "review" | "unmatched";
  stopId: string | null;
  score: number;
  candidates: Array<{ stopId: string; nameEn: string; score: number }>;
};

type SourceStopRecord = {
  recordId: string;
  sourceKind:
    | "official_route_html"
    | "official_route_html_zh_hant"
    | "official_campus_map"
    | "bus_clock"
    | "openstreetmap";
  sourceName: string;
  sourceRef: string;
  externalId: string | number | null;
  coordinates: { latitude: number; longitude: number } | null;
  sourceMetadata: Record<string, string | null> | null;
  match: MatchResult;
};

const BASE = "https://transport.cuhk.edu.hk";
const BUS_CLOCK_COMMIT = "575adc5475fc115001c30d9b5d5373384791c1f6";
const BUS_CLOCK_RAW = `https://raw.githubusercontent.com/CCheukKa/CUHK-bus-clock/${BUS_CLOCK_COMMIT}`;
const CUHK_CAMPUS_MAP_URL =
  "https://www.cuhk.edu.hk/english/campus/cuhk-campus-map.html?area=shuttle+bus";
const CUHK_CAMPUS_MAP_DATA_URL =
  "https://www.cuhk.edu.hk/english/js/campus/cuhk_location_db.js?20161006";
const PARSER_VERSION = "cuhk-public-data-merge/6";
const OUTPUT_JSON = resolve(
  "docs/campus-transport/data/cuhk-public-data/merged.snapshot.json",
);
const OUTPUT_REPORT = resolve(
  "docs/campus-transport/data/cuhk-public-data/README.md",
);
const execFile = promisify(execFileCallback);

const REVIEWED_NUMBERED_ROUTE_PATTERNS: Record<
  string,
  {
    sourceDocumentId: string;
    pdfPages: number[];
    stopIds: string[];
    conditionalStops: Array<{
      stopId: string;
      serviceWindow: string;
      excludedDayTypes: string[];
    }>;
  }
> = {
  up: {
    sourceDocumentId: "paid-current",
    pdfPages: [1, 2],
    stopIds: [
      "cuhk-wp-stop-4248",
      "cuhk-wp-stop-3540",
      "cuhk-wp-stop-3542",
      "cuhk-wp-stop-3544",
      "cuhk-wp-stop-3548",
      "cuhk-wp-stop-2544",
      "cuhk-wp-stop-3550",
      "cuhk-wp-stop-2814",
      "cuhk-wp-stop-2816",
      "cuhk-wp-stop-7521",
      "cuhk-wp-stop-3552",
      "cuhk-wp-stop-3554",
      "cuhk-wp-stop-2830",
      "cuhk-wp-stop-2924",
      "cuhk-wp-stop-3556",
    ],
    conditionalStops: [
      {
        stopId: "cuhk-wp-stop-3548",
        serviceWindow: "Monday-Friday 08:30-17:30",
        excludedDayTypes: ["public_holiday", "university_holiday"],
      },
    ],
  },
  down: {
    sourceDocumentId: "paid-current",
    pdfPages: [1, 2],
    stopIds: [
      "cuhk-wp-stop-3556",
      "cuhk-wp-stop-2924",
      "cuhk-wp-stop-2830",
      "cuhk-wp-stop-2828",
      "cuhk-wp-stop-7526",
      "cuhk-wp-stop-7523",
      "cuhk-wp-stop-2818",
      "cuhk-wp-stop-2548",
      "cuhk-wp-stop-7514",
      "cuhk-wp-stop-3569",
      "cuhk-wp-stop-3544",
      "cuhk-wp-stop-3542",
      "cuhk-wp-stop-3572",
      "cuhk-wp-stop-4729",
      "cuhk-wp-stop-4248",
    ],
    conditionalStops: [
      {
        stopId: "cuhk-wp-stop-7514",
        serviceWindow: "Monday-Friday 08:45-17:45",
        excludedDayTypes: ["public_holiday", "university_holiday"],
      },
    ],
  },
};

type ReviewedVisualPatternDefinition = {
  patternId: string;
  busClockVariantIds: string[];
  officialMapExcludedBusClockStationNames?: string[];
  sourceConflictNote?: string;
  activation: {
    departureMinutes: number[];
    serviceDayType:
      | "scheduled_service_day"
      | "teaching_day"
      | "non_teaching_day";
  };
};

const REVIEWED_VISUAL_ROUTE_PATTERNS: Record<
  string,
  ReviewedVisualPatternDefinition[]
> = {
  "1a": [
    {
      patternId: "1a:default",
      busClockVariantIds: ["1A"],
      activation: {
        departureMinutes: [10, 20, 40, 50],
        serviceDayType: "scheduled_service_day",
      },
    },
  ],
  "1b": [
    {
      patternId: "1b:via-pgh1",
      busClockVariantIds: ["1B"],
      activation: {
        departureMinutes: [0, 30],
        serviceDayType: "scheduled_service_day",
      },
    },
  ],
  "2": [
    {
      patternId: "2:default",
      busClockVariantIds: ["2"],
      activation: {
        departureMinutes: [15, 30],
        serviceDayType: "scheduled_service_day",
      },
    },
    {
      patternId: "2:via-shaw-hall",
      busClockVariantIds: ["2+"],
      activation: {
        departureMinutes: [0, 45],
        serviceDayType: "scheduled_service_day",
      },
    },
  ],
  "3": [
    {
      patternId: "3:default",
      busClockVariantIds: ["3"],
      activation: {
        departureMinutes: [0, 20, 40],
        serviceDayType: "scheduled_service_day",
      },
    },
  ],
  "4": [
    {
      patternId: "4:default",
      busClockVariantIds: ["4"],
      activation: {
        departureMinutes: [10, 30, 50],
        serviceDayType: "scheduled_service_day",
      },
    },
  ],
  "5": [
    {
      patternId: "5:default",
      busClockVariantIds: ["5", "5*"],
      activation: {
        departureMinutes: [18, 22, 26],
        serviceDayType: "teaching_day",
      },
    },
  ],
  "6a": [
    {
      patternId: "6a:default",
      busClockVariantIds: ["6A", "6A*"],
      activation: {
        departureMinutes: [10],
        serviceDayType: "teaching_day",
      },
    },
  ],
  "6b": [
    {
      patternId: "6b:default",
      busClockVariantIds: ["6B"],
      activation: {
        departureMinutes: [20],
        serviceDayType: "teaching_day",
      },
    },
  ],
  "7": [
    {
      patternId: "7:default",
      busClockVariantIds: ["7", "7*"],
      activation: {
        departureMinutes: [18, 50],
        serviceDayType: "teaching_day",
      },
    },
  ],
  "8": [
    {
      patternId: "8:teaching-day",
      busClockVariantIds: ["8"],
      activation: {
        departureMinutes: [0, 20, 40],
        serviceDayType: "teaching_day",
      },
    },
    {
      patternId: "8:non-teaching-day",
      busClockVariantIds: ["8*"],
      activation: {
        departureMinutes: [0, 20, 40],
        serviceDayType: "non_teaching_day",
      },
    },
  ],
  n: [
    {
      patternId: "n:default",
      busClockVariantIds: ["N"],
      activation: {
        departureMinutes: [15, 30, 45],
        serviceDayType: "scheduled_service_day",
      },
    },
    {
      patternId: "n:00-via-pgh1",
      busClockVariantIds: ["N+"],
      activation: {
        departureMinutes: [0],
        serviceDayType: "scheduled_service_day",
      },
    },
  ],
  h: [
    {
      patternId: "h:default",
      busClockVariantIds: ["H"],
      activation: {
        departureMinutes: [20, 40],
        serviceDayType: "scheduled_service_day",
      },
    },
    {
      patternId: "h:00-via-pgh1-area39",
      busClockVariantIds: ["H+"],
      activation: {
        departureMinutes: [0],
        serviceDayType: "scheduled_service_day",
      },
    },
  ],
};

const MONTHS = new Map(
  [
    "january",
    "february",
    "march",
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
  ].map((month, index) => [month, index + 1]),
);
for (const [short, month] of [
  ["jan", 1],
  ["feb", 2],
  ["mar", 3],
  ["apr", 4],
  ["jun", 6],
  ["jul", 7],
  ["aug", 8],
  ["sep", 9],
  ["sept", 9],
  ["oct", 10],
  ["nov", 11],
  ["dec", 12],
] as const) {
  MONTHS.set(short, month);
}

function text(node: HtmlNode): string {
  if (node.nodeName === "#text") return node.value ?? "";
  return (node.childNodes ?? [])
    .map(text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function attr(node: HtmlNode, name: string): string | undefined {
  return node.attrs?.find((item) => item.name === name)?.value;
}

function hasClass(node: HtmlNode, className: string): boolean {
  return (attr(node, "class") ?? "").split(/\s+/).includes(className);
}

function findAll(
  node: HtmlNode,
  predicate: (candidate: HtmlNode) => boolean,
): HtmlNode[] {
  return [
    ...(predicate(node) ? [node] : []),
    ...(node.childNodes ?? []).flatMap((child) => findAll(child, predicate)),
  ];
}

function decodeHtml(value: string): string {
  const document = parse(`<p>${value}</p>`) as unknown as HtmlNode;
  const paragraph = findAll(document, (node) => node.nodeName === "p")[0];
  return paragraph ? text(paragraph) : value;
}

function sha256(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function asString(source: FetchResult): string {
  return new TextDecoder().decode(source.bytes);
}

async function fetchSource(
  sourceId: string,
  kind: string,
  url: string,
  licenseNote: string,
  init?: RequestInit,
): Promise<FetchResult> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "user-agent": "CUpedia-public-data-research/1.0",
          ...init?.headers,
        },
      });
      if (!response.ok) throw new Error(`${response.status} ${url}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const digest = sha256(bytes);
      return {
        bytes,
        headers: response.headers,
        snapshot: {
          snapshotId: `${sourceId}:${digest}`,
          sourceId,
          kind,
          url,
          fetchedAt: new Date().toISOString(),
          sha256: digest,
          byteLength: bytes.byteLength,
          contentType: response.headers.get("content-type"),
          lastModified: response.headers.get("last-modified"),
          licenseNote,
        },
      };
    } catch (error) {
      lastError = error;
      if (attempt < 3)
        await new Promise((resolveWait) => setTimeout(resolveWait, 750));
    }
  }
  throw lastError;
}

async function fetchWpCollection(
  sourceId: string,
  restBase: string,
  query = "",
  sitePrefix = "",
): Promise<{ items: WpItem[]; sources: FetchResult[] }> {
  const items: WpItem[] = [];
  const sources: FetchResult[] = [];
  let page = 1;
  let totalPages = 1;
  do {
    const separator = query ? "&" : "";
    const url = `${BASE}${sitePrefix}/wp-json/wp/v2/${restBase}?per_page=100${separator}${query}&page=${page}`;
    const source = await fetchSource(
      `${sourceId}-page-${page}`,
      `${restBase}_index_json`,
      url,
      "Publicly accessible CUHK content; reuse permission not explicitly granted.",
    );
    sources.push(source);
    items.push(...(JSON.parse(asString(source)) as WpItem[]));
    totalPages = Number(source.headers.get("x-wp-totalpages") ?? 1);
    page++;
  } while (page <= totalPages);
  return { items, sources };
}

function parseDepartureMinutes(departureNode: HtmlNode | undefined): {
  departureMinutes: number[];
  departureRuleRaw: string;
  departureRemarkRaw: string | null;
} {
  if (!departureNode) {
    return {
      departureMinutes: [],
      departureRuleRaw: "",
      departureRemarkRaw: null,
    };
  }

  // Official minutes live in `.rb-large`. Remarks after <br> often contain
  // numbers (e.g. "31 to 00", "Fare $5.5") that must not become departure mins.
  const large = findAll(departureNode, (node) => hasClass(node, "rb-large"))[0];
  const minuteSource = large ? text(large) : text(departureNode);
  const fullText = text(departureNode).replace(
    /^Departure Time \(mins\)\s*/i,
    "",
  );
  const remark = fullText
    .replace(minuteSource, "")
    .replace(/^[\s,;:：＃#]+/, "")
    .trim();

  // Accept only 0-59 values that look like clock minutes in the official list.
  // Prefer comma/space-separated tokens after optional "Every"/"＃".
  const tokenMatches = [
    ...minuteSource.matchAll(/(?:^|[\s,;＃#/])([0-5]?\d)(?=[\s,;＃#/]|$)/g),
  ].map((match) => Number(match[1]));
  const unique = [...new Set(tokenMatches)].filter(
    (minute) => Number.isInteger(minute) && minute >= 0 && minute <= 59,
  );

  return {
    departureMinutes: unique,
    departureRuleRaw: fullText,
    departureRemarkRaw: remark || null,
  };
}

function parseScheduleBands(document: HtmlNode) {
  const windows = findAll(document, (node) => hasClass(node, "rb-2-1"));
  const departures = findAll(document, (node) => hasClass(node, "rb-2-2"));
  return windows.map((windowNode, index) => {
    const serviceRuleRaw = text(windowNode).replace(/^Service Hours\s*/i, "");
    const departureNode = departures[index];
    const { departureMinutes, departureRuleRaw, departureRemarkRaw } =
      parseDepartureMinutes(departureNode);
    const range = serviceRuleRaw.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
    return {
      sourceOrdinal: index,
      startTime: range?.[1] ?? null,
      endTime: range?.[2] ?? null,
      departureMinutes,
      serviceRuleRaw,
      departureRuleRaw,
      departureRemarkRaw,
      parseStatus:
        range && departureMinutes.length
          ? ("parsed" as const)
          : ("manual_review_required" as const),
    };
  });
}

function parseRoutePage(source: FetchResult, item: WpItem) {
  const document = parse(asString(source)) as unknown as HtmlNode;
  const stopNodes = [
    ...findAll(document, (node) => hasClass(node, "route-stop-text")),
    ...findAll(document, (node) => hasClass(node, "route-stop-bottom-text")),
  ];
  const stopNames = stopNodes
    .map((node) => text(node))
    .map((name) => name.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return {
    routeId: item.slug,
    officialPostId: item.id,
    name: decodeHtml(item.title.rendered),
    modifiedAt: item.modified,
    sourceRef: source.snapshot.snapshotId,
    scheduleBands: parseScheduleBands(document),
    visualStopNames: stopNames,
    sequenceStatus: "manual_review_required_visual_layout" as const,
  };
}

function parseLocalizedRoutePage(
  source: FetchResult,
  item: WpItem,
  locale: "zh-Hant",
) {
  const route = parseRoutePage(source, item);
  const document = parse(asString(source)) as unknown as HtmlNode;
  const pageTitle =
    findAll(document, (node) => node.nodeName === "title")
      .map((node) => text(node))
      .find(Boolean) ?? null;
  return { ...route, locale, pageTitle };
}

async function withTemporaryFile<T>(
  extension: string,
  bytes: Uint8Array,
  run: (path: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(resolve(tmpdir(), "cuhk-public-data-"));
  const path = resolve(directory, `source.${extension}`);
  try {
    await writeFile(path, bytes);
    return await run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function extractPdfEvidence(source: FetchResult) {
  const extracted = await withTemporaryFile(
    "pdf",
    source.bytes,
    async (path) => {
      const result = await execFile("pdftotext", ["-layout", path, "-"]);
      return result.stdout;
    },
  );
  const normalized = extracted.replace(/[‐‑‒–—]/g, "-").replace(/\s+/g, " ");
  const scheduleWindows = [
    ...normalized.matchAll(/\b(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\b/g),
  ].map((match) => `${match[1]}-${match[2]}`);
  const effective = normalized.match(
    /Effective\s*:\s*([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i,
  );
  return {
    sourceRef: source.snapshot.snapshotId,
    extractedTextLength: extracted.length,
    extractedTextSha256: sha256(extracted),
    scheduleWindows: [...new Set(scheduleWindows)].sort(),
    effectiveDateRaw: effective?.[0] ?? null,
    extractionStatus:
      extracted.trim().length > 50 ? "text_extracted" : "image_or_sparse_text",
  };
}

function isoDate(day: string, month: string, year: string): string {
  const monthNumber = MONTHS.get(month.toLowerCase());
  if (!monthNumber) throw new Error(`Unknown month: ${month}`);
  return `${year}-${String(monthNumber).padStart(2, "0")}-${String(Number(day)).padStart(2, "0")}`;
}

function parseDateRange(value: string) {
  const match = value.match(
    /(\d{1,2})\s+([A-Za-z]+)\s+(\d{4}).*?[–-]\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/,
  );
  return match
    ? {
        startDate: isoDate(match[1], match[2], match[3]),
        endDate: isoDate(match[4], match[5], match[6]),
      }
    : null;
}

function parseAcademicCalendar(source: FetchResult) {
  const document = parse(asString(source)) as unknown as HtmlNode;
  const table = findAll(document, (node) => node.nodeName === "table").find(
    (candidate) => {
      const content = text(candidate);
      return (
        content.includes("First term") &&
        content.includes("Second term") &&
        content.includes("Reading Week")
      );
    },
  );
  if (!table) {
    return {
      sourceRef: source.snapshot.snapshotId,
      parseStatus: "manual_review_required" as const,
      firstTerm: null,
      secondTerm: null,
      readingWeek: null,
    };
  }
  const rows = findAll(table, (node) => node.nodeName === "tr").map((row) =>
    findAll(row, (node) => node.nodeName === "td").map((cell) => text(cell)),
  );
  const rangeFor = (label: string) => {
    const row = rows.find((cells) => cells[0]?.trim() === label);
    return row?.[1] ? parseDateRange(row[1]) : null;
  };
  const firstTerm = rangeFor("First term");
  const secondTerm = rangeFor("Second term");
  const readingWeek = rangeFor("Reading Week");
  return {
    sourceRef: source.snapshot.snapshotId,
    parseStatus:
      firstTerm && secondTerm && readingWeek
        ? ("parsed_as_calendar_evidence" as const)
        : ("manual_review_required" as const),
    firstTerm,
    secondTerm,
    readingWeek,
  };
}

function parsePublicHolidays(source: FetchResult, cutoff: string) {
  const parsed = JSON.parse(asString(source)) as {
    vcalendar?: Array<{
      vevent?: Array<{
        dtstart?: [string, { value?: string }];
        summary?: string;
        uid?: string;
      }>;
    }>;
  };
  const events = (parsed.vcalendar?.[0]?.vevent ?? []).flatMap((event) => {
    const compact = event.dtstart?.[0];
    if (!compact || !/^\d{8}$/.test(compact)) return [];
    const date = `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
    return date >= cutoff
      ? [{ date, summary: event.summary ?? null, uid: event.uid ?? null }]
      : [];
  });
  return {
    sourceRef: source.snapshot.snapshotId,
    parseStatus: events.length ? "parsed" : "manual_review_required",
    events,
  };
}

function normalizeName(value: string): string {
  return decodeHtml(value)
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\./g, " ")
    .replace(/\buniv\b/g, "university")
    .replace(/\badministration\b/g, "admin")
    .replace(/\bbldg\b/g, "building")
    .replace(/\bblocks?\b/g, "building")
    .replace(/\bu\s*c\b/g, "united college")
    .replace(/\bc\s*w\b/g, "cw")
    .replace(/\bresidences\b/g, "residence")
    .replace(/\bno\b/g, "number")
    .replace(/\by\s*i\s*a\s*p\b/g, "yiap")
    .replace(/\bp\s*s\s*l\s*b\b/g, "pslb")
    .replace(/[^a-z0-9\u3400-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stopPlaceKey(value: string): string {
  return normalizeName(value)
    .replace(/\b(upward|downward|pslb|terminus)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function direction(value: string): string | null {
  const normalized = normalizeName(value);
  return (
    ["upward", "downward", "terminus"].find((part) =>
      normalized.includes(part),
    ) ?? null
  );
}

function nameScore(left: string, right: string): number {
  const a = normalizeName(left);
  const b = normalizeName(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const directionA = direction(left);
  const directionB = direction(right);
  if (directionA && directionB && directionA !== directionB) return 0;
  const aTokens = new Set(a.split(" "));
  const bTokens = new Set(b.split(" "));
  const intersection = [...aTokens].filter((token) =>
    bTokens.has(token),
  ).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  const jaccard = union ? intersection / union : 0;
  const substring = a.includes(b) || b.includes(a) ? 0.82 : 0;
  return Math.round(Math.max(jaccard, substring) * 1000) / 1000;
}

function matchOfficialStop(
  sourceName: string,
  officialStops: OfficialStop[],
): MatchResult {
  const candidates = officialStops
    .map((stop) => ({
      stopId: stop.stopId,
      nameEn: stop.nameEn,
      score: nameScore(sourceName, stop.nameEn),
    }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score || a.nameEn.localeCompare(b.nameEn));
  const best = candidates[0];
  const second = candidates[1];
  if (!best || best.score < 0.6) {
    return {
      status: "unmatched",
      stopId: null,
      score: best?.score ?? 0,
      candidates: candidates.slice(0, 3),
    };
  }
  const uniqueExact = best.score === 1 && (!second || second.score < 1);
  if (uniqueExact) {
    return {
      status: "auto",
      stopId: best.stopId,
      score: best.score,
      candidates: candidates.slice(0, 3),
    };
  }
  return {
    status: "review",
    stopId: best.stopId,
    score: best.score,
    candidates: candidates.slice(0, 3),
  };
}

type CampusMapRouteType = {
  shuttle_bus_route_type_id: string;
  shuttle_bus_route_type_name_en: string;
  shuttle_bus_route_type_name_xb5: string;
};

type CampusMapServiceTime = {
  shuttle_bus_route_service_time_id: string;
  shuttle_bus_route_service_type_id: string;
  shuttle_bus_route_service_time_name_en: string;
  shuttle_bus_route_service_time_name_xb5: string;
};

type CampusMapRoute = {
  route_id: string;
  route_name_en: string;
  route_name_xb5: string;
  route_color: string;
  route_service_type_id: string;
  rotue_service_time_id: string;
};

type CampusMapRouteSegmentRef = {
  route_id: string;
  seg_id: string;
  order: string;
};

type CampusMapSegment = {
  bus_route_seg_id: string;
  start_bus_stop_id: string;
  end_bus_stop_id: string;
  encoded_start_pt: string;
  encoded_line: string;
  encoded_end_pt: string;
  encoded_levels: string;
};

type CampusMapStop = {
  bus_stop_id: string;
  bus_stop_name_en: string;
  bus_stop_name_xb5: string;
  lat_lng: string;
  bus_stop_type_id: string;
  description_en: string;
  description_xb5: string;
  active: string;
};

function extractJsJsonArray<T>(content: string, key: string): T[] {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const marker = new RegExp(`(?:^|\\n)${escapedKey}\\s*:\\s*\\[`).exec(content);
  if (!marker) throw new Error(`Missing CUHK Campus Map array: ${key}`);
  const start = marker.index + marker[0].lastIndexOf("[");

  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const character = content[index];
    if (quoted) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        quoted = false;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === "[") {
      depth += 1;
    } else if (character === "]") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(content.slice(start, index + 1)) as T[];
      }
    }
  }
  throw new Error(`Unterminated CUHK Campus Map array: ${key}`);
}

function parseLatLng(value: string) {
  const match = value.match(
    /^\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/,
  );
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

function parseOfficialCampusMapData(source: FetchResult) {
  const content = asString(source).replace(/^\uFEFF/, "");
  const routeTypes = extractJsJsonArray<CampusMapRouteType>(
    content,
    "shuttle_bus_route_type",
  );
  const serviceTimes = extractJsJsonArray<CampusMapServiceTime>(
    content,
    "shuttle_bus_route_service_time",
  );
  const routes = extractJsJsonArray<CampusMapRoute>(
    content,
    "shuttle_bus_route",
  );
  const routeSegmentRefs = extractJsJsonArray<CampusMapRouteSegmentRef>(
    content,
    "shuttle_bus_route_seg",
  );
  const segments = extractJsJsonArray<CampusMapSegment>(
    content,
    "shuttle_bus_seg",
  );
  const stops = extractJsJsonArray<CampusMapStop>(
    content,
    "shuttle_bus_stops",
  ).map((stop) => ({
    stopId: stop.bus_stop_id,
    nameEn: stop.bus_stop_name_en,
    nameZhHant: stop.bus_stop_name_xb5,
    coordinates: parseLatLng(stop.lat_lng),
    stopTypeId: stop.bus_stop_type_id,
    active: stop.active === "True",
    descriptionEn: stop.description_en,
    descriptionZhHant: stop.description_xb5,
  }));

  const routeTypeById = new Map(
    routeTypes.map((routeType) => [
      routeType.shuttle_bus_route_type_id,
      routeType,
    ]),
  );
  const serviceTimeById = new Map(
    serviceTimes.map((serviceTime) => [
      serviceTime.shuttle_bus_route_service_time_id,
      serviceTime,
    ]),
  );
  const segmentById = new Map(
    segments.map((segment) => [segment.bus_route_seg_id, segment]),
  );

  return {
    assetVersionHint: source.snapshot.url.match(/\?(\d{8})$/)?.[1] ?? null,
    sourceRef: source.snapshot.snapshotId,
    routeTypes,
    serviceTimes,
    stops,
    segments: segments.map((segment) => ({
      segmentId: segment.bus_route_seg_id,
      startStopId: segment.start_bus_stop_id,
      endStopId: segment.end_bus_stop_id,
      encodedPolyline:
        segment.encoded_start_pt +
        segment.encoded_line +
        segment.encoded_end_pt,
      encodedLevels: segment.encoded_levels,
    })),
    routes: routes.map((route) => {
      const segmentIds = routeSegmentRefs
        .filter((reference) => reference.route_id === route.route_id)
        .sort((left, right) => Number(left.order) - Number(right.order))
        .map((reference) => reference.seg_id);
      const routeSegments = segmentIds
        .map((segmentId) => segmentById.get(segmentId))
        .filter((segment): segment is CampusMapSegment => Boolean(segment));
      const connectivityGaps = routeSegments
        .slice(1)
        .flatMap((segment, index) => {
          const previous = routeSegments[index];
          return previous.end_bus_stop_id === segment.start_bus_stop_id
            ? []
            : [
                {
                  afterSegmentId: previous.bus_route_seg_id,
                  beforeSegmentId: segment.bus_route_seg_id,
                  previousEndStopId: previous.end_bus_stop_id,
                  nextStartStopId: segment.start_bus_stop_id,
                },
              ];
        });
      return {
        routeId: route.route_id,
        nameEn: route.route_name_en,
        nameZhHant: route.route_name_xb5,
        color: route.route_color,
        routeType: routeTypeById.get(route.route_service_type_id) ?? null,
        serviceTime: serviceTimeById.get(route.rotue_service_time_id) ?? null,
        segmentIds,
        stopIds:
          routeSegments.length && connectivityGaps.length === 0
            ? [
                routeSegments[0].start_bus_stop_id,
                ...routeSegments.map((segment) => segment.end_bus_stop_id),
              ]
            : null,
        pathContinuity:
          connectivityGaps.length === 0 ? "continuous" : "has_source_gaps",
        connectivityGaps,
      };
    }),
  };
}

function parseBusClockData(source: FetchResult) {
  const content = asString(source);
  const stationBlock = content.match(
    /export const Station = \{([\s\S]*?)\}\s+as const;/,
  )?.[1];
  const routeBlock = content.match(
    /export const BusRoute = \{([\s\S]*?)\}\s+as const;/,
  )?.[1];
  const names = new Map<string, string>();
  for (const match of stationBlock?.matchAll(
    /^\s*([A-Z0-9_]+):\s*'([^']+)'/gm,
  ) ?? []) {
    names.set(match[1], match[2]);
  }
  const routeNames = new Map<string, string>();
  for (const match of routeBlock?.matchAll(/^\s*_([A-Z0-9]+):\s*'([^']+)'/gm) ??
    []) {
    routeNames.set(match[1], match[2]);
  }
  const coordinates = new Map<
    string,
    { latitude: number; longitude: number }
  >();
  for (const match of content.matchAll(
    /\[Station\.([A-Z0-9_]+)\]:\s*\{\s*latitude:\s*([0-9.]+),\s*longitude:\s*([0-9.]+)\s*\}/g,
  )) {
    coordinates.set(match[1], {
      latitude: Number(match[2]),
      longitude: Number(match[3]),
    });
  }
  const routeInfoStart = content.indexOf("export const busRouteInfos");
  const routeInfoText =
    routeInfoStart >= 0 ? content.slice(routeInfoStart) : "";
  const routeMarkers = [
    ...routeInfoText.matchAll(/\[BusRoute\._([A-Z0-9]+)\]:\s*\{/g),
  ];
  const routePatterns = routeMarkers.map((marker, index) => {
    const start = marker.index ?? 0;
    const end = routeMarkers[index + 1]?.index ?? routeInfoText.length;
    const block = routeInfoText.slice(start, end);
    const stationsRaw = block.match(/stations:\s*\[([\s\S]*?)\],/)?.[1] ?? "";
    return {
      variantId: routeNames.get(marker[1]) ?? marker[1],
      firstService: block.match(/firstService:\s*\[([^\]]+)\]/)?.[1] ?? null,
      lastService: block.match(/lastService:\s*\[([^\]]+)\]/)?.[1] ?? null,
      minuteMarks: (block.match(/minuteMarks:\s*\[([^\]]+)\]/)?.[1] ?? "")
        .split(",")
        .map(Number)
        .filter(Number.isFinite),
      stations: [...stationsRaw.matchAll(/Station\.([A-Z0-9_]+)/g)].map(
        (station) => names.get(station[1]) ?? station[1],
      ),
    };
  });
  return {
    stations: [...names.entries()].map(([key, name]) => ({
      key,
      name,
      coordinates: coordinates.get(key) ?? null,
    })),
    routePatterns,
  };
}

function quantile(values: number[], probability: number): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * probability;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const value =
    lower === upper
      ? sorted[lower]
      : sorted[lower] + (sorted[upper] - sorted[lower]) * (index - lower);
  return Math.round(value * 10) / 10;
}

function haversineMeters(
  left: { latitude: number; longitude: number },
  right: { latitude: number; longitude: number },
): number {
  const radius = 6_371_000;
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const deltaLatitude = radians(right.latitude - left.latitude);
  const deltaLongitude = radians(right.longitude - left.longitude);
  const latitude1 = radians(left.latitude);
  const latitude2 = radians(right.latitude);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) *
      Math.cos(latitude2) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}

function baseRouteId(variant: string): string {
  return variant.replace(/[+*]$/, "").toLowerCase();
}

async function fetchOverpass(): Promise<FetchResult> {
  const query = `[out:json][timeout:25];nwr["highway"="bus_stop"](22.408,114.195,22.433,114.223);out center tags;`;
  const endpoints = [
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass-api.de/api/interpreter",
  ];
  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      return await fetchSource(
        "osm-cuhk-bus-stops",
        "osm_overpass_json",
        endpoint,
        "OpenStreetMap ODbL; attribution required.",
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ data: query }),
        },
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const cutoff = "2024-08-10T00:00:00";
  const [
    routeCollection,
    stopCollection,
    routeCollectionZhHant,
    stopCollectionZhHant,
    noticeCollection,
  ] = await Promise.all([
    fetchWpCollection("cuhk-routes", "route"),
    fetchWpCollection("cuhk-stops", "stop"),
    fetchWpCollection("cuhk-routes-zh-hant", "route", "", "/tc"),
    fetchWpCollection("cuhk-stops-zh-hant", "stop", "", "/tc"),
    fetchWpCollection("cuhk-notices", "newsdetails", `after=${cutoff}`),
  ]);

  const collectionIdentity = (items: WpItem[]) =>
    items
      .map((item) => `${item.id}:${item.slug}`)
      .sort()
      .join("|");
  if (
    collectionIdentity(routeCollection.items) !==
    collectionIdentity(routeCollectionZhHant.items)
  ) {
    throw new Error(
      "English and Traditional Chinese CUHK route indexes do not share the same id/slug set",
    );
  }
  if (
    collectionIdentity(stopCollection.items) !==
    collectionIdentity(stopCollectionZhHant.items)
  ) {
    throw new Error(
      "English and Traditional Chinese CUHK stop indexes do not share the same id/slug set",
    );
  }

  const routePageSources = await Promise.all(
    routeCollection.items.map((route) =>
      fetchSource(
        `cuhk-route-${route.slug}`,
        "route_html",
        route.link,
        "Publicly accessible CUHK content; reuse permission not explicitly granted.",
      ),
    ),
  );
  const routes = routeCollection.items.map((route, index) =>
    parseRoutePage(routePageSources[index], route),
  );
  const routePageZhHantSources = await Promise.all(
    routeCollection.items.map((route) =>
      fetchSource(
        `cuhk-route-zh-hant-${route.slug}`,
        "route_html_zh_hant",
        `${BASE}/tc/route/${route.slug}/`,
        "Publicly accessible CUHK Traditional Chinese content; reuse permission not explicitly granted.",
      ),
    ),
  );
  const routesZhHant = routeCollection.items.map((route, index) => {
    const localizedItem = routeCollectionZhHant.items.find(
      (candidate) => candidate.id === route.id,
    );
    if (!localizedItem) {
      throw new Error(`Missing zh-Hant route REST record for ${route.slug}`);
    }
    return parseLocalizedRoutePage(
      routePageZhHantSources[index],
      localizedItem,
      "zh-Hant",
    );
  });

  const [campusMapPageSource, campusMapDataSource] = await Promise.all([
    fetchSource(
      "cuhk-campus-map-page",
      "official_campus_map_html",
      CUHK_CAMPUS_MAP_URL,
      "Publicly accessible CUHK map page; reuse permission not explicitly granted.",
    ),
    fetchSource(
      "cuhk-campus-map-data",
      "official_campus_map_javascript_data",
      CUHK_CAMPUS_MAP_DATA_URL,
      "Publicly accessible CUHK map data; reuse permission not explicitly granted.",
    ),
  ]);
  const officialCampusMap = parseOfficialCampusMapData(campusMapDataSource);
  const campusMapPageHtml = asString(campusMapPageSource);
  const campusMapDisclaimer = decodeHtml(
    campusMapPageHtml.match(
      /id=["']map-disclaimer-text["'][^>]*>\s*([^<]+?)\s*</i,
    )?.[1] ?? "",
  );
  const officialCampusMapEvidence = {
    ...officialCampusMap,
    mapPageSourceRef: campusMapPageSource.snapshot.snapshotId,
    pageDisclaimer: campusMapDisclaimer || null,
    recencyBoundary:
      "The asset is still publicly served by the official map page, but its query-string version hint is 20161006. Treat stop coordinates and encoded paths as stale structural priors, not as current route or arrival truth.",
  };

  const pdfDefinitions: Array<{
    sourceId: string;
    filename: string;
    edition: "current" | "2024-25";
    routeIds: string[];
    pdfPages: number[];
    mapEncoding: string;
  }> = [
    {
      sourceId: "shuttle-current",
      filename: "Shuttle.pdf",
      edition: "current",
      routeIds: ["1a", "1b", "2", "3", "4", "8"],
      pdfPages: [1],
      mapEncoding: "colored_paths_arrows_first_last_and_conditional_stops",
    },
    {
      sourceId: "night-holiday-current",
      filename: "NH.pdf",
      edition: "current",
      routeIds: ["n", "h"],
      pdfPages: [1],
      mapEncoding: "colored_paths_arrows_first_last_and_conditional_stops",
    },
    {
      sourceId: "class-current",
      filename: "Meet-class.pdf",
      edition: "current",
      routeIds: ["5", "6a", "6b", "7"],
      pdfPages: [1],
      mapEncoding: "colored_paths_arrows_first_last_and_service_day_rule",
    },
    {
      sourceId: "paid-current",
      filename: "PSLB_2025.pdf",
      edition: "current",
      routeIds: ["up", "down"],
      pdfPages: [1, 2],
      mapEncoding: "numbered_1_to_15_schematic_and_geographic_map",
    },
    {
      sourceId: "shuttle-2024-25",
      filename: "Shuttle_24-25.pdf",
      edition: "2024-25",
      routeIds: ["1a", "1b", "2", "3", "4", "8"],
      pdfPages: [1],
      mapEncoding: "historical_visual_route_map",
    },
    {
      sourceId: "night-holiday-2024-25",
      filename: "NH_24-25.pdf",
      edition: "2024-25",
      routeIds: ["n", "h"],
      pdfPages: [1],
      mapEncoding: "historical_visual_route_map",
    },
    {
      sourceId: "class-2024-25",
      filename: "Meet-class_24-25.pdf",
      edition: "2024-25",
      routeIds: ["5", "6a", "6b", "7"],
      pdfPages: [1],
      mapEncoding: "historical_visual_route_map",
    },
  ];
  const pdfSources = await Promise.all(
    pdfDefinitions.map(({ sourceId, filename }) =>
      fetchSource(
        `cuhk-pdf-${sourceId}`,
        "schedule_pdf",
        `${BASE}/wp-content/uploads/documents/${filename}`,
        "Publicly accessible CUHK document; reuse permission not explicitly granted.",
      ),
    ),
  );
  const pdfEvidence = await Promise.all(
    pdfSources.map(async (source, index) => ({
      ...(await extractPdfEvidence(source)),
      documentId: pdfDefinitions[index].sourceId,
      filename: pdfDefinitions[index].filename,
      edition: pdfDefinitions[index].edition,
      routeIds: pdfDefinitions[index].routeIds,
      pdfPages: pdfDefinitions[index].pdfPages,
      mapEncoding: pdfDefinitions[index].mapEncoding,
    })),
  );

  const [almanac2025, almanac2026, publicHolidaySource] = await Promise.all([
    fetchSource(
      "cuhk-almanac-2025-26",
      "academic_calendar_html",
      "https://www.res.cuhk.edu.hk/general-information/almanac/university-almanac-2025-26/full-time-undergraduate-programmes-teaching-terms/",
      "Public CUHK academic-calendar evidence; it is not a bus service calendar.",
    ),
    fetchSource(
      "cuhk-almanac-2026-27",
      "academic_calendar_html",
      "https://www.res.cuhk.edu.hk/general-information/almanac/university-almanac-2026-27/full-time-undergraduate-programmes-teaching-terms/",
      "Public CUHK academic-calendar evidence; it is not a bus service calendar.",
    ),
    fetchSource(
      "hksarg-public-holidays",
      "public_holiday_json",
      "https://www.1823.gov.hk/common/ical/en.json",
      "Hong Kong Government public data; retain source attribution.",
    ),
  ]);
  const academicCalendars = [almanac2025, almanac2026].map(
    parseAcademicCalendar,
  );
  const publicHolidays = parsePublicHolidays(
    publicHolidaySource,
    cutoff.slice(0, 10),
  );

  const [
    overpass,
    busLogSource,
    processedLogSource,
    stationTimesSource,
    busDataSource,
  ] = await Promise.all([
    fetchOverpass(),
    fetchSource(
      "bus-clock-bus-log",
      "bus_clock_raw_gps_json",
      `${BUS_CLOCK_RAW}/data/bus-log.json`,
      "Repository code is GPL-3.0; data files have no separate explicit license.",
    ),
    fetchSource(
      "bus-clock-processed-log",
      "bus_clock_processed_gps_json",
      `${BUS_CLOCK_RAW}/data/processed-bus-log.json`,
      "Repository code is GPL-3.0; data files have no separate explicit license.",
    ),
    fetchSource(
      "bus-clock-station-times",
      "bus_clock_segment_times_json",
      `${BUS_CLOCK_RAW}/data/station-times.json`,
      "Repository code is GPL-3.0; data files have no separate explicit license.",
    ),
    fetchSource(
      "bus-clock-bus-data",
      "bus_clock_typescript_constants",
      `${BUS_CLOCK_RAW}/constants/BusData.ts`,
      "GPL-3.0 source code; derived facts remain source-attributed.",
    ),
  ]);

  const officialSourceRef = stopCollection.sources[0].snapshot.snapshotId;
  const officialSourceRefZhHant =
    stopCollectionZhHant.sources[0].snapshot.snapshotId;
  const officialStops: OfficialStop[] = stopCollection.items.map((stop) => {
    const localizedStop = stopCollectionZhHant.items.find(
      (candidate) => candidate.id === stop.id,
    );
    if (!localizedStop) {
      throw new Error(`Missing zh-Hant official stop record for ${stop.id}`);
    }
    return {
      stopId: `cuhk-wp-stop-${stop.id}`,
      officialPostId: stop.id,
      slug: stop.slug,
      nameEn: decodeHtml(stop.title.rendered),
      nameZhHant: decodeHtml(localizedStop.title.rendered),
      modifiedAt: stop.modified,
      sourceRef: officialSourceRef,
      sourceRefZhHant: officialSourceRefZhHant,
    };
  });
  const sourceStopRecords: SourceStopRecord[] = [];

  for (const route of routes) {
    route.visualStopNames.forEach((sourceName, index) => {
      sourceStopRecords.push({
        recordId: `route:${route.routeId}:dom:${index}`,
        sourceKind: "official_route_html",
        sourceName,
        sourceRef: route.sourceRef,
        externalId: `${route.routeId}:${index}`,
        coordinates: null,
        sourceMetadata: { routeId: route.routeId },
        match: matchOfficialStop(sourceName, officialStops),
      });
    });
  }

  for (const localizedRoute of routesZhHant) {
    const englishRoute = routes.find(
      (route) => route.routeId === localizedRoute.routeId,
    );
    const alignmentStatus =
      englishRoute &&
      englishRoute.visualStopNames.length ===
        localizedRoute.visualStopNames.length
        ? "aligned_by_same_template_occurrence"
        : "count_mismatch_review_required";
    localizedRoute.visualStopNames.forEach((sourceName, index) => {
      const englishRecord = sourceStopRecords.find(
        (record) =>
          record.recordId === `route:${localizedRoute.routeId}:dom:${index}`,
      );
      const match: MatchResult =
        alignmentStatus === "aligned_by_same_template_occurrence" &&
        englishRecord
          ? englishRecord.match
          : { status: "unmatched", stopId: null, score: 0, candidates: [] };
      sourceStopRecords.push({
        recordId: `route-zh-hant:${localizedRoute.routeId}:dom:${index}`,
        sourceKind: "official_route_html_zh_hant",
        sourceName,
        sourceRef: localizedRoute.sourceRef,
        externalId: `${localizedRoute.routeId}:zh-Hant:${index}`,
        coordinates: null,
        sourceMetadata: {
          routeId: localizedRoute.routeId,
          locale: localizedRoute.locale,
          alignmentStatus,
          alignedEnglishSourceName:
            englishRoute?.visualStopNames[index] ?? null,
        },
        match,
      });
    });
  }

  const busClock = parseBusClockData(busDataSource);
  for (const station of busClock.stations) {
    sourceStopRecords.push({
      recordId: `bus-clock:${station.key}`,
      sourceKind: "bus_clock",
      sourceName: station.name,
      sourceRef: busDataSource.snapshot.snapshotId,
      externalId: station.key,
      coordinates: station.coordinates,
      sourceMetadata: { stationKey: station.key },
      match: matchOfficialStop(station.name, officialStops),
    });
  }

  for (const stop of officialCampusMap.stops) {
    const initialMatch = matchOfficialStop(stop.nameEn, officialStops);
    const match: MatchResult =
      stop.stopTypeId === "1" || initialMatch.status !== "auto"
        ? initialMatch
        : { ...initialMatch, status: "review" };
    sourceStopRecords.push({
      recordId: `official-campus-map:${stop.stopId}`,
      sourceKind: "official_campus_map",
      sourceName: stop.nameEn,
      sourceRef: officialCampusMap.sourceRef,
      externalId: stop.stopId,
      coordinates: stop.coordinates,
      sourceMetadata: {
        nameZhHant: stop.nameZhHant,
        stopTypeId: stop.stopTypeId,
        active: String(stop.active),
        assetVersionHint: officialCampusMap.assetVersionHint,
        autoLinkBoundary:
          stop.stopTypeId === "1"
            ? "current-shuttle-name-match"
            : "old-type-2-stop-requires-review",
      },
      match,
    });
  }

  const busClockCoordinateAnchors = new Map<
    string,
    { latitude: number; longitude: number }
  >();
  for (const record of sourceStopRecords) {
    if (
      record.sourceKind === "bus_clock" &&
      record.match.status === "auto" &&
      record.match.stopId &&
      record.coordinates
    ) {
      busClockCoordinateAnchors.set(record.match.stopId, record.coordinates);
    }
  }

  const overpassJson = JSON.parse(asString(overpass)) as {
    elements: Array<{
      type: string;
      id: number;
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
      tags?: Record<string, string>;
    }>;
  };
  for (const element of overpassJson.elements) {
    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;
    const sourceName =
      element.tags?.["name:en"] ??
      element.tags?.name ??
      element.tags?.["name:zh"];
    if (!sourceName || latitude === undefined || longitude === undefined)
      continue;
    const coordinates = { latitude, longitude };
    const initialMatch = matchOfficialStop(sourceName, officialStops);
    const coordinateAnchor = initialMatch.stopId
      ? busClockCoordinateAnchors.get(initialMatch.stopId)
      : null;
    const distanceToAnchorMeters = coordinateAnchor
      ? Math.round(haversineMeters(coordinates, coordinateAnchor) * 10) / 10
      : null;
    const operator = element.tags?.operator ?? null;
    const hasCuhkOperator = normalizeName(operator ?? "") === "cuhk";
    const osmMatch: MatchResult =
      initialMatch.status === "auto" &&
      (hasCuhkOperator ||
        (distanceToAnchorMeters !== null && distanceToAnchorMeters <= 75))
        ? initialMatch
        : initialMatch.status === "auto"
          ? { ...initialMatch, status: "review" }
          : initialMatch;
    sourceStopRecords.push({
      recordId: `osm:${element.type}:${element.id}`,
      sourceKind: "openstreetmap",
      sourceName,
      sourceRef: overpass.snapshot.snapshotId,
      externalId: `${element.type}/${element.id}`,
      coordinates,
      sourceMetadata: {
        operator,
        network: element.tags?.network ?? null,
        ref: element.tags?.ref ?? null,
        nameZh: element.tags?.["name:zh"] ?? null,
        distanceToBusClockAnchorMeters:
          distanceToAnchorMeters === null
            ? null
            : String(distanceToAnchorMeters),
      },
      match: osmMatch,
    });
  }

  const mergedStops = officialStops.map((official) => {
    const linked = sourceStopRecords.filter(
      (record) =>
        record.match.status === "auto" &&
        record.match.stopId === official.stopId,
    );
    const coordinateObservations = linked
      .filter(
        (
          record,
        ): record is SourceStopRecord & {
          coordinates: NonNullable<SourceStopRecord["coordinates"]>;
        } => record.coordinates !== null,
      )
      .map((record) => ({
        ...record.coordinates,
        sourceKind: record.sourceKind,
        sourceRef: record.sourceRef,
        sourceRecordId: record.recordId,
      }));
    const selectedCoordinate =
      coordinateObservations.find(
        (item) => item.sourceKind === "openstreetmap",
      ) ??
      coordinateObservations.find(
        (item) => item.sourceKind === "official_campus_map",
      ) ??
      coordinateObservations.find((item) => item.sourceKind === "bus_clock") ??
      null;
    const routePageNameZhHantCandidates = [
      ...new Set(
        linked
          .filter(
            (record) => record.sourceKind === "official_route_html_zh_hant",
          )
          .map((record) => record.sourceName),
      ),
    ];
    const coordinateSpreadMeters = coordinateObservations.length
      ? Math.round(
          Math.max(
            ...coordinateObservations.flatMap((left) =>
              coordinateObservations.map((right) =>
                haversineMeters(left, right),
              ),
            ),
          ) * 10,
        ) / 10
      : null;
    return {
      ...official,
      routePageNameZhHantCandidates,
      routePageNameZhHantStatus:
        routePageNameZhHantCandidates.length === 0
          ? "unavailable"
          : routePageNameZhHantCandidates.every(
                (candidate) => candidate === official.nameZhHant,
              )
            ? "confirms_official_stop_index"
            : "review_required_route_page_label_differs",
      aliases: linked.map((record) => ({
        value: record.sourceName,
        sourceKind: record.sourceKind,
        sourceRef: record.sourceRef,
      })),
      linkedSourceRecords: linked.map((record) => record.recordId),
      coordinates: selectedCoordinate,
      coordinateObservations,
      coordinateStatus: !selectedCoordinate
        ? "unavailable"
        : coordinateSpreadMeters !== null && coordinateSpreadMeters > 50
          ? "conflict_review_required"
          : "provisional_public_source",
      coordinateSpreadMeters,
    };
  });
  const placeGroups = new Map<string, typeof mergedStops>();
  for (const stop of mergedStops.filter(
    (candidate) => candidate.slug !== "blank",
  )) {
    const key = stopPlaceKey(stop.nameEn);
    placeGroups.set(key, [...(placeGroups.get(key) ?? []), stop]);
  }
  const stopPlaceCandidates = [...placeGroups.entries()]
    .map(([key, stops]) => ({
      placeCandidateId: `place-candidate:${sha256(key).slice(0, 12)}`,
      normalizedName: key,
      officialStopIds: stops.map((stop) => stop.stopId),
      officialStopNames: stops.map((stop) => stop.nameEn),
      coordinateCandidates: stops.flatMap(
        (stop) => stop.coordinateObservations,
      ),
      sourceRefs: [
        ...new Set(
          stops.flatMap((stop) => [
            stop.sourceRef,
            stop.sourceRefZhHant,
            ...stop.aliases.map((alias) => alias.sourceRef),
          ]),
        ),
      ],
      status:
        stops.length > 1
          ? ("review_required_direction_or_platform_fold" as const)
          : ("single_operational_stop_candidate" as const),
    }))
    .sort((left, right) =>
      left.normalizedName.localeCompare(right.normalizedName),
    );

  const busLog = JSON.parse(asString(busLogSource)) as Array<{
    route: string;
    timeStamp: string;
    location?: { coords?: { accuracy?: number } };
  }>;
  const processedLog = JSON.parse(asString(processedLogSource)) as Array<{
    route: string;
    timeStamp: string;
    station?: string;
  }>;
  const stationTimes = JSON.parse(asString(stationTimesSource)) as Record<
    string,
    number[]
  >;
  const gpsCounts = new Map<string, number>();
  for (const row of busLog)
    gpsCounts.set(row.route, (gpsCounts.get(row.route) ?? 0) + 1);
  const gpsAccuracyValues = busLog
    .map((row) => row.location?.coords?.accuracy)
    .filter((value): value is number => typeof value === "number");
  const busClockEvidence = {
    commit: BUS_CLOCK_COMMIT,
    rawGps: {
      sourceRef: busLogSource.snapshot.snapshotId,
      rowCount: busLog.length,
      from: busLog.map((row) => row.timeStamp).sort()[0] ?? null,
      to:
        busLog
          .map((row) => row.timeStamp)
          .sort()
          .at(-1) ?? null,
      utcDateCount: new Set(busLog.map((row) => row.timeStamp.slice(0, 10)))
        .size,
      routeRows: Object.fromEntries([...gpsCounts.entries()].sort()),
      accuracyMeters: {
        p50: quantile(gpsAccuracyValues, 0.5),
        p90: quantile(gpsAccuracyValues, 0.9),
        max: gpsAccuracyValues.length ? Math.max(...gpsAccuracyValues) : null,
      },
    },
    processedLabels: {
      sourceRef: processedLogSource.snapshot.snapshotId,
      rowCount: processedLog.length,
      uniqueStationLabels: new Set(
        processedLog.flatMap((row) => (row.station ? [row.station] : [])),
      ).size,
    },
    segmentTimes: {
      sourceRef: stationTimesSource.snapshot.snapshotId,
      pairCount: Object.keys(stationTimes).length,
      nonEmptyPairCount: Object.values(stationTimes).filter(
        (values) => values.length,
      ).length,
      sampleCount: Object.values(stationTimes).reduce(
        (total, values) => total + values.length,
        0,
      ),
    },
  };

  const stopById = new Map(officialStops.map((stop) => [stop.stopId, stop]));
  for (const [routeId, pattern] of Object.entries(
    REVIEWED_NUMBERED_ROUTE_PATTERNS,
  )) {
    for (const stopId of pattern.stopIds) {
      if (!stopById.has(stopId)) {
        throw new Error(
          `Reviewed official map pattern ${routeId} references missing stop ${stopId}`,
        );
      }
    }
  }

  const officialMapEvidenceForRoute = (routeId: string) => {
    const definitionIndex = pdfDefinitions.findIndex(
      (definition) =>
        definition.edition === "current" &&
        definition.routeIds.includes(routeId),
    );
    if (definitionIndex < 0) {
      throw new Error(`No current official route map covers route ${routeId}`);
    }
    const definition = pdfDefinitions[definitionIndex];
    const source = pdfSources[definitionIndex];
    const englishRoutePage = routes.find((route) => route.routeId === routeId);
    const zhHantRoutePage = routesZhHant.find(
      (route) => route.routeId === routeId,
    );
    const officialRoutePageSourceRefs = [
      englishRoutePage?.sourceRef,
      zhHantRoutePage?.sourceRef,
    ].filter((sourceRef): sourceRef is string => Boolean(sourceRef));
    const reviewedNumberedPattern =
      REVIEWED_NUMBERED_ROUTE_PATTERNS[routeId] ?? null;
    const reviewedVisualPatterns =
      REVIEWED_VISUAL_ROUTE_PATTERNS[routeId] ?? null;
    if (
      reviewedNumberedPattern &&
      reviewedNumberedPattern.sourceDocumentId !== definition.sourceId
    ) {
      throw new Error(
        `Reviewed pattern source mismatch for route ${routeId}: ${reviewedNumberedPattern.sourceDocumentId} != ${definition.sourceId}`,
      );
    }
    const routeHtmlStopIds = new Set(
      sourceStopRecords.flatMap((record) =>
        record.sourceKind === "official_route_html" &&
        record.sourceMetadata?.routeId === routeId &&
        record.match.stopId
          ? [record.match.stopId]
          : [],
      ),
    );
    const enrichSequence = (
      stops: Array<{ sourceName: string; stopId: string }>,
    ) => {
      const sequence = stops.map(({ sourceName, stopId }, index) => ({
        sequence: index + 1,
        stopId,
        stopName: stopById.get(stopId)?.nameEn ?? null,
        sourceName,
      }));
      const routeHtmlMissingStopIds = [
        ...new Set(
          sequence
            .map((stop) => stop.stopId)
            .filter((stopId) => !routeHtmlStopIds.has(stopId)),
        ),
      ];
      return { sequence, routeHtmlMissingStopIds };
    };

    const numberedRoutePatterns = reviewedNumberedPattern
      ? (() => {
          const enriched = enrichSequence(
            reviewedNumberedPattern.stopIds.map((stopId) => ({
              sourceName: stopById.get(stopId)?.nameEn ?? stopId,
              stopId,
            })),
          );
          return [
            {
              patternId: `${routeId}:default`,
              activation: null,
              stopSequence: enriched.sequence,
              conditionalStops: reviewedNumberedPattern.conditionalStops.map(
                (conditional) => ({
                  ...conditional,
                  stopName: stopById.get(conditional.stopId)?.nameEn ?? null,
                }),
              ),
              evidence: {
                extractionMethod:
                  "manual_visual_review_of_numbered_official_map",
                officialPdfSourceRef: source.snapshot.snapshotId,
                officialPdfPages: reviewedNumberedPattern.pdfPages,
                officialRoutePageSourceRefs,
                busClockCrossCheck: "not_available",
                routeHtmlMembership:
                  enriched.routeHtmlMissingStopIds.length === 0
                    ? "all_pattern_stops_present"
                    : "partial_pattern_membership",
                routeHtmlMissingStopIds: enriched.routeHtmlMissingStopIds,
              },
              confidence: "high_official_numbered_map",
            },
          ];
        })()
      : [];

    const visualRoutePatterns = (reviewedVisualPatterns ?? []).map(
      (patternDefinition) => {
        const excludedBusClockStationNames = new Set(
          patternDefinition.officialMapExcludedBusClockStationNames ?? [],
        );
        const variants = patternDefinition.busClockVariantIds.map(
          (variantId) => {
            const variant = busClock.routePatterns.find(
              (candidate) => candidate.variantId === variantId,
            );
            if (!variant) {
              throw new Error(
                `Reviewed official map pattern ${patternDefinition.patternId} references missing Bus Clock variant ${variantId}`,
              );
            }
            return variant;
          },
        );
        const variantSequences = variants.map((variant) =>
          variant.stations.flatMap((sourceName) => {
            if (excludedBusClockStationNames.has(sourceName)) return [];
            const record = sourceStopRecords.find(
              (candidate) =>
                candidate.sourceKind === "bus_clock" &&
                candidate.sourceName === sourceName,
            );
            if (!record?.match.stopId) {
              throw new Error(
                `Reviewed official map pattern ${patternDefinition.patternId} cannot link Bus Clock station ${sourceName}`,
              );
            }
            return [{ sourceName, stopId: record.match.stopId }];
          }),
        );
        const canonicalStopIds = variantSequences[0].map((stop) => stop.stopId);
        for (const [index, sequence] of variantSequences.entries()) {
          if (
            sequence.map((stop) => stop.stopId).join(">") !==
            canonicalStopIds.join(">")
          ) {
            throw new Error(
              `Bus Clock variants disagree for reviewed pattern ${patternDefinition.patternId}: ${variants[0].variantId} vs ${variants[index].variantId}`,
            );
          }
        }
        const enriched = enrichSequence(variantSequences[0]);
        return {
          patternId: patternDefinition.patternId,
          activation: patternDefinition.activation,
          stopSequence: enriched.sequence,
          conditionalStops: [],
          evidence: {
            extractionMethod:
              "manual_visual_trace_of_official_map_cross_checked_against_bus_clock",
            officialPdfSourceRef: source.snapshot.snapshotId,
            officialPdfPages: definition.pdfPages,
            officialRoutePageSourceRefs,
            busClockSourceRef: busDataSource.snapshot.snapshotId,
            busClockVariantIds: patternDefinition.busClockVariantIds,
            busClockCrossCheck: patternDefinition.sourceConflictNote
              ? "source_conflict_official_pdf_station_excluded_from_bus_clock_sequence"
              : "exact_order_match_after_official_map_review",
            busClockExcludedStationNames: [...excludedBusClockStationNames],
            sourceConflictNote: patternDefinition.sourceConflictNote ?? null,
            routeHtmlMembership:
              enriched.routeHtmlMissingStopIds.length === 0
                ? "all_pattern_stops_present"
                : "partial_pattern_membership",
            routeHtmlMissingStopIds: enriched.routeHtmlMissingStopIds,
          },
          confidence: patternDefinition.sourceConflictNote
            ? "medium_high_official_map_with_source_conflict"
            : "high_official_map_plus_independent_code_cross_check",
        };
      },
    );

    const routePatterns = [...numberedRoutePatterns, ...visualRoutePatterns];
    const hasSourceConflict = routePatterns.some((pattern) =>
      pattern.evidence.busClockCrossCheck.startsWith("source_conflict_"),
    );
    return {
      sourceRef: source.snapshot.snapshotId,
      documentId: definition.sourceId,
      pdfPages: definition.pdfPages,
      mapEncoding: definition.mapEncoding,
      reviewStatus: reviewedNumberedPattern
        ? ("reviewed_numbered_official_map" as const)
        : hasSourceConflict
          ? ("reviewed_official_map_with_source_conflict" as const)
          : routePatterns.length
            ? ("reviewed_official_map_and_bus_clock" as const)
            : ("official_visual_trace_available" as const),
      routePatterns,
      extractionBoundary:
        "PDF text and route-page DOM are not travel order; sequences were accepted only after visual tracing.",
    };
  };

  const mergedRoutes = routes.map((route) => {
    const officialMapEvidence = officialMapEvidenceForRoute(route.routeId);
    const zhHantRoute = routesZhHant.find(
      (candidate) => candidate.routeId === route.routeId,
    );
    if (!zhHantRoute) {
      throw new Error(
        `Missing zh-Hant official page for route ${route.routeId}`,
      );
    }
    const zhHantAlignmentStatus =
      route.visualStopNames.length === zhHantRoute.visualStopNames.length
        ? "aligned_by_same_template_occurrence"
        : "count_mismatch_review_required";
    return {
      ...route,
      nameZhHant: zhHantRoute.name,
      sequenceStatus:
        officialMapEvidence.reviewStatus === "official_visual_trace_available"
          ? route.sequenceStatus
          : officialMapEvidence.reviewStatus,
      visualStops: route.visualStopNames.map((sourceName, index) => {
        const record = sourceStopRecords.find(
          (candidate) =>
            candidate.recordId === `route:${route.routeId}:dom:${index}`,
        );
        return { sourceName, match: record?.match ?? null };
      }),
      localizedOfficialPages: {
        zhHant: {
          routeIndexSourceRef:
            routeCollectionZhHant.sources[0].snapshot.snapshotId,
          sourceRef: zhHantRoute.sourceRef,
          pageTitle: zhHantRoute.pageTitle,
          alignmentStatus: zhHantAlignmentStatus,
          scheduleBands: zhHantRoute.scheduleBands,
          visualStops: zhHantRoute.visualStopNames.map((sourceName, index) => {
            const record = sourceStopRecords.find(
              (candidate) =>
                candidate.recordId ===
                `route-zh-hant:${route.routeId}:dom:${index}`,
            );
            return {
              sourceName,
              alignedEnglishSourceName: route.visualStopNames[index] ?? null,
              match: record?.match ?? null,
            };
          }),
        },
      },
      officialMapEvidence,
      busClockVariants: busClock.routePatterns
        .filter((variant) => baseRouteId(variant.variantId) === route.routeId)
        .map((variant) => ({
          ...variant,
          sourceRef: busDataSource.snapshot.snapshotId,
        })),
      busClockGpsRows: [...gpsCounts.entries()]
        .filter(([variant]) => baseRouteId(variant) === route.routeId)
        .reduce((total, [, count]) => total + count, 0),
      provenance: [
        route.sourceRef,
        routeCollectionZhHant.sources[0].snapshot.snapshotId,
        zhHantRoute.sourceRef,
        officialMapEvidence.sourceRef,
      ],
    };
  });

  const routePatternStopIds = (routeId: string, patternId: string) => {
    const pattern = mergedRoutes
      .find((route) => route.routeId === routeId)
      ?.officialMapEvidence.routePatterns.find(
        (candidate) => candidate.patternId === patternId,
      );
    if (!pattern) {
      throw new Error(`Missing reviewed route pattern ${patternId}`);
    }
    return new Set(pattern.stopSequence.map((stop) => stop.stopId));
  };
  const area39UpwardStopId = "cuhk-wp-stop-2939";
  for (const nPatternId of ["n:default", "n:00-via-pgh1"]) {
    if (!routePatternStopIds("n", nPatternId).has(area39UpwardStopId)) {
      throw new Error(
        `${nPatternId} must include Area 39 (Upward): N serves it as a regular stop`,
      );
    }
  }
  if (routePatternStopIds("h", "h:default").has(area39UpwardStopId)) {
    throw new Error(
      "h:default must not include Area 39 (Upward): H serves it only at minute 00",
    );
  }
  if (
    !routePatternStopIds("h", "h:00-via-pgh1-area39").has(area39UpwardStopId)
  ) {
    throw new Error("h:00-via-pgh1-area39 must include Area 39 (Upward)");
  }

  const pendingRoutePatternSequences = mergedRoutes.filter(
    (route) =>
      route.officialMapEvidence.reviewStatus ===
      "official_visual_trace_available",
  );
  const routePatternSourceConflicts = mergedRoutes.flatMap((route) =>
    route.officialMapEvidence.routePatterns.flatMap((pattern) =>
      "sourceConflictNote" in pattern.evidence &&
      pattern.evidence.sourceConflictNote
        ? [
            {
              routeId: route.routeId,
              patternId: pattern.patternId,
              officialPdfSourceRef: pattern.evidence.officialPdfSourceRef,
              officialRoutePageSourceRefs:
                pattern.evidence.officialRoutePageSourceRefs,
              busClockSourceRef:
                "busClockSourceRef" in pattern.evidence
                  ? pattern.evidence.busClockSourceRef
                  : null,
              reason: pattern.evidence.sourceConflictNote,
              resolution:
                "Current official PDF is used for the published candidate; confirm with CUHK Transport Office before production release.",
            },
          ]
        : [],
    ),
  );

  const segmentStats = Object.entries(stationTimes).map(([pair, values]) => {
    const [fromName, toName] = pair.split(">>");
    return {
      segmentKey: pair,
      fromName,
      toName,
      fromMatch: matchOfficialStop(fromName, officialStops),
      toMatch: matchOfficialStop(toName, officialStops),
      routeScope: null,
      sampleCount: values.length,
      p10Seconds: quantile(values, 0.1),
      p50Seconds: quantile(values, 0.5),
      p90Seconds: quantile(values, 0.9),
      minSeconds: values.length ? Math.min(...values) : null,
      maxSeconds: values.length ? Math.max(...values) : null,
      sourceRef: stationTimesSource.snapshot.snapshotId,
      confidence: values.length >= 5 ? "weak_prior" : "insufficient_samples",
    };
  });

  const notices = noticeCollection.items.map((notice) => ({
    officialPostId: notice.id,
    slug: notice.slug,
    title: decodeHtml(notice.title.rendered),
    publishedAt: notice.date,
    modifiedAt: notice.modified,
    link: notice.link,
    sourceRef:
      noticeCollection.sources.find((source) =>
        asString(source).includes(`\"id\":${notice.id}`),
      )?.snapshot.snapshotId ?? noticeCollection.sources[0].snapshot.snapshotId,
    structuredEffect: null,
    reviewStatus: "title_only_image_or_html_review_required",
  }));

  const officialAnomalies = officialStops.flatMap((stop) => {
    const issues: string[] = [];
    if (normalizeName(stop.nameEn) === "blank")
      issues.push("placeholder_official_stop");
    if (nameScore(stop.slug.replace(/-/g, " "), stop.nameEn) < 0.45) {
      issues.push("official_slug_title_mismatch");
    }
    return issues.map((issue) => ({ issue, stop }));
  });
  const unresolvedSourceStops = sourceStopRecords.filter(
    (record) => record.match.status !== "auto",
  );
  const unresolvedSegments = segmentStats.filter(
    (segment) =>
      segment.fromMatch.status !== "auto" || segment.toMatch.status !== "auto",
  );
  const coordinateConflicts = mergedStops.filter(
    (stop) => stop.coordinateStatus === "conflict_review_required",
  );
  const multiStopPlaceCandidates = stopPlaceCandidates.filter(
    (place) => place.officialStopIds.length > 1,
  );
  const routePageZhHantLabelDifferences = mergedStops.filter(
    (stop) =>
      stop.routePageNameZhHantStatus ===
      "review_required_route_page_label_differs",
  );

  const sourceSnapshots = [
    ...routeCollection.sources,
    ...stopCollection.sources,
    ...routeCollectionZhHant.sources,
    ...stopCollectionZhHant.sources,
    ...noticeCollection.sources,
    ...routePageSources,
    ...routePageZhHantSources,
    campusMapPageSource,
    campusMapDataSource,
    ...pdfSources,
    almanac2025,
    almanac2026,
    publicHolidaySource,
    overpass,
    busLogSource,
    processedLogSource,
    stationTimesSource,
    busDataSource,
  ].map((source) => source.snapshot);

  const sourceStopCounts = {
    officialRouteHtml: sourceStopRecords.filter(
      (record) => record.sourceKind === "official_route_html",
    ).length,
    officialRouteHtmlZhHant: sourceStopRecords.filter(
      (record) => record.sourceKind === "official_route_html_zh_hant",
    ).length,
    officialCampusMap: sourceStopRecords.filter(
      (record) => record.sourceKind === "official_campus_map",
    ).length,
    busClock: sourceStopRecords.filter(
      (record) => record.sourceKind === "bus_clock",
    ).length,
    openStreetMap: sourceStopRecords.filter(
      (record) => record.sourceKind === "openstreetmap",
    ).length,
  };
  const autoMatchCounts = {
    officialRouteHtml: sourceStopRecords.filter(
      (record) =>
        record.sourceKind === "official_route_html" &&
        record.match.status === "auto",
    ).length,
    officialRouteHtmlZhHant: sourceStopRecords.filter(
      (record) =>
        record.sourceKind === "official_route_html_zh_hant" &&
        record.match.status === "auto",
    ).length,
    officialCampusMap: sourceStopRecords.filter(
      (record) =>
        record.sourceKind === "official_campus_map" &&
        record.match.status === "auto",
    ).length,
    busClock: sourceStopRecords.filter(
      (record) =>
        record.sourceKind === "bus_clock" && record.match.status === "auto",
    ).length,
    openStreetMap: sourceStopRecords.filter(
      (record) =>
        record.sourceKind === "openstreetmap" && record.match.status === "auto",
    ).length,
  };

  const output = {
    snapshot: true,
    generatedAt,
    parserVersion: PARSER_VERSION,
    scope: {
      dataSince: cutoff.slice(0, 10),
      timezone: "Asia/Hong_Kong",
      osmBoundingBox: [22.408, 114.195, 22.433, 114.223],
      busClockCommit: BUS_CLOCK_COMMIT,
      officialCampusMapAssetVersionHint: officialCampusMap.assetVersionHint,
    },
    summary: {
      sourceSnapshots: sourceSnapshots.length,
      officialRoutes: mergedRoutes.length,
      officialScheduleBands: mergedRoutes.reduce(
        (total, route) => total + route.scheduleBands.length,
        0,
      ),
      officialStops: officialStops.length,
      operationalOfficialStops: mergedStops.filter(
        (stop) => stop.slug !== "blank",
      ).length,
      stopPlaceCandidates: stopPlaceCandidates.length,
      sourceStopRecords: sourceStopRecords.length,
      sourceStopCounts,
      autoMatchCounts,
      officialCampusMapRoutes: officialCampusMap.routes.length,
      officialCampusMapStops: officialCampusMap.stops.length,
      officialCampusMapType1Stops: officialCampusMap.stops.filter(
        (stop) => stop.stopTypeId === "1",
      ).length,
      officialCampusMapType2Stops: officialCampusMap.stops.filter(
        (stop) => stop.stopTypeId === "2",
      ).length,
      officialCampusMapSegments: officialCampusMap.segments.length,
      officialCampusMapRoutesWithSourceGaps: officialCampusMap.routes.filter(
        (route) => route.pathContinuity !== "continuous",
      ).length,
      stopsWithCoordinates: mergedStops.filter((stop) => stop.coordinates)
        .length,
      stopsWithZhHantName: mergedStops.filter((stop) => stop.nameZhHant).length,
      operationalStopsWithZhHantName: mergedStops.filter(
        (stop) => stop.slug !== "blank" && stop.nameZhHant,
      ).length,
      routePageZhHantLabelReviewItems: routePageZhHantLabelDifferences.length,
      zhHantRoutePages: routesZhHant.length,
      zhHantRoutePageAlignmentMismatches: mergedRoutes.filter(
        (route) =>
          route.localizedOfficialPages.zhHant.alignmentStatus !==
          "aligned_by_same_template_occurrence",
      ).length,
      busClockRouteVariants: busClock.routePatterns.length,
      busClockGpsRows: busLog.length,
      busClockProcessedRows: processedLog.length,
      busClockUtcDates: busClockEvidence.rawGps.utcDateCount,
      busClockSegmentPairs: segmentStats.length,
      busClockNonEmptySegmentPairs: segmentStats.filter(
        (segment) => segment.sampleCount,
      ).length,
      busClockSegmentSamples: segmentStats.reduce(
        (total, segment) => total + segment.sampleCount,
        0,
      ),
      officialNoticesSinceCutoff: notices.length,
      pdfDocuments: pdfEvidence.length,
      currentOfficialRouteMapDocuments: pdfDefinitions.filter(
        (definition) => definition.edition === "current",
      ).length,
      reviewedOfficialMapRoutes: mergedRoutes.filter(
        (route) =>
          route.officialMapEvidence.reviewStatus !==
          "official_visual_trace_available",
      ).length,
      reviewedOfficialRoutePatterns: mergedRoutes.reduce(
        (total, route) =>
          total + route.officialMapEvidence.routePatterns.length,
        0,
      ),
      pendingOfficialMapTraces: pendingRoutePatternSequences.length,
      routePatternSourceConflicts: routePatternSourceConflicts.length,
      academicCalendars: academicCalendars.length,
      publicHolidayEvents: publicHolidays.events.length,
      reviewItems:
        officialAnomalies.length +
        unresolvedSourceStops.length +
        unresolvedSegments.length +
        coordinateConflicts.length +
        multiStopPlaceCandidates.length +
        pendingRoutePatternSequences.length +
        routePatternSourceConflicts.length +
        routePageZhHantLabelDifferences.length,
    },
    sourceSnapshots,
    merged: {
      routes: mergedRoutes,
      stops: mergedStops,
      stopPlaceCandidates,
      segmentTravelTimePriors: segmentStats,
      busClockEvidence,
      officialCampusMapEvidence,
      notices,
      pdfEvidence,
      serviceCalendars: {
        academicCalendars,
        publicHolidays,
        boundary:
          "Academic terms are evidence for review, not an authoritative bus teaching-day feed.",
      },
    },
    sourceStopRecords,
    reviewQueue: {
      routePatternSequences: pendingRoutePatternSequences.map((route) => ({
        routeId: route.routeId,
        sourceRef: route.officialMapEvidence.sourceRef,
        reason: route.sequenceStatus,
      })),
      routePatternSourceConflicts,
      routePageZhHantLabelDifferences,
      officialStopAnomalies: officialAnomalies,
      unresolvedSourceStops,
      unresolvedSegments,
      coordinateConflicts,
      multiStopPlaceCandidates,
    },
    publicationBoundary: {
      allowedUse:
        "Research and an attributed derived cold-start dataset after review.",
      notEstablished:
        "Official realtime ETA, exact arrival truth, current-route validity of the old Campus Map graph, or unrestricted redistribution rights.",
    },
  };

  const report = `# CUHK public bus data merge snapshot

Generated: ${generatedAt}

This is a research snapshot, not a production feed. Every merged row points to a content-addressed source snapshot in \`merged.snapshot.json\`.

The rendering and visual-order boundary for the four current maps is documented in the [official route-map audit](../../research/cuhk-official-route-map-audit.md).

## What was collected

| Item | Count |
| --- | ---: |
| Source snapshots | ${output.summary.sourceSnapshots} |
| Official routes after dedupe | ${output.summary.officialRoutes} |
| Official schedule bands | ${output.summary.officialScheduleBands} |
| Official stops after dedupe | ${output.summary.officialStops} |
| Operational official stops | ${output.summary.operationalOfficialStops} |
| Physical-place candidates | ${output.summary.stopPlaceCandidates} |
| Route-page stop occurrences | ${sourceStopCounts.officialRouteHtml} |
| Traditional Chinese route-page stop occurrences | ${sourceStopCounts.officialRouteHtmlZhHant} |
| Official Campus Map stop records | ${sourceStopCounts.officialCampusMap} |
| Official Campus Map old type-1 / type-2 stops | ${output.summary.officialCampusMapType1Stops} / ${output.summary.officialCampusMapType2Stops} |
| Official Campus Map old route / segment records | ${output.summary.officialCampusMapRoutes} / ${output.summary.officialCampusMapSegments} |
| Official Campus Map routes with a source connectivity gap | ${output.summary.officialCampusMapRoutesWithSourceGaps} |
| Bus Clock station constants | ${sourceStopCounts.busClock} |
| OSM named bus-stop records in bbox | ${sourceStopCounts.openStreetMap} |
| Stops with a provisional coordinate | ${output.summary.stopsWithCoordinates} |
| Stops with an official Traditional Chinese name | ${output.summary.stopsWithZhHantName} |
| Operational stops with official Traditional Chinese names | ${output.summary.operationalStopsWithZhHantName} |
| Traditional Chinese route-page label review items | ${output.summary.routePageZhHantLabelReviewItems} |
| Traditional Chinese route pages | ${output.summary.zhHantRoutePages} |
| Traditional Chinese template-alignment mismatches | ${output.summary.zhHantRoutePageAlignmentMismatches} |
| Bus Clock GPS rows | ${output.summary.busClockGpsRows} |
| Bus Clock UTC dates | ${output.summary.busClockUtcDates} |
| Bus Clock segment pairs / samples | ${output.summary.busClockSegmentPairs} / ${output.summary.busClockSegmentSamples} |
| Official notices since ${cutoff.slice(0, 10)} | ${output.summary.officialNoticesSinceCutoff} |
| Current/historical PDFs | ${output.summary.pdfDocuments} |
| Current official route-map PDFs | ${output.summary.currentOfficialRouteMapDocuments} |
| Reviewed official-map routes | ${output.summary.reviewedOfficialMapRoutes} |
| Reviewed directed route patterns | ${output.summary.reviewedOfficialRoutePatterns} |
| Route-pattern source conflicts | ${output.summary.routePatternSourceConflicts} |
| Academic calendars | ${output.summary.academicCalendars} |
| Public-holiday events since ${cutoff.slice(0, 10)} | ${output.summary.publicHolidayEvents} |

## Conservative merge result

Only a unique exact normalized-name match is automatic. Directional differences, abbreviations that remain ambiguous, nearby OSM nodes, and placeholder official records stay in the review queue.

| Source stop records | Total | Auto-linked to an official stop |
| --- | ---: | ---: |
| Official route HTML | ${sourceStopCounts.officialRouteHtml} | ${autoMatchCounts.officialRouteHtml} |
| Official route HTML (Traditional Chinese) | ${sourceStopCounts.officialRouteHtmlZhHant} | ${autoMatchCounts.officialRouteHtmlZhHant} |
| Official Campus Map | ${sourceStopCounts.officialCampusMap} | ${autoMatchCounts.officialCampusMap} |
| Bus Clock | ${sourceStopCounts.busClock} | ${autoMatchCounts.busClock} |
| OpenStreetMap | ${sourceStopCounts.openStreetMap} | ${autoMatchCounts.openStreetMap} |

## Resulting usable layers

1. \`merged.routes\`: 14 official route identities, English and Traditional Chinese official-page evidence, schedule bands, official-map evidence, visual stop candidates, Bus Clock variants, and GPS coverage. All current routes have reviewed directed stop patterns: Up/Down use the official 1-15 numbering, while the other routes were visually traced and cross-checked against the fixed Bus Clock commit. Conditional path variants remain separate patterns, including N treating Area 39 as a regular stop while H serves it only on minute-00 departures.
2. \`merged.stops\`: 47 official stop identities enriched with the same-ID Traditional Chinese stop-index name, attributed route-page aliases, and provisional coordinates where exact matching succeeded. Bilingual route-page occurrence alignment is retained only as a cross-check.
3. \`merged.stopPlaceCandidates\`: 46 non-placeholder operational stops folded into 34 reversible physical-place candidates; direction and PSLB variants remain linked, not deleted.
4. \`merged.segmentTravelTimePriors\`: Bus Clock pair-level p10/p50/p90 summaries, with route scope explicitly left null.
5. \`merged.busClockEvidence\`: fixed-commit coverage, route counts, GPS accuracy summaries, and processed-label counts without republishing raw GPS rows.
6. \`merged.notices\`: official notices from the last two years, retained as title-level review candidates rather than automatic service changes.
7. \`merged.pdfEvidence\`: current and 2024–25 document hashes, route coverage, pages, visual encoding, text-extraction status, schedule windows, and effective-date evidence.
8. \`merged.serviceCalendars\`: CUHK term/reading-week evidence plus HKSARG public holidays, kept separate from transport rules.
9. \`merged.officialCampusMapEvidence\`: the official Campus Map's public stop coordinates, route/segment graph, and encoded paths. The page still serves the asset, but the asset version hint is 20161006 and the page warns that information is not real-time, so it is only a stale structural prior.

## Review boundary

- ${output.reviewQueue.routePatternSequences.length} route patterns still require visual station-order review.
- ${output.reviewQueue.routePatternSourceConflicts.length} reviewed route patterns retain a conflict between current official PDF evidence and another public source.
- ${output.summary.zhHantRoutePageAlignmentMismatches} Traditional Chinese route pages could not be occurrence-aligned with the corresponding English template.
- ${output.reviewQueue.routePageZhHantLabelDifferences.length} route-page Traditional Chinese labels differ from the same-ID official stop-index name.
- ${output.reviewQueue.unresolvedSourceStops.length} external stop records were not auto-linked.
- ${output.reviewQueue.unresolvedSegments.length} segment pairs have at least one endpoint that did not auto-link.
- ${output.reviewQueue.coordinateConflicts.length} stops have public coordinate observations more than 50 m apart.
- ${output.reviewQueue.multiStopPlaceCandidates.length} physical-place candidates contain multiple operational stops and remain reversible links.
- ${output.reviewQueue.officialStopAnomalies.length} official stop records look like placeholders or slug/title mismatches.

Do not convert review candidates into canonical facts merely to increase coverage.
`;

  await mkdir(dirname(OUTPUT_JSON), { recursive: true });
  await writeFile(
    OUTPUT_JSON,
    await format(JSON.stringify(output), { parser: "json" }),
  );
  await writeFile(OUTPUT_REPORT, await format(report, { parser: "markdown" }));
  console.log(
    JSON.stringify(
      { output: OUTPUT_JSON, report: OUTPUT_REPORT, ...output.summary },
      null,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
