import { describe, expect, it } from "vitest";

import { buildOsmRouteGeodata } from "../../scripts/cuhk-bus-osm-geodata";

describe("buildOsmRouteGeodata", () => {
  it("aligns reviewed stop occurrences with OSM platform members", () => {
    const osm: Parameters<typeof buildOsmRouteGeodata>[0] = {
      elements: [
        { id: 1, lat: 22.4, lon: 114.2, type: "node" },
        { id: 2, lat: 22.41, lon: 114.21, type: "node" },
        { id: 3, lat: 22.401, lon: 114.201, type: "node" },
        { id: 4, lat: 22.411, lon: 114.211, type: "node" },
        { id: 10, nodes: [1, 2], type: "way" },
        {
          id: 20,
          members: [
            { ref: 3, role: "platform", type: "node" },
            { ref: 1, role: "stop", type: "node" },
            { ref: 10, role: "", type: "way" },
            { ref: 4, role: "platform_exit_only", type: "node" },
            { ref: 2, role: "stop", type: "node" },
          ],
          timestamp: "2026-08-11T00:00:00Z",
          type: "relation",
          version: 3,
        },
      ],
    };
    const coldStart: Parameters<typeof buildOsmRouteGeodata>[1] = {
      route: { routeId: "x" },
      patterns: [
        {
          projections: [
            {
              stopId: "same-stop",
              stopNameEn: "Origin",
              stopNameZhHant: "起點",
              stopSequence: 1,
            },
            {
              stopId: "same-stop",
              stopNameEn: "Terminus",
              stopNameZhHant: "終點",
              stopSequence: 2,
            },
          ],
        },
      ],
    };

    const geodata = buildOsmRouteGeodata(osm, coldStart);

    expect(geodata.stopOccurrences).toEqual([
      expect.objectContaining({
        coordinates: [114.201, 22.401],
        occurrenceId: "same-stop#1",
      }),
      expect.objectContaining({
        coordinates: [114.211, 22.411],
        occurrenceId: "same-stop#2",
      }),
    ]);
    expect(geodata.geometry.geometry.coordinates).toEqual([
      [
        [114.2, 22.4],
        [114.21, 22.41],
      ],
    ]);
  });

  it("fails closed when OSM and the reviewed stop sequence diverge", () => {
    const osm: Parameters<typeof buildOsmRouteGeodata>[0] = {
      elements: [
        { id: 1, lat: 22.4, lon: 114.2, type: "node" },
        { id: 20, members: [], type: "relation" },
      ],
    };
    const coldStart: Parameters<typeof buildOsmRouteGeodata>[1] = {
      route: { routeId: "x" },
      patterns: [
        {
          projections: [
            {
              stopId: "a",
              stopNameEn: "A",
              stopNameZhHant: "甲",
              stopSequence: 1,
            },
          ],
        },
      ],
    };

    expect(() => buildOsmRouteGeodata(osm, coldStart)).toThrow(
      "0 OSM platforms but 1 canonical stop occurrences",
    );
  });

  it("records and ignores an exact consecutive duplicate OSM platform member", () => {
    const osm: Parameters<typeof buildOsmRouteGeodata>[0] = {
      elements: [
        { id: 1, lat: 22.4, lon: 114.2, type: "node" },
        { id: 2, lat: 22.41, lon: 114.21, type: "node" },
        { id: 10, nodes: [1, 2], type: "way" },
        {
          id: 20,
          members: [
            { ref: 1, role: "platform", type: "node" },
            { ref: 1, role: "platform", type: "node" },
            { ref: 10, role: "", type: "way" },
          ],
          type: "relation",
        },
      ],
    };
    const coldStart: Parameters<typeof buildOsmRouteGeodata>[1] = {
      route: { routeId: "x" },
      patterns: [
        {
          projections: [
            {
              stopId: "a",
              stopNameEn: "A",
              stopNameZhHant: "甲",
              stopSequence: 1,
            },
          ],
        },
      ],
    };

    const geodata = buildOsmRouteGeodata(osm, coldStart);

    expect(geodata.source.ignoredConsecutiveDuplicatePlatformNodeIds).toEqual([
      1,
    ]);
    expect(geodata.stopOccurrences).toHaveLength(1);
  });
});
