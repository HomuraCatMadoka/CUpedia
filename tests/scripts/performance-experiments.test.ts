import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { appendFileSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const exec = promisify(execFile);
const script = fileURLToPath(
  new URL("../../scripts/performance-experiments.mjs", import.meta.url),
);
const route = "/courses";

let directory: string;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "cupedia-performance-test-"));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

function run(...args: string[]) {
  return exec(process.execPath, [script, ...args], { timeout: 10_000 });
}

function runExperiment(
  baseUrl: string,
  scenarios: string,
  output: string,
  ...args: string[]
) {
  return run(
    "run",
    "--base-url",
    baseUrl,
    "--scenarios",
    scenarios,
    "--out",
    output,
    "--revision",
    "test",
    "--environment",
    "local",
    "--probe",
    "loopback",
    "--fixture",
    "synthetic",
    "--samples",
    "3",
    "--warmup",
    "0",
    ...args,
  );
}

describe("performance experiments CLI", () => {
  it("links fresh logs and skips cached, out-of-window and undated rows", async () => {
    const testCases = [
      "fresh",
      "cached",
      "old-origin",
      "future-origin",
      "old-app",
      "undated-app",
    ];
    const originLog = join(directory, "origin.jsonl");
    const appLog = join(directory, "app.log");
    const scenarios = join(directory, "scenarios.json");
    const output = join(directory, "report.json");
    const fixture = (id: string) => ({
      id,
      path: `/courses?case=${id}`,
      route,
      expectedStatus: 200,
      contains: "fixture",
    });
    await Promise.all([
      writeFile(scenarios, JSON.stringify(testCases.map(fixture))),
      writeFile(originLog, ""),
      writeFile(appLog, ""),
    ]);

    const server = createServer((request, response) => {
      const id = new URL(
        request.url ?? "/",
        "http://127.0.0.1",
      ).searchParams.get("case");
      const requestId = randomUUID().replaceAll("-", "");
      const now = Date.now();
      const time = new Date(now).toISOString();
      const old = new Date(now - 10_000).toISOString();
      const future = new Date(now + 10_000).toISOString();
      const originTime =
        id === "old-origin" ? old : id === "future-origin" ? future : time;
      const appTime =
        id === "undated-app" ? undefined : id === "old-app" ? old : time;
      appendFileSync(
        originLog,
        `${JSON.stringify({ requestId, route, time: originTime, status: 200 })}\n`,
      );
      appendFileSync(
        appLog,
        `[perf] ${JSON.stringify({ requestId, route, time: appTime, stage: "courses", ms: 3 })}\n`,
      );
      response.setHeader("X-Request-Id", requestId);
      if (id === "cached") response.setHeader("Age", "60");
      response.end("fixture");
    });
    server.listen(0, "127.0.0.1");
    try {
      await once(server, "listening");
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Expected a TCP address");
      const baseUrl = `http://127.0.0.1:${address.port}`;
      await runExperiment(
        baseUrl,
        scenarios,
        output,
        "--origin-log",
        originLog,
        "--app-log",
        appLog,
      );
      const report = JSON.parse(await readFile(output, "utf8"));
      for (const [index, id] of testCases.entries()) {
        const originMatches = ["fresh", "old-app", "undated-app"].includes(id)
          ? 3
          : 0;
        for (const group of report.runs.slice(index * 2, index * 2 + 2)) {
          expect(group).toMatchObject({
            scenario: id,
            summary: {
              originMatches,
              applicationMatches: id === "fresh" ? 3 : 0,
              cachedResponses: id === "cached" ? 3 : 0,
            },
          });
        }
      }
      expect(report.runs[2].samples[0]).toMatchObject({ ageSeconds: 60 });

      await writeFile(scenarios, JSON.stringify([fixture("fresh")]));
      const appOnlyOutput = join(directory, "app-only.json");
      await runExperiment(
        baseUrl,
        scenarios,
        appOnlyOutput,
        "--app-log",
        appLog,
      );
      expect(
        JSON.parse(await readFile(appOnlyOutput, "utf8")).runs[0].summary,
      ).toMatchObject({
        originMatches: 0,
        applicationMatches: 3,
      });
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  }, 15_000);

  it("rejects a concrete resource ID in a route label", async () => {
    const scenarios = join(directory, "scenarios.json");
    const resource = "/wiki/00000000-0000-4000-8000-000000000123";
    await writeFile(
      scenarios,
      JSON.stringify([
        {
          id: "invalid-label",
          path: resource,
          route: resource,
          expectedStatus: 200,
          contains: "fixture",
        },
      ]),
    );
    await expect(
      runExperiment(
        "http://127.0.0.1:1",
        scenarios,
        join(directory, "report.json"),
      ),
    ).rejects.toMatchObject({
      code: 1,
      stderr: expect.stringContaining(
        "Invalid or duplicate scenario at position 1",
      ),
    });
  });

  it("suppresses only the timing deltas affected by a failed warm-up in version 1 reports", async () => {
    const baseline = join(directory, "baseline.json");
    const rerun = join(directory, "rerun.json");
    function report(ms: number, warmupError: string | null) {
      return {
        version: 1,
        revision: "test",
        conditions: { warmupCount: 1 },
        runs: ["serial", "burst"].map((mode) => ({
          scenario: "fixture",
          route,
          mode,
          concurrency: mode === "serial" ? 1 : 3,
          warmupSamples: [{ error: mode === "serial" ? warmupError : null }],
          samples: [
            {
              error: null,
              headersMs: ms,
              totalMs: ms,
              origin: { routeMatches: true, upstreamHeaderSeconds: ms / 1000 },
              application: [{ stage: "courses", ms }],
            },
          ],
        })),
      };
    }
    await Promise.all([
      writeFile(baseline, JSON.stringify(report(5, null))),
      writeFile(rerun, JSON.stringify(report(7, "request-timeout"))),
    ]);
    const { stdout } = await run("compare", baseline, rerun);
    expect(JSON.parse(stdout)).toMatchObject({
      comparable: false,
      differentConditions: [],
      runs: [
        {
          mode: "serial",
          comparable: false,
          baselineWarmupFailures: 0,
          rerunWarmupFailures: 1,
          rerunFailures: 0,
          headersMs: { baseline: 5, rerun: 7, delta: null },
          totalMs: { delta: null },
          originHeadersMs: { delta: null },
          applicationMs: { courses: { delta: null } },
        },
        {
          mode: "burst",
          comparable: true,
          rerunWarmupFailures: 0,
          headersMs: { delta: 2 },
        },
      ],
    });
  });
});
