import { createReadStream } from "node:fs";
import { compose } from "node:stream";
import { parseArgs } from "node:util";
import { createGunzip } from "node:zlib";
import { isPerformanceRouteLabel } from "./performance-route-labels.mjs";

const timingFields = [
  "requestSeconds",
  "upstreamHeaderSeconds",
  "upstreamResponseSeconds",
];
const usage =
  "Usage: node scripts/performance-origin-report.mjs --log <path> [--log <path> ...] --since <ISO> [--until <ISO>]";

function timestamp(value) {
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    return NaN;
  }
  return Date.parse(value);
}

async function* readLines(path) {
  const file = createReadStream(path);
  const stream = path.endsWith(".gz") ? compose(file, createGunzip()) : file;
  stream.setEncoding("utf8");
  let remainder = "";
  for await (const chunk of stream) {
    const lines = (remainder + chunk).split("\n");
    remainder = lines.pop();
    yield* lines;
  }
  if (remainder) yield remainder;
}

function newSummary() {
  return {
    requests: 0,
    bytes: 0,
    statuses: {},
    http5xx: 0,
    http429: 0,
    timings: Object.fromEntries(timingFields.map((field) => [field, []])),
  };
}

function addRequest(summary, record) {
  summary.requests++;
  summary.bytes += record.bytes;
  summary.statuses[record.status] = (summary.statuses[record.status] ?? 0) + 1;
  if (record.status >= 500) summary.http5xx++;
  if (record.status === 429) summary.http429++;
  for (const field of timingFields) {
    const sample = record[field];
    if (
      typeof sample === "number" ||
      (typeof sample === "string" && /^\d+(\.\d+)?$/.test(sample))
    ) {
      const seconds = Number(sample);
      if (Number.isFinite(seconds) && seconds >= 0)
        summary.timings[field].push(seconds);
    }
  }
}

function summarizeTimings(samples) {
  if (samples.length === 0) {
    return { samples: 0, min: null, median: null, max: null };
  }

  samples.sort((a, b) => a - b);
  const lower = samples[Math.floor((samples.length - 1) / 2)];
  const upper = samples[Math.floor(samples.length / 2)];
  return {
    samples: samples.length,
    min: samples[0],
    median: lower + (upper - lower) / 2,
    max: samples.at(-1),
  };
}

function finishSummary({ timings, ...summary }) {
  return {
    ...summary,
    timings: Object.fromEntries(
      Object.entries(timings).map(([field, samples]) => [
        field,
        summarizeTimings(samples),
      ]),
    ),
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      log: { type: "string", multiple: true },
      since: { type: "string" },
      until: { type: "string" },
      help: { type: "boolean" },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  const since = timestamp(values.since);
  const until =
    values.until === undefined ? Date.now() : timestamp(values.until);
  if (
    !values.log?.length ||
    !Number.isFinite(since) ||
    !Number.isFinite(until) ||
    since >= until
  ) {
    throw new Error(
      `Specify at least one log and a valid ISO time window with a timezone.\n${usage}`,
    );
  }

  const total = newSummary();
  const byRoute = new Map();
  let invalidRecords = 0;
  let parsedFiles = 0;
  let missingFiles = 0;

  for (const path of new Set(values.log)) {
    try {
      for await (const line of readLines(path)) {
        if (!line.trim()) continue;
        let record;
        try {
          record = JSON.parse(line);
        } catch {
          invalidRecords++;
          continue;
        }

        const time = timestamp(record?.time);
        if (
          !Number.isFinite(time) ||
          !Number.isInteger(record.status) ||
          record.status < 100 ||
          record.status > 599 ||
          !Number.isSafeInteger(record.bytes) ||
          record.bytes < 0
        ) {
          invalidRecords++;
          continue;
        }
        if (time < since || time >= until) continue;

        const route = isPerformanceRouteLabel(record.route)
          ? record.route
          : "other";
        if (!byRoute.has(route)) byRoute.set(route, newSummary());
        addRequest(total, record);
        addRequest(byRoute.get(route), record);
      }
      parsedFiles++;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missingFiles++;
      console.error(`Log file missing: ${path}`);
    }
  }
  if (!parsedFiles) throw new Error("No log files could be read.");

  console.log(
    JSON.stringify(
      {
        since: new Date(since).toISOString(),
        until: new Date(until).toISOString(),
        parsedFiles,
        missingFiles,
        invalidRecords,
        total: finishSummary(total),
        routes: Object.fromEntries(
          [...byRoute]
            .sort(([first], [second]) => first.localeCompare(second))
            .map(([route, summary]) => [route, finishSummary(summary)]),
        ),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
