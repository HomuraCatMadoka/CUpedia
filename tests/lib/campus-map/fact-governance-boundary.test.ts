import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  governCampusMapFacts,
  type CampusMapFactGovernanceCommand,
} from "@/lib/campus-map/fact-governance";

describe("Campus Map fact governance boundary", () => {
  it("exposes one typed, server-authorized command seam", () => {
    expect(governCampusMapFacts).toBeTypeOf("function");

    const commands = [
      {
        kind: "revert",
        idempotencyKey: "00000000-0000-4000-8000-000000000001",
        reason: "恢复到已核对版本",
        client: { name: "admin-test", version: "1" },
        placeId: "00000000-0000-4000-8000-000000000002",
        baseRevisionId: "00000000-0000-4000-8000-000000000003",
        targetRevisionId: "00000000-0000-4000-8000-000000000004",
        sources: [],
      },
      {
        kind: "merge",
        idempotencyKey: "00000000-0000-4000-8000-000000000005",
        sourceAccessedOn: "2026-09-01",
        reason: "两项记录代表同一个饮水点",
        client: { name: "admin-test", version: "1" },
        survivor: {
          placeId: "00000000-0000-4000-8000-000000000006",
          baseRevisionId: "00000000-0000-4000-8000-000000000007",
          fact: {} as never,
          sources: [],
        },
        loser: {
          placeId: "00000000-0000-4000-8000-000000000008",
          baseRevisionId: "00000000-0000-4000-8000-000000000009",
          sources: [],
        },
        fieldResolutions: [],
      },
      {
        kind: "bulk-edit",
        idempotencyKey: "00000000-0000-4000-8000-000000000010",
        reason: "管理员批量修正",
        sourceSummary: "现场核对",
        client: { name: "admin-test", version: "1" },
        changes: [],
        warningAcknowledgements: [],
      },
    ] satisfies CampusMapFactGovernanceCommand[];

    expect(commands.map((command) => command.kind)).toEqual([
      "revert",
      "merge",
      "bulk-edit",
    ]);
  });

  it("does not create a second Drizzle row-writing boundary", async () => {
    const source = await readFile(
      new URL(
        "../../../src/lib/campus-map/fact-governance.ts",
        import.meta.url,
      ),
      "utf8",
    );

    expect(source).not.toMatch(/from ["']drizzle-orm["']/);
    expect(source).not.toMatch(/@\/db\/schema/);
    expect(source).not.toMatch(/\.insert\(|\.update\(|\.delete\(/);
  });
});
