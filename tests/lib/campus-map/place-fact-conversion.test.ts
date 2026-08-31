import { describe, expect, it } from "vitest";

import type { CampusMapCurrentPlace } from "@/lib/campus-map/fact-store";
import {
  toCampusMapRepublishableFact,
  type CampusMapPlaceFactSnapshot,
} from "@/lib/campus-map/place-fact-conversion";
import type { CampusMapPublishFactInput } from "@/lib/campus-map/publish-contract";

const buildingId = "50000000-0000-4000-8000-000000000001";
const floorId = "60000000-0000-4000-8000-000000000001";

function currentPlace(
  overrides: Partial<CampusMapCurrentPlace> = {},
): CampusMapCurrentPlace {
  return {
    id: "20000000-0000-4000-8000-000000000001",
    revisionId: "30000000-0000-4000-8000-000000000001",
    factSchemaVersion: 1,
    name: "科学馆打印点",
    pinType: "printer",
    capabilities: ["copy"],
    access: {
      audience: "cuhk-member",
      credentialRequirement: "campus-card",
      schedule: {
        kind: "weekly",
        timezone: "Asia/Hong_Kong",
        intervals: [
          { days: ["mon", "wed"], opensAt: "08:00", closesAt: "18:00" },
        ],
      },
      reservationRequirement: "none",
      temporaryStatus: "normal",
    },
    facets: { gender: "unknown", wheelchairAccess: "yes" },
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
  overrides: Partial<
    Extract<CampusMapPlaceFactSnapshot, { kind: "stored" }>["fact"]
  > = {},
): Extract<CampusMapPlaceFactSnapshot, { kind: "stored" }>["fact"] {
  return {
    name: "科学馆打印点",
    buildingId,
    floorId,
    pinType: "printer",
    capabilities: ["copy"],
    gender: "unknown",
    wheelchairAccess: "yes",
    audience: "cuhk-member",
    credentialRequirement: "campus-card",
    accessSchedule: { kind: "always" },
    reservationRequirement: "none",
    temporaryStatus: "normal",
    locationKind: "floor",
    pointPrecision: null,
    longitude: null,
    latitude: null,
    coordinateCrs: null,
    observedAt: new Date("2026-08-25T04:00:00.000Z"),
    ...overrides,
  };
}

describe("Campus Map Place fact conversion", () => {
  it("uses the same public entry for current building and stored floor facts", () => {
    expect(
      toCampusMapRepublishableFact({ kind: "current", fact: currentPlace() }),
    ).toMatchObject({
      ok: true,
      fact: {
        buildingId,
        floorId: null,
        location: { kind: "building" },
      },
    });

    expect(
      toCampusMapRepublishableFact({ kind: "stored", fact: storedFact() }),
    ).toMatchObject({
      ok: true,
      fact: {
        buildingId,
        floorId,
        location: { kind: "floor" },
      },
    });
  });

  it("preserves outdoor coordinates and their evidence metadata", () => {
    expect(
      toCampusMapRepublishableFact({
        kind: "stored",
        fact: storedFact({
          buildingId: null,
          floorId: null,
          locationKind: "outdoor-point",
          longitude: 114.2068,
          latitude: 22.4196,
          coordinateCrs: "wgs84",
          pointPrecision: "approximate",
        }),
      }),
    ).toMatchObject({
      ok: true,
      fact: {
        buildingId: null,
        floorId: null,
        location: {
          kind: "outdoor-point",
          longitude: 114.2068,
          latitude: 22.4196,
          crs: "wgs84",
          precision: "approximate",
        },
      },
    });
  });

  it.each([
    ["longitude", { longitude: null }],
    ["latitude", { latitude: null }],
    ["coordinate CRS", { coordinateCrs: null }],
    ["point precision", { pointPrecision: null }],
  ])(
    "fails explicitly when an outdoor snapshot lacks %s",
    (_label, missing) => {
      expect(
        toCampusMapRepublishableFact({
          kind: "stored",
          fact: storedFact({
            buildingId: null,
            floorId: null,
            locationKind: "outdoor-point",
            longitude: 114.2068,
            latitude: 22.4196,
            coordinateCrs: "wgs84",
            pointPrecision: "precise",
            ...missing,
          }),
        }),
      ).toEqual({ ok: false, reason: "invalid-outdoor-location" });
    },
  );

  it("copies array facts and serializes observation time", () => {
    const source = currentPlace();
    const result = toCampusMapRepublishableFact({
      kind: "current",
      fact: source,
    });
    expect(result).toMatchObject({
      ok: true,
      fact: { observedAt: "2026-08-25T04:00:00.000Z" },
    });
    if (!result.ok || result.fact.accessSchedule.kind !== "weekly") return;

    expect(result.fact.capabilities).not.toBe(source.capabilities);
    expect(result.fact.accessSchedule).not.toBe(source.access.schedule);
    expect(result.fact.accessSchedule.intervals).not.toBe(
      source.access.schedule.kind === "weekly"
        ? source.access.schedule.intervals
        : null,
    );
    expect(result.fact.accessSchedule.intervals[0].days).not.toBe(
      source.access.schedule.kind === "weekly"
        ? source.access.schedule.intervals[0].days
        : null,
    );
  });

  it("keeps the complete publish-fact field contract at the interface", () => {
    const expectedFields: Record<keyof CampusMapPublishFactInput, true> = {
      name: true,
      buildingId: true,
      floorId: true,
      pinType: true,
      capabilities: true,
      gender: true,
      wheelchairAccess: true,
      audience: true,
      credentialRequirement: true,
      accessSchedule: true,
      reservationRequirement: true,
      temporaryStatus: true,
      location: true,
      observedAt: true,
    };
    const result = toCampusMapRepublishableFact({
      kind: "stored",
      fact: storedFact(),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.fact).sort()).toEqual(
      Object.keys(expectedFields).sort(),
    );
  });
});
