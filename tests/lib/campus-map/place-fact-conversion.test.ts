import { describe, expect, it } from "vitest";

import type { CampusMapCurrentPlace } from "@/lib/campus-map/fact-store";
import type { CampusMapAppendFact } from "@/lib/campus-map/fact-store-transaction";
import { toCampusMapRepublishableFact } from "@/lib/campus-map/place-fact-conversion";
import type { CampusMapPublishFactInput } from "@/lib/campus-map/publish-contract";

const buildingId = "50000000-0000-4000-8000-000000000001";
const floorId = "60000000-0000-4000-8000-000000000001";

function currentPlace(
  overrides: Partial<CampusMapCurrentPlace> = {},
): CampusMapCurrentPlace {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    revisionId: "30000000-0000-4000-8000-000000000001",
    factSchemaVersion: 2,
    name: "科学馆打印点",
    placeType: "printer",
    regularHours: {
      timezone: "Asia/Hong_Kong",
      intervals: [
        { days: ["mon", "wed"], opensAt: "08:00", closesAt: "18:00" },
      ],
    },
    officialActions: [{ label: "官网", url: "https://www.cuhk.edu.hk" }],
    visitNote: "入口旁",
    capabilities: ["copy"],
    gender: null,
    wheelchairAccess: "yes",
    location: {
      kind: "building",
      building: {
        id: buildingId,
        name: "科学馆",
        englishName: "Science Centre",
        code: "SC",
      },
    },
    observedAt: new Date("2026-08-25T04:00:00.000Z"),
    verifiedAt: null,
    publishedAt: new Date("2026-08-25T05:00:00.000Z"),
    provenance: [],
    ...overrides,
  };
}

function storedFact(
  overrides: Partial<CampusMapAppendFact> = {},
): CampusMapAppendFact {
  return {
    name: "科学馆打印点",
    buildingId,
    floorId,
    pinType: "printer",
    regularHours: null,
    officialActions: [],
    visitNote: null,
    capabilities: ["copy"],
    gender: "unknown",
    wheelchairAccess: "yes",
    audience: "cuhk-member",
    credentialRequirement: "campus-card",
    accessSchedule: {
      kind: "weekly",
      timezone: "Asia/Hong_Kong",
      intervals: [
        { days: ["mon", "wed"], opensAt: "08:00", closesAt: "18:00" },
      ],
    },
    reservationRequirement: "none",
    temporaryStatus: "normal",
    locationKind: "floor",
    pointPrecision: null,
    longitude: null,
    latitude: null,
    coordinateCrs: null,
    observedAt: new Date("2026-08-25T04:00:00.000Z"),
    verifiedAt: null,
    verifiedByActorIdSnapshot: null,
    ...overrides,
  };
}

describe("Campus Map Place fact conversion", () => {
  it("copies a V2 Current fact without sharing arrays", () => {
    const source = currentPlace();
    const result = toCampusMapRepublishableFact({
      kind: "current",
      fact: source,
    });

    expect(result).toMatchObject({
      ok: true,
      fact: {
        placeType: "printer",
        buildingId,
        floorId: null,
        location: { kind: "building" },
        observedAt: "2026-08-25T04:00:00.000Z",
      },
    });
    if (!result.ok || !result.fact.regularHours) return;
    expect(result.fact.capabilities).not.toBe(source.capabilities);
    expect(result.fact.officialActions).not.toBe(source.officialActions);
    expect(result.fact.regularHours.intervals).not.toBe(
      source.regularHours?.intervals,
    );
  });

  it("upgrades a V1 stored revision explicitly into the V2 contract", () => {
    const result = toCampusMapRepublishableFact({
      kind: "stored",
      factSchemaVersion: 1,
      fact: storedFact(),
    });

    expect(result).toMatchObject({
      ok: true,
      fact: {
        placeType: "printer",
        regularHours: {
          intervals: [
            { days: ["mon", "wed"], opensAt: "08:00", closesAt: "18:00" },
          ],
        },
        officialActions: [],
        capabilities: ["copy"],
        gender: null,
        wheelchairAccess: "yes",
      },
    });
  });

  it("restores a V2 stored revision and preserves its new facts", () => {
    const result = toCampusMapRepublishableFact({
      kind: "stored",
      factSchemaVersion: 2,
      fact: storedFact({
        pinType: "classroom",
        regularHours: {
          timezone: "Asia/Hong_Kong",
          intervals: [{ days: ["fri"], opensAt: "09:00", closesAt: "21:00" }],
        },
        officialActions: [
          { label: "课室资料", url: "https://www.cuhk.edu.hk/rooms" },
        ],
        visitNote: "经平台层进入",
        capabilities: [],
        gender: null,
        wheelchairAccess: null,
        audience: "unknown",
        credentialRequirement: "unknown",
        accessSchedule: { kind: "unknown" },
        reservationRequirement: "unknown",
        temporaryStatus: null,
      }),
    });

    expect(result).toMatchObject({
      ok: true,
      fact: {
        placeType: "classroom",
        visitNote: "经平台层进入",
      },
    });
  });

  it("fails closed for schema/payload mismatches and unsupported versions", () => {
    expect(
      toCampusMapRepublishableFact({
        kind: "stored",
        factSchemaVersion: 2,
        fact: storedFact(),
      }),
    ).toEqual({ ok: false, reason: "invalid-schema-payload" });
    expect(
      toCampusMapRepublishableFact({
        kind: "stored",
        factSchemaVersion: 99,
        fact: storedFact(),
      }),
    ).toEqual({ ok: false, reason: "unsupported-schema-version" });
  });

  it("keeps every active publish-fact field at the conversion boundary", () => {
    const expectedFields: Record<keyof CampusMapPublishFactInput, true> = {
      name: true,
      buildingId: true,
      floorId: true,
      placeType: true,
      regularHours: true,
      officialActions: true,
      visitNote: true,
      capabilities: true,
      gender: true,
      wheelchairAccess: true,
      location: true,
      observedAt: true,
    };
    const result = toCampusMapRepublishableFact({
      kind: "stored",
      factSchemaVersion: 1,
      fact: storedFact(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.fact).sort()).toEqual(
      Object.keys(expectedFields).sort(),
    );
  });
});
