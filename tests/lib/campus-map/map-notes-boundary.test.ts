import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createCampusMapNoteCorrectionContext,
  normalizeCampusMapNoteCommand,
  type CampusMapNoteCommand,
} from "@/lib/campus-map/map-notes-contract";

describe("Campus Map Notes module boundary (#722)", () => {
  it("normalizes canonical identifiers and WGS84 context before fingerprinting", () => {
    const command: CampusMapNoteCommand = {
      kind: "create",
      idempotencyKey: "72000000-0000-4000-8000-000000000001",
      placeId: "72000000-0000-4000-8000-000000000002".toUpperCase(),
      position: { longitude: 114.2, latitude: 22.4, crs: "wgs84" },
      openingComment: "  飲水機的位置似乎不正確。  ",
    };

    expect(normalizeCampusMapNoteCommand(command)).toEqual({
      ...command,
      placeId: command.placeId!.toLowerCase(),
      openingComment: "飲水機的位置似乎不正確。",
    });
  });

  it("hands Edit place a typed return context without owning the map session", () => {
    expect(
      createCampusMapNoteCorrectionContext(
        "72000000-0000-4000-8000-000000000003",
        "72000000-0000-4000-8000-000000000002",
      ),
    ).toEqual({
      placeId: "72000000-0000-4000-8000-000000000002",
      editHref:
        "/prototype/campus-map?v=1&task=edit&id=72000000-0000-4000-8000-000000000002&returnNote=72000000-0000-4000-8000-000000000003",
      returnContext: {
        kind: "map-note",
        noteId: "72000000-0000-4000-8000-000000000003",
        href: "/campus-map/notes/72000000-0000-4000-8000-000000000003",
      },
    });
  });

  it("keeps callers on typed commands and the single service owner", async () => {
    const root = process.cwd();
    const facade = await readFile(
      resolve(root, "src/lib/campus-map/map-notes.ts"),
      "utf8",
    );
    const contract = await readFile(
      resolve(root, "src/lib/campus-map/map-notes-contract.ts"),
      "utf8",
    );

    expect(contract).not.toMatch(/@\/db|drizzle-orm/);
    expect(facade).toMatch(/export async function commandCampusMapNote/);
    expect(facade).toMatch(/export async function getCampusMapNote/);
    expect(facade).toMatch(/export async function listCampusMapNotes/);
    expect(facade).not.toMatch(/export async function (insert|update|delete)/);
  });
});
