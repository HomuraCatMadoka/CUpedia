import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { PLAYWRIGHT_RETRIES } from "../e2e/policy";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);
type WorkflowStep = {
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
};

type WorkflowJob = {
  needs?: string | string[];
  container?: string | { image?: string };
  services?: Record<string, unknown>;
  steps?: WorkflowStep[];
  strategy?: {
    matrix?: {
      include?: Array<Record<string, unknown>>;
    };
  };
};

type WorkflowConfig = {
  jobs?: Record<string, WorkflowJob>;
};

function parseWorkflow(source: string): WorkflowConfig {
  return parse(source) as WorkflowConfig;
}

const config = parseWorkflow(workflow);

function jobs(source = config) {
  return source.jobs ?? {};
}

function requireJob(name: string, source = config) {
  const job = jobs(source)[name];
  if (!job) throw new Error(`Missing CI job: ${name}`);
  return job;
}

function steps(name: string, source = config) {
  return requireJob(name, source).steps ?? [];
}

function e2eMatrixProjects(source = config) {
  return (requireJob("e2e", source).strategy?.matrix?.include ?? []).map(
    (entry) => entry.project,
  );
}

describe("bounded full CI topology (#669)", () => {
  it("discovers jobs when runs-on is not the first job property", () => {
    const reordered = parseWorkflow(`jobs:
  quality:
    needs: build
    runs-on: ubuntu-latest
`);
    expect(Object.keys(jobs(reordered))).toEqual(["quality"]);
  });

  it("caps the workflow at six jobs and E2E at three runners", () => {
    const totalJobExecutions =
      Object.keys(jobs()).filter((name) => name !== "e2e").length +
      e2eMatrixProjects().length;
    expect(totalJobExecutions).toBeLessThanOrEqual(6);
    const browserRunnerCount =
      e2eMatrixProjects().length + (jobs()["browser-third"] ? 1 : 0);
    expect(browserRunnerCount).toBeLessThanOrEqual(3);
    expect(e2eMatrixProjects()).toEqual([
      "chromium-general",
      "chromium-wiki-media",
    ]);
  });

  it("keeps lint, unit, and typecheck in one quality gate", () => {
    const qualityRuns = steps("quality").flatMap((step) =>
      step.run ? [step.run] : [],
    );
    expect(qualityRuns).toContain("pnpm lint");
    expect(qualityRuns).toContain("pnpm test");
    expect(qualityRuns).toContain("pnpm typecheck");
    expect(qualityRuns).not.toContain(
      expect.stringMatching(/pnpm (?:lint|test|typecheck) &/),
    );
  });

  it("keeps database coverage on real Postgres without another install", () => {
    const quality = requireJob("quality");
    expect(Object.keys(quality.services ?? {})).toEqual(
      expect.arrayContaining(["migration-postgres", "zhparser-postgres"]),
    );
    const qualitySteps = steps("quality");
    expect(qualitySteps.map((step) => step.name)).toContain(
      "Initialize zhparser",
    );
    const qualityRuns = qualitySteps.flatMap((step) =>
      step.run ? [step.run] : [],
    );
    expect(qualityRuns.join("\n")).toContain(
      "canteen-menu-source-migration.test.ts",
    );
    expect(qualityRuns.join("\n")).toContain("canteen-menu-sync.test.ts");
    expect(
      qualityRuns.filter((run) => run === "pnpm install --frozen-lockfile"),
    ).toHaveLength(1);
    expect(JSON.stringify(quality)).not.toContain("playwright");
  });

  it("builds Next once and makes every E2E runner reuse that artifact", () => {
    expect(Object.keys(jobs()).filter((name) => name === "build")).toHaveLength(
      1,
    );
    expect(requireJob("e2e").needs).toBe("build");
    expect(requireJob("browser-third").needs).toBe("build");
    expect(
      steps("build").some(
        (step) =>
          step.uses === "actions/upload-artifact@v4" &&
          step.with?.name === "next-build",
      ),
    ).toBe(true);
    expect(
      steps("e2e").some((step) => step.uses === "actions/download-artifact@v4"),
    ).toBe(true);
    expect(requireJob("browser-third").container).toBe(
      "mcr.microsoft.com/playwright:v1.60.0-noble",
    );
    expect(
      steps("browser-third").some(
        (step) =>
          step.uses === "actions/download-artifact@v4" &&
          step.with?.name === "next-build",
      ),
    ).toBe(true);
    const thirdRunner = steps("browser-third").find(
      (step) => step.name === "Run balanced Chromium and WebKit risk coverage",
    );
    expect(thirdRunner?.run).toContain("--project=chromium-balanced");
    expect(thirdRunner?.run).toContain("--project=webkit-mobile");
  });

  it("starts MinIO only for the upload-bearing E2E runner", () => {
    const startMinio = steps("e2e").find((step) => step.name === "Start MinIO");
    const createBucket = steps("e2e").find(
      (step) => step.name === "Create uploads bucket",
    );
    expect(startMinio?.if).toBe("matrix.minio");
    expect(createBucket?.if).toBe("matrix.minio");
    const thirdRunner = requireJob("browser-third");
    expect(
      Object.keys(thirdRunner.services ?? {}).some((name) =>
        name.toLocaleLowerCase().includes("minio"),
      ),
    ).toBe(false);
    expect(
      (thirdRunner.steps ?? []).some((step) =>
        [step.name, step.run, step.uses].some((field) =>
          field?.toLocaleLowerCase().includes("minio"),
        ),
      ),
    ).toBe(false);
  });

  it("cannot turn a retry-pass flaky test green", () => {
    expect(PLAYWRIGHT_RETRIES).toBe(0);
  });
});
