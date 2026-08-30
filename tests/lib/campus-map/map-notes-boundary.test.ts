import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  createCampusMapNoteCorrectionContext,
  normalizeCampusMapNoteCommand,
  type CampusMapNoteCommand,
} from "@/lib/campus-map/map-notes-contract";
import { decodeCampusMapUrl } from "@/lib/campus-map/scene-codec";
import type { CampusMapSceneCatalog } from "@/lib/campus-map/scene-kernel";

const correctionCatalog: CampusMapSceneCatalog = {
  categories: [],
  buildings: {},
  places: {
    "72000000-0000-4000-8000-000000000002": {
      buildingId: null,
      floorId: null,
      category: "map-note-correction",
      cameraTarget: "place-point",
    },
  },
  contents: {},
};

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
        "/campus-map?v=1&task=edit&id=72000000-0000-4000-8000-000000000002&returnNote=72000000-0000-4000-8000-000000000003",
      returnContext: {
        kind: "map-note",
        noteId: "72000000-0000-4000-8000-000000000003",
        href: "/campus-map/notes/72000000-0000-4000-8000-000000000003",
      },
    });
  });

  it("keeps every accepted canonical Note UUID valid across the Edit URL boundary", () => {
    const correction = createCampusMapNoteCorrectionContext(
      "0198f4c6-88f4-7e52-88c3-e570808c9a73",
      "72000000-0000-4000-8000-000000000002",
    );
    if (!correction) throw new Error("expected canonical correction context");

    expect(
      decodeCampusMapUrl(
        new URL(correction.editHref, "https://example.test").searchParams,
        correctionCatalog,
      ),
    ).toEqual({
      status: "decoded",
      session: {
        mode: "task",
        task: {
          kind: "edit",
          placeId: correction.placeId,
          returnContext: {
            kind: "map-note",
            noteId: "0198f4c6-88f4-7e52-88c3-e570808c9a73",
          },
        },
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
