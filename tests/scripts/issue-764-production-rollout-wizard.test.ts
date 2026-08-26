import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const wizardPath = "scripts/issue-764-production-rollout-wizard.sh";
const runbookPath = "docs/operations/canteen-menu-sync-scheduling.md";
const wizard = readFileSync(wizardPath, "utf8");
const runbook = readFileSync(runbookPath, "utf8");

describe("Issue #764 production rollout wizard", () => {
  it("pins the reviewed production identities and post-#762 baseline", () => {
    expect(wizard).toContain('REPOSITORY="HomuraCatMadoka/CUpedia"');
    expect(wizard).toContain('SUPABASE_PROJECT_NAME="cupedia-sg"');
    expect(wizard).toContain('VERCEL_PROJECT="cupedia"');
    expect(wizard).toContain(
      'ROLLOUT_COMMIT="5dccbe512febd9f93ae5233cbd8bfe863de6b9c5"',
    );
    expect(wizard).toContain("TOTAL_STAGES=6");
    expect(wizard).toContain('MODE="${1:-rollout}"');
  });

  it("keeps the bearer ephemeral and updates only the three reviewed stores", () => {
    expect(wizard).toContain("set +x");
    expect(wizard).toContain("askEphemeralSecret MENU_SYNC_TRIGGER_SECRET");
    expect(wizard).toContain("openssl rand -base64 48");
    expect(wizard).toContain(
      "printf '%s' \"$MENU_SYNC_TRIGGER_SECRET\" | vercel env update",
    );
    expect(wizard).toContain(
      'setRepositorySecret MENU_SYNC_TRIGGER_SECRET "$MENU_SYNC_TRIGGER_SECRET"',
    );
    expect(wizard).toContain('(.aliases | index("cupedia.org")) != null');
    expect(wizard).toContain("clearClipboard || true");
    expect(wizard).not.toMatch(
      /write_env\s+MENU_SYNC_TRIGGER_SECRET|vault\.decrypted_secrets|vault\.secrets\.secret/,
    );
    expect(wizard).not.toMatch(
      /--value\s+["']?\$MENU_SYNC_TRIGGER_SECRET|gh secret set[^\n]+--body/,
    );
  });

  it("fails closed before activation and never edits cron.job directly", () => {
    expect(wizard).toContain("assertMainAndProductionDeployment");
    expect(wizard).toContain("--environment production \\\n    --format json");
    expect(wizard).not.toContain(
      "--environment production \\\n    --no-branch \\\n    --format json",
    );
    expect(wizard).toContain("assertOutsidePrimaryWindow");
    expect(wizard).toContain("assertNoMenuSyncRun");
    expect(wizard).toContain("assertRotationGap");
    expect(wizard).toContain("SELECT net.check_worker_is_up();");
    expect(wizard).toContain("client_roles_no_login");
    expect(wizard).toContain("transport_tables_unlogged");
    expect(wizard).toContain("$rows[0].database == $rows[0].current_database");
    expect(wizard).toContain("$rows[0].pg_net_ttl_seconds <= 21600");
    expect(wizard).toContain("vault_metadata_before");
    expect(wizard).toContain(
      "vault metadata did not change during this rollout",
    );
    expect(wizard).toContain("information_schema.columns");
    expect(wizard).toContain(
      "array_agg(column_name::text ORDER BY ordinal_position)",
    );
    expect(wizard).toContain("scheduler_audit_columns_exact");
    expect(wizard).toContain("vercel logs \\\n");
    expect(wizard).toContain('--query "/api/internal/canteen-menu-sync/next"');
    expect(wizard).toContain(
      "bounded Vercel production logs contain a sensitive-data marker",
    );
    expect(wizard).toContain(
      "SELECT canteen_menu_scheduler.activate() AS result;",
    );
    expect(wizard).not.toMatch(
      /(?:INSERT|UPDATE|DELETE)\s+(?:INTO\s+|FROM\s+)?cron\.job\b/i,
    );
  });

  it("can resume with bounded read-only natural-window evidence", () => {
    expect(wizard).toContain('if [[ "$MODE" == "verify" ]]');
    expect(wizard).toContain("canteen_menu_scheduler.delivery_health(");
    expect(wizard).toContain("canteen_menu_scheduler.window_health(");
    expect(wizard).toContain('classification == "primary-drained-window"');
    expect(wizard).toContain("Call 1/16: no-work");
    expect(wizard).toContain(
      '"repos/${REPOSITORY}/compare/${ROLLOUT_COMMIT}...${fallback_sha}"',
    );
    expect(wizard).toContain("pending_requests == 0");
    expect(wizard).toContain("gh issue comment 764");
    expect(wizard).toContain("gh issue view 757");
    expect(wizard).toContain("gh issue view 763");
    expect(wizard).toContain("production_recovery_clean");
    expect(wizard).toContain(
      'confirm "Post this bounded evidence to issue #764?"',
    );
  });

  it("uses camelCase for every authored shell helper", () => {
    const authoredSection = wizard.split("TOTAL_STAGES=6")[1] ?? "";
    const functionNames = [
      ...authoredSection.matchAll(/^([A-Za-z0-9_]+)\(\) \{/gm),
    ].map(([, name]) => name);
    expect(functionNames).not.toEqual([]);
    expect(functionNames.filter((name) => name.includes("_"))).toEqual([]);
  });

  it("documents both rollout and verification entry points", () => {
    expect(runbook).toContain(wizardPath);
    expect(runbook).toContain(`${wizardPath} verify`);
    expect(runbook).toContain(
      "keeps the bearer only in process memory and the clipboard",
    );
  });
});
