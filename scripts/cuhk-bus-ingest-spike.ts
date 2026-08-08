/**
 * PROTOTYPE — fetches public CUHK transport sources and emits derived facts only.
 * Raw CUHK pages, PDFs, and notice images are hashed in memory but not persisted.
 */
import { createHash } from "node:crypto";
import { execFile as execFileCallback } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { promisify } from "node:util";

import { parse } from "parse5";

type HtmlNode = {
  nodeName: string;
  childNodes?: HtmlNode[];
  attrs?: Array<{ name: string; value: string }>;
  value?: string;
};

type SourceKind =
  | "route_index_json"
  | "stop_index_json"
  | "route_html"
  | "notice_index_json"
  | "notice_html"
  | "notice_image"
  | "schedule_pdf"
  | "historical_schedule_pdf"
  | "academic_calendar_html"
  | "public_holiday_json";

type SourceSnapshot = {
  snapshotId: string;
  sourceId: string;
  kind: SourceKind;
  url: string;
  fetchedAt: string;
  sha256: string;
  byteLength: number;
  contentType: string | null;
  lastModified: string | null;
  parserVersion: string;
  businessEffectiveFrom: string | null;
  businessEffectiveTo: string | null;
  effectiveStatus: "parsed" | "not_encoded_by_source";
  persistedRawContent: false;
};

type WpItem = {
  id: number;
  slug: string;
  link: string;
  modified: string;
  date: string;
  title: { rendered: string };
};

type ReviewedOverride = {
  sourcePostId: number;
  sourceImageSha256: string;
  reviewStatus: "prototype_visual_review";
  reviewedBy: string;
  reviewedAt: string;
  publishEligible: false;
  effectiveFrom: string;
  effectiveTo: string | null;
  openEndedPolicy: "start_date_only_then_reconfirm";
  effect: {
    kind: "stop_relocation";
    stopName: string;
    routeIds: string[];
    note: string;
  };
};

type FetchResult = {
  snapshot: SourceSnapshot;
  bytes: Uint8Array;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseOverrides(value: unknown): ReviewedOverride[] {
  if (!Array.isArray(value)) throw new Error("Override file must be an array");
  return value.map((candidate, index) => {
    if (!isRecord(candidate) || !isRecord(candidate.effect)) {
      throw new Error(`Override ${index} must be an object with an effect`);
    }
    const routeIds = candidate.effect.routeIds;
    const valid =
      typeof candidate.sourcePostId === "number" &&
      typeof candidate.sourceImageSha256 === "string" &&
      /^[a-f0-9]{64}$/.test(candidate.sourceImageSha256) &&
      candidate.reviewStatus === "prototype_visual_review" &&
      typeof candidate.reviewedBy === "string" &&
      typeof candidate.reviewedAt === "string" &&
      !Number.isNaN(Date.parse(candidate.reviewedAt)) &&
      candidate.publishEligible === false &&
      typeof candidate.effectiveFrom === "string" &&
      !Number.isNaN(Date.parse(candidate.effectiveFrom)) &&
      (candidate.effectiveTo === null ||
        (typeof candidate.effectiveTo === "string" &&
          !Number.isNaN(Date.parse(candidate.effectiveTo)))) &&
      candidate.openEndedPolicy === "start_date_only_then_reconfirm" &&
      candidate.effect.kind === "stop_relocation" &&
      typeof candidate.effect.stopName === "string" &&
      Array.isArray(routeIds) &&
      routeIds.every((routeId) => typeof routeId === "string") &&
      typeof candidate.effect.note === "string";
    if (!valid) throw new Error(`Override ${index} has an invalid schema`);
    if (
      candidate.effectiveTo !== null &&
      Date.parse(candidate.effectiveTo as string) <
        Date.parse(candidate.effectiveFrom as string)
    ) {
      throw new Error(`Override ${index} ends before it starts`);
    }
    return candidate as ReviewedOverride;
  });
}

const BASE = "https://transport.cuhk.edu.hk";
const ROUTE_INDEX = `${BASE}/wp-json/wp/v2/route?per_page=100`;
const STOP_INDEX = `${BASE}/wp-json/wp/v2/stop?per_page=100`;
const NOTICE_INDEX = `${BASE}/wp-json/wp/v2/newsdetails?per_page=10`;
const PARSER_VERSION = "cuhk-bus-ingest-spike/1";
const execFile = promisify(execFileCallback);
const OUTPUT_DEFAULT = resolve(
  "docs/campus-transport/prototypes/cuhk-bus-ingest-spike/output.prototype.json",
);
const OVERRIDES_FILE = resolve(
  "docs/campus-transport/prototypes/cuhk-bus-ingest-spike/reviewed-overrides.prototype.json",
);

function cliValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
}

