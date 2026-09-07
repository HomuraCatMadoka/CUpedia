import { describe, expect, it } from "vitest";

import {
  hasPublishCommandStructure,
  normalizePublishCommandIdentifiers,
  validateChangeIdentities,
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

  it("accepts a confirmed missing Floor only on a Building-contained create", () => {
    const command = updateCommand() as unknown as {
      changes: Array<Record<string, unknown>>;
    };
    command.changes[0] = {
      operation: "create",
      requestedFloor: { displayLabel: " G " },
      fact: {
        buildingId: "10000000-0000-4000-8000-000000000001",
        floorId: null,
        location: { kind: "building" },
      },
      sources: [{}],
    };

    expect(hasPublishCommandStructure(command)).toBe(true);
    expect(
      validateChangeIdentities(command as unknown as CampusMapPublishCommand),
    ).toEqual([]);
  });

  it("rejects missing Floor intent on updates or incompatible locations", () => {
    const update = updateCommand() as unknown as {
      changes: Array<Record<string, unknown>>;
    };
    update.changes[0]!.requestedFloor = { displayLabel: "G" };

    expect(
      validateChangeIdentities(update as unknown as CampusMapPublishCommand),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "requested-floor-create-only" }),
      ]),
    );

    const create = structuredClone(update);
    create.changes[0] = {
      operation: "create",
      requestedFloor: { displayLabel: " " },
      fact: {
        buildingId: null,
        floorId: null,
        location: {
          kind: "outdoor-point",
          longitude: 114.2,
          latitude: 22.4,
          crs: "wgs84",
          precision: "approximate",
        },
      },
      sources: [{}],
    };

    expect(
      validateChangeIdentities(create as unknown as CampusMapPublishCommand),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "floor-label-required" }),
        expect.objectContaining({ code: "invalid-requested-floor-location" }),
      ]),
    );
  });

  it("requires user-confirmed evidence for a requested Floor", () => {
    const command = updateCommand() as unknown as {
      changes: Array<Record<string, unknown>>;
    };
    command.changes[0] = {
      operation: "create",
      requestedFloor: { displayLabel: "LG1" },
      fact: {
        buildingId: "10000000-0000-4000-8000-000000000001",
        floorId: null,
        location: { kind: "building" },
      },
      sources: [{ kind: "provider-candidate" }],
    };

    expect(
      validateChangeIdentities(command as unknown as CampusMapPublishCommand),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "requested-floor-user-source-required",
          anchor: { changeIndex: 0, field: "requestedFloor" },
        }),
      ]),
    );
  });

  it("rejects requested Floor creation in an admin bulk command", () => {
    const command = updateCommand() as unknown as CampusMapPublishCommand;
    command.kind = "bulk";
    command.changes = [
      {
        operation: "create",
        requestedFloor: { displayLabel: "LG1" },
        fact: {
          buildingId: "10000000-0000-4000-8000-000000000001",
          floorId: null,
          location: { kind: "building" },
        },
        sources: [{ kind: "field-observation" }],
      },
    ] as CampusMapPublishCommand["changes"];

    expect(validateChangeIdentities(command)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "requested-floor-single-only",
          anchor: { changeIndex: 0, field: "requestedFloor" },
        }),
      ]),
    );
  });
});
