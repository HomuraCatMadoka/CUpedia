#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { access, readFile, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createInterface } from "node:readline";
import { parseArgs } from "node:util";

const REPORT_VERSION = 1;
const REQUEST_TIMEOUT_MS = 30_000;
const RESPONSE_LIMIT_BYTES = 8 * 1024 * 1024;
const REQUEST_ID = /^[a-f0-9]{32}$/;
const LABEL = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,79}$/;
const ROUTE = /^(?:\/(?:[a-zA-Z0-9_-]+|\[(?:\.\.\.)?[a-zA-Z0-9_-]+\]))*\/?$/;
const ROUTE_GROUPS = new Set(["static", "other"]);
const CACHE_STATUSES = new Set([
  "BYPASS",
  "DYNAMIC",
  "EXPIRED",
  "HIT",
  "MISS",
  "REVALIDATED",
  "STALE",
  "UPDATING",
]);
const CACHED_RESPONSES = new Set(["HIT", "STALE", "UPDATING", "REVALIDATED"]);
const MODES = [
  { mode: "serial", concurrency: 1 },
  { mode: "burst", concurrency: 3 },
];

const USAGE =
  "Usage: node scripts/performance-experiments.mjs run " +
  "--base-url <origin> --scenarios <file.json> --out <report.json> " +
  "--revision <id> --environment <label> --probe <label> --fixture <label> " +
  "[--origin-log <file>] [--app-log <file>] [--samples 9] [--warmup 1] [--change <label>]\n" +
  "       node scripts/performance-experiments.mjs compare <baseline.json> <rerun.json>";

function readLabel(value, name) {
  if (typeof value !== "string" || !LABEL.test(value)) {
    throw new Error(`Expected a short label for ${name}`);
  }
  return value;
}

function readCount(value, name, min, max) {
  if (!/^\d+$/.test(value) || Number(value) < min || Number(value) > max) {
    throw new Error(`Expected ${name} between ${min} and ${max}`);
  }
  return Number(value);
}

async function readJson(file) {
  const contents = await readFile(file, "utf8");
  try {
    return JSON.parse(contents);
  } catch {
    throw new Error("Input file does not contain valid JSON");
  }
}

function readBaseUrl(value) {
  const url = URL.canParse(value) ? new URL(value) : null;
  if (
    !url ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("Expected an HTTP(S) origin for --base-url");
  }
  return url;
}

async function loadScenarios(file, baseUrl) {
  const input = await readJson(file);
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error("Expected a non-empty array of scenarios");
  }
  const ids = new Set();
  return input.map((scenario, index) => {
    if (!scenario || typeof scenario !== "object" || Array.isArray(scenario)) {
      throw new Error(`Invalid scenario at position ${index + 1}`);
    }
    const { id, path, route, expectedStatus, contains } = scenario;
    readLabel(id, "scenario ID");
    const url =
      typeof path === "string" && URL.canParse(path, baseUrl)
        ? new URL(path, baseUrl)
        : null;
    if (
      ids.has(id) ||
      !url ||
      !path.startsWith("/") ||
      path.startsWith("//") ||
      /[\\\x00-\x20\x7f]/.test(path) ||
      url.origin !== baseUrl.origin ||
      url.hash ||
      typeof route !== "string" ||
      !(
        (route.startsWith("/") && ROUTE.test(route)) ||
        ROUTE_GROUPS.has(route)
      ) ||
      !Number.isInteger(expectedStatus) ||
      expectedStatus < 200 ||
      expectedStatus > 599 ||
      typeof contains !== "string" ||
      contains.length === 0
    ) {
      throw new Error(`Invalid or duplicate scenario at position ${index + 1}`);
    }
    ids.add(id);
    return { id, path, route, expectedStatus, contains };
  });
}

function fingerprint(value) {
  return createHash("sha256").update(value).digest("hex");
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

async function checkBody(response, marker) {
  if (!response.body) return "expected-content-missing";
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let tail = "";
  let found = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > RESPONSE_LIMIT_BYTES) {
      await reader.cancel();
      return "response-too-large";
    }
    if (!found) {
      const text = tail + decoder.decode(value, { stream: true });
      found = text.includes(marker);
      tail = marker.length > 1 ? text.slice(1 - marker.length) : "";
    }
  }
  return found || (tail + decoder.decode()).includes(marker)
    ? null
    : "expected-content-missing";
}