function requiredBoolean(name: string): boolean {
  const value = cliValue(name);
  if (value !== "true" && value !== "false") {
    throw new Error(`--${name}=true|false is required`);
  }
  return value === "true";
}

function text(node: HtmlNode, excludedClass?: string): string {
  if (excludedClass && hasClass(node, excludedClass)) return "";
  if (node.nodeName === "#text") return node.value ?? "";
  return (node.childNodes ?? [])
    .map((child) => text(child, excludedClass))
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
  predicate: (node: HtmlNode) => boolean,
): HtmlNode[] {
  const matches = predicate(node) ? [node] : [];
  return matches.concat(
    ...(node.childNodes ?? []).map((child) => findAll(child, predicate)),
  );
}

function firstByClass(node: HtmlNode, className: string): HtmlNode | undefined {
  return findAll(node, (candidate) => hasClass(candidate, className))[0];
}

function decodeHtml(value: string): string {
  const document = parse(`<p>${value}</p>`) as unknown as HtmlNode;
  const paragraph = findAll(document, (node) => node.nodeName === "p")[0];
  return paragraph ? text(paragraph) : value;
}

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
MONTHS.set("jan", 1);
MONTHS.set("feb", 2);
MONTHS.set("mar", 3);
MONTHS.set("apr", 4);
MONTHS.set("jun", 6);
MONTHS.set("jul", 7);
MONTHS.set("aug", 8);
MONTHS.set("sep", 9);
MONTHS.set("sept", 9);
MONTHS.set("oct", 10);
MONTHS.set("nov", 11);
MONTHS.set("dec", 12);

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
      const tableText = text(candidate);
      return (
        tableText.includes("First term") &&
        tableText.includes("Second term") &&
        tableText.includes("Reading Week")
      );
    },
  );
  if (!table) {
    return {
      sourceSnapshotId: source.snapshot.snapshotId,
      parseStatus: "manual_review_required" as const,
      terms: [],
      readingWeeks: [],
    };
  }
  const rows = findAll(table, (node) => node.nodeName === "tr").map((row) =>
    findAll(row, (node) => node.nodeName === "td").map((cell) => text(cell)),
  );
  const rangeFor = (label: string) => {
    const row = rows.find((cells) => cells[0]?.trim() === label);
    return row?.[1] ? parseDateRange(row[1]) : null;
  };
  const terms = [rangeFor("First term"), rangeFor("Second term")].filter(
    (range): range is NonNullable<typeof range> => range !== null,
  );
  const readingWeeks = [rangeFor("Reading Week")].filter(
    (range): range is NonNullable<typeof range> => range !== null,
  );
  return {
    sourceSnapshotId: source.snapshot.snapshotId,
    parseStatus:
      terms.length === 2 && readingWeeks.length === 1
        ? ("parsed_needs_transport_rule_review" as const)
        : ("manual_review_required" as const),
    terms,
    readingWeeks,
  };
}

function dateInRange(
  date: string,
  range: { startDate: string; endDate: string },
) {
  return range.startDate <= date && date <= range.endDate;
}

