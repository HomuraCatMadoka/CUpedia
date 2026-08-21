#!/usr/bin/env node

import { pathToFileURL } from "node:url";

export const MENU_SYNC_ENDPOINT =
  "https://cupedia.org/api/internal/canteen-menu-sync/next";
export const MAX_ENDPOINT_CALLS = 16;
export const WALL_CLOCK_BUDGET_MS = 12 * 60 * 1_000;
export const REQUEST_TIMEOUT_MS = 65 * 1_000;
export const RETRY_DELAYS_MS = [2 * 60 * 1_000, 5 * 60 * 1_000];

const DISPOSITIONS = new Set([
  "continue",
  "no-work",
  "retry-later",
  "stop-for-review",
]);
const RESULT_RULES = new Map([
  ["applied", { codes: new Set(["MENU_SYNC_APPLIED"]), itemCount: true }],
  ["unchanged", { codes: new Set(["MENU_SYNC_UNCHANGED"]), itemCount: true }],
  [
    "already-running",
    { codes: new Set(["MENU_SYNC_ALREADY_RUNNING"]), itemCount: false },
  ],
  [
    "blocked",
    {
      codes: new Set([
        "MENU_SYNC_CONFLICT",
        "MENU_SYNC_IDENTITY_CHURN",
        "MENU_SYNC_SUSPICIOUS_DROP",
      ]),
      itemCount: false,
    },
  ],
  ["provider-failure", { codes: null, itemCount: false }],
  [
    "source-unavailable",
    {
      codes: new Set(["MENU_SOURCE_NOT_FOUND", "MENU_SOURCE_DISABLED"]),
      itemCount: false,
    },
  ],
  ["internal-failure", { codes: null, itemCount: false }],
  [
    "superseded",
    { codes: new Set(["MENU_SYNC_SUPERSEDED"]), itemCount: false },
  ],
]);
const RESULT_STATUSES_BY_DISPOSITION = new Map([
  ["continue", new Set(["applied", "unchanged", "source-unavailable"])],
  [
    "retry-later",
    new Set(["provider-failure", "internal-failure", "superseded"]),
  ],
  [
    "stop-for-review",
    new Set(["blocked", "provider-failure", "internal-failure"]),
  ],
]);

function requireString(record, key) {
  if (typeof record[key] !== "string" || record[key].length === 0) {
    throw new Error(`Malformed endpoint response: missing ${key}`);
  }
}

function validateSyncResult(result, disposition, sourceId) {
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("Malformed endpoint response: invalid result");
  }
  requireString(result, "sourceId");
  if (result.sourceId !== sourceId) {
    throw new Error("Malformed endpoint response: mismatched result sourceId");
  }
  requireString(result, "status");
  const rule = RESULT_RULES.get(result.status);
  if (!rule) {
    throw new Error("Malformed endpoint response: invalid result status");
  }
  if (!RESULT_STATUSES_BY_DISPOSITION.get(disposition)?.has(result.status)) {
    throw new Error(
      "Malformed endpoint response: result status contradicts disposition",
    );
  }
  requireString(result, "code");
  if (rule.codes && !rule.codes.has(result.code)) {
    throw new Error("Malformed endpoint response: invalid result code");
  }
  if (
    rule.itemCount &&
    (!Number.isSafeInteger(result.itemCount) || result.itemCount < 0)
  ) {
    throw new Error("Malformed endpoint response: invalid result itemCount");
  }
}

export function parseEndpointResponse(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Malformed endpoint response: expected an object");
  }
  if (!DISPOSITIONS.has(value.disposition)) {
    throw new Error("Malformed endpoint response: invalid disposition");
  }
  requireString(value, "window");

  if (value.disposition === "no-work") return value;

  requireString(value, "sourceId");
  if (value.disposition === "continue") {
    validateSyncResult(value.result, value.disposition, value.sourceId);
    return value;
  }

  requireString(value, "code");
  if (value.result !== undefined) {
    validateSyncResult(value.result, value.disposition, value.sourceId);
  }
  return value;
}

async function requestNext({ fetchImpl, secret, requestTimeoutMs }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetchImpl(MENU_SYNC_ENDPOINT, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}` },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`Endpoint request failed with HTTP ${response.status}`);
    }

    let body;
    try {
      body = await response.json();
    } catch {
      throw new Error("Malformed endpoint response: invalid JSON");
    }
    return parseEndpointResponse(body);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(`Endpoint request timed out after ${requestTimeoutMs}ms`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function drainMenuSync(options = {}) {
  const {
    secret = process.env.MENU_SYNC_TRIGGER_SECRET,
    fetchImpl = globalThis.fetch,
    sleep = (milliseconds) =>
      new Promise((resolve) => setTimeout(resolve, milliseconds)),
    now = Date.now,
    log = console.log,
    maxEndpointCalls = MAX_ENDPOINT_CALLS,
    wallClockBudgetMs = WALL_CLOCK_BUDGET_MS,
    requestTimeoutMs = REQUEST_TIMEOUT_MS,
    retryDelaysMs = RETRY_DELAYS_MS,
  } = options;

  if (!secret) throw new Error("MENU_SYNC_TRIGGER_SECRET is not configured");
  if (typeof fetchImpl !== "function") throw new Error("fetch is unavailable");

  const startedAt = now();
  let retrySourceId;
  let retryCount = 0;

  for (let call = 1; call <= maxEndpointCalls; call += 1) {
    if (now() - startedAt >= wallClockBudgetMs) {
      throw new Error(`Wall-clock budget exhausted before call ${call}`);
    }

    const outcome = await requestNext({
      fetchImpl,
      secret,
      requestTimeoutMs: Math.min(
        requestTimeoutMs,
        wallClockBudgetMs - (now() - startedAt),
      ),
    });
    log(`Call ${call}/${maxEndpointCalls}: ${outcome.disposition}`);

    if (outcome.disposition === "no-work") {
      log(`Drain complete for ${outcome.window}`);
      return { calls: call, disposition: outcome.disposition };
    }
    if (outcome.disposition === "stop-for-review") {
      throw new Error(`Review required: ${outcome.code}`);
    }
    if (outcome.disposition === "continue") {
      retrySourceId = undefined;
      retryCount = 0;
      continue;
    }

    if (retrySourceId !== outcome.sourceId) {
      retrySourceId = outcome.sourceId;
      retryCount = 0;
    }

    const delayMs = retryDelaysMs[retryCount];
    if (delayMs === undefined) {
      throw new Error(`Retry budget exhausted: ${outcome.code}`);
    }
    if (now() - startedAt + delayMs >= wallClockBudgetMs) {
      throw new Error(
        `Wall-clock budget exhausted before retry: ${outcome.code}`,
      );
    }
    retryCount += 1;
    log(`Endpoint requested retry ${retryCount}/${retryDelaysMs.length}`);
    await sleep(delayMs);
  }

  throw new Error(
    `Endpoint-call budget exhausted after ${maxEndpointCalls} calls`,
  );
}

async function main() {
  try {
    await drainMenuSync();
  } catch (error) {
    console.error(
      error instanceof Error ? error.message : "Menu sync drain failed",
    );
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