async function measure(baseUrl, scenario) {
  const startedAt = new Date().toISOString();
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const start = performance.now();
  let headersMs = null;
  let status = null;
  let requestId = null;
  let cacheStatus = null;
  let error;
  try {
    const response = await fetch(new URL(scenario.path, baseUrl), {
      method: "GET",
      redirect: "manual",
      signal,
    });
    headersMs = roundMs(performance.now() - start);
    status = response.status;
    const cache = response.headers.get("cf-cache-status");
    if (CACHE_STATUSES.has(cache)) cacheStatus = cache;
    const id = response.headers.get("x-request-id");
    if (id && REQUEST_ID.test(id)) requestId = id;
    const bodyError = await checkBody(response, scenario.contains);
    error =
      status === scenario.expectedStatus ? bodyError : "unexpected-status";
  } catch {
    error = signal.aborted ? "request-timeout" : "transport-failed";
  }
  return {
    startedAt,
    requestId,
    status,
    cacheStatus,
    error,
    headersMs,
    totalMs: roundMs(performance.now() - start),
  };
}

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

function numericLogValue(value) {
  // Nginx can emit "-" when there is no upstream and lists when it retries.
  if (typeof value === "string" && /^\d+(?:\.\d+)?$/.test(value)) {
    return finiteNumber(Number(value));
  }
  return finiteNumber(value);
}

async function correlateLog(path, prefix, byId, applyRow) {
  if (!path || !byId.size) return;
  const input = createReadStream(path, { encoding: "utf8" });
  const lines = createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    const start = line.indexOf(prefix);
    if (start < 0) continue;
    let row;
    try {
      row = JSON.parse(line.slice(start + prefix.length));
    } catch {
      continue;
    }
    const match = byId.get(row?.requestId);
    if (match) applyRow(row, match);
  }
}

async function correlate(runs, originLog, appLog) {
  const byId = new Map();
  const duplicates = new Set();
  for (const run of runs) {
    for (const sample of [...run.warmupSamples, ...run.samples]) {
      if (!sample.requestId || CACHED_RESPONSES.has(sample.cacheStatus))
        continue;
      if (byId.has(sample.requestId)) duplicates.add(sample.requestId);
      byId.set(sample.requestId, { sample, route: run.route });
    }
  }
  // A cached response can preserve an old ID. Only join a fresh, unique ID.
  for (const requestId of duplicates) byId.delete(requestId);
  await correlateLog(originLog, "", byId, (row, { sample, route }) => {
    sample.origin = {
      routeMatches: row.route === route,
      status: numericLogValue(row.status),
      bytes: numericLogValue(row.bytes),
      requestSeconds: numericLogValue(row.requestSeconds),
      upstreamHeaderSeconds: numericLogValue(row.upstreamHeaderSeconds),
      upstreamResponseSeconds: numericLogValue(row.upstreamResponseSeconds),
    };
  });
  await correlateLog(appLog, "[perf] ", byId, (row, { sample, route }) => {
    const ms = finiteNumber(row.ms);
    if (
      row.route !== route ||
      typeof row.stage !== "string" ||
      !LABEL.test(row.stage) ||
      ms === null
    ) {
      return;
    }
    sample.application ??= [];
    sample.application.push({
      stage: row.stage,
      ms,
      dbPoolWaiting: finiteNumber(row.dbPoolWaiting),
    });
  });
}

function distribution(values) {
  const sorted = values
    .filter((value) => finiteNumber(value) !== null)
    .sort((a, b) => a - b);
  const count = sorted.length;
  if (count === 0) return { count };
  const middle = Math.floor(count / 2);
  const median =
    count % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  return {
    count,
    min: roundMs(sorted[0]),
    median: roundMs(median),
    max: roundMs(sorted[count - 1]),
    ...(count >= 20
      ? { p95: roundMs(sorted[Math.ceil(count * 0.95) - 1]) }
      : {}),
  };
}

