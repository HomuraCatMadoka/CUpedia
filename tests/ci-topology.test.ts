import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);
const playwrightConfig = readFileSync(
  resolve(process.cwd(), "playwright.config.ts"),
  "utf8",
);

function jobNames() {
  return [...workflow.matchAll(/^  ([a-z][a-z0-9-]+):\n    runs-on:/gm)].map(
    ([, name]) => name,
  );
}

function e2eMatrixProjects() {
  const e2eJob = workflow.slice(workflow.indexOf("\n  e2e:"));
  return [...e2eJob.matchAll(/^          - project: (.+)$/gm)].map(
    ([, project]) => project,
  );
}

describe("bounded full CI topology (#669)", () => {
  it("caps the workflow at six jobs and E2E at three runners", () => {
    const totalJobExecutions =
      jobNames().filter((name) => name !== "e2e").length +
      e2eMatrixProjects().length;
    expect(totalJobExecutions).toBeLessThanOrEqual(6);
    const browserRunnerCount =
      e2eMatrixProjects().length + (jobNames().includes("webkit-risk") ? 1 : 0);
    expect(browserRunnerCount).toBeLessThanOrEqual(3);
    expect(e2eMatrixProjects()).toEqual([
      "chromium-general",
      "chromium-wiki-media",
    ]);
  });

  it("keeps lint, unit, and typecheck in one quality gate", () => {
    expect(workflow).toMatch(/  quality:[\s\S]*pnpm lint/);
    expect(workflow).toMatch(/  quality:[\s\S]*pnpm test/);
    expect(workflow).toMatch(/  quality:[\s\S]*pnpm typecheck/);
    expect(workflow).not.toMatch(/pnpm (?:lint|test|typecheck) &/);
  });

  it("keeps database coverage in one real-Postgres integration job", () => {
    expect(workflow).toMatch(
      /  database-integration:[\s\S]*services:\n      migration-postgres:[\s\S]*zhparser-postgres:/,
    );
    expect(workflow).toMatch(
      /  database-integration:[\s\S]*Initialize zhparser/,
    );
    expect(workflow).toMatch(
      /  database-integration:[\s\S]*canteen-menu-source-migration\.test\.ts/,
    );
    expect(workflow).toMatch(
      /  database-integration:[\s\S]*canteen-menu-sync\.test\.ts/,
    );
    const databaseJob = workflow.slice(
      workflow.indexOf("\n  database-integration:"),
      workflow.indexOf("\n  build:"),
    );
    expect(databaseJob).not.toContain("playwright");
  });

  it("builds Next once and makes every E2E runner reuse that artifact", () => {
    expect(jobNames().filter((name) => name === "build")).toHaveLength(1);
    expect(workflow).toMatch(/  e2e:[\s\S]*needs: build/);
    expect(workflow).toMatch(/  database-integration:[\s\S]*needs: build/);
    expect(workflow).toMatch(/  webkit-risk:[\s\S]*needs: build/);
    expect(workflow).toMatch(/  build:[\s\S]*name: next-build/);
    expect(workflow).toMatch(
      /  e2e:[\s\S]*uses: actions\/download-artifact@v4/,
    );
    expect(workflow).toMatch(
      /  webkit-risk:[\s\S]*mcr\.microsoft\.com\/playwright:v1\.60\.0-noble[\s\S]*uses: actions\/download-artifact@v4[\s\S]*--project=webkit-mobile/,
    );
  });

  it("starts MinIO only for the upload-bearing E2E runner", () => {
    expect(workflow).toMatch(/Start MinIO[\s\S]*if: matrix\.minio/);
    expect(workflow).toMatch(/Create uploads bucket[\s\S]*if: matrix\.minio/);
  });

  it("cannot turn a retry-pass flaky test green", () => {
    expect(playwrightConfig).toMatch(/retries:\s*0/);
  });
});