async function fetchSource(
  sourceId: string,
  kind: SourceKind,
  url: string,
): Promise<FetchResult> {
  const response = await fetch(url, {
    headers: { "user-agent": "CUpedia-CUHK-bus-ingest-spike/1.0" },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  return {
    bytes,
    snapshot: {
      snapshotId: `${sourceId}:${sha256}`,
      sourceId,
      kind,
      url,
      fetchedAt: new Date().toISOString(),
      sha256,
      byteLength: bytes.byteLength,
      contentType: response.headers.get("content-type"),
      lastModified: response.headers.get("last-modified"),
      parserVersion: PARSER_VERSION,
      businessEffectiveFrom: null,
      businessEffectiveTo: null,
      effectiveStatus: "not_encoded_by_source",
      persistedRawContent: false,
    },
  };
}

function asString(source: FetchResult): string {
  return new TextDecoder().decode(source.bytes);
}

async function withTemporaryFile<T>(
  extension: string,
  bytes: Uint8Array,
  run: (path: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(resolve(tmpdir(), "cuhk-bus-ingest-"));
  const path = resolve(directory, `source.${extension}`);
  try {
    await writeFile(path, bytes);
    return await run(path);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function extractPdfEvidence(source: FetchResult) {
  const extractedText = await withTemporaryFile(
    "pdf",
    source.bytes,
    async (path) => {
      const result = await execFile("pdftotext", ["-layout", path, "-"]);
      return result.stdout;
    },
  );
  const normalized = extractedText
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\s+/g, " ");
  const scheduleWindows = [
    ...normalized.matchAll(/\b(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})\b/g),
  ].map((match) => `${match[1]}-${match[2]}`);
  const effectiveMatch = normalized.match(
    /Effective\s*:\s*([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})/i,
  );
  const effectiveFrom = effectiveMatch
    ? isoDate(effectiveMatch[2], effectiveMatch[1], effectiveMatch[3])
    : null;
  if (effectiveFrom) {
    source.snapshot.businessEffectiveFrom = effectiveFrom;
    source.snapshot.effectiveStatus = "parsed";
  }
  return {
    sourceSnapshotId: source.snapshot.snapshotId,
    extractionTool: "pdftotext -layout",
    extractedTextSha256: createHash("sha256")
      .update(extractedText)
      .digest("hex"),
    extractedTextLength: extractedText.length,
    scheduleWindows: [...new Set(scheduleWindows)].sort(),
    effectiveFrom,
    semanticMarkers: {
      mondayToSaturday: /Mon\s*-\s*Sat/i.test(normalized),
      publicHolidaySuspension:
        /Service suspended on.{0,160}Public Holidays/i.test(normalized),
      route8NonTeachingPattern:
        /During non-teaching days, buses will stop at Station Piazza\s*&\s*Chung Chi Teaching Bldg/i.test(
          normalized,
        ),
    },
    canonicalUse: "cross_check_only",
  };
}

async function extractNoticeOcr(source: FetchResult) {
  const tsv = await withTemporaryFile("jpg", source.bytes, async (path) => {
    const result = await execFile("tesseract", [
      path,
      "stdout",
      "-l",
      "eng",
      "tsv",
    ]);
    return result.stdout;
  });
  const rows = tsv
    .split("\n")
    .slice(1)
    .map((line) => line.split("\t"))
    .filter((columns) => columns.length >= 12 && columns[11]?.trim());
  const words = rows.map((columns) => columns[11].trim());
  const confidences = rows
    .map((columns) => Number(columns[10]))
    .filter((confidence) => Number.isFinite(confidence) && confidence >= 0);
  const ocrText = words.join(" ").replace(/\s+/g, " ").trim();
  const routeIds = [
    ...ocrText.matchAll(/Route\s+([0-9A-Z]+)\s*\/\s*([0-9A-Z]+)/gi),
  ].flatMap((match) => [match[1].toLowerCase(), match[2].toLowerCase()]);
  const dateMatch = ocrText.match(
    /(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})/i,
  );
  const timeMatch = ocrText.match(
    /from\s+(\d{1,2}:\d{2})\s*([ap])\.?m\.?\s+until the end of works/i,
  );
  return {
    sourceSnapshotId: source.snapshot.snapshotId,
    extractionTool: "tesseract eng tsv",
    ocrTextSha256: createHash("sha256").update(ocrText).digest("hex"),
    wordCount: words.length,
    meanWordConfidence:
      confidences.length > 0
        ? Math.round(
            (confidences.reduce((sum, value) => sum + value, 0) /
              confidences.length) *
              10,
          ) / 10
        : null,
    draft: {
      englishDate: dateMatch?.[0] ?? null,
      startTime: timeMatch ? `${timeMatch[1]} ${timeMatch[2]}.m.` : null,
      openEnded: /until the end of works/i.test(ocrText),
      routeIds: [...new Set(routeIds)],
      mentionsUniversityStation: /University Station Bus Stop/i.test(ocrText),
    },
    reviewStatus: "operator_review_required",
  };
}

function parseWpItems(source: FetchResult): WpItem[] {
  return JSON.parse(asString(source)) as WpItem[];
}

function parsePublicHolidays(source: FetchResult) {
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
    const compactDate = event.dtstart?.[0];
    if (!compactDate || !/^\d{8}$/.test(compactDate)) return [];
    return [
      {
        date: `${compactDate.slice(0, 4)}-${compactDate.slice(4, 6)}-${compactDate.slice(6, 8)}`,
        summary: event.summary ?? null,
        uid: event.uid ?? null,
      },
    ];
  });
  return {
    sourceSnapshotId: source.snapshot.snapshotId,
    eventCount: events.length,
    events,
    parseStatus: events.length ? "parsed" : "manual_review_required",
  };
}

