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
  env?: Record<string, unknown>;
  name?: string;
  run?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
};
type WorkflowJob = {
  name?: string;
  needs?: string | string[];
  if?: string;
  container?: string | { image?: string };
  outputs?: Record<string, unknown>;
  services?: Record<string, unknown>;
  steps?: WorkflowStep[];
  strategy?: { matrix?: unknown };
};
type WorkflowConfig = {
  on?: Record<string, unknown>;
  jobs?: Record<string, WorkflowJob>;
};

const config = parse(workflow) as WorkflowConfig;
const jobs = config.jobs ?? {};

function job(name: string) {
  const value = jobs[name];
  if (!value) throw new Error(`Missing CI job: ${name}`);
  return value;
}
function steps(name: string) {
  return job(name).steps ?? [];
}
function namedStep(jobName: string, stepName: string) {
  const value = steps(jobName).find((step) => step.name === stepName);
  if (!value) throw new Error(`Missing ${jobName} step: ${stepName}`);
  return value;
}

describe("tiered CI topology (#670)", () => {
  it("always publishes the stable aggregate gate without top-level path filters", () => {
    expect(config.on?.pull_request).toEqual({ branches: ["main"] });
    expect(job("quality").name).toBe("lint-and-test");
    expect(job("build").name).toBe("build");
    expect(job("gate").name).toBe("CI gate");
    expect(job("gate").if).toBe("${{ always() }}");
    expect(job("gate").needs).toEqual([
      "quality",
      "build",
      "e2e",
      "browser-third",
    ]);
  });

  it("classifies in the two parallel entry jobs from one implementation", () => {
    for (const jobName of ["quality", "build"]) {
      const classify = namedStep(jobName, "Classify changes");
      expect(classify.run).toContain("node scripts/ci-classifier.mjs");
      expect(classify.run).toContain("--force-full");
      expect(classify.env).toMatchObject({
        CI_BASE_SHA: expect.stringContaining("pull_request.base.sha"),
        CI_HEAD_SHA: expect.stringContaining("pull_request.head.sha"),
      });
    }
    expect(Object.keys(jobs)).not.toContain("classify");
  });

  it("keeps the full topology within six executions and three browsers", () => {
    expect(Object.keys(jobs)).toEqual([
      "quality",
      "build",
      "e2e",
      "browser-third",
      "gate",
    ]);
    expect(job("e2e").strategy?.matrix).toBe(
      "${{ fromJSON(needs.build.outputs.e2e_matrix) }}",
    );
  });

  it("does not install dependencies or start services for docs-only", () => {
    const installConditions = ["quality", "build"].flatMap((jobName) =>
      steps(jobName)
        .filter(
          (step) =>
            step.uses?.includes("setup") ||
            step.run === "pnpm install --frozen-lockfile",
        )
        .map((step) => step.if),
    );
    expect(installConditions).not.toContain(undefined);
    expect(
      installConditions.every((value) => value?.includes("fromJSON")),
    ).toBe(true);
    expect(job("quality").services).toBeUndefined();
    expect(
      namedStep("quality", "Start PostgreSQL integration services").if,
    ).toContain(".postgres");
  });

  it("keeps lint, unit, blocking typecheck, and real PostgreSQL coverage", () => {
    expect(namedStep("quality", "Lint").run).toBe("pnpm lint");
    expect(namedStep("quality", "Unit tests").run).toBe("pnpm test");
    expect(namedStep("quality", "Typecheck").run).toBe("pnpm typecheck");
    const postgres = namedStep(
      "quality",
      "Start PostgreSQL integration services",
    );
    expect(postgres.run).toContain("postgres:16");
    expect(postgres.run).toContain("abcfy2/zhparser:17-alpine");
    expect(postgres.run).toContain("supabase/postgres:17.6.1.136");
    expect(postgres.run).toContain(
      "--add-host=host.docker.internal:host-gateway",
    );
    expect(postgres.run).toContain("for port in 5432 5434 5435");
    expect(namedStep("quality", "Apply migrations").run).toBe(
      "pnpm drizzle-kit migrate",
    );
    expect(
      namedStep("quality", "Initialize Supabase client roles").run,
    ).toContain("CREATE ROLE anon NOLOGIN");
    expect(
      namedStep("quality", "Initialize Supabase client roles").run,
    ).toContain("CREATE ROLE authenticated NOLOGIN");
    expect(namedStep("quality", "Test public Data API security")).toMatchObject(
      {
        run: "pnpm exec vitest run tests/db/public-data-api-security.test.ts",
        env: {
          DATABASE_URL:
            "postgresql://postgres:postgres@localhost:5434/cuclaw_menu_sync_test",
          REQUIRE_SUPABASE_CLIENT_ROLES: "1",
        },
      },
    );

    expect(namedStep("quality", "Test menu sync persistence").run).toContain(
      "tests/db/canteen-menu-sync-health.test.ts",
    );
  });

  it("replays and tests the scheduler on the pinned Supabase PostgreSQL 17 image", () => {
    const setupCli = steps("quality").find(
      (step) => step.uses === "supabase/setup-cli@v2",
    );
    expect(setupCli).toMatchObject({
      if: "${{ fromJSON(steps.plan.outputs.plan).postgres }}",
      with: { version: "2.115.0" },
    });

    expect(
      namedStep("quality", "Apply Supabase scheduler migrations"),
    ).toMatchObject({
      env: {
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5435/postgres",
      },
      run: expect.stringContaining(
        "tests/db/fixtures/supabase-scheduler-bootstrap.sql",
      ),
    });
    expect(
      namedStep("quality", "Apply Supabase scheduler migrations").run,
    ).toContain("pnpm drizzle-kit migrate");
    expect(
      namedStep("quality", "Apply Supabase scheduler migrations").run,
    ).toContain("SCHEDULER_MIGRATION_CREATED_OUTBOUND_WORK");

    expect(namedStep("quality", "Test Supabase menu scheduler")).toMatchObject({
      env: {
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5435/postgres",
        SUPABASE_SCHEDULER_TEST: "1",
        SCHEDULER_HTTP_DOUBLE_HOST: "host.docker.internal",
      },
      run: expect.stringContaining("tests/db/canteen-menu-sync-cron.test.ts"),
    });

    const advisors = namedStep(
      "quality",
      "Check Supabase scheduler database advisors",
    );
    expect(advisors.env).toMatchObject({
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5435/postgres",
      PGSSLMODE: "disable",
    });
    expect(advisors.run).toContain("supabase db advisors");
    expect(advisors.run).toContain("--type all");
    expect(advisors.run).toContain("--level warn");
    expect(advisors.run).toContain(".results | all(.[];");
    expect(advisors.run).toContain("function_search_path_mutable");
    expect(advisors.run).toContain("extension_in_public");
  });

  it("builds Next once and every selected browser reuses the artifact", () => {
    expect(namedStep("build", "Build").env?.NEXT_BUILD_SKIP_TYPECHECK).toBe(
      "1",
    );
    expect(namedStep("build", "Upload Next build").uses).toBe(
      "actions/upload-artifact@v4",
    );
    for (const jobName of ["e2e", "browser-third"]) {
      expect(namedStep(jobName, "Download Next build").uses).toBe(
        "actions/download-artifact@v4",
      );
      expect(job(jobName).needs).toBe("build");
    }
  });

  it("starts MinIO only in the capability-selected upload lane", () => {
    expect(namedStep("e2e", "Start MinIO").if).toBe("${{ matrix.minio }}");
    expect(namedStep("e2e", "Create uploads bucket").if).toBe(
      "${{ matrix.minio }}",
    );
    expect(JSON.stringify(job("browser-third"))).not.toContain("MinIO");
  });

  it("checks every upstream result and keeps retry-pass flakes impossible", () => {
    const gate = namedStep("gate", "Evaluate required capabilities");
    expect(gate.run).toBe("node scripts/ci-gate.mjs");
    expect(gate.env).toMatchObject({
      QUALITY_RESULT: "${{ needs.quality.result }}",
      BUILD_RESULT: "${{ needs.build.result }}",
      E2E_RESULT: "${{ needs.e2e.result }}",
      BROWSER_THIRD_RESULT: "${{ needs.browser-third.result }}",
    });
    expect(PLAYWRIGHT_RETRIES).toBe(0);
  });
});
