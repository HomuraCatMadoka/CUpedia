import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { createCampusMapProviderMappingCandidate } from "@/lib/campus-map/provider-mapping-candidate";

describe("Campus Map provider mapping candidates", () => {
  it("keeps name, alias, distance, and coordinate signals as a non-binding candidate", async () => {
    const candidate = createCampusMapProviderMappingCandidate({
      identity: { provider: "amap", providerObjectId: "B0FFF779" },
      target: {
        kind: "building",
        buildingId: "77900000-0000-4000-8000-000000000001",
      },
      signals: [
        {
          kind: "name",
          providerName: "University Library",
          canonicalName: "大学图书馆",
        },
        {
          kind: "alias",
          providerAlias: "Main Library",
          canonicalAlias: "大学图书馆",
        },
        { kind: "distance", meters: 8.4 },
        {
          kind: "coordinate",
          providerCrs: "gcj02",
          canonicalCrs: "wgs84",
        },
      ],
    });

    expect(candidate).toEqual({
      status: "candidate",
      identity: { provider: "amap", providerObjectId: "B0FFF779" },
      target: {
        kind: "building",
        buildingId: "77900000-0000-4000-8000-000000000001",
      },
      signals: [
        {
          kind: "name",
          providerName: "University Library",
          canonicalName: "大学图书馆",
        },
        {
          kind: "alias",
          providerAlias: "Main Library",
          canonicalAlias: "大学图书馆",
        },
        { kind: "distance", meters: 8.4 },
        {
          kind: "coordinate",
          providerCrs: "gcj02",
          canonicalCrs: "wgs84",
        },
      ],
    });

    const source = await readFile(
      resolve(rootPath(), "src/lib/campus-map/provider-mapping-candidate.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/@\/db|campusMapProviderMappings/);
    expect(source).not.toContain("commandCampusMapProviderMapping");
  });
});

function rootPath() {
  return process.cwd();
}
