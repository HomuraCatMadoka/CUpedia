import { describe, expect, it } from "vitest";

import {
  hasPublishCommandStructure,
  normalizePublishCommandIdentifiers,
} from "@/lib/campus-map/publish-command";
import type {
  CampusMapPublishCommand,
  CampusMapPublishPhotoInput,
} from "@/lib/campus-map/publish-contract";

function updateCommand(photos?: CampusMapPublishPhotoInput[]) {
  const change = {
    operation: "update",
    placeId: "10000000-0000-4000-8000-000000000001",
    baseRevisionId: "20000000-0000-4000-8000-000000000001",
    fact: { buildingId: null, floorId: null },
    sources: [{}],
    ...(photos === undefined ? {} : { photos }),
  };
  return {
    kind: "single",
    idempotencyKey: "30000000-0000-4000-8000-000000000001",
    comment: "更新地点",
    sourceSummary: "现场观察",
    reviewRequested: false,
    client: { name: "test", version: "1" },
    warningAcknowledgements: [],
    changes: [change],
  } as unknown as CampusMapPublishCommand;
}

describe("Campus Map publish command normalization", () => {
  it("keeps an omitted Place-photo selection absent for governance revalidation", () => {
    const normalized = normalizePublishCommandIdentifiers(updateCommand());

    expect(Object.hasOwn(normalized.changes[0]!, "photos")).toBe(false);
    expect(hasPublishCommandStructure(normalized)).toBe(true);
  });

  it("preserves an explicit empty Place-photo selection", () => {
    const normalized = normalizePublishCommandIdentifiers(updateCommand([]));

    expect(normalized.changes[0]).toMatchObject({ photos: [] });
    expect(hasPublishCommandStructure(normalized)).toBe(true);
  });

  it("canonicalizes optional Place-photo asset IDs through the shared path", () => {
    const normalized = normalizePublishCommandIdentifiers(
      updateCommand([
        {
          assetId: "ABCDEFAB-CDEF-4ABC-8ABC-ABCDEFABCDEF",
          role: "entrance",
        },
      ]),
    );

    expect(normalized.changes[0]).toMatchObject({
      photos: [
        {
          assetId: "abcdefab-cdef-4abc-8abc-abcdefabcdef",
          role: "entrance",
        },
      ],
    });
  });
});
