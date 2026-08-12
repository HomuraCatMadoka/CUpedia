import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Text-based contract guard: CI has no Docker daemon, so the real `pnpm setup`
// end-to-end run cannot execute here. These assertions lock the invariants a
// one-command local bootstrap depends on, so they cannot silently regress.
const compose = readFileSync(
  join(__dirname, "../../docker-compose.yml"),
  "utf8",
);
const announcementScheduler = readFileSync(
  join(__dirname, "../../scripts/run-announcement-scheduler.sh"),
  "utf8",
);

describe("docker-compose local bootstrap contract", () => {
  it("gives the database a readiness healthcheck", () => {
    expect(compose).toMatch(/pg_isready/);
  });

  it("gives MinIO a readiness healthcheck", () => {
    expect(compose).toMatch(/minio\/health\/live/);
  });

  it("auto-creates the uploads bucket via a one-shot mc service", () => {
    expect(compose).toMatch(/createbuckets/);
    expect(compose).toMatch(/mc mb[^\n]*cuclaw-uploads/);
  });

  it("schedules protected announcement broadcasts in the production profile", () => {
    expect(compose).toMatch(/CRON_SECRET:\s*\$\{CRON_SECRET:-\}/);
    expect(compose).toMatch(/announcement-scheduler:/);
    expect(compose).toMatch(/run-announcement-scheduler\.sh/);
    expect(announcementScheduler).toMatch(/api\/cron\/announcements/);
    expect(announcementScheduler).toMatch(
      /Authorization: Bearer \$CRON_SECRET/,
    );
    expect(announcementScheduler).toMatch(/--connect-timeout\s+\d+/);
    expect(announcementScheduler).toMatch(/--max-time\s+\d+/);
    expect(announcementScheduler).toMatch(
      /CRON_SECRET is required for the announcement scheduler/,
    );
  });
});