function parseScheduleBands(document: HtmlNode) {
  const windows = findAll(document, (node) => hasClass(node, "rb-2-1"));
  const departures = findAll(document, (node) => hasClass(node, "rb-2-2"));

  return windows.map((windowNode, index) => {
    const departureNode = departures[index];
    const windowRaw = text(windowNode);
    const departureRaw = departureNode ? text(departureNode) : "";
    const range = windowRaw.match(/(\d{2}:\d{2})\s*[-–]\s*(\d{2}:\d{2})/);
    const minuteText = departureNode
      ? text(firstByClass(departureNode, "rb-large") ?? departureNode)
      : "";
    const departureMinutes = [...minuteText.matchAll(/\b([0-5]?\d)\b/g)].map(
      (match) => Number(match[1]),
    );
    return {
      sourceOrdinal: index,
      fieldLocators: {
        serviceWindow: { selector: ".rb-2-1", matchOrdinal: index },
        departureRule: { selector: ".rb-2-2", matchOrdinal: index },
      },
      startTime: range?.[1] ?? null,
      endTime: range?.[2] ?? null,
      departureMinutes: [...new Set(departureMinutes)],
      serviceRuleRaw: windowRaw.replace(/^Service Hours\s*/i, ""),
      departureRuleRaw: departureRaw.replace(
        /^Departure Time \(mins\)\s*/i,
        "",
      ),
      parseStatus:
        range && departureMinutes.length ? "parsed" : "manual_review_required",
    };
  });
}

