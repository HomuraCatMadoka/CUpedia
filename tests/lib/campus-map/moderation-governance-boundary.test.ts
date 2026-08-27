import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  commandCampusMapModeration,
  getCampusMapModerationCase,
  getCampusMapModerationTarget,
  listCampusMapModerationQueue,
} from "@/lib/campus-map/moderation-governance";
import type { CampusMapModerationCommand } from "@/lib/campus-map/moderation-governance-contract";
import { commandCampusMapModerationAction } from "@/lib/campus-map/moderation-governance-actions";

describe("Campus Map moderation governance boundary (#723)", () => {
  it("offers one typed command seam and a separate private admin read seam", () => {
    expect(commandCampusMapModeration).toBeTypeOf("function");
    expect(getCampusMapModerationCase).toBeTypeOf("function");
    expect(getCampusMapModerationTarget).toBeTypeOf("function");
    expect(listCampusMapModerationQueue).toBeTypeOf("function");
    expect(commandCampusMapModerationAction).toBeTypeOf("function");

    const commands = [
      {
        kind: "report",
        idempotencyKey: "72300000-0000-4000-8000-000000000001",
        target: {
          kind: "map-note-event",
          id: "72300000-0000-4000-8000-000000000002",
        },
        signal: "privacy",
        details: "这条备注可能公开了个人资料",
        evidence: null,
      },
      {
        kind: "hide-map-note-event",
        idempotencyKey: "72300000-0000-4000-8000-000000000003",
        eventId: "72300000-0000-4000-8000-000000000002",
        expectedVisibility: "public",
        reason: "隐藏个人资料",
        caseId: "72300000-0000-4000-8000-000000000004",
      },
      {
        kind: "redact-revision",
        idempotencyKey: "72300000-0000-4000-8000-000000000005",
        revisionId: "72300000-0000-4000-8000-000000000006",
        expectedVisibility: "public",
        reason: "历史版本包含个人资料",
        caseId: "72300000-0000-4000-8000-000000000004",
      },
      {
        kind: "block-contributor",
        idempotencyKey: "72300000-0000-4000-8000-000000000007",
        contributorId: "72300000-0000-4000-8000-000000000008",
        scope: "all",
        startsAt: "2026-08-27T00:00:00.000Z",
        endsAt: null,
        needsAcknowledgement: true,
        reason: "反复公开个人资料",
        caseId: "72300000-0000-4000-8000-000000000004",
      },
    ] satisfies CampusMapModerationCommand[];

    expect(commands.map((command) => command.kind)).toEqual([
      "report",
      "hide-map-note-event",
      "redact-revision",
      "block-contributor",
    ]);
  });

  it("keeps Drizzle rows behind the moderation module", async () => {
    const root = process.cwd();
    const contract = await readFile(
      resolve(root, "src/lib/campus-map/moderation-governance-contract.ts"),
      "utf8",
    );

    expect(contract).not.toMatch(/@\/db|drizzle-orm/);
  });
});
