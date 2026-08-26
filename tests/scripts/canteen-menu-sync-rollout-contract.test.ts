import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  firstPrimaryWindowBounds,
  githubWakeGap,
  validateVaultMetadataChange,
  validateWorkflowSchedule,
} from "../../scripts/lib/canteen-menu-sync-rollout-contract.mjs";

const currentWorkflow = readFileSync(
  ".github/workflows/canteen-menu-sync.yml",
  "utf8",
);

describe("canteen menu-sync rollout contract", () => {
  it("accepts the reviewed production workflow", () => {
    expect(() => validateWorkflowSchedule(currentWorkflow)).not.toThrow();
  });

  it("rejects an extra or duplicate scheduled wake", () => {
    const extra = currentWorkflow.replace(
      "  workflow_dispatch:",
      '    - cron: "5 5 * * *"\n  workflow_dispatch:',
    );
    expect(() => validateWorkflowSchedule(extra)).toThrow(
      "MENU_SYNC_WORKFLOW_SCHEDULE_MISMATCH",
    );

    const duplicate = currentWorkflow.replace(
      "  workflow_dispatch:",
      '    - cron: "37,47 0,3,9 * * *"\n  workflow_dispatch:',
    );
    expect(() => validateWorkflowSchedule(duplicate)).toThrow(
      "MENU_SYNC_WORKFLOW_SCHEDULE_MISMATCH",
    );
  });

  it("requires workflow_dispatch recovery", () => {
    const withoutDispatch = currentWorkflow.replace(
      "  workflow_dispatch:\n",
      "",
    );
    expect(() => validateWorkflowSchedule(withoutDispatch)).toThrow(
      "MENU_SYNC_WORKFLOW_DISPATCH_MISSING",
    );
  });

  it("requires an existing Vault secret to change in place", () => {
    const before = [
      {
        id: "vault-id",
        created_at: "2026-08-27T00:00:00Z",
        updated_at: "2026-08-27T00:00:00Z",
      },
    ];
    const updated = [
      {
        ...before[0],
        updated_at: "2026-08-27T00:01:00Z",
      },
    ];

    expect(() => validateVaultMetadataChange(before, updated)).not.toThrow();
    expect(() => validateVaultMetadataChange(before, before)).toThrow(
      "MENU_SYNC_VAULT_METADATA_UNCHANGED",
    );
    expect(() =>
      validateVaultMetadataChange(before, [
        { ...updated[0], id: "replacement" },
      ]),
    ).toThrow("MENU_SYNC_VAULT_METADATA_UNCHANGED");
    expect(() => validateVaultMetadataChange([], updated)).not.toThrow();
  });

  it("derives GitHub gaps and the next primary window from one clock contract", () => {
    expect(githubWakeGap(new Date("2026-08-27T03:52:30Z"))).toEqual({
      minutesSincePrevious: 5,
      minutesUntilNext: 24,
    });
    expect(firstPrimaryWindowBounds("2026-08-27T03:40:00Z")).toMatchObject({
      windowStart: "2026-08-27T09:17:00.000Z",
      healthTo: "2026-08-27T09:32:00.000Z",
      verifyAfter: "2026-08-27T09:57:00.000Z",
    });
  });
});
