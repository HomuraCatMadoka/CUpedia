import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import {
  buildProfessorPortraitBackfillArgs,
  normalizeProfessorPortraitDatabaseUrl,
} from "../../scripts/run-professor-portrait-backfill.mjs";

const workflowText = readFileSync(
  resolve(process.cwd(), ".github/workflows/professor-portrait-backfill.yml"),
  "utf8",
);
const wizardText = readFileSync(
  resolve(process.cwd(), "scripts/setup-professor-portrait-backfill.sh"),
  "utf8",
);
const workflow = parse(workflowText) as {
  on: { workflow_dispatch: { inputs: Record<string, unknown> } };
  permissions: Record<string, string>;
  concurrency: Record<string, unknown>;
  jobs: {
    materialize: {
      environment: string;
      steps: Array<{
        env?: Record<string, string>;
        if?: string;
        name?: string;
        run?: string;
        uses?: string;
        with?: Record<string, unknown>;
      }>;
      "timeout-minutes": number;
    };
  };
};

describe("production professor portrait backfill workflow (ref #800)", () => {
  it("is manual, serialized, and protected by the production environment", () => {
    expect(workflow.on.workflow_dispatch.inputs).toBeDefined();
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(workflow.concurrency).toEqual({
      group: "production-professor-portrait-backfill",
      "cancel-in-progress": false,
    });
    expect(workflow.jobs.materialize.environment).toBe("production");
    expect(workflow.jobs.materialize["timeout-minutes"]).toBe(120);
  });

  it("keeps storage secrets out of setup and database-only dry-runs", () => {
    const dryRun = workflow.jobs.materialize.steps.find(
      (step) => step.name === "Run database-only dry-run",
    );
    const writeRun = workflow.jobs.materialize.steps.find(
      (step) => step.name === "Run production write backfill",
    );

    expect(dryRun?.if).toBe("inputs.mode == 'dry-run'");
    expect(dryRun?.env).toEqual({
      BACKFILL_MODE: "${{ inputs.mode }}",
      BACKFILL_LIMIT: "${{ inputs.limit }}",
      BACKFILL_CONCURRENCY: "${{ inputs.concurrency }}",
      DATABASE_URL: "${{ secrets.DATABASE_URL }}",
      NODE_EXTRA_CA_CERTS:
        "${{ github.workspace }}/certs/supabase-prod-ca-2021.crt",
    });
    expect(writeRun?.if).toBe("inputs.mode != 'dry-run'");
    expect(writeRun?.env).toMatchObject({
      DATABASE_URL: "${{ secrets.DATABASE_URL }}",
      NODE_EXTRA_CA_CERTS:
        "${{ github.workspace }}/certs/supabase-prod-ca-2021.crt",
      MINIO_ENDPOINT: "${{ secrets.MINIO_ENDPOINT }}",
      MINIO_REGION: "${{ secrets.MINIO_REGION }}",
      MINIO_ACCESS_KEY: "${{ secrets.MINIO_ACCESS_KEY }}",
      MINIO_SECRET_KEY: "${{ secrets.MINIO_SECRET_KEY }}",
      MINIO_BUCKET: "${{ secrets.MINIO_BUCKET }}",
      MINIO_PUBLIC_URL: "${{ secrets.MINIO_PUBLIC_URL }}",
    });
    expect(workflowText).not.toContain("schedule:");
  });

  it("trusts the pinned Supabase root CA for strict TLS verification", () => {
    const certificate = new X509Certificate(
      readFileSync(
        resolve(process.cwd(), "certs/supabase-prod-ca-2021.crt"),
        "utf8",
      ),
    );

    expect(certificate.subject).toContain("CN=Supabase Root 2021 CA");
    expect(certificate.fingerprint256).toBe(
      "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA",
    );
  });

  it("routes execution through the validated runner", () => {
    const runSteps = workflow.jobs.materialize.steps.filter((step) => step.run);
    expect(runSteps.slice(-2).map((step) => step.run)).toEqual([
      "node scripts/run-professor-portrait-backfill.mjs",
      "node scripts/run-professor-portrait-backfill.mjs",
    ]);
  });

  it("uses the repository's supported Node.js version", () => {
    expect(
      workflow.jobs.materialize.steps.find(
        (step) => step.uses === "actions/setup-node@v4",
      )?.with?.["node-version"],
    ).toBe(20);
  });

  it("installs the repository's supported pnpm version", () => {
    expect(
      workflow.jobs.materialize.steps.find(
        (step) => step.uses === "pnpm/action-setup@v4",
      )?.with?.version,
    ).toBe(10);
  });
});