function summarize(samples) {
  const successes = samples.filter(({ error }) => error === null);
  return {
    requests: samples.length,
    failures: samples.length - successes.length,
    requestIds: samples.filter(({ requestId }) => requestId).length,
    originMatches: samples.filter(({ origin }) => origin?.routeMatches).length,
    applicationMatches: samples.filter(({ application }) => application?.length)
      .length,
    cachedResponses: samples.filter(({ cacheStatus }) =>
      CACHED_RESPONSES.has(cacheStatus),
    ).length,
    headersMs: distribution(successes.map(({ headersMs }) => headersMs)),
    totalMs: distribution(successes.map(({ totalMs }) => totalMs)),
    originHeadersMs: distribution(
      successes.map(({ origin }) =>
        origin?.routeMatches && origin.upstreamHeaderSeconds !== null
          ? origin.upstreamHeaderSeconds * 1000
          : null,
      ),
    ),
  };
}

function summarizeStages(samples) {
  const stageTimes = new Map();
  for (const sample of samples) {
    if (sample.error !== null) continue;
    for (const { stage, ms } of sample.application ?? []) {
      if (!stageTimes.has(stage)) stageTimes.set(stage, []);
      stageTimes.get(stage).push(ms);
    }
  }
  return Object.fromEntries(
    Array.from(stageTimes, ([stage, values]) => [stage, distribution(values)]),
  );
}

async function runExperiment(args) {
  const { values } = parseArgs({
    args,
    options: {
      "base-url": { type: "string" },
      scenarios: { type: "string" },
      out: { type: "string" },
      revision: { type: "string" },
      environment: { type: "string" },
      probe: { type: "string" },
      fixture: { type: "string" },
      change: { type: "string" },
      "origin-log": { type: "string" },
      "app-log": { type: "string" },
      samples: { type: "string", default: "9" },
      warmup: { type: "string", default: "1" },
    },
  });
  if (!values.scenarios || !values.out) {
    throw new Error("The run command requires --scenarios and --out");
  }
  const baseUrl = readBaseUrl(values["base-url"]);
  const scenarios = await loadScenarios(values.scenarios, baseUrl);
  const sampleCount = readCount(values.samples, "--samples", 3, 90);
  if (sampleCount % 3 !== 0) {
    throw new Error("--samples must be a multiple of 3");
  }
  const warmupCount = readCount(values.warmup, "--warmup", 0, 10);
  const revision = readLabel(values.revision, "--revision");
  const change =
    values.change === undefined ? null : readLabel(values.change, "--change");
  const originLog = values["origin-log"];
  const appLog = values["app-log"];
  await Promise.all(
    [originLog, appLog].filter(Boolean).map((file) => access(file)),
  );

  const conditions = {
    environment: readLabel(values.environment, "--environment"),
    probe: readLabel(values.probe, "--probe"),
    fixture: readLabel(values.fixture, "--fixture"),
    session: "anonymous",
    targetFingerprint: fingerprint(baseUrl.origin),
    scenarioFingerprint: fingerprint(JSON.stringify(scenarios)),
    sampleCount,
    warmupCount,
    originLog: Boolean(originLog),
    appLog: Boolean(appLog),
  };
  const startedAt = new Date().toISOString();
  const runs = [];
  for (const scenario of scenarios) {
    for (const { mode, concurrency } of MODES) {
      const warmupSamples = [];
      for (let index = 0; index < warmupCount; index += 1) {
        warmupSamples.push(await measure(baseUrl, scenario));
      }
      const samples = [];
      for (let index = 0; index < sampleCount; index += concurrency) {
        const batch = Array.from({ length: concurrency }, () =>
          measure(baseUrl, scenario),
        );
        samples.push(...(await Promise.all(batch)));
      }
      runs.push({
        scenario: scenario.id,
        route: scenario.route,
        mode,
        concurrency,
        warmupSamples,
        samples,
      });
    }
  }
  const finishedAt = new Date().toISOString();
  await correlate(runs, originLog, appLog);
  for (const run of runs) {
    run.summary = {
      ...summarize(run.samples),
      applicationMs: summarizeStages(run.samples),
    };
  }
  const report = {
    version: REPORT_VERSION,
    revision,
    change,
    conditions,
    startedAt,
    finishedAt,
    runs,
  };
  try {
    await writeFile(values.out, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
      flag: "wx",
    });
  } catch (error) {
    if (error.code === "EEXIST") {
      throw new Error(
        "The report output already exists. Choose a new --out file.",
      );
    }
    throw error;
  }

  const failures = runs.reduce(
    (count, { summary, warmupSamples }) =>
      count +
      summary.failures +
      warmupSamples.filter(({ error }) => error).length,
    0,
  );
  console.log(
    `Wrote performance report (${failures} failed requests, including warm-up)`,
  );
  if (failures) process.exitCode = 1;
}

