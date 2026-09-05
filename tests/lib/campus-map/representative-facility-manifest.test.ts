import { describe, expect, it } from "vitest";

import {
  buildCampusMapRepresentativeFacilityCommand,
  campusMapRepresentativeFacilityIdentitySource,
  getCampusMapRepresentativeFacilityManifest,
} from "@/lib/campus-map/representative-facility-manifest";
import { validateFact, validateSource } from "@/lib/campus-map/publish-command";

describe("Campus Map representative facility manifest", () => {
  it("forms one valid reviewed bulk command with stable official identities", () => {
    const manifest = getCampusMapRepresentativeFacilityManifest();
    const command = buildCampusMapRepresentativeFacilityCommand();

    expect(command).toMatchObject({
      kind: "bulk",
      idempotencyKey: manifest.idempotencyKey,
      client: { version: manifest.version },
    });
    expect(command.changes).toHaveLength(4);
    expect(
      new Set(
        manifest.entries.map(
          (entry) => campusMapRepresentativeFacilityIdentitySource(entry).ref,
        ),
      ).size,
    ).toBe(4);

    for (const [changeIndex, change] of command.changes.entries()) {
      if (change.operation !== "create") throw new Error("bad manifest");
      const identitySource = campusMapRepresentativeFacilityIdentitySource(
        manifest.entries[changeIndex]!,
      );
      expect(change.sources[0]).toEqual(identitySource);
      expect(validateFact(change.fact, changeIndex)).toEqual([]);
      for (const [sourceIndex, source] of change.sources.entries()) {
        expect(validateSource(source, changeIndex, sourceIndex)).toEqual([]);
      }
    }
  });

  it("covers one classroom, one standalone facility, and split health services", () => {
    const manifest = getCampusMapRepresentativeFacilityManifest();
    const byKey = new Map(manifest.entries.map((entry) => [entry.key, entry]));
    const factFor = (key: (typeof manifest.entries)[number]["key"]) => {
      const entry = byKey.get(key);
      if (!entry) throw new Error(`missing ${key}`);
      return entry.change.fact;
    };

    expect(factFor("res-bms-lt")).toMatchObject({
      name: "BMS LT",
      placeType: "classroom",
      location: { kind: "building" },
    });
    expect(factFor("osa-university-swimming-pool")).toMatchObject({
      placeType: "sports-facility",
      buildingId: null,
      floorId: null,
      location: { kind: "outdoor-point", precision: "approximate" },
    });
    expect(factFor("umso-outpatient").officialActions).toEqual([
      {
        label: "网上预约",
        url: "https://booking.umso.cuhk.edu.hk/booking/",
      },
      { label: "电话预约", url: "tel:+85239436439" },
    ]);
    expect(factFor("umso-dental")).toMatchObject({
      placeType: "health-service",
      regularHours: null,
    });
  });

  it("returns fresh copies without changing the idempotent payload", () => {
    const firstManifest = getCampusMapRepresentativeFacilityManifest();
    firstManifest.entries[0]!.change.fact.name = "accidental mutation";

    expect(
      getCampusMapRepresentativeFacilityManifest().entries[0]!.change.fact,
    ).toMatchObject({ name: "BMS LT" });
    expect(buildCampusMapRepresentativeFacilityCommand()).toEqual(
      buildCampusMapRepresentativeFacilityCommand(),
    );
  });
});
