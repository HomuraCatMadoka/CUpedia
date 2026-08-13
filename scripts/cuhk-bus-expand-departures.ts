/**
 * Expand official schedule bands into concrete origin departure candidates.
 *
 * Input: docs/campus-transport/data/cuhk-public-data/merged.snapshot.json
 * Output: docs/campus-transport/data/schedules/
 *   - all-origin-departures.json  (full audit package)
 *   - all-origin-departures.csv   (flat table)
 *   - by-route/<slug>.json
 *
 * These are scheduled origin departures, not stop times / ETA / realtime.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { format } from "prettier";

const GENERATOR_VERSION = "cuhk-bus-expand-departures/1";
const DEFAULT_INPUT = resolve(
  "docs/campus-transport/data/cuhk-public-data/merged.snapshot.json",
);
const OUTPUT_DIR = resolve("docs/campus-transport/data/schedules");

type ScheduleBand = {
  sourceOrdinal: number;
  startTime: string | null;
  endTime: string | null;
  departureMinutes: number[];
  serviceRuleRaw: string;
  departureRuleRaw: string;
  departureRemarkRaw?: string | null;
  parseStatus: string;
};

type Pattern = {
  patternId: string;
  activation?: {
    departureMinutes?: number[];
    serviceDayType?: string;
  };
  stopSequence?: Array<{ sequence: number; stopId: string; stopName: string }>;
};

type Route = {
  routeId: string;
  name: string;
  nameZhHant?: string;
  sourceRef: string;
  scheduleBands?: ScheduleBand[];
  officialMapEvidence?: {
    routePatterns?: Pattern[];
    reviewStatus?: string;
  };
};

type Snapshot = {
  generatedAt: string;
  parserVersion: string;
  merged: { routes: Route[] };
};

type ExpandedDeparture = {
  departureId: string;
  routeId: string;
  routeName: string;
  routeNameZhHant: string | null;
  originDeparture: string;
  departureMinute: number;
  bandOrdinal: number;
  serviceWindow: string;
  serviceRuleRaw: string;
  departureRuleRaw: string;
  departureRemarkRaw: string | null;
  serviceDayHints: string[];
  patternCandidates: Array<{
    patternId: string;
    serviceDayType: string | null;
    stopCount: number;
  }>;
  patternMatchStatus: "unique" | "ambiguous" | "none" | "no_patterns";
  selectedPatternId: string | null;
  status: "scheduled_departure_candidate" | "manual_review_required";
  evidence: {
    routeSourceRef: string;
    parserVersion: string;
    generatorVersion: string;
  };
};

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function fromMinutes(total: number): string {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function expandBandMinutes(
  startTime: string,
  endTime: string,
  departureMinutes: number[],
): string[] {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (end < start) {
    // Overnight windows are not present in current CUHK pages; keep explicit.
    throw new Error(`Overnight window not supported: ${startTime}-${endTime}`);
  }
  const out: string[] = [];
  for (let t = start; t <= end; t++) {
    if (departureMinutes.includes(t % 60)) out.push(fromMinutes(t));
  }
  return out;
}

function serviceDayHints(rule: string): string[] {
  const hints = new Set<string>();
  const r = rule.toLowerCase();
  if (/teaching days? only/.test(r)) hints.add("teaching_day");
  if (/non[- ]teaching/.test(r)) hints.add("non_teaching_day");
  if (/reading week/.test(r)) hints.add("excludes_reading_week");
  if (/sun/.test(r) && /public holiday/.test(r)) {
    hints.add("sunday");
    hints.add("public_holiday");
  }
  if (/mon to sat/.test(r) || /mon - sat/.test(r) || /mon to fri/.test(r)) {
    if (/mon to fri/.test(r) || /mon - fri/.test(r)) {
      hints.add("monday");
      hints.add("tuesday");
      hints.add("wednesday");
      hints.add("thursday");
      hints.add("friday");
    } else {
      hints.add("monday");
      hints.add("tuesday");
      hints.add("wednesday");
      hints.add("thursday");
      hints.add("friday");
      hints.add("saturday");
    }
  }
  if (/mon to sun/.test(r) || /mon - sun/.test(r)) {
    for (const d of [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ]) {
      hints.add(d);
    }
  }
  if (/except public holiday/.test(r) || /except public holidays/.test(r)) {
    hints.add("except_public_holiday");
  }
  if (/public holidays?/.test(r) && !/except public holiday/.test(r)) {
    hints.add("public_holiday");
  }
  if (/sat/.test(r) && !/mon to sat/.test(r) && !/mon - sat/.test(r)) {
    hints.add("saturday");
  }
  return [...hints];
}

function matchPatterns(
  patterns: Pattern[],
  departureMinute: number,
): {
  candidates: ExpandedDeparture["patternCandidates"];
  status: ExpandedDeparture["patternMatchStatus"];
  selectedPatternId: string | null;
} {
  if (!patterns.length) {
    return { candidates: [], status: "no_patterns", selectedPatternId: null };
  }

  const activated = patterns.filter((pattern) => {
    const mins = pattern.activation?.departureMinutes;
    if (!mins || mins.length === 0) return true;
    return mins.includes(departureMinute);
  });

  const candidates = activated.map((pattern) => ({
    patternId: pattern.patternId,
    serviceDayType: pattern.activation?.serviceDayType ?? null,
    stopCount: pattern.stopSequence?.length ?? 0,
  }));

  if (candidates.length === 1) {
    return {
      candidates,
      status: "unique",
      selectedPatternId: candidates[0].patternId,
    };
  }
  if (candidates.length === 0) {
    return { candidates: [], status: "none", selectedPatternId: null };
  }
  return { candidates, status: "ambiguous", selectedPatternId: null };
}

function expandRoute(route: Route, parserVersion: string): ExpandedDeparture[] {
  const bands = route.scheduleBands ?? [];
  const patterns = route.officialMapEvidence?.routePatterns ?? [];
  const rows: ExpandedDeparture[] = [];

  for (const band of bands) {
    if (
      band.parseStatus !== "parsed" ||
      !band.startTime ||
      !band.endTime ||
      !band.departureMinutes.length
    ) {
      rows.push({
        departureId: `${route.routeId}:band-${band.sourceOrdinal}:unparsed`,
        routeId: route.routeId,
        routeName: route.name,
        routeNameZhHant: route.nameZhHant ?? null,
        originDeparture: "",
        departureMinute: -1,
        bandOrdinal: band.sourceOrdinal,
        serviceWindow: `${band.startTime ?? "?"}–${band.endTime ?? "?"}`,
        serviceRuleRaw: band.serviceRuleRaw,
        departureRuleRaw: band.departureRuleRaw,
        departureRemarkRaw: band.departureRemarkRaw ?? null,
        serviceDayHints: serviceDayHints(band.serviceRuleRaw),
        patternCandidates: [],
        patternMatchStatus: "none",
        selectedPatternId: null,
        status: "manual_review_required",
        evidence: {
          routeSourceRef: route.sourceRef,
          parserVersion,
          generatorVersion: GENERATOR_VERSION,
        },
      });
      continue;
    }

    const times = expandBandMinutes(
      band.startTime,
      band.endTime,
      band.departureMinutes,
    );
    for (const originDeparture of times) {
      const minute = Number(originDeparture.slice(3, 5));
      const matched = matchPatterns(patterns, minute);
      rows.push({
        departureId: `${route.routeId}:${originDeparture}:b${band.sourceOrdinal}`,
        routeId: route.routeId,
        routeName: route.name,
        routeNameZhHant: route.nameZhHant ?? null,
        originDeparture,
        departureMinute: minute,
        bandOrdinal: band.sourceOrdinal,
        serviceWindow: `${band.startTime}–${band.endTime}`,
        serviceRuleRaw: band.serviceRuleRaw,
        departureRuleRaw: band.departureRuleRaw,
        departureRemarkRaw: band.departureRemarkRaw ?? null,
        serviceDayHints: serviceDayHints(band.serviceRuleRaw),
        patternCandidates: matched.candidates,
        patternMatchStatus: matched.status,
        selectedPatternId: matched.selectedPatternId,
        status: "scheduled_departure_candidate",
        evidence: {
          routeSourceRef: route.sourceRef,
          parserVersion,
          generatorVersion: GENERATOR_VERSION,
        },
      });
    }
  }

  return rows;
}

function toCsv(rows: ExpandedDeparture[]): string {
  const headers = [
    "departureId",
    "routeId",
    "routeName",
    "originDeparture",
    "departureMinute",
    "bandOrdinal",
    "serviceWindow",
    "serviceDayHints",
    "selectedPatternId",
    "patternMatchStatus",
    "status",
    "serviceRuleRaw",
    "departureRuleRaw",
    "departureRemarkRaw",
  ];
  const escape = (value: string | number | null) => {
    const text = value == null ? "" : String(value);
    if (/[",\n]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
    return text;
  };
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(
      [
        row.departureId,
        row.routeId,
        row.routeName,
        row.originDeparture,
        row.departureMinute,
        row.bandOrdinal,
        row.serviceWindow,
        row.serviceDayHints.join("|"),
        row.selectedPatternId ?? "",
        row.patternMatchStatus,
        row.status,
        row.serviceRuleRaw,
        row.departureRuleRaw,
        row.departureRemarkRaw ?? "",
      ]
        .map(escape)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

async function main() {
  const inputPath = process.argv[2] ?? DEFAULT_INPUT;
  const raw = await readFile(inputPath, "utf8");
  const snapshot = JSON.parse(raw) as Snapshot;
  const all = snapshot.merged.routes
    .flatMap((route) => expandRoute(route, snapshot.parserVersion))
    .sort((a, b) =>
      a.routeId === b.routeId
        ? a.originDeparture.localeCompare(b.originDeparture) ||
          a.bandOrdinal - b.bandOrdinal
        : a.routeId.localeCompare(b.routeId),
    );

  const byRoute: Record<string, ExpandedDeparture[]> = {};
  for (const row of all) {
    (byRoute[row.routeId] ??= []).push(row);
  }

  const summary = {
    generatorVersion: GENERATOR_VERSION,
    sourceSnapshotGeneratedAt: snapshot.generatedAt,
    sourceParserVersion: snapshot.parserVersion,
    routeCount: snapshot.merged.routes.length,
    departureCandidateCount: all.filter(
      (row) => row.status === "scheduled_departure_candidate",
    ).length,
    manualReviewCount: all.filter(
      (row) => row.status === "manual_review_required",
    ).length,
    uniquePatternMatches: all.filter(
      (row) => row.patternMatchStatus === "unique",
    ).length,
    ambiguousPatternMatches: all.filter(
      (row) => row.patternMatchStatus === "ambiguous",
    ).length,
    perRoute: Object.fromEntries(
      Object.entries(byRoute).map(([routeId, rows]) => [
        routeId,
        {
          candidates: rows.filter(
            (row) => row.status === "scheduled_departure_candidate",
          ).length,
          manualReview: rows.filter(
            (row) => row.status === "manual_review_required",
          ).length,
          uniquePattern: rows.filter(
            (row) => row.patternMatchStatus === "unique",
          ).length,
          ambiguousPattern: rows.filter(
            (row) => row.patternMatchStatus === "ambiguous",
          ).length,
        },
      ]),
    ),
    notes: [
      "originDeparture is the official scheduled origin departure only.",
      "No intermediate stop times are invented.",
      "serviceDayHints are heuristic labels from free text, not a compiled service calendar.",
      "patternMatchStatus=ambiguous means multiple reviewed patterns share the minute (e.g. teaching vs non-teaching).",
    ],
  };

  const packageJson = {
    snapshot: true,
    generatedAt: new Date().toISOString(),
    summary,
    departures: all,
  };

  await mkdir(OUTPUT_DIR, { recursive: true });
  await mkdir(resolve(OUTPUT_DIR, "by-route"), { recursive: true });
  await writeFile(
    resolve(OUTPUT_DIR, "all-origin-departures.json"),
    await format(JSON.stringify(packageJson), { parser: "json" }),
  );
  await writeFile(
    resolve(OUTPUT_DIR, "all-origin-departures.csv"),
    toCsv(all.filter((row) => row.status === "scheduled_departure_candidate")),
  );
  await writeFile(
    resolve(OUTPUT_DIR, "README.md"),
    await format(
      `# CUHK bus scheduled origin departures

Generated by \`${GENERATOR_VERSION}\` from \`${snapshot.parserVersion}\` snapshot (${snapshot.generatedAt}).

| Metric | Count |
| --- | ---: |
| Routes | ${summary.routeCount} |
| Origin departure candidates | ${summary.departureCandidateCount} |
| Manual review rows | ${summary.manualReviewCount} |
| Unique pattern matches | ${summary.uniquePatternMatches} |
| Ambiguous pattern matches | ${summary.ambiguousPatternMatches} |

## Files

- \`all-origin-departures.json\` — full audit package
- \`all-origin-departures.csv\` — flat table of candidates only
- \`by-route/<slug>.json\` — per-route slices

## Boundary

These rows are **起点计划发车** only. They are not stop times, ETA, vehicle positions, or today's compiled service.
`,
      { parser: "markdown" },
    ),
  );

  for (const [routeId, rows] of Object.entries(byRoute)) {
    await writeFile(
      resolve(OUTPUT_DIR, "by-route", `${routeId}.json`),
      await format(
        JSON.stringify({
          routeId,
          generatedAt: packageJson.generatedAt,
          summary: summary.perRoute[routeId],
          departures: rows,
        }),
        { parser: "json" },
      ),
    );
  }

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