function compareMedians(before, after) {
  const baseline = before.median ?? null;
  const rerun = after.median ?? null;
  return {
    baseline,
    rerun,
    delta:
      baseline === null || rerun === null ? null : roundMs(rerun - baseline),
    baselineCount: before.count,
    rerunCount: after.count,
  };
}

function compareStages(before, after) {
  const first = summarizeStages(before);
  const second = summarizeStages(after);
  const names = new Set([...Object.keys(first), ...Object.keys(second)]);
  const missing = { count: 0 };
  return Object.fromEntries(
    Array.from(names, (stage) => [
      stage,
      compareMedians(
        Object.hasOwn(first, stage) ? first[stage] : missing,
        Object.hasOwn(second, stage) ? second[stage] : missing,
      ),
    ]),
  );
}

async function compareReports(baselineFile, rerunFile) {
  const [baseline, rerun] = await Promise.all([
    readJson(baselineFile),
    readJson(rerunFile),
  ]);
  for (const report of [baseline, rerun]) {
    if (
      report?.version !== REPORT_VERSION ||
      !report.conditions ||
      !Array.isArray(report.runs)
    ) {
      throw new Error("Expected two version 1 performance reports");
    }
    readLabel(report.revision, "report revision");
  }
  const conditionKeys = Object.keys({
    ...baseline.conditions,
    ...rerun.conditions,
  });
  const differences = conditionKeys.filter(
    (key) => baseline.conditions[key] !== rerun.conditions[key],
  );
  const result = {
    baselineRevision: baseline.revision,
    rerunRevision: rerun.revision,
    baselineChange: baseline.change ?? null,
    rerunChange: rerun.change ?? null,
    comparable: differences.length === 0,
    differentConditions: differences,
  };
  if (result.comparable) {
    result.runs = baseline.runs.map((before, index) => {
      const after = rerun.runs[index];
      if (
        before.scenario !== after?.scenario ||
        before.route !== after.route ||
        before.mode !== after.mode ||
        before.concurrency !== after.concurrency
      ) {
        throw new Error("The reports contain different scenario/mode groups");
      }
      const first = summarize(before.samples);
      const second = summarize(after.samples);
      return {
        scenario: before.scenario,
        route: before.route,
        mode: before.mode,
        baselineRequests: first.requests,
        rerunRequests: second.requests,
        baselineFailures: first.failures,
        rerunFailures: second.failures,
        baselineCachedResponses: first.cachedResponses,
        rerunCachedResponses: second.cachedResponses,
        baselineOriginMatches: first.originMatches,
        rerunOriginMatches: second.originMatches,
        baselineApplicationMatches: first.applicationMatches,
        rerunApplicationMatches: second.applicationMatches,
        headersMs: compareMedians(first.headersMs, second.headersMs),
        totalMs: compareMedians(first.totalMs, second.totalMs),
        originHeadersMs: compareMedians(
          first.originHeadersMs,
          second.originHeadersMs,
        ),
        applicationMs: compareStages(before.samples, after.samples),
      };
    });
    if (baseline.runs.length !== rerun.runs.length) {
      throw new Error(
        "The reports contain different numbers of scenario/mode groups",
      );
    }
  }
  console.log(JSON.stringify(result, null, 2));
}

async function main([command, ...args]) {
  if (command === "--help") {
    console.log(USAGE);
  } else if (command === "run") {
    await runExperiment(args);
  } else if (command === "compare" && args.length === 2) {
    await compareReports(...args);
  } else {
    throw new Error(USAGE);
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(
    error.code
      ? `Cannot complete performance experiment (${error.code})`
      : error.message,
  );
  process.exitCode = 1;
}