describe("professor portrait backfill arguments", () => {
  it("pins Supabase pooler connections to strict TLS verification", () => {
    expect(
      normalizeProfessorPortraitDatabaseUrl(
        "postgresql://postgres.example:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=require",
      ),
    ).toBe(
      "postgresql://postgres.example:secret@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres?sslmode=verify-full",
    );
    expect(
      normalizeProfessorPortraitDatabaseUrl(
        "postgresql://postgres:postgres@localhost:5432/cupedia",
      ),
    ).toBe("postgresql://postgres:postgres@localhost:5432/cupedia");
  });

  it("keeps dry-runs and canaries bounded", () => {
    expect(
      buildProfessorPortraitBackfillArgs({
        mode: "dry-run",
        limit: "10",
        concurrency: "2",
      }),
    ).toEqual([
      "materialize:professor-portraits",
      "--",
      "--concurrency",
      "2",
      "--dry-run",
      "--limit",
      "10",
    ]);
    expect(
      buildProfessorPortraitBackfillArgs({
        mode: "canary",
        limit: "100",
        concurrency: "2",
      }),
    ).toEqual([
      "materialize:professor-portraits",
      "--",
      "--concurrency",
      "2",
      "--limit",
      "10",
    ]);
  });

  it("removes the limit only for an explicit full run", () => {
    expect(
      buildProfessorPortraitBackfillArgs({
        mode: "full",
        limit: "10",
        concurrency: "4",
      }),
    ).toEqual(["materialize:professor-portraits", "--", "--concurrency", "4"]);
  });

  it("rejects unbounded or malformed inputs", () => {
    expect(() =>
      buildProfessorPortraitBackfillArgs({
        mode: "canary",
        limit: "0; echo unsafe",
        concurrency: "2",
      }),
    ).toThrow("BACKFILL_LIMIT");
    expect(() =>
      buildProfessorPortraitBackfillArgs({
        mode: "unexpected",
        limit: "10",
        concurrency: "2",
      }),
    ).toThrow("BACKFILL_MODE");
  });
});

describe("professor portrait setup wizard", () => {
  it("stores credentials only as production environment secrets", () => {
    expect(wizardText).toContain(
      'gh secret set "$name" --env production --repo "$REPOSITORY"',
    );
    for (const secret of [
      "DATABASE_URL",
      "MINIO_ENDPOINT",
      "MINIO_REGION",
      "MINIO_ACCESS_KEY",
      "MINIO_SECRET_KEY",
      "MINIO_BUCKET",
      "MINIO_PUBLIC_URL",
    ]) {
      expect(wizardText).toContain(`set_production_secret ${secret}`);
    }
    expect(wizardText).not.toContain("write_env DATABASE_URL");
  });

  it("runs dry-run first and requires confirmation before canary", () => {
    expect(wizardText).toContain("-f mode=dry-run");
    expect(wizardText).toContain(
      'confirm "Trigger the 10-person canary that writes database rows and WebP objects?"',
    );
    expect(wizardText).toContain("-f mode=canary");
    expect(wizardText).not.toContain("-f mode=full");
  });

  it("stops unless the production environment requires a reviewer", () => {
    expect(wizardText).toContain(
      'select(.type == "required_reviewers") | .reviewers[]?',
    );
    expect(wizardText).toContain(
      "The production Environment does not have a required reviewer.",
    );
  });
});
