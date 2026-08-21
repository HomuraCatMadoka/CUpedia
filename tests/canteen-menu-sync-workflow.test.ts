import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

const workflowText = readFileSync(
  resolve(process.cwd(), ".github/workflows/canteen-menu-sync.yml"),
  "utf8",
);
type WorkflowStep = {
  name?: string;
  run?: string;
  env?: Record<string, string>;
};
type Workflow = {
  on: {
    schedule: Array<{ cron: string }>;
    workflow_dispatch: null;
  };
  concurrency: Record<string, unknown>;
  jobs: {
    drain: {
      "timeout-minutes": number;
      steps: WorkflowStep[];
    };
  };
};
const workflow = parse(workflowText) as Workflow;
const vercel = JSON.parse(
  readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
);

describe("production canteen menu sync workflow (#635)", () => {
  it("runs at the documented non-peak breakfast, lunch, and dinner times", () => {
    expect(workflow.on.schedule).toEqual([
      { cron: "17 23 * * *" },
      { cron: "17 3 * * *" },
      { cron: "17 9 * * *" },
    ]);
    expect(workflowText).toContain(
      "23:17 UTC = 07:17 Asia/Hong_Kong on the following day (breakfast)",
    );
    expect(workflowText).toContain("03:17 UTC = 11:17 Asia/Hong_Kong (lunch)");
    expect(workflowText).toContain("09:17 UTC = 17:17 Asia/Hong_Kong (dinner)");
  });

  it("keeps manual recovery input-free and production drains non-overlapping", () => {
    expect(workflow.on.workflow_dispatch).toBeNull();
    expect(workflow.concurrency).toEqual({
      group: "production-canteen-menu-sync",
      "cancel-in-progress": false,
    });
    expect(workflow.jobs.drain["timeout-minutes"]).toBe(15);
  });

  it("passes only the dedicated secret to the fixed drain runner", () => {
    const step = workflow.jobs.drain.steps.find(
      (candidate) => candidate.name === "Drain production menu sources",
    );
    if (!step) throw new Error("Missing production drain step");
    expect(step.run).toBe("node scripts/drain-canteen-menu-sync.mjs");
    expect(step.env).toEqual({
      MENU_SYNC_TRIGGER_SECRET: "${{ secrets.MENU_SYNC_TRIGGER_SECRET }}",
    });
    expect(workflowText).not.toMatch(
      /(?:preview|source[_-]?id|provider[_-]?url|canteen[_-]?id|timestamp)/i,
    );
  });

  it("removes the legacy all-source Vercel cron", () => {
    expect(vercel.crons).toBeUndefined();
    expect(workflowText).not.toContain("/api/cron/canteen-menu-sync");
    expect(
      existsSync(
        resolve(process.cwd(), "src/app/api/cron/canteen-menu-sync/route.ts"),
      ),
    ).toBe(false);
  });
});
