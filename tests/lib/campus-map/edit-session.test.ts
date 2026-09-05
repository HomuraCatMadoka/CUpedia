import { describe, expect, it } from "vitest";

import {
  CAMPUS_MAP_EDIT_SNAPSHOT_VERSION,
  createCampusMapEditDraft,
  decodeCampusMapEditSnapshot,
  deriveCampusMapPublishCommand,
  encodeCampusMapEditSnapshot,
  isCampusMapEditDirty,
  transitionCampusMapEdit,
  type CampusMapEditEvent,
  type CampusMapEditSession,
} from "@/lib/campus-map/edit-session";
import { validateFact } from "@/lib/campus-map/publish-command";
import type {
  CampusMapPublishFactInput,
  CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish-contract";

const firstKey = "10000000-0000-4000-8000-000000000001";
const secondKey = "10000000-0000-4000-8000-000000000002";
const placeId = "20000000-0000-4000-8000-000000000001";
const baseRevisionId = "30000000-0000-4000-8000-000000000001";
const currentRevisionId = "30000000-0000-4000-8000-000000000002";

const source: CampusMapPublishSourceInput = {
  kind: "field-observation",
  ref: "现场观察 2026-08-25",
  url: null,
  owner: null,
  version: null,
  snapshotHash: null,
  accessedOn: "2026-08-25",
  observedAt: "2026-08-25T04:00:00.000Z",
  rightsStatus: "original-observation",
  limitations: null,
  note: null,
  sourceCoordinate: null,
};

const fact: CampusMapPublishFactInput = {
  name: "大学图书馆饮水机",
  buildingId: null,
  floorId: null,
  placeType: "water",
  regularHours: null,
  officialActions: [],
  visitNote: null,
  capabilities: [],
  gender: null,
  wheelchairAccess: null,
  location: {
    kind: "outdoor-point",
    longitude: 114.2049,
    latitude: 22.4195,
    crs: "wgs84",
    precision: "approximate",
  },
  observedAt: "2026-08-25T04:00:00.000Z",
};

function editSession(): CampusMapEditSession {
  return transitionCampusMapEdit(null, {
    type: "START_EDIT",
    placeId,
    baseRevisionId,
    fact,
    sources: [source],
    idempotencyKey: firstKey,
  }).session!;
}

function legacyV6Snapshot(session: CampusMapEditSession) {
  const snapshot = JSON.parse(encodeCampusMapEditSnapshot(session)) as {
    version: number;
    session: Record<string, unknown> & {
      draft: Record<string, unknown> & {
        fact: Record<string, unknown>;
        baselineFact: Record<string, unknown> | null;
        sources: unknown[];
        baselineSources: unknown[];
        photos: unknown[];
        baselinePhotos: unknown[];
      };
    };
  };
  const downgradeFact = (current: Record<string, unknown> | null) => {
    if (current === null) return null;
    const legacy = { ...current };
    const placeType = legacy.placeType;
    const regularHours = legacy.regularHours;
    delete legacy.placeType;
    delete legacy.regularHours;
    delete legacy.officialActions;
    delete legacy.visitNote;
    delete legacy.capacity;
    delete legacy.seatType;
    return {
      ...legacy,
      pinType: placeType,
      audience: "unknown",
      credentialRequirement: "unknown",
      accessSchedule:
        regularHours && typeof regularHours === "object"
          ? { kind: "weekly", ...regularHours }
          : { kind: "unknown" },
      reservationRequirement: "unknown",
      temporaryStatus: current.temporaryStatus ?? "unknown",
      gender: current.gender ?? "unknown",
      wheelchairAccess: current.wheelchairAccess ?? "unknown",
    };
  };

  snapshot.version = 6;
  snapshot.session.draft.fact = downgradeFact(snapshot.session.draft.fact)!;
  snapshot.session.draft.baselineFact = downgradeFact(
    snapshot.session.draft.baselineFact,
  );
  return snapshot;
}

describe("Campus Map edit session transition", () => {
  it("starts a global Add by selecting a canonical map location", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_FACILITY_ADD",
      idempotencyKey: firstKey,
      entry: { kind: "global" },
    });

    expect(started).toMatchObject({
      accepted: true,
      session: {
        status: "selecting-location",
        draft: {
          entrySource: "global",
          fact: {
            buildingId: null,
            floorId: null,
            location: null,
          },
        },
      },
      commands: [
        { kind: "scene", intent: "start-create" },
        { kind: "persist-snapshot" },
        { kind: "focus", target: "form-heading" },
      ],
    });
    expect(isCampusMapEditDirty(started.session)).toBe(false);
  });

  it("selects a canonical Building before opening the Add form", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_FACILITY_ADD",
      idempotencyKey: firstKey,
      entry: { kind: "global" },
    }).session!;
    const changed = transitionCampusMapEdit(started, {
      type: "SELECT_BUILDING_LOCATION",
      locationDisplay: {
        buildingId: "50000000-0000-4000-8000-000000000001",
        buildingName: "科学馆",
        floorId: null,
        floorLabel: null,
      },
    }).session!;

    expect(changed.status).toBe("editing");
    expect(changed.draft.fact).toMatchObject({
      buildingId: "50000000-0000-4000-8000-000000000001",
      floorId: null,
      location: { kind: "building" },
    });
    expect(isCampusMapEditDirty(changed)).toBe(true);

    expect(
      decodeCampusMapEditSnapshot(encodeCampusMapEditSnapshot(changed)),
    ).toEqual({ status: "restored", session: changed });
  });

  it("inherits the building and optional floor for a building-required Add", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_FACILITY_ADD",
      idempotencyKey: firstKey,
      entry: {
        kind: "building",
        locationDisplay: {
          buildingId: "50000000-0000-4000-8000-000000000001",
          buildingName: "科学馆",
          floorId: "60000000-0000-4000-8000-000000000001",
          floorLabel: "1/F",
        },
      },
    });

    expect(started.session).toMatchObject({
      status: "editing",
      draft: {
        entrySource: "building",
        fact: {
          buildingId: "50000000-0000-4000-8000-000000000001",
          floorId: "60000000-0000-4000-8000-000000000001",
          location: { kind: "floor" },
        },
        locationDisplay: {
          buildingName: "科学馆",
          floorLabel: "1/F",
        },
      },
    });
    expect(isCampusMapEditDirty(started.session)).toBe(false);
    expect(
      transitionCampusMapEdit(started.session, { type: "REQUEST_CLOSE" }),
    ).toEqual({
      accepted: true,
      session: null,
      commands: [
        { kind: "clear-snapshot" },
        { kind: "scene", intent: "cancel-task" },
      ],
    });
    expect(
      transitionCampusMapEdit(started.session, {
        type: "REQUEST_PUBLISH",
        accessedOn: "2026-08-26",
      }).commands,
    ).toContainEqual(expect.objectContaining({ kind: "publish" }));
  });

  it("enters center-pin placement only through the explicit outdoor branch", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_FACILITY_ADD",
      idempotencyKey: firstKey,
      entry: { kind: "global" },
    });
    const outdoor = transitionCampusMapEdit(started.session, {
      type: "START_OUTDOOR_PLACEMENT",
    });

    expect(outdoor.session).toMatchObject({
      status: "placing",
      draft: {
        fact: { buildingId: null, floorId: null, location: null },
        placementCandidate: null,
      },
    });
    expect(outdoor.commands).toContainEqual({
      kind: "announce",
      message: "移动地图以选择室外设施位置",
    });
  });

  it("does not accept hidden form changes while location selection is active", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_FACILITY_ADD",
      idempotencyKey: firstKey,
      entry: { kind: "global", placeType: "classroom" },
    });

    expect(
      transitionCampusMapEdit(started.session, {
        type: "CHANGE_PLACE_TYPE",
        placeType: "water",
      }),
    ).toMatchObject({ accepted: false, session: started.session });
  });

  it("keeps the active category when Add starts from an empty category", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_FACILITY_ADD",
      idempotencyKey: firstKey,
      entry: { kind: "global", placeType: "classroom" },
    });

    expect(started.session).toMatchObject({
      status: "selecting-location",
      draft: {
        entrySource: "global",
        fact: { placeType: "classroom", name: "课室" },
      },
    });
    expect(isCampusMapEditDirty(started.session)).toBe(false);
  });

  it("accepts an Add intent once and locks a keyboard-confirmed WGS84 point", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: firstKey,
    });
    const duplicate = transitionCampusMapEdit(started.session, {
      type: "START_ADD",
      idempotencyKey: secondKey,
    });
    const positioned = transitionCampusMapEdit(started.session, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.2072,
        latitude: 22.4191,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    });

    expect(started.session?.status).toBe("placing");
    expect(started.commands).toContainEqual({
      kind: "scene",
      intent: "start-create",
    });
    expect(duplicate).toMatchObject({
      accepted: false,
      session: started.session,
    });
    expect(positioned.session).toMatchObject({
      status: "editing",
      draft: {
        fact: {
          location: {
            kind: "outdoor-point",
            longitude: 114.2072,
            latitude: 22.4191,
            crs: "wgs84",
            precision: "approximate",
          },
        },
        placementMethod: "keyboard",
      },
    });
  });

  it("persists a placement candidate without making an Add draft dirty", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: firstKey,
    });
    const position = {
      longitude: 114.2072,
      latitude: 22.4191,
      crs: "wgs84" as const,
      precision: "approximate" as const,
      method: "pointer" as const,
    };
    const updated = transitionCampusMapEdit(started.session, {
      type: "UPDATE_PLACEMENT_CANDIDATE",
      position,
    });

    expect(updated).toMatchObject({
      accepted: true,
      session: {
        status: "placing",
        draft: {
          placementCandidate: position,
          fact: { location: null },
        },
      },
    });
    expect(isCampusMapEditDirty(updated.session)).toBe(false);

    const restored = decodeCampusMapEditSnapshot(
      encodeCampusMapEditSnapshot(updated.session!),
    );
    expect(restored).toMatchObject({
      status: "restored",
      session: { draft: { placementCandidate: position } },
    });

    const confirmed = transitionCampusMapEdit(updated.session, {
      type: "CONFIRM_POSITION",
      position,
    });
    expect(confirmed.session).toMatchObject({
      status: "editing",
      draft: {
        placementCandidate: null,
        placementMethod: "pointer",
        fact: {
          location: {
            kind: "outdoor-point",
            longitude: position.longitude,
            latitude: position.latitude,
            crs: "wgs84",
            precision: "approximate",
          },
        },
      },
    });
    expect(
      confirmed.commands.filter(
        (command) => command.kind === "persist-snapshot",
      ),
    ).toHaveLength(1);
    expect(confirmed.commands).toContainEqual({
      kind: "focus",
      target: "form-heading",
    });
  });

  it("starts Add at one WGS84 point with one scene and camera transition", () => {
    const position = {
      longitude: 114.215,
      latitude: 22.425,
      crs: "wgs84" as const,
      precision: "approximate" as const,
      method: "pointer" as const,
    };

    const started = transitionCampusMapEdit(null, {
      type: "START_ADD_AT_POSITION",
      idempotencyKey: firstKey,
      position,
    });

    expect(started).toMatchObject({
      accepted: true,
      session: {
        status: "placing",
        draft: { placementCandidate: position },
      },
      commands: [
        { kind: "scene", intent: "start-create" },
        { kind: "persist-snapshot" },
        {
          kind: "camera",
          intent: "recenter-placement",
          position: [114.215, 22.425],
          precision: "approximate",
        },
      ],
    });
    expect(isCampusMapEditDirty(started.session)).toBe(false);
  });

  it("keeps the same placing session while the user fills in place details", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: firstKey,
    });
    const position = {
      longitude: 114.2072,
      latitude: 22.4191,
      crs: "wgs84" as const,
      precision: "approximate" as const,
      method: "pointer" as const,
    };
    const positioned = transitionCampusMapEdit(started.session, {
      type: "UPDATE_PLACEMENT_CANDIDATE",
      position,
    });
    const named = transitionCampusMapEdit(positioned.session, {
      type: "CHANGE_FACT",
      fact: {
        ...positioned.session!.draft.fact,
        name: "大学站广场饮水点",
        placeType: "water",
      },
    });

    expect(named.session).toMatchObject({
      status: "placing",
      draft: {
        placementCandidate: position,
        fact: {
          name: "大学站广场饮水点",
          placeType: "water",
          location: null,
        },
      },
    });
    expect(isCampusMapEditDirty(named.session)).toBe(true);
  });

  it("treats every typed Add fact change as dirty", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: firstKey,
    }).session!;
    const changed = transitionCampusMapEdit(started, {
      type: "CHANGE_FACT",
      fact: { ...started.draft.fact, placeType: "toilet" },
    }).session;

    expect(isCampusMapEditDirty(changed)).toBe(true);
  });

  it("owns a pending indoor location through validation, close, and snapshot restore", () => {
    const pending = transitionCampusMapEdit(editSession(), {
      type: "CHOOSE_LOCATION_KIND",
      kind: "indoor",
    });

    expect(pending).toMatchObject({
      accepted: true,
      session: {
        status: "editing",
        draft: {
          locationIntent: "indoor",
          fact: { location: { kind: "outdoor-point" } },
        },
      },
      commands: [{ kind: "persist-snapshot" }],
    });
    expect(isCampusMapEditDirty(pending.session)).toBe(true);
    expect(
      transitionCampusMapEdit(pending.session, {
        type: "REQUEST_PUBLISH",
        accessedOn: "2026-08-26",
      }),
    ).toMatchObject({
      session: { status: "editing", localError: "buildingId" },
      commands: [
        { kind: "persist-snapshot" },
        { kind: "focus", target: "building" },
        { kind: "announce", message: "请选择建筑" },
      ],
    });
    expect(
      transitionCampusMapEdit(pending.session, { type: "REQUEST_CLOSE" })
        .session?.status,
    ).toBe("confirm-discard");
    expect(
      decodeCampusMapEditSnapshot(
        encodeCampusMapEditSnapshot(pending.session!),
      ),
    ).toEqual({ status: "restored", session: pending.session });
  });

  it("keeps schema defaults in sync when an untouched Add preset changes", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: firstKey,
    }).session!;
    const changed = transitionCampusMapEdit(started, {
      type: "CHANGE_PLACE_TYPE",
      placeType: "toilet",
    });

    expect(changed).toMatchObject({
      accepted: true,
      session: {
        draft: {
          fact: {
            name: "洗手间",
            placeType: "toilet",
            capabilities: [],
            gender: null,
          },
        },
      },
    });
  });

  it("preserves a real place name when its preset changes", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: firstKey,
    }).session!;
    const named = transitionCampusMapEdit(started, {
      type: "CHANGE_FACT",
      fact: { ...started.draft.fact, name: "科学馆 G/F 饮水机" },
    }).session!;
    const changed = transitionCampusMapEdit(named, {
      type: "CHANGE_PLACE_TYPE",
      placeType: "toilet",
    });

    expect(changed.session?.draft.fact).toMatchObject({
      name: "科学馆 G/F 饮水机",
      placeType: "toilet",
    });
  });

  it("preserves a canonical Edit name when its preset changes", () => {
    const changed = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_PLACE_TYPE",
      placeType: "toilet",
    });

    expect(changed.session?.draft.fact).toMatchObject({
      name: fact.name,
      placeType: "toilet",
    });
  });

  it("keeps an explicitly selected canonical Building or Floor label with the fact", () => {
    const buildingId = "50000000-0000-4000-8000-000000000001";
    const floorId = "60000000-0000-4000-8000-000000000001";
    const started = editSession();
    const buildingFact: CampusMapPublishFactInput = {
      ...started.draft.fact,
      buildingId,
      floorId: null,
      location: { kind: "building" },
    } as CampusMapPublishFactInput;
    const building = transitionCampusMapEdit(started, {
      type: "CHANGE_FACT",
      fact: buildingFact,
      locationDisplay: {
        buildingId,
        buildingName: "科学馆",
        floorId: null,
        floorLabel: null,
      },
    });

    expect(building.session?.draft).toMatchObject({
      fact: { buildingId, floorId: null, location: { kind: "building" } },
      locationDisplay: {
        buildingId,
        buildingName: "科学馆",
        floorId: null,
        floorLabel: null,
      },
    });

    const floorFact: CampusMapPublishFactInput = {
      ...buildingFact,
      floorId,
      location: { kind: "floor" },
    };
    const floor = transitionCampusMapEdit(building.session, {
      type: "CHANGE_FACT",
      fact: floorFact,
      locationDisplay: {
        buildingId,
        buildingName: "科学馆",
        floorId,
        floorLabel: "1/F",
      },
    });
    expect(floor.session?.draft.locationDisplay).toEqual({
      buildingId,
      buildingName: "科学馆",
      floorId,
      floorLabel: "1/F",
    });
    expect(
      deriveCampusMapPublishCommand(floor.session!.draft).changes[0],
    ).toMatchObject({
      operation: "update",
      fact: {
        name: fact.name,
        buildingId,
        floorId,
        location: { kind: "floor" },
      },
    });
  });

  it("maps every editable V2 operating fact into the canonical publish fact", () => {
    const edited = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: {
        ...fact,
        name: "大学图书馆 1/F 饮水机 A",
        regularHours: {
          timezone: "Asia/Hong_Kong",
          intervals: [
            {
              days: ["mon", "tue", "wed", "thu", "fri"],
              opensAt: "08:30",
              closesAt: "22:00",
            },
          ],
        },
        officialActions: [
          { label: "官网", url: "https://www.cuhk.edu.hk/example" },
        ],
        visitNote: "由正门进入",
      },
    }).session!;

    expect(
      deriveCampusMapPublishCommand(edited.draft).changes[0],
    ).toMatchObject({
      operation: "update",
      fact: {
        name: "大学图书馆 1/F 饮水机 A",
        regularHours: {
          timezone: "Asia/Hong_Kong",
          intervals: [
            {
              days: ["mon", "tue", "wed", "thu", "fri"],
              opensAt: "08:30",
              closesAt: "22:00",
            },
          ],
        },
        officialActions: [
          { label: "官网", url: "https://www.cuhk.edu.hk/example" },
        ],
        visitNote: "由正门进入",
      },
    });
  });

  it("restores incomplete regular hours but blocks them from publishing", () => {
    const edited = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: {
        ...fact,
        name: "大学图书馆平日饮水机",
        regularHours: {
          timezone: "Asia/Hong_Kong",
          intervals: [{ days: [], opensAt: "", closesAt: "" }],
        },
      },
    }).session!;

    expect(
      decodeCampusMapEditSnapshot(encodeCampusMapEditSnapshot(edited)),
    ).toMatchObject({
      status: "restored",
      session: {
        draft: {
          fact: {
            regularHours: {
              intervals: [{ days: [], opensAt: "", closesAt: "" }],
            },
          },
        },
      },
    });
    expect(
      transitionCampusMapEdit(edited, { type: "REQUEST_PUBLISH" }),
    ).toMatchObject({
      accepted: true,
      session: { status: "editing", localError: "regularHours" },
      commands: expect.arrayContaining([
        { kind: "focus", target: "regularHours" },
      ]),
    });
  });

  it("clears type-specific facts when their fields become inapplicable", () => {
    const printerFact: CampusMapPublishFactInput = {
      ...fact,
      placeType: "printer",
      capabilities: ["print", "scan"],
    };
    const started: CampusMapEditSession = {
      status: "editing",
      draft: createCampusMapEditDraft({
        mode: "edit",
        placeId,
        baseRevisionId,
        idempotencyKey: firstKey,
        fact: printerFact,
        sources: [source],
      }),
    };
    const healthService = transitionCampusMapEdit(started, {
      type: "CHANGE_PLACE_TYPE",
      placeType: "health-service",
    }).session!;

    expect(healthService.draft.fact).toMatchObject({
      placeType: "health-service",
      capabilities: [],
      gender: null,
    });
    const requested = transitionCampusMapEdit(healthService, {
      type: "REQUEST_PUBLISH",
    });
    const publish = requested.commands.find(
      (command) => command.kind === "publish",
    );
    expect(publish).toBeDefined();
    if (publish?.kind !== "publish") throw new Error("publish command missing");
    const change = publish.command.changes[0];
    if (change.operation === "retire" || change.operation === "merge") {
      throw new Error("unexpected publish operation");
    }
    expect(validateFact(change.fact, 0)).toEqual([]);
  });

  it("starts Edit with stable identity and a clean baseline", () => {
    const session = editSession();

    expect(session).toMatchObject({
      status: "editing",
      draft: { mode: "edit", placeId, baseRevisionId },
    });
    expect(isCampusMapEditDirty(session)).toBe(false);
  });

  it("keeps source-only Edit changes as provenance without making them publishable", () => {
    const changedSources = [
      source,
      { ...source, ref: "现场观察 2026-08-26", accessedOn: "2026-08-26" },
    ];
    const changed = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_SOURCES",
      sources: changedSources,
    });
    const publish = transitionCampusMapEdit(changed.session, {
      type: "REQUEST_PUBLISH",
    });

    expect(changed.session?.draft.sources).toEqual(changedSources);
    expect(isCampusMapEditDirty(changed.session)).toBe(false);
    expect(publish).toMatchObject({
      accepted: false,
      session: changed.session,
    });

    const factChanged = transitionCampusMapEdit(changed.session, {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "有事实修改的地点" },
    }).session!;
    expect(
      deriveCampusMapPublishCommand(factChanged.draft).changes[0],
    ).toMatchObject({ sources: changedSources });
  });

  it("repositions the same edit draft and invalidates warning acknowledgement", () => {
    const warned = {
      ...editSession(),
      status: "warning" as const,
      draft: {
        ...editSession().draft,
        warningAcknowledgements: [
          {
            changeIndex: 0,
            code: "duplicate-candidate",
            fingerprint: "a".repeat(64),
          },
        ],
      },
    };
    const placing = transitionCampusMapEdit(warned, {
      type: "START_REPOSITION",
    });
    const repositioned = transitionCampusMapEdit(placing.session, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.21,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    });

    expect(placing.session).toMatchObject({
      status: "placing",
      draft: {
        mode: "edit",
        placeId,
        baseRevisionId,
        placementCandidate: {
          longitude: 114.2049,
          latitude: 22.4195,
          crs: "wgs84",
          precision: "approximate",
          method: "pointer",
        },
        warningAcknowledgements: [],
      },
    });
    expect(placing.commands).toContainEqual({
      kind: "camera",
      intent: "recenter-placement",
      position: [114.2049, 22.4195],
      precision: "approximate",
    });
    expect(repositioned.session).toMatchObject({
      status: "editing",
      draft: {
        placeId,
        baseRevisionId,
        fact: {
          location: { longitude: 114.21, latitude: 22.42 },
        },
      },
    });
    expect(isCampusMapEditDirty(repositioned.session)).toBe(true);
  });

  it("clears building containment when an Edit moves to an outdoor point", () => {
    const containedFact: CampusMapPublishFactInput = {
      ...fact,
      buildingId: "science-centre",
      floorId: "1",
      location: { kind: "floor" },
    };
    const editing = transitionCampusMapEdit(null, {
      type: "START_EDIT",
      placeId,
      baseRevisionId,
      fact: containedFact,
      sources: [source],
      idempotencyKey: firstKey,
    }).session!;
    const placing = transitionCampusMapEdit(editing, {
      type: "START_REPOSITION",
    }).session;
    const repositioned = transitionCampusMapEdit(placing, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.21,
        latitude: 22.42,
        crs: "wgs84",
        precision: "precise",
        method: "pointer",
      },
    }).session!;

    expect(repositioned.draft.fact).toMatchObject({
      buildingId: null,
      floorId: null,
      location: { kind: "outdoor-point", precision: "precise" },
    });
    expect(
      decodeCampusMapEditSnapshot(encodeCampusMapEditSnapshot(repositioned)),
    ).toMatchObject({ status: "restored", session: repositioned });
  });

  it("asks before closing a dirty draft and supports continue or discard", () => {
    const changed = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "大学图书馆新饮水点" },
    }).session;
    const closing = transitionCampusMapEdit(changed, { type: "REQUEST_CLOSE" });
    const continued = transitionCampusMapEdit(closing.session, {
      type: "CONTINUE_EDITING",
    });
    const discarded = transitionCampusMapEdit(closing.session, {
      type: "DISCARD",
    });

    expect(isCampusMapEditDirty(changed)).toBe(true);
    expect(closing.session?.status).toBe("confirm-discard");
    expect(continued.session?.status).toBe("editing");
    expect(discarded.session).toBeNull();
    expect(discarded.commands).toEqual([
      { kind: "clear-snapshot" },
      { kind: "scene", intent: "cancel-task" },
    ]);
  });

  it("discards only newly uploaded photos when they leave a draft", () => {
    const baselineAssetId = "30000000-0000-4000-8000-000000000010";
    const uploadedAssetId = "30000000-0000-4000-8000-000000000011";
    const session = transitionCampusMapEdit(null, {
      type: "START_EDIT",
      placeId,
      baseRevisionId,
      fact,
      sources: [source],
      photos: [{ assetId: baselineAssetId, role: "overview" }],
      idempotencyKey: firstKey,
    }).session!;
    const withUpload = transitionCampusMapEdit(session, {
      type: "CHANGE_PHOTOS",
      photos: [
        ...session.draft.photos,
        { assetId: uploadedAssetId, role: "entrance" },
      ],
    }).session!;

    const removeHistorical = transitionCampusMapEdit(withUpload, {
      type: "CHANGE_PHOTOS",
      photos: [{ assetId: uploadedAssetId, role: "entrance" }],
    });
    expect(removeHistorical.commands).toEqual([{ kind: "persist-snapshot" }]);

    const removeUpload = transitionCampusMapEdit(removeHistorical.session, {
      type: "CHANGE_PHOTOS",
      photos: [],
    });
    expect(removeUpload.commands).toEqual([
      { kind: "persist-snapshot" },
      { kind: "discard-place-photos", assetIds: [uploadedAssetId] },
    ]);
  });

  it("discards every unbound upload when the user confirms draft removal", () => {
    const baselineAssetId = "30000000-0000-4000-8000-000000000012";
    const uploadedAssetId = "30000000-0000-4000-8000-000000000013";
    const session = transitionCampusMapEdit(null, {
      type: "START_EDIT",
      placeId,
      baseRevisionId,
      fact,
      sources: [source],
      photos: [{ assetId: baselineAssetId, role: "overview" }],
      idempotencyKey: firstKey,
    }).session!;
    const changed = transitionCampusMapEdit(session, {
      type: "CHANGE_PHOTOS",
      photos: [
        ...session.draft.photos,
        { assetId: uploadedAssetId, role: "entrance" },
      ],
    }).session!;
    const closing = transitionCampusMapEdit(changed, { type: "REQUEST_CLOSE" });
    const discarded = transitionCampusMapEdit(closing.session, {
      type: "DISCARD",
    });

    expect(discarded.commands).toEqual([
      { kind: "clear-snapshot" },
      { kind: "discard-place-photos", assetIds: [uploadedAssetId] },
      { kind: "scene", intent: "cancel-task" },
    ]);
  });

  it("round-trips a versioned draft and safely rejects damaged snapshots", () => {
    const changed = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "可恢复名称" },
    }).session;
    const encoded = encodeCampusMapEditSnapshot(changed!);

    expect(CAMPUS_MAP_EDIT_SNAPSHOT_VERSION).toBe(9);
    expect(JSON.parse(encoded)).toMatchObject({
      version: CAMPUS_MAP_EDIT_SNAPSHOT_VERSION,
      session: { draft: { placeId, baseRevisionId } },
    });
    expect(decodeCampusMapEditSnapshot(encoded)).toEqual({
      status: "restored",
      session: changed,
    });
    expect(decodeCampusMapEditSnapshot("{broken")).toEqual({
      status: "discarded",
      reason: "invalid-json",
    });
    expect(
      decodeCampusMapEditSnapshot(
        JSON.stringify({ version: 999, session: changed }),
      ),
    ).toEqual({ status: "discarded", reason: "unsupported-version" });
  });

  it.each([
    "reconciliation-unavailable",
    "handoff-failed",
    "projection-failed",
    "missing-target",
    "receipt-state-unavailable",
  ] as const)("keeps %s as an unknown original publish result", (reason) => {
    const publishing = transitionCampusMapEdit(
      transitionCampusMapEdit(editSession(), {
        type: "CHANGE_FACT",
        fact: { ...fact, name: "等待确认" },
      }).session,
      { type: "REQUEST_PUBLISH" },
    ).session!;

    const unknown = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RECOVERY_RESULT",
      idempotencyKey: firstKey,
      reason,
    });

    expect(unknown.session).toMatchObject({
      status: "publish-unknown",
      publishFeedbackReason: reason,
    });
    expect(unknown.commands).toEqual([
      { kind: "persist-snapshot" },
      { kind: "focus", target: "publish-feedback" },
      {
        kind: "announce",
        message: "正在确认发布结果，你的修改已经保留",
      },
    ]);
    expect(
      decodeCampusMapEditSnapshot(
        encodeCampusMapEditSnapshot(unknown.session!),
      ),
    ).toMatchObject({
      status: "restored",
      session: {
        status: "publish-unknown",
        publishFeedbackReason: reason,
      },
    });

    const checking = transitionCampusMapEdit(unknown.session, {
      type: "CHECK_PUBLISH_RESULT",
    });
    expect(checking.session?.status).toBe("publishing");
    expect(checking.commands).toContainEqual(
      expect.objectContaining({ kind: "publish" }),
    );
    expect(
      transitionCampusMapEdit(checking.session, {
        type: "CHECK_PUBLISH_RESULT",
      }).accepted,
    ).toBe(false);
  });

  it("fails closed when receipt locking prevents safe recovery", () => {
    const reason = "receipt-lock-unavailable" as const;
    const publishing = transitionCampusMapEdit(
      transitionCampusMapEdit(editSession(), {
        type: "CHANGE_FACT",
        fact: { ...fact, name: "等待安全恢复" },
      }).session,
      { type: "REQUEST_PUBLISH" },
    ).session!;

    const blocked = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RECOVERY_RESULT",
      idempotencyKey: firstKey,
      reason,
    });

    expect(blocked.session).toMatchObject({
      status: "publish-recovery-unavailable",
      publishFeedbackReason: reason,
    });
    expect(
      transitionCampusMapEdit(blocked.session, {
        type: "RETRY_PUBLISH",
      }).accepted,
    ).toBe(false);
    expect(
      transitionCampusMapEdit(blocked.session, {
        type: "CHECK_PUBLISH_RESULT",
      }).accepted,
    ).toBe(false);
    expect(
      transitionCampusMapEdit(blocked.session, {
        type: "CONTINUE_EDITING",
      }),
    ).toMatchObject({
      accepted: true,
      session: { status: "editing", draft: blocked.session?.draft },
      commands: [
        { kind: "persist-snapshot" },
        { kind: "scene", intent: "start-edit" },
        { kind: "focus", target: "form-heading" },
      ],
    });
  });

  it.each(["identity-mismatch", "identity-unavailable"] as const)(
    "presents %s without offering a publish retry",
    (reason) => {
      const publishing = transitionCampusMapEdit(
        transitionCampusMapEdit(editSession(), {
          type: "CHANGE_FACT",
          fact: { ...fact, name: "不应显示的草稿内容" },
        }).session,
        { type: "REQUEST_PUBLISH" },
      ).session!;

      const identity = transitionCampusMapEdit(publishing, {
        type: "PUBLISH_RECOVERY_RESULT",
        idempotencyKey: firstKey,
        reason,
      });

      expect(identity.session).toMatchObject({
        status: "publish-identity",
        publishFeedbackReason: reason,
      });
      expect(
        transitionCampusMapEdit(identity.session, {
          type: "RETRY_PUBLISH",
        }).accepted,
      ).toBe(false);
      expect(identity.commands).toContainEqual(
        reason === "identity-mismatch"
          ? { kind: "clear-snapshot" }
          : { kind: "persist-snapshot" },
      );
    },
  );

  it.each(["superseded", "projection-superseded"] as const)(
    "silently ignores %s without changing state or focus",
    (reason) => {
      const publishing = transitionCampusMapEdit(
        transitionCampusMapEdit(editSession(), {
          type: "CHANGE_FACT",
          fact: { ...fact, name: "较旧的发布" },
        }).session,
        { type: "REQUEST_PUBLISH" },
      ).session!;

      expect(
        transitionCampusMapEdit(publishing, {
          type: "PUBLISH_RECOVERY_RESULT",
          idempotencyKey: firstKey,
          reason,
        }),
      ).toEqual({ accepted: false, session: publishing, commands: [] });
    },
  );

  it("accepts refreshed recovery outcomes from persisted feedback states", () => {
    const draft = editSession().draft;
    const unknown: CampusMapEditSession = {
      status: "publish-unknown",
      draft,
      publishFeedbackReason: "reconciliation-unavailable",
    };
    const identityUnavailable: CampusMapEditSession = {
      status: "publish-identity",
      draft,
      publishFeedbackReason: "identity-unavailable",
    };
    const lockUnavailable: CampusMapEditSession = {
      status: "publish-recovery-unavailable",
      draft,
      publishFeedbackReason: "receipt-lock-unavailable",
    };

    expect(
      transitionCampusMapEdit(unknown, {
        type: "PUBLISH_HANDOFF_COMPLETED",
        idempotencyKey: firstKey,
      }),
    ).toMatchObject({
      accepted: true,
      session: null,
      commands: [{ kind: "clear-snapshot" }],
    });
    expect(
      transitionCampusMapEdit(identityUnavailable, {
        type: "PUBLISH_RESULT",
        idempotencyKey: firstKey,
        result: {
          status: "authentication-required",
          code: "authentication-required",
        },
      }),
    ).toMatchObject({
      accepted: true,
      session: { status: "authentication-required" },
    });
    expect(
      transitionCampusMapEdit(lockUnavailable, {
        type: "PUBLISH_RECOVERY_RESULT",
        idempotencyKey: firstKey,
        reason: "reconciliation-unavailable",
      }),
    ).toMatchObject({
      accepted: true,
      session: {
        status: "publish-unknown",
        publishFeedbackReason: "reconciliation-unavailable",
      },
    });
  });

  it("migrates version 1 and 2 drafts with empty placement display metadata", () => {
    const legacy = JSON.parse(encodeCampusMapEditSnapshot(editSession())) as {
      version: number;
      session: {
        draft: Record<string, unknown>;
        conflict?: Record<string, unknown>;
      };
    };
    legacy.version = 1;
    delete legacy.session.draft.placementCandidate;
    delete legacy.session.draft.locationDisplay;

    expect(decodeCampusMapEditSnapshot(JSON.stringify(legacy))).toMatchObject({
      status: "restored",
      session: {
        draft: { placementCandidate: null, locationDisplay: null },
      },
    });

    const versionTwo = JSON.parse(
      encodeCampusMapEditSnapshot(editSession()),
    ) as typeof legacy;
    versionTwo.version = 2;
    delete versionTwo.session.draft.locationDisplay;

    expect(
      decodeCampusMapEditSnapshot(JSON.stringify(versionTwo)),
    ).toMatchObject({
      status: "restored",
      session: { draft: { locationDisplay: null } },
    });
  });

  it("migrates version 4 Add entry metadata", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: firstKey,
    }).session!;
    const legacy = JSON.parse(encodeCampusMapEditSnapshot(started)) as {
      version: number;
      session: { draft: Record<string, unknown> };
    };
    legacy.version = 4;
    delete legacy.session.draft.entrySource;
    delete legacy.session.draft.locationIntent;
    legacy.session.draft.baselineFact = null;

    const restored = decodeCampusMapEditSnapshot(JSON.stringify(legacy));

    expect(restored).toMatchObject({
      status: "restored",
      session: {
        draft: {
          entrySource: "global",
          locationIntent: null,
          baselineFact: null,
        },
      },
    });
    expect(
      restored.status === "restored"
        ? isCampusMapEditDirty(restored.session)
        : false,
    ).toBe(false);
  });

  it("removes hidden legacy details when restoring a pre-M2 Add draft", () => {
    const selected = transitionCampusMapEdit(
      transitionCampusMapEdit(null, {
        type: "START_FACILITY_ADD",
        idempotencyKey: firstKey,
        entry: { kind: "global", placeType: "printer" },
      }).session,
      {
        type: "SELECT_BUILDING_LOCATION",
        locationDisplay: {
          buildingId: "50000000-0000-4000-8000-000000000001",
          buildingName: "科学馆",
          floorId: null,
          floorLabel: null,
        },
      },
    ).session!;
    const legacy = legacyV6Snapshot(selected);
    Object.assign(legacy.session.draft.fact, {
      name: "旧自定义名称",
      gender: "female",
      wheelchairAccess: "yes",
      audience: "cuhk-member",
      credentialRequirement: "campus-card",
      reservationRequirement: "none",
      temporaryStatus: "normal",
      observedAt: "2026-08-25T04:00:00.000Z",
    });
    legacy.session.draft.sources = [source];
    legacy.session.draft.photos = [
      {
        assetId: "30000000-0000-4000-8000-000000000014",
        role: "overview",
      },
    ];

    const restored = decodeCampusMapEditSnapshot(JSON.stringify(legacy));

    expect(restored).toMatchObject({
      status: "restored",
      session: {
        draft: {
          fact: {
            name: "打印站",
            placeType: "printer",
            gender: null,
            wheelchairAccess: null,
            regularHours: null,
            observedAt: null,
          },
          sources: [],
          baselineSources: [],
          photos: [],
          baselinePhotos: [],
        },
      },
    });
    if (restored.status !== "restored") {
      throw new Error("snapshot not restored");
    }
    expect(restored.session.draft.idempotencyKey).not.toBe(firstKey);
    expect(
      deriveCampusMapPublishCommand(restored.session.draft).changes[0],
    ).toMatchObject({
      operation: "create",
      fact: {
        name: "打印站",
        placeType: "printer",
        regularHours: null,
      },
      sources: [],
      photos: [],
    });
  });

  it.each([
    {
      label: "authentication required",
      state: { status: "authentication-required" as const },
    },
    {
      label: "warning",
      state: {
        status: "warning" as const,
        warnings: [
          {
            code: "duplicate-candidate",
            fingerprint: "a".repeat(64),
            anchor: { changeIndex: 0, field: "name" },
          },
        ],
      },
    },
    {
      label: "profile setup required",
      state: {
        status: "forbidden" as const,
        forbiddenCode: "profile-incomplete" as const,
      },
    },
    {
      label: "rate limited",
      state: {
        status: "rate-limited" as const,
        retryAfter: 0,
        rateScope: "actor" as const,
      },
    },
    {
      label: "temporarily unavailable",
      state: { status: "temporarily-unavailable" as const },
    },
  ])("removes hidden legacy Add details when $label", ({ state }) => {
    const selected = transitionCampusMapEdit(
      transitionCampusMapEdit(null, {
        type: "START_FACILITY_ADD",
        idempotencyKey: firstKey,
        entry: { kind: "global", placeType: "printer" },
      }).session,
      {
        type: "SELECT_BUILDING_LOCATION",
        locationDisplay: {
          buildingId: "50000000-0000-4000-8000-000000000001",
          buildingName: "科学馆",
          floorId: null,
          floorLabel: null,
        },
      },
    ).session!;
    const legacy = legacyV6Snapshot(selected);
    legacy.session = { ...legacy.session, ...state };
    legacy.session.draft.fact.name = "旧自定义名称";
    legacy.session.draft.fact.audience = "cuhk-member";
    legacy.session.draft.photos = [
      {
        assetId: "30000000-0000-4000-8000-000000000015",
        role: "overview",
      },
    ];

    const restored = decodeCampusMapEditSnapshot(JSON.stringify(legacy));
    expect(restored).toMatchObject({
      status: "restored",
      session: {
        status: "editing",
        draft: {
          fact: { name: "打印站", placeType: "printer" },
          photos: [],
        },
      },
    });
    if (restored.status !== "restored") {
      throw new Error("snapshot not restored");
    }
    expect(restored.session.draft.idempotencyKey).not.toBe(firstKey);
  });

  it.each([
    { status: "publishing" as const },
    {
      status: "publish-unknown" as const,
      publishFeedbackReason: "missing-target" as const,
    },
    {
      status: "publish-identity" as const,
      publishFeedbackReason: "identity-unavailable" as const,
    },
    {
      status: "publish-recovery-unavailable" as const,
      publishFeedbackReason: "receipt-lock-unavailable" as const,
    },
  ])("preserves the exact legacy Add payload while $status", (state) => {
    const selected = transitionCampusMapEdit(
      transitionCampusMapEdit(null, {
        type: "START_FACILITY_ADD",
        idempotencyKey: firstKey,
        entry: { kind: "global", placeType: "printer" },
      }).session,
      {
        type: "SELECT_BUILDING_LOCATION",
        locationDisplay: {
          buildingId: "50000000-0000-4000-8000-000000000001",
          buildingName: "科学馆",
          floorId: null,
          floorLabel: null,
        },
      },
    ).session!;
    const legacy = legacyV6Snapshot(selected);
    legacy.session = { ...legacy.session, ...state };
    legacy.session.draft.fact.name = "已尝试发布的旧名称";

    const restored = decodeCampusMapEditSnapshot(JSON.stringify(legacy));
    expect(restored).toMatchObject({
      status: "restored",
      session: {
        status: state.status,
        draft: { fact: { name: "已尝试发布的旧名称" } },
      },
    });
    if (restored.status !== "restored") {
      throw new Error("snapshot not restored");
    }
    expect(restored.session.draft.idempotencyKey).toBe(firstKey);
  });

  it("derives typed comment/source summary and always disables review requests", () => {
    const changed = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "大学图书馆新饮水点", wheelchairAccess: "yes" },
    }).session!;
    const command = deriveCampusMapPublishCommand(changed.draft);

    expect(command).toMatchObject({
      kind: "single",
      idempotencyKey: firstKey,
      reviewRequested: false,
      comment: "更新地点：名称、无障碍通行",
      sourceSummary: "来源：现场观察",
      changes: [{ operation: "update", placeId, baseRevisionId }],
    });
    expect(command).not.toHaveProperty("discussion");
  });

  it("adds honest hidden submission provenance when the simplified Sheet publishes", () => {
    const positioned = transitionCampusMapEdit(
      transitionCampusMapEdit(null, {
        type: "START_ADD",
        idempotencyKey: firstKey,
      }).session,
      {
        type: "CONFIRM_POSITION",
        position: {
          longitude: 114.2072,
          latitude: 22.4191,
          crs: "wgs84",
          precision: "approximate",
          method: "pointer",
        },
      },
    ).session!;

    const publishing = transitionCampusMapEdit(positioned, {
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-26",
    });

    expect(publishing.session?.status).toBe("publishing");
    expect(publishing.commands).toContainEqual({
      kind: "publish",
      command: expect.objectContaining({
        sourceSummary: "来源：地图提交",
        changes: [
          expect.objectContaining({
            fact: expect.objectContaining({ name: "饮水机" }),
            sources: [
              expect.objectContaining({
                kind: "other",
                ref: "CUpedia Campus Map submission 2026-08-26",
                accessedOn: "2026-08-26",
                observedAt: null,
                rightsStatus: "unknown",
                limitations:
                  "用户通过 Campus Map 提交名称、位置、地点类型与可选运营资料；未提供独立资料来源。",
              }),
            ],
          }),
        ],
      }),
    });
  });

  it("focuses local errors and blocks publishing an unchanged Edit", () => {
    const unchanged = transitionCampusMapEdit(editSession(), {
      type: "REQUEST_PUBLISH",
    });
    const invalidDraft = createCampusMapEditDraft({
      mode: "add",
      idempotencyKey: firstKey,
      fact: { ...fact, name: "" },
      sources: [],
    });
    const invalid = transitionCampusMapEdit(
      { status: "editing", draft: invalidDraft },
      { type: "REQUEST_PUBLISH" },
    );

    expect(unchanged.accepted).toBe(false);
    expect(unchanged.commands).toEqual([]);
    expect(invalid.session).toMatchObject({
      status: "editing",
      localError: "name",
    });
    expect(invalid.commands).toContainEqual({
      kind: "focus",
      target: "name",
    });
  });

  it("focuses and announces the Building control for indoor intent without a selection", () => {
    const session = transitionCampusMapEdit(editSession(), {
      type: "CHOOSE_LOCATION_KIND",
      kind: "indoor",
    }).session!;
    const reported = transitionCampusMapEdit(session, {
      type: "REQUEST_PUBLISH",
    });

    expect(reported.session).toMatchObject({ localError: "buildingId" });
    expect(reported.commands).toContainEqual({
      kind: "focus",
      target: "building",
    });
    expect(reported.commands).toContainEqual({
      kind: "announce",
      message: "请选择建筑",
    });
    expect(isCampusMapEditDirty(session)).toBe(true);
  });

  it("keeps an invalid name ahead of a missing Building in publish order", () => {
    const session = transitionCampusMapEdit(editSession(), {
      type: "CHOOSE_LOCATION_KIND",
      kind: "indoor",
    }).session!;
    const invalidName = transitionCampusMapEdit(
      {
        ...session,
        draft: {
          ...session.draft,
          fact: { ...session.draft.fact, name: "" },
        },
      },
      { type: "REQUEST_PUBLISH" },
    );

    expect(invalidName.session).toMatchObject({ localError: "name" });
    expect(invalidName.commands).toContainEqual({
      kind: "focus",
      target: "name",
    });
  });

  it("clears stale validation feedback when the contributor changes a fact", () => {
    const invalidDraft = createCampusMapEditDraft({
      mode: "add",
      idempotencyKey: firstKey,
      fact: { ...fact, name: "" },
      sources: [],
    });
    const invalid = transitionCampusMapEdit(
      { status: "editing", draft: invalidDraft },
      { type: "REQUEST_PUBLISH" },
    ).session!;
    const corrected = transitionCampusMapEdit(
      {
        ...invalid,
        serverErrors: [
          {
            code: "fact-name-required",
            anchor: { field: "changes.0.fact.name" },
          },
        ],
      },
      {
        type: "CHANGE_FACT",
        fact: { ...invalid.draft.fact, name: "科学馆饮水机 A" },
      },
    );

    expect(corrected.session).not.toHaveProperty("localError");
    expect(corrected.session).not.toHaveProperty("serverErrors");
  });

  it("derives local required-field checks from the active fact schema", () => {
    const invalidDraft = createCampusMapEditDraft({
      mode: "add",
      idempotencyKey: firstKey,
      fact: {
        ...fact,
        placeType: "printer",
        capabilities: [],
      },
      sources: [source],
    });

    const invalid = transitionCampusMapEdit(
      { status: "editing", draft: invalidDraft },
      {
        type: "REQUEST_PUBLISH",
        requiredFields: ["name", "placeType", "capabilities", "location"],
      },
    );

    expect(invalid.session).toMatchObject({
      status: "editing",
      localError: "capabilities",
    });
    expect(invalid.commands).toContainEqual({
      kind: "focus",
      target: "capabilities",
    });
  });

  it.each([
    ["location.precision", "location"],
    ["changes.0.fact.floorId", "location"],
    ["sources.0.url", "form-heading"],
    ["sources.0.observedAt", "form-heading"],
    ["changes.0.fact.regularHours.intervals.0.opensAt", "regularHours"],
    ["changes.0.fact.placeType", "placeType"],
    ["changes.0.fact.visitNote", "visitNote"],
    ["changes.0.fact.capabilities", "capabilities"],
    ["changes.0.fact.gender", "gender"],
    ["changes.0.fact.wheelchairAccess", "wheelchairAccess"],
    ["comment", "form-heading"],
  ])(
    "normalizes server error path %s to the real focus target %s",
    (field, target) => {
      const dirty = transitionCampusMapEdit(editSession(), {
        type: "CHANGE_FACT",
        fact: { ...fact, name: "服务器校验失败" },
      }).session!;
      const publishing = transitionCampusMapEdit(dirty, {
        type: "REQUEST_PUBLISH",
      }).session!;
      const failed = transitionCampusMapEdit(publishing, {
        type: "PUBLISH_RESULT",
        idempotencyKey: firstKey,
        result: {
          status: "validation-failed",
          errors: [
            {
              code: "invalid-field",
              anchor: { changeIndex: 0, placeId, field },
            },
          ],
          warnings: [],
          suggestions: [],
        },
      });

      expect(failed.session).toMatchObject({
        status: "editing",
        localError: target,
      });
      expect(failed.commands).toContainEqual({ kind: "focus", target });
    },
  );

  it("rejects an overlong visit note before sending it to the server", () => {
    const target = "visitNote";
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, visitNote: "界".repeat(167) },
    }).session!;
    const invalid = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    });

    expect(invalid.session).toMatchObject({
      status: "editing",
      localError: target,
    });
    expect(invalid.commands).toContainEqual({ kind: "focus", target });
    expect(invalid.commands).not.toContainEqual(
      expect.objectContaining({ kind: "publish" }),
    );
  });

  it("uses a new attempt for acknowledged server warnings and invalidates it after edits", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "有重复候选的饮水点" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const warned = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "validation-failed",
        errors: [],
        warnings: [
          {
            code: "duplicate-candidate",
            fingerprint: "a".repeat(64),
            anchor: { changeIndex: 0, field: "name" },
          },
        ],
        suggestions: [],
      },
    });
    const acknowledged = transitionCampusMapEdit(warned.session, {
      type: "ACKNOWLEDGE_WARNINGS",
      idempotencyKey: secondKey,
    });
    const changedAgain = transitionCampusMapEdit(warned.session, {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "不再相同" },
    });

    expect(warned.session?.status).toBe("warning");
    expect(acknowledged.session).toMatchObject({
      status: "publishing",
      draft: {
        idempotencyKey: secondKey,
        warningAcknowledgements: [
          {
            changeIndex: 0,
            code: "duplicate-candidate",
            fingerprint: "a".repeat(64),
          },
        ],
      },
    });
    expect(changedAgain.session).toMatchObject({
      status: "editing",
      draft: { warningAcknowledgements: [] },
    });
  });

  it("keeps auth, rate limit, and transient retry as distinct resumable states", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "准备发布" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;

    for (const [result, expected] of [
      [
        { status: "authentication-required", code: "authentication-required" },
        "authentication-required",
      ],
      [
        {
          status: "rate-limited",
          code: "publish-rate-limit",
          scope: "actor",
          policy: "burst",
          retryAfter: 12,
        },
        "rate-limited",
      ],
      [
        {
          status: "temporarily-unavailable",
          code: "publish-unavailable",
          retryable: true,
        },
        "temporarily-unavailable",
      ],
    ] as const) {
      const next = transitionCampusMapEdit(publishing, {
        type: "PUBLISH_RESULT",
        idempotencyKey: firstKey,
        result,
      });
      expect(next.session?.status).toBe(expected);
      expect(
        decodeCampusMapEditSnapshot(encodeCampusMapEditSnapshot(next.session!)),
      ).toMatchObject({
        status: "restored",
        session: { status: expected },
      });
    }

    const auth = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "authentication-required",
        code: "authentication-required",
      },
    });
    expect(
      transitionCampusMapEdit(auth.session, { type: "AUTH_RETURNED" }).session
        ?.status,
    ).toBe("editing");
  });

  it.each([
    [
      {
        status: "authentication-required" as const,
        code: "authentication-required" as const,
      },
      "需要登录，草稿已保留",
    ],
    [
      { status: "forbidden" as const, code: "actor-banned" as const },
      "当前账号无法发布，草稿已保留",
    ],
    [
      {
        status: "temporarily-unavailable" as const,
        code: "publish-unavailable" as const,
        retryable: true as const,
      },
      "暂时无法发布，你的修改已保存在这个浏览器中",
    ],
  ])(
    "announces a failed publish after leaving publishing",
    (result, message) => {
      const dirty = transitionCampusMapEdit(editSession(), {
        type: "CHANGE_FACT",
        fact: { ...fact, name: "读屏反馈" },
      }).session!;
      const publishing = transitionCampusMapEdit(dirty, {
        type: "REQUEST_PUBLISH",
      }).session!;

      const failed = transitionCampusMapEdit(publishing, {
        type: "PUBLISH_RESULT",
        idempotencyKey: firstKey,
        result,
      });

      expect(failed.commands).toContainEqual({ kind: "announce", message });
      expect(failed.commands).toContainEqual({
        kind: "focus",
        target: "publish-feedback",
      });
    },
  );

  it("does not retry a rate-limited attempt before the server delay elapses", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "等待限流" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const limited = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "rate-limited",
        code: "publish-rate-limit",
        scope: "actor",
        policy: "burst",
        retryAfter: 12,
      },
    });

    expect(limited.commands).toContainEqual({
      kind: "schedule-rate-retry",
      afterSeconds: 12,
      idempotencyKey: firstKey,
    });
    expect(
      transitionCampusMapEdit(limited.session, { type: "RETRY_PUBLISH" })
        .accepted,
    ).toBe(false);
    const ready = transitionCampusMapEdit(limited.session, {
      type: "RATE_LIMIT_ELAPSED",
      idempotencyKey: firstKey,
    });
    expect(ready.session).toMatchObject({
      status: "rate-limited",
      retryAfter: 0,
    });
    expect(
      transitionCampusMapEdit(ready.session, { type: "RETRY_PUBLISH" }).session
        ?.status,
    ).toBe("publishing");
    expect(
      transitionCampusMapEdit(limited.session, {
        type: "RATE_LIMIT_ELAPSED",
        idempotencyKey: secondKey,
      }).accepted,
    ).toBe(false);
  });

  it("keeps the same key for transient retry but requires a fresh key after edits", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "准备重试" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const stale = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: secondKey,
      result: {
        status: "temporarily-unavailable",
        code: "publish-unavailable",
        retryable: true,
      },
    });
    const unavailable = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "temporarily-unavailable",
        code: "publish-unavailable",
        retryable: true,
      },
    });
    const retry = transitionCampusMapEdit(unavailable.session, {
      type: "RETRY_PUBLISH",
    });
    const reported = transitionCampusMapEdit(unavailable.session, {
      type: "REPORT_LOCAL_ERROR",
      field: "sourceObservedAt",
    });
    const unsafeFactEdit = transitionCampusMapEdit(unavailable.session, {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "不能复用旧发布识别码" },
    });
    const unsafeSourceEdit = transitionCampusMapEdit(unavailable.session, {
      type: "CHANGE_SOURCES",
      sources: [],
    });
    const freshEdit = transitionCampusMapEdit(unavailable.session, {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "使用新发布识别码" },
      idempotencyKey: secondKey,
    });

    expect(stale.accepted).toBe(false);
    expect(stale.session).toBe(publishing);
    expect(retry.session).toMatchObject({
      status: "publishing",
      draft: { idempotencyKey: firstKey },
    });
    expect(retry.commands).toContainEqual(
      expect.objectContaining({
        kind: "publish",
        command: expect.objectContaining({ idempotencyKey: firstKey }),
      }),
    );
    expect(reported.session).toMatchObject({
      status: "temporarily-unavailable",
      localError: "sourceObservedAt",
      draft: { idempotencyKey: firstKey },
    });
    expect(reported.commands).toContainEqual({
      kind: "focus",
      target: "form-heading",
    });
    expect(
      transitionCampusMapEdit(reported.session, {
        type: "CHANGE_SOURCES",
        sources: [source],
        idempotencyKey: secondKey,
      }).session,
    ).toMatchObject({
      status: "editing",
      draft: { idempotencyKey: secondKey },
    });
    expect(unsafeFactEdit).toMatchObject({
      accepted: false,
      session: unavailable.session,
    });
    expect(unsafeSourceEdit).toMatchObject({
      accepted: false,
      session: unavailable.session,
    });
    expect(freshEdit.session).toMatchObject({
      status: "editing",
      draft: {
        idempotencyKey: secondKey,
        fact: { name: "使用新发布识别码" },
      },
    });
  });

  it("keeps user input on conflict and rebases only through an explicit new attempt", () => {
    const mine = { ...fact, name: "我的名称" };
    const current = { ...fact, name: "服务器最新名称" };
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: mine,
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const conflicted = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "conflict",
        code: "base-revision-conflict",
        conflicts: [
          {
            code: "base-revision-conflict",
            anchor: { changeIndex: 0, placeId },
            placeId,
            expectedRevisionId: baseRevisionId,
            currentRevisionId,
            currentStatus: "active",
            currentSnapshot: { ...current, factSchemaVersion: 1 },
          },
        ],
      },
    });
    const continued = transitionCampusMapEdit(conflicted.session, {
      type: "CONTINUE_FROM_CONFLICT",
      idempotencyKey: secondKey,
      fact: { ...current, name: mine.name },
    });

    expect(conflicted.session).toMatchObject({
      status: "conflict",
      draft: { fact: mine },
      conflict: { kind: "current", currentRevisionId, currentFact: current },
    });
    const bypasses: CampusMapEditEvent[] = [
      { type: "CHANGE_FACT", fact: { ...mine, name: "绕过冲突" } },
      { type: "CHANGE_SOURCES", sources: [] },
      { type: "START_REPOSITION" },
      { type: "REQUEST_PUBLISH" },
    ];
    for (const bypass of bypasses) {
      expect(transitionCampusMapEdit(conflicted.session, bypass)).toMatchObject(
        {
          accepted: false,
          session: conflicted.session,
        },
      );
    }
    expect(continued.session).toMatchObject({
      status: "editing",
      draft: {
        fact: { ...current, name: mine.name },
        baseRevisionId: currentRevisionId,
        idempotencyKey: secondKey,
        warningAcknowledgements: [],
      },
    });
  });

  it("carries canonical indoor labels through Edit and conflict rebasing", () => {
    const buildingId = "50000000-0000-4000-8000-000000000001";
    const floorId = "60000000-0000-4000-8000-000000000001";
    const latestFloorId = "60000000-0000-4000-8000-000000000002";
    const indoorFact: CampusMapPublishFactInput = {
      ...fact,
      name: "科学馆饮水机",
      buildingId,
      floorId,
      location: { kind: "floor" },
    };
    const started = transitionCampusMapEdit(null, {
      type: "START_EDIT",
      placeId,
      baseRevisionId,
      fact: indoorFact,
      sources: [source],
      idempotencyKey: firstKey,
      locationDisplay: {
        buildingId,
        buildingName: "科学馆",
        floorId,
        floorLabel: "G/F",
      },
    });
    const changed = transitionCampusMapEdit(started.session, {
      type: "CHANGE_FACT",
      fact: { ...indoorFact, name: "我的名称" },
    });
    const publishing = transitionCampusMapEdit(changed.session, {
      type: "REQUEST_PUBLISH",
    });
    const currentFact = {
      ...indoorFact,
      name: "最新名称",
      floorId: latestFloorId,
    };
    const conflicted = transitionCampusMapEdit(publishing.session, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      conflictLocationDisplay: {
        buildingId,
        buildingName: "科学馆",
        floorId: latestFloorId,
        floorLabel: "1/F",
      },
      result: {
        status: "conflict",
        code: "base-revision-conflict",
        conflicts: [
          {
            code: "base-revision-conflict",
            anchor: { changeIndex: 0, placeId },
            placeId,
            expectedRevisionId: baseRevisionId,
            currentRevisionId,
            currentStatus: "active",
            currentSnapshot: { ...currentFact, factSchemaVersion: 1 },
          },
        ],
      },
    });
    const latest = transitionCampusMapEdit(conflicted.session, {
      type: "CONTINUE_FROM_CONFLICT",
      idempotencyKey: secondKey,
      fact: currentFact,
    });
    const unreadable = transitionCampusMapEdit(publishing.session, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "conflict",
        code: "base-revision-conflict",
        conflicts: [
          {
            code: "base-revision-conflict",
            anchor: { changeIndex: 0, placeId },
            placeId,
            expectedRevisionId: baseRevisionId,
            currentRevisionId,
            currentStatus: "active",
            currentSnapshot: { ...currentFact, factSchemaVersion: 1 },
          },
        ],
      },
    });
    const samePlacementCurrent = { ...indoorFact, name: "只更新名称" };
    const samePlacementConflict = transitionCampusMapEdit(publishing.session, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "conflict",
        code: "base-revision-conflict",
        conflicts: [
          {
            code: "base-revision-conflict",
            anchor: { changeIndex: 0, placeId },
            placeId,
            expectedRevisionId: baseRevisionId,
            currentRevisionId,
            currentStatus: "active",
            currentSnapshot: {
              ...samePlacementCurrent,
              factSchemaVersion: 1,
            },
          },
        ],
      },
    });

    expect(started.session).toMatchObject({
      draft: {
        locationDisplay: {
          buildingId,
          buildingName: "科学馆",
          floorId,
          floorLabel: "G/F",
        },
      },
    });
    expect(conflicted.session).toMatchObject({
      conflict: {
        kind: "current",
        currentLocationDisplay: {
          buildingId,
          buildingName: "科学馆",
          floorId: latestFloorId,
          floorLabel: "1/F",
        },
      },
    });
    expect(latest.session).toMatchObject({
      draft: {
        locationDisplay: {
          buildingId,
          buildingName: "科学馆",
          floorId: latestFloorId,
          floorLabel: "1/F",
        },
      },
    });
    expect(unreadable.session).toMatchObject({
      status: "conflict",
      conflict: { kind: "unavailable", reason: "location-labels" },
    });
    expect(samePlacementConflict.session).toMatchObject({
      conflict: {
        kind: "current",
        currentLocationDisplay: {
          buildingName: "科学馆",
          floorLabel: "G/F",
        },
      },
    });
  });

  it("makes a restored indoor placement conflict safe when labels are missing", () => {
    const currentFact: CampusMapPublishFactInput = {
      ...fact,
      buildingId: "50000000-0000-4000-8000-000000000001",
      floorId: "60000000-0000-4000-8000-000000000001",
      location: { kind: "floor" },
    };
    const session: CampusMapEditSession = {
      ...editSession(),
      status: "conflict",
      conflict: { kind: "current", currentRevisionId, currentFact },
    };

    expect(
      decodeCampusMapEditSnapshot(encodeCampusMapEditSnapshot(session)),
    ).toMatchObject({
      status: "restored",
      session: {
        status: "conflict",
        conflict: { kind: "unavailable", reason: "location-labels" },
      },
    });
  });

  it("keeps an orphaned conflict draft recoverable when no latest snapshot exists", () => {
    const mine = { ...fact, name: "仍要保留的名称" };
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: mine,
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const conflicted = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "conflict",
        code: "base-revision-conflict",
        conflicts: [
          {
            code: "base-revision-conflict",
            anchor: { changeIndex: 0, placeId, field: "baseRevisionId" },
            placeId,
            expectedRevisionId: baseRevisionId,
            currentRevisionId: null,
            currentStatus: null,
            currentSnapshot: null,
          },
        ],
      },
    });

    expect(conflicted.session).toMatchObject({
      status: "conflict",
      draft: { fact: mine },
      conflict: { kind: "unavailable" },
    });
    expect(
      transitionCampusMapEdit(conflicted.session, {
        type: "CHANGE_FACT",
        fact: { ...mine, name: "不可绕过" },
      }),
    ).toMatchObject({ accepted: false, session: conflicted.session });
    expect(
      transitionCampusMapEdit(conflicted.session, {
        type: "CONTINUE_FROM_CONFLICT",
        idempotencyKey: secondKey,
        fact: mine,
      }),
    ).toMatchObject({ accepted: false, session: conflicted.session });
    expect(
      decodeCampusMapEditSnapshot(
        encodeCampusMapEditSnapshot(conflicted.session!),
      ),
    ).toMatchObject({
      status: "restored",
      session: {
        status: "conflict",
        draft: { fact: mine },
        conflict: { kind: "unavailable" },
      },
    });
  });

  it.each([
    {
      label: "warning",
      state: {
        status: "warning" as const,
        warnings: [
          {
            code: "duplicate-candidate",
            fingerprint: "a".repeat(64),
            anchor: { changeIndex: 0, field: "name" },
          },
        ],
      },
    },
    {
      label: "rate limit",
      state: {
        status: "rate-limited" as const,
        retryAfter: 15,
        rateScope: "actor" as const,
      },
    },
    {
      label: "conflict",
      state: {
        status: "conflict" as const,
        conflict: {
          kind: "current" as const,
          currentRevisionId,
          currentFact: { ...fact, name: "服务器最新版" },
        },
      },
    },
  ])(
    "preserves the complete $label recovery state through dirty close",
    ({ state }) => {
      const dirty = transitionCampusMapEdit(editSession(), {
        type: "CHANGE_FACT",
        fact: { ...fact, name: "需要保留的草稿" },
      }).session!;
      const recovery = { ...dirty, ...state } as CampusMapEditSession;
      const closing = transitionCampusMapEdit(recovery, {
        type: "REQUEST_CLOSE",
      }).session!;
      const restored = decodeCampusMapEditSnapshot(
        encodeCampusMapEditSnapshot(closing),
      );

      expect(restored).toMatchObject({
        status: "restored",
        session: {
          ...state,
          status: "confirm-discard",
          returnStatus: state.status,
        },
      });
      if (restored.status !== "restored")
        throw new Error("snapshot not restored");
      const continued = transitionCampusMapEdit(restored.session, {
        type: "CONTINUE_EDITING",
      });
      expect(continued.session).toMatchObject(state);
      expect(continued.session).not.toHaveProperty("returnStatus");
    },
  );

  it("records a rate-limit timer finishing while the dirty-close dialog is open", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "等待限流结束的草稿" },
    }).session!;
    const rateLimited: CampusMapEditSession = {
      ...dirty,
      status: "rate-limited",
      retryAfter: 15,
      rateScope: "actor",
    };
    const closing = transitionCampusMapEdit(rateLimited, {
      type: "REQUEST_CLOSE",
    }).session!;
    const elapsed = transitionCampusMapEdit(closing, {
      type: "RATE_LIMIT_ELAPSED",
      idempotencyKey: firstKey,
    });
    const continued = transitionCampusMapEdit(elapsed.session, {
      type: "CONTINUE_EDITING",
    });

    expect(elapsed.session).toMatchObject({
      status: "confirm-discard",
      returnStatus: "rate-limited",
      retryAfter: 0,
    });
    expect(continued.session).toMatchObject({
      status: "rate-limited",
      retryAfter: 0,
      rateScope: "actor",
    });
  });

  it("keeps forbidden publish results distinct and refresh-safe", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "没有权限发布的名称" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const forbidden = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: { status: "forbidden", code: "actor-banned" },
    });

    expect(forbidden.session).toMatchObject({
      status: "forbidden",
      forbiddenCode: "actor-banned",
      draft: { fact: { name: "没有权限发布的名称" } },
    });
    expect(forbidden.session).not.toHaveProperty("serverErrors");
    expect(
      decodeCampusMapEditSnapshot(
        encodeCampusMapEditSnapshot(forbidden.session!),
      ),
    ).toMatchObject({
      status: "restored",
      session: { status: "forbidden", forbiddenCode: "actor-banned" },
    });

    expect(
      transitionCampusMapEdit(forbidden.session, {
        type: "REQUEST_PUBLISH",
      }),
    ).toMatchObject({ accepted: false, session: forbidden.session });
  });

  it("resumes the same draft after contributor setup completes", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "补全账号后发布的名称" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const incomplete = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: { status: "forbidden", code: "profile-incomplete" },
    }).session!;

    const resumed = transitionCampusMapEdit(incomplete, {
      type: "CONTRIBUTOR_SETUP_COMPLETED",
    });

    expect(resumed.session).toMatchObject({
      status: "publishing",
      draft: {
        idempotencyKey: firstKey,
        fact: { name: "补全账号后发布的名称" },
      },
    });
    expect(resumed.commands).toContainEqual(
      expect.objectContaining({ kind: "publish" }),
    );
  });

  it.each(["warning", "rate-limited", "conflict"] as const)(
    "does not bypass the %s recovery action with the primary publish event",
    (status) => {
      const dirty = transitionCampusMapEdit(editSession(), {
        type: "CHANGE_FACT",
        fact: { ...fact, name: "不可绕过恢复动作" },
      }).session!;
      const session = {
        ...dirty,
        status,
      } as CampusMapEditSession;

      expect(
        transitionCampusMapEdit(session, { type: "REQUEST_PUBLISH" }),
      ).toMatchObject({ accepted: false, session });
    },
  );

  it("rechecks the current map center after returning from a placing close dialog", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: firstKey,
    }).session!;
    const positioned = transitionCampusMapEdit(started, {
      type: "UPDATE_PLACEMENT_CANDIDATE",
      position: {
        longitude: 114.2,
        latitude: 22.4,
        crs: "wgs84",
        precision: "approximate",
        method: "pointer",
      },
    }).session!;
    const dirty = transitionCampusMapEdit(positioned, {
      type: "CHANGE_FACT",
      fact: { ...positioned.draft.fact, name: "拖动中的地点" },
    }).session!;
    const closing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_CLOSE",
    }).session!;
    const continued = transitionCampusMapEdit(closing, {
      type: "CONTINUE_EDITING",
    });

    expect(continued.session).toMatchObject({
      status: "placing",
      draft: { placementCandidate: null },
    });
  });

  it("clears the draft on success and makes published terminal against duplicate publish", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "发布后的名称" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const published = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "published",
        changesetId: "40000000-0000-4000-8000-000000000001",
        changes: [{ placeId, revisionId: currentRevisionId }],
        warnings: [],
        suggestions: [],
      },
    });
    const duplicate = transitionCampusMapEdit(published.session, {
      type: "REQUEST_PUBLISH",
    });

    expect(published.session).toMatchObject({
      status: "published",
      receipt: {
        placeId,
        revisionId: currentRevisionId,
        changesetId: "40000000-0000-4000-8000-000000000001",
      },
    });
    expect(published.commands).toContainEqual({ kind: "clear-snapshot" });
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.commands).toEqual([]);
  });

  it("ends the edit task after the receipt consumer has opened the canonical Place", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "已交接的名称" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;

    expect(
      transitionCampusMapEdit(publishing, {
        type: "PUBLISH_HANDOFF_COMPLETED",
        idempotencyKey: firstKey,
      }),
    ).toEqual({
      accepted: true,
      session: null,
      commands: [{ kind: "clear-snapshot" }],
    });
  });

  it("keeps a publishing payload immutable until its matching result arrives", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "正在发布" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;

    expect(
      transitionCampusMapEdit(publishing, {
        type: "CHANGE_FACT",
        fact: { ...fact, name: "竞态覆盖" },
      }),
    ).toMatchObject({ accepted: false, session: publishing });
    expect(
      transitionCampusMapEdit(publishing, { type: "REQUEST_CLOSE" }).accepted,
    ).toBe(false);
  });

  it("discards a structurally corrupted snapshot before rendering", () => {
    const encoded = encodeCampusMapEditSnapshot(editSession());
    const snapshot = JSON.parse(encoded) as {
      session: { draft: { fact: unknown } };
    };
    snapshot.session.draft.fact = { name: "missing controlled fields" };

    expect(decodeCampusMapEditSnapshot(JSON.stringify(snapshot))).toEqual({
      status: "discarded",
      reason: "invalid-snapshot",
    });
  });

  it("rejects malformed rendered errors before the Sheet can read them", () => {
    const snapshot = JSON.parse(encodeCampusMapEditSnapshot(editSession())) as {
      session: CampusMapEditSession;
    };
    snapshot.session.serverErrors = [null] as never;

    expect(decodeCampusMapEditSnapshot(JSON.stringify(snapshot))).toEqual({
      status: "discarded",
      reason: "invalid-snapshot",
    });
  });

  it("discards a damaged placement candidate", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: firstKey,
    }).session!;
    const snapshot = JSON.parse(encodeCampusMapEditSnapshot(started)) as {
      session: { draft: { placementCandidate: unknown } };
    };
    snapshot.session.draft.placementCandidate = {
      longitude: 114.21,
      latitude: 95,
      crs: "gcj02",
      precision: "approximate",
      method: "pointer",
    };

    expect(decodeCampusMapEditSnapshot(JSON.stringify(snapshot))).toEqual({
      status: "discarded",
      reason: "invalid-snapshot",
    });
  });

  it("discards indoor display metadata that does not match the stable IDs", () => {
    const buildingId = "50000000-0000-4000-8000-000000000001";
    const floorId = "60000000-0000-4000-8000-000000000001";
    const indoor = transitionCampusMapEdit(null, {
      type: "START_EDIT",
      placeId,
      baseRevisionId,
      fact: {
        ...fact,
        buildingId,
        floorId,
        location: { kind: "floor" },
      },
      sources: [source],
      idempotencyKey: firstKey,
      locationDisplay: {
        buildingId,
        buildingName: "科学馆",
        floorId,
        floorLabel: "1/F",
      },
    }).session!;
    const snapshot = JSON.parse(encodeCampusMapEditSnapshot(indoor)) as {
      session: CampusMapEditSession;
    };
    if (!snapshot.session.draft.locationDisplay) {
      throw new Error("missing indoor display fixture");
    }
    snapshot.session.draft.locationDisplay.floorId = currentRevisionId;

    expect(decodeCampusMapEditSnapshot(JSON.stringify(snapshot))).toEqual({
      status: "discarded",
      reason: "invalid-snapshot",
    });
  });

  it("restores V2 controlled values, hours, and official actions", () => {
    const session = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: {
        ...fact,
        gender: "all-gender",
        wheelchairAccess: "limited",
        officialActions: [{ label: "致电", url: "tel:+85239436421" }],
        regularHours: {
          timezone: "Asia/Hong_Kong",
          intervals: [
            { days: ["mon", "wed"], opensAt: "09:00", closesAt: "18:00" },
          ],
        },
      },
    }).session!;
    expect(
      decodeCampusMapEditSnapshot(encodeCampusMapEditSnapshot(session)),
    ).toMatchObject({ status: "restored", session });
  });

  it("rejects malformed weekly schedules and source timestamps in snapshots", () => {
    const snapshot = JSON.parse(encodeCampusMapEditSnapshot(editSession())) as {
      session: CampusMapEditSession;
    };
    snapshot.session.draft.fact.regularHours = {
      timezone: "Asia/Hong_Kong",
      intervals: [{ days: [] as never[], opensAt: "25:00", closesAt: "25:00" }],
    };
    snapshot.session.draft.sources[0]!.observedAt = "not-a-timestamp";
    expect(decodeCampusMapEditSnapshot(JSON.stringify(snapshot))).toEqual({
      status: "discarded",
      reason: "invalid-snapshot",
    });
  });

  it.each([
    [{ kind: "floor" }, null, null],
    [{ kind: "building" }, placeId, baseRevisionId],
    [
      {
        kind: "outdoor-point",
        longitude: 999,
        latitude: 22.4,
        crs: "wgs84",
        precision: "approximate",
      },
      null,
      null,
    ],
  ])(
    "rejects contradictory or impossible snapshot locations",
    (location, buildingId, floorId) => {
      const snapshot = JSON.parse(
        encodeCampusMapEditSnapshot(editSession()),
      ) as {
        session: CampusMapEditSession;
      };
      snapshot.session.draft.fact = {
        ...snapshot.session.draft.fact,
        buildingId,
        floorId,
        location,
      } as never;
      expect(decodeCampusMapEditSnapshot(JSON.stringify(snapshot))).toEqual({
        status: "discarded",
        reason: "invalid-snapshot",
      });
    },
  );

  it("rejects an editing Add snapshot before location is locked", () => {
    const placing = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: firstKey,
    }).session!;
    const snapshot = JSON.parse(encodeCampusMapEditSnapshot(placing)) as {
      session: CampusMapEditSession;
    };
    snapshot.session.status = "editing";
    expect(decodeCampusMapEditSnapshot(JSON.stringify(snapshot))).toEqual({
      status: "discarded",
      reason: "invalid-snapshot",
    });
  });

  it("rejects a close-dialog snapshot that claims an impossible publishing return", () => {
    const snapshot = JSON.parse(encodeCampusMapEditSnapshot(editSession())) as {
      session: CampusMapEditSession;
    };
    snapshot.session.status = "confirm-discard";
    snapshot.session.returnStatus = "publishing";

    expect(decodeCampusMapEditSnapshot(JSON.stringify(snapshot))).toEqual({
      status: "discarded",
      reason: "invalid-snapshot",
    });
  });

  it("rejects impossible Edit reposition and damaged stable identity", () => {
    const snapshot = JSON.parse(encodeCampusMapEditSnapshot(editSession())) as {
      session: CampusMapEditSession;
    };
    snapshot.session.status = "placing";
    snapshot.session.draft.fact.location = null;
    snapshot.session.draft.placeId = "";
    snapshot.session.draft.baseRevisionId = "not-a-uuid";
    snapshot.session.draft.idempotencyKey = "broken";
    expect(decodeCampusMapEditSnapshot(JSON.stringify(snapshot))).toEqual({
      status: "discarded",
      reason: "invalid-snapshot",
    });
  });

  it("allows overnight regular hours to reach server validation", () => {
    const overnight = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: {
        ...fact,
        regularHours: {
          timezone: "Asia/Hong_Kong",
          intervals: [{ days: ["fri"], opensAt: "22:00", closesAt: "02:00" }],
        },
      },
    }).session!;
    expect(
      transitionCampusMapEdit(overnight, { type: "REQUEST_PUBLISH" }).session
        ?.localError,
    ).not.toBe("regularHours");
  });

  it.each([
    ["conflict", {}],
    ["warning", {}],
    ["forbidden", {}],
    ["rate-limited", {}],
  ])("discards a %s snapshot without its required state", (status, extra) => {
    const snapshot = JSON.parse(encodeCampusMapEditSnapshot(editSession())) as {
      session: CampusMapEditSession;
    };
    snapshot.session = { ...snapshot.session, ...extra, status } as never;
    expect(decodeCampusMapEditSnapshot(JSON.stringify(snapshot))).toEqual({
      status: "discarded",
      reason: "invalid-snapshot",
    });
  });
});