function normalizeStopName(value: string): string {
  return decodeHtml(value)
    .replace(/[.#]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function parseRoutePage(source: FetchResult, route: WpItem, stops: WpItem[]) {
  const document = parse(asString(source)) as unknown as HtmlNode;
  const stopByName = new Map(
    stops.map((stop) => [normalizeStopName(stop.title.rendered), stop]),
  );
  const visibleStops = [
    ...findAll(document, (node) => hasClass(node, "route-stop-text")),
    ...findAll(document, (node) => hasClass(node, "route-stop-bottom-text")),
  ].flatMap((node) => {
    const nestedFirstStops = findAll(node, (child) =>
      hasClass(child, "first-stop"),
    );
    return nestedFirstStops.length ? nestedFirstStops : [node];
  });
  const stopCandidates = visibleStops.map((node, sourceDomOrdinal) => {
    const sourceName = text(node, "route-remarks");
    const matched = stopByName.get(normalizeStopName(sourceName));
    return {
      sourceDomOrdinal,
      sourceName,
      officialStopId: matched?.id ?? null,
      officialStopSlug: matched?.slug ?? null,
      matchStatus: matched ? "matched_by_normalized_name" : "unmatched",
    };
  });
  const audienceText = text(
    firstByClass(document, "route-heading") ?? document,
  );
  const activeRouteCard = findAll(
    document,
    (node) => hasClass(node, "home-route") && hasClass(node, "active"),
  )[0];
  const statusClass = activeRouteCard
    ? attr(
        firstByClass(activeRouteCard, "hr-status") ?? activeRouteCard,
        "class",
      )
    : undefined;
  const operatingStatus = statusClass?.includes("hr-status-normal")
    ? "normal_service"
    : statusClass?.includes("hr-status-delayed")
      ? "service_delay"
      : statusClass?.includes("hr-status-suspended")
        ? "service_suspension"
        : statusClass?.includes("hr-status-no")
          ? "non_service_hours"
          : "unknown_requires_review";

  return {
    routeId: route.slug,
    sourceSnapshotId: source.snapshot.snapshotId,
    officialRoutePostId: route.id,
    publicName: decodeHtml(route.title.rendered),
    sourceModifiedAt: route.modified,
    operatingStatus: {
      value: operatingStatus,
      observedAt: source.snapshot.fetchedAt,
      sourceSnapshotId: source.snapshot.snapshotId,
      sourceProvidesStatusEffectiveInterval: false,
    },
    audience: /students\s*&\s*staff/i.test(audienceText)
      ? "cuhk_students_and_staff"
      : /paid|fare|public/i.test(asString(source))
        ? "public_paid"
        : "needs_review",
    scheduleBands: parseScheduleBands(document),
    patternCandidate: {
      stopCandidates,
      sequenceStatus: "manual_review_required_visual_layout",
      reason:
        "The official page uses separate left/right/bottom columns; DOM order is not travel order.",
      fieldLocators: [".route-stop-text", ".route-stop-bottom-text"],
    },
  };
}

function evaluateServiceRule(
  raw: string,
  date: string,
  publicHoliday: boolean,
  teachingDay: boolean,
): boolean | null {
  const rule = raw.toLowerCase();
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (rule.includes("teaching days only") && !teachingDay) return false;
  if (/except public holidays?/.test(rule) && publicHoliday) return false;
  if (/mon to sun/.test(rule)) return true;
  if (/sun(day)?\s*&\s*public holidays?/.test(rule)) {
    return day === 0 || publicHoliday;
  }
  if (/mon to sat/.test(rule)) return day >= 1 && day <= 6;
  if (/mon to fri/.test(rule)) return day >= 1 && day <= 5;
  if (/\bsat\b/.test(rule)) return day === 6;
  return null;
}

function expandDepartures(
  startTime: string,
  endTime: string,
  minutes: number[],
) {
  const [startHour, startMinute] = startTime.split(":").map(Number);
  const [endHour, endMinute] = endTime.split(":").map(Number);
  const start = startHour * 60 + startMinute;
  const end = endHour * 60 + endMinute;
  const result: string[] = [];
  for (let hour = startHour; hour <= endHour; hour++) {
    for (const minute of minutes) {
      const value = hour * 60 + minute;
      if (value < start || value > end) continue;
      result.push(
        `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`,
      );
    }
  }
  return result;
}

function parseNoticePage(source: FetchResult, notice: WpItem) {
  const document = parse(asString(source)) as unknown as HtmlNode;
  const content = firstByClass(document, "content-news-large") ?? document;
  const imageUrls = findAll(content, (node) => node.nodeName === "img")
    .map((node) => attr(node, "src"))
    .filter((url): url is string => Boolean(url?.includes("/uploads/news/")));
  const displayedDateRaw = text(firstByClass(content, "cn-date") ?? content);
  return {
    sourcePostId: notice.id,
    title: decodeHtml(notice.title.rendered),
    publishedAt: notice.date,
    modifiedAt: notice.modified,
    displayedDateRaw,
    detailUrl: notice.link,
    imageUrls,
    completedHint: /\(completed\)/i.test(decodeHtml(notice.title.rendered)),
    parseStatus: imageUrls.length
      ? "image_only_manual_review_required"
      : "manual_review_required",
  };
}

async function main() {
  const date = cliValue("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("--date=YYYY-MM-DD is required");
  }
  const publicHoliday = requiredBoolean("public-holiday");
  const teachingDay = requiredBoolean("teaching-day");
  const outputPath = resolve(cliValue("output") ?? OUTPUT_DEFAULT);
  const overrides = parseOverrides(
    JSON.parse(await readFile(OVERRIDES_FILE, "utf8")) as unknown,
  );

  const [
    routeIndex,
    stopIndex,
    noticeIndex,
    currentPdf,
    historicalPdf,
    almanac2025,
    almanac2026,
    publicHolidays,
  ] = await Promise.all([
    fetchSource("cuhk-route-index", "route_index_json", ROUTE_INDEX),
    fetchSource("cuhk-stop-index", "stop_index_json", STOP_INDEX),
    fetchSource("cuhk-notice-index", "notice_index_json", NOTICE_INDEX),
    fetchSource(
      "cuhk-shuttle-current",
      "schedule_pdf",
      `${BASE}/wp-content/uploads/documents/Shuttle.pdf`,
    ),
    fetchSource(
      "cuhk-shuttle-2024-25",
      "historical_schedule_pdf",
      `${BASE}/wp-content/uploads/documents/Shuttle_24-25.pdf`,
    ),
    fetchSource(
      "cuhk-almanac-2025-26",
      "academic_calendar_html",
      "https://www.res.cuhk.edu.hk/general-information/almanac/university-almanac-2025-26/full-time-undergraduate-programmes-teaching-terms/",
    ),
    fetchSource(
      "cuhk-almanac-2026-27",
      "academic_calendar_html",
      "https://www.res.cuhk.edu.hk/general-information/almanac/university-almanac-2026-27/full-time-undergraduate-programmes-teaching-terms/",
    ),
    fetchSource(
      "hksarg-public-holidays",
      "public_holiday_json",
      "https://www.1823.gov.hk/common/ical/en.json",
    ),
  ]);
  const routeItems = parseWpItems(routeIndex);
  const stopItems = parseWpItems(stopIndex);
  const noticeItems = parseWpItems(noticeIndex);
  const routeSources = await Promise.all(
    routeItems.map((route) =>
      fetchSource(`cuhk-route-${route.slug}`, "route_html", route.link),
    ),
  );
  const noticeSources = await Promise.all(
    noticeItems.map((notice) =>
      fetchSource(`cuhk-notice-${notice.id}`, "notice_html", notice.link),
    ),
  );
  const routes = routeItems.map((route, index) =>
    parseRoutePage(routeSources[index], route, stopItems),
  );
  const notices = noticeItems.map((notice, index) =>
    parseNoticePage(noticeSources[index], notice),
  );
  const noticeImages = await Promise.all(
    notices
      .flatMap((notice) =>
        notice.imageUrls.map((url, index) => ({ notice, url, index })),
      )
      .map(({ notice, url, index }) =>
        fetchSource(
          `cuhk-notice-${notice.sourcePostId}-image-${index}`,
          "notice_image",
          url,
        ),
      ),
  );
  const [currentPdfEvidence, historicalPdfEvidence] = await Promise.all([
    extractPdfEvidence(currentPdf),
    extractPdfEvidence(historicalPdf),
  ]);
  const calendarEvidence = [
    parseAcademicCalendar(almanac2025),
    parseAcademicCalendar(almanac2026),
  ];
  const publicHolidayEvidence = parsePublicHolidays(publicHolidays);
  const derivedPublicHoliday = publicHolidayEvidence.events.some(
    (event) => event.date === date,
  );
  const noticeOcrDrafts = await Promise.all(noticeImages.map(extractNoticeOcr));
  const derivedTeachingDay =
    !derivedPublicHoliday &&
    calendarEvidence.some((calendar) =>
      calendar.terms.some((term) => dateInRange(date, term)),
    ) &&
    !calendarEvidence.some((calendar) =>
      calendar.readingWeeks.some((week) => dateInRange(date, week)),
    );
  const generatedAt = new Date();
  const observedServiceDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(generatedAt);

  const todayBands = routes.flatMap((route) =>
    route.scheduleBands.map((band) => {
      const active = evaluateServiceRule(
        band.serviceRuleRaw,
        date,
        derivedPublicHoliday,
        derivedTeachingDay,
      );
      return {
        routeId: route.routeId,
        sourceOrdinal: band.sourceOrdinal,
        active,
        originStopId: null,
        originStatus: "blocked_by_unverified_stop_sequence",
        departures:
          active && band.startTime && band.endTime
            ? expandDepartures(
                band.startTime,
                band.endTime,
                band.departureMinutes,
              )
            : [],
        evidence: {
          serviceRuleRaw: band.serviceRuleRaw,
          departureRuleRaw: band.departureRuleRaw,
          sourceSnapshotId: route.sourceSnapshotId,
          fieldLocators: band.fieldLocators,
        },
      };
    }),
  );
  const routeIdSet = new Set(routes.map((route) => route.routeId));
  const overrideChecks = overrides.map((override) => {
    const notice = notices.find(
      (candidate) => candidate.sourcePostId === override.sourcePostId,
    );
    const imageSnapshot = noticeImages.find(
      (candidate) =>
        candidate.snapshot.sourceId.startsWith(
          `cuhk-notice-${override.sourcePostId}-image-`,
        ) && candidate.snapshot.sha256 === override.sourceImageSha256,
    );
    const validationErrors = [
      ...(!notice ? ["notice_not_found"] : []),
      ...(notice?.completedHint ? ["notice_marked_completed"] : []),
      ...(!imageSnapshot ? ["source_image_hash_mismatch"] : []),
      ...(!override.reviewedBy || !override.reviewedAt
        ? ["review_audit_missing"]
        : []),
      ...override.effect.routeIds
        .filter((routeId) => !routeIdSet.has(routeId))
        .map((routeId) => `unknown_route:${routeId}`),
    ];
    const startDate = override.effectiveFrom.slice(0, 10);
    const endDate = override.effectiveTo?.slice(0, 10) ?? null;
    const appliesToServiceDate =
      startDate <= date && (endDate ? date <= endDate : date === startDate);
    const activeAtGeneratedAt =
      appliesToServiceDate &&
      generatedAt >= new Date(override.effectiveFrom) &&
      (!override.effectiveTo || generatedAt <= new Date(override.effectiveTo));
    return {
      ...override,
      sourceSnapshotId: imageSnapshot?.snapshot.snapshotId ?? null,
      validationErrors,
      appliesToServiceDate,
      activeAtGeneratedAt,
      releaseStatus: "production_operator_approval_required",
    };
  });
  const unresolvedRules = todayBands.filter((band) => band.active === null);
  const incompleteBands = routes.flatMap((route) =>
    route.scheduleBands
      .filter((band) => band.parseStatus !== "parsed")
      .map((band) => `${route.routeId}/${band.sourceOrdinal}`),
  );
  const unmatchedStops = routes.flatMap((route) =>
    route.patternCandidate.stopCandidates
      .filter((stop) => stop.matchStatus === "unmatched")
      .map((stop) => ({ routeId: route.routeId, sourceName: stop.sourceName })),
  );
  const sourceSnapshots = [
    routeIndex,
    stopIndex,
    noticeIndex,
    currentPdf,
    historicalPdf,
    almanac2025,
    almanac2026,
    publicHolidays,
    ...routeSources,
    ...noticeSources,
    ...noticeImages,
  ].map((source) => source.snapshot);
  const normalRouteIds = new Set(["1a", "1b", "2", "3", "4", "8"]);
  const htmlNormalWindows = routes
    .filter((route) => normalRouteIds.has(route.routeId))
    .flatMap((route) =>
      route.scheduleBands
        .filter((band) => band.startTime && band.endTime)
        .map((band) => `${band.startTime}-${band.endTime}`),
    )
    .sort();
  const missingCurrentPdfWindows = htmlNormalWindows.filter(
    (window) => !currentPdfEvidence.scheduleWindows.includes(window),
  );
  const overrideValidationErrors = overrideChecks.flatMap((override) =>
    override.validationErrors.map(
      (error) => `Override ${override.sourcePostId}: ${error}`,
    ),
  );
  const blockingErrors = [
    ...(routeItems.length === 14
      ? []
      : [`Expected 14 route posts, received ${routeItems.length}`]),
    ...unresolvedRules.map(
      (band) =>
        `Unresolved service rule: ${band.routeId}/${band.sourceOrdinal}`,
    ),
    ...incompleteBands.map((band) => `Incomplete schedule band: ${band}`),
    ...(observedServiceDate === date
      ? []
      : [
          `Current HTML was observed on ${observedServiceDate} and cannot be projected to ${date}`,
        ]),
    ...(publicHoliday && teachingDay
      ? ["Calendar inputs conflict: a public holiday cannot be a teaching day"]
      : []),
    ...(derivedPublicHoliday === publicHoliday
      ? []
      : [
          `Public-holiday input ${publicHoliday} disagrees with HKSARG evidence ${derivedPublicHoliday}`,
        ]),
    ...(derivedTeachingDay === teachingDay
      ? []
      : [
          `Teaching-day input ${teachingDay} disagrees with parsed almanac evidence ${derivedTeachingDay}`,
        ]),
    ...calendarEvidence
      .filter((calendar) => calendar.parseStatus === "manual_review_required")
      .map(
        (calendar) => `Calendar parse incomplete: ${calendar.sourceSnapshotId}`,
      ),
    ...missingCurrentPdfWindows.map(
      (window) => `Current PDF does not corroborate HTML window ${window}`,
    ),
    ...overrideValidationErrors,
  ];

  const output = {
    prototype: true,
    parserVersion: PARSER_VERSION,
    generatedAt: generatedAt.toISOString(),
    question:
      "Can current CUHK public sources produce traceable canonical rows and today's departures without overstating certainty?",
    sourceSnapshots,
    extractedEvidence: {
      pdf: {
        current: currentPdfEvidence,
        historical2024_25: historicalPdfEvidence,
        semanticComparison: {
          sameScheduleWindows:
            JSON.stringify(currentPdfEvidence.scheduleWindows) ===
            JSON.stringify(historicalPdfEvidence.scheduleWindows),
          currentMissingHtmlWindows: missingCurrentPdfWindows,
          historicalEffectiveFrom: historicalPdfEvidence.effectiveFrom,
          currentEffectiveFrom: currentPdfEvidence.effectiveFrom,
        },
      },
      academicCalendars: calendarEvidence,
      publicHolidays: publicHolidayEvidence,
      noticeOcrDrafts,
    },
    canonicalCandidates: {
      routes,
      officialStops: stopItems.map((stop) => ({
        stopId: `cuhk-wp-stop-${stop.id}`,
        officialPostId: stop.id,
        slug: stop.slug,
        nameEn: decodeHtml(stop.title.rendered),
        sourceModifiedAt: stop.modified,
        coordinates: null,
        campusMapPlaceId: null,
      })),
    },
    today: {
      serviceDate: date,
      timezone: "Asia/Hong_Kong",
      explicitCalendarInputs: { publicHoliday, teachingDay },
      derivedCalendarEvidence: {
        publicHoliday: derivedPublicHoliday,
        teachingDay: derivedTeachingDay,
      },
      scheduleBands: todayBands,
      operatorReviewDrafts: overrideChecks.filter(
        (override) => override.appliesToServiceDate,
      ),
      arrivalProjections: [],
      realtimeFeed: null,
      labels: {
        departures: "official_schedule_candidate_unpublished",
        intermediateArrivals: "not_available",
        realtime: "not_available",
      },
    },
    validation: {
      counts: {
        routePosts: routeItems.length,
        stopPosts: stopItems.length,
        scheduleBands: routes.reduce(
          (count, route) => count + route.scheduleBands.length,
          0,
        ),
        departuresForDate: todayBands.reduce(
          (count, band) => count + band.departures.length,
          0,
        ),
        noticePostsInspected: notices.length,
        noticeImagesHashed: noticeImages.length,
      },
      blockingErrors,
      reviewQueue: [
        {
          kind: "route_pattern_sequence",
          count: routes.length,
          reason:
            "Visual multi-column HTML does not encode travel order safely.",
        },
        {
          kind: "unmatched_stop_names",
          count: unmatchedStops.length,
          items: unmatchedStops,
        },
        {
          kind: "notice_ocr_drafts",
          count: notices.filter((notice) => notice.imageUrls.length).length,
          reason:
            "OCR is a draft; effective interval and impact require an operator review linked to the image hash.",
        },
        {
          kind: "pdf_change",
          count:
            currentPdf.snapshot.sha256 === historicalPdf.snapshot.sha256
              ? 0
              : 1,
          reason:
            "Current and 2024-25 PDF hashes differ; parsed schedule windows agree, while only the historical PDF exposes an effective date.",
        },
      ],
      releaseGates: {
        routeLevelScheduleCandidates: blockingErrors.length === 0,
        orderedStopPatterns: false,
        datedNoticeOverrides: false,
        reason:
          "This spike stages candidates only; production publication requires reviewed source diffs, ordered patterns, and operator-approved notice overrides.",
      },
      publishDecision: blockingErrors.length
        ? "blocked_by_validation_errors"
        : "staged_candidates_require_operator_review",
    },
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  console.log(
    JSON.stringify(
      {
        outputPath,
        ...output.validation.counts,
        blockingErrors: output.validation.blockingErrors.length,
        publishDecision: output.validation.publishDecision,
      },
      null,
      2,
    ),
  );
  if (output.validation.blockingErrors.length) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
