import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { format } from "prettier";

type OsmNode = {
  id: number;
  lat: number;
  lon: number;
  timestamp?: string;
  type: "node";
  version?: number;
};

type OsmWay = {
  id: number;
  nodes: number[];
  type: "way";
};

type OsmRelation = {
  id: number;
  members: Array<{
    ref: number;
    role: string;
    type: "node" | "relation" | "way";
  }>;
  timestamp?: string;
  type: "relation";
  version?: number;
};

type OsmFullResponse = {
  elements: Array<OsmNode | OsmRelation | OsmWay>;
};

type ColdStartDataset = {
  route: { routeId: string };
  patterns: Array<{
    projections: Array<{
      stopId: string;
      stopNameEn: string;
      stopNameZhHant: string;
      stopSequence: number;
    }>;
  }>;
};

function occurrenceIds<T extends { stopId: string }>(items: T[]) {
  const counts = new Map<string, number>();
  return items.map((item) => {
    const occurrence = (counts.get(item.stopId) ?? 0) + 1;
    counts.set(item.stopId, occurrence);
    return `${item.stopId}#${occurrence}`;
  });
}

export function buildOsmRouteGeodata(
  osm: OsmFullResponse,
  coldStart: ColdStartDataset,
) {
  const relation = osm.elements.find(
    (element): element is OsmRelation => element.type === "relation",
  );
  if (!relation) throw new Error("OSM response has no relation");

  const nodes = new Map(
    osm.elements
      .filter((element): element is OsmNode => element.type === "node")
      .map((node) => [node.id, node]),
  );
  const ways = new Map(
    osm.elements
      .filter((element): element is OsmWay => element.type === "way")
      .map((way) => [way.id, way]),
  );
  const rawPlatformMembers = relation.members.filter(
    (member) => member.type === "node" && member.role.startsWith("platform"),
  );
  const ignoredConsecutiveDuplicatePlatformNodeIds: number[] = [];
  const platformMembers = rawPlatformMembers.filter((member, index) => {
    const isConsecutiveDuplicate =
      index > 0 && rawPlatformMembers[index - 1].ref === member.ref;
    if (isConsecutiveDuplicate) {
      ignoredConsecutiveDuplicatePlatformNodeIds.push(member.ref);
      return false;
    }
    return true;
  });
  const canonicalPattern = coldStart.patterns.find(
    (pattern) => pattern.projections.length === platformMembers.length,
  );

  if (!canonicalPattern) {
    const referencePattern = coldStart.patterns.reduce((current, candidate) =>
      candidate.projections.length < current.projections.length
        ? candidate
        : current,
    );
    throw new Error(
      `Route ${coldStart.route.routeId} has ${platformMembers.length} OSM platforms but ${referencePattern.projections.length} canonical stop occurrences`,
    );
  }

  const ids = occurrenceIds(canonicalPattern.projections);
  const stopOccurrences = canonicalPattern.projections.map(
    (projection, index) => {
      const platformNode = nodes.get(platformMembers[index].ref);
      if (!platformNode) {
        throw new Error(
          `Missing OSM platform node ${platformMembers[index].ref}`,
        );
      }
      return {
        occurrenceId: ids[index],
        stopId: projection.stopId,
        sequence: projection.stopSequence,
        nameEn: projection.stopNameEn,
        nameZhHant: projection.stopNameZhHant,
        osmPlatformNodeId: platformNode.id,
        coordinates: [platformNode.lon, platformNode.lat],
      };
    },
  );
  const coordinates = relation.members
    .filter((member) => member.type === "way")
    .map((member) => {
      const way = ways.get(member.ref);
      if (!way) throw new Error(`Missing OSM way ${member.ref}`);
      return way.nodes.map((nodeId) => {
        const node = nodes.get(nodeId);
        if (!node) throw new Error(`Missing OSM node ${nodeId}`);
        return [node.lon, node.lat];
      });
    });

  return {
    schemaVersion: "cuhk-osm-route-geodata/1",
    routeId: coldStart.route.routeId,
    source: {
      kind: "openstreetmap_relation",
      relationId: relation.id,
      relationVersion: relation.version ?? null,
      relationTimestamp: relation.timestamp ?? null,
      sourceUrl: `https://www.openstreetmap.org/relation/${relation.id}`,
      attribution: "© OpenStreetMap contributors",
      licence: "ODbL-1.0",
      ignoredConsecutiveDuplicatePlatformNodeIds,
    },
    stopOccurrences,
    geometry: {
      type: "Feature",
      properties: {
        route: coldStart.route.routeId,
        source: `OpenStreetMap relation ${relation.id}`,
      },
      geometry: { type: "MultiLineString", coordinates },
    },
  };
}

async function main() {
  const [osmInput, coldStartInput, output] = process.argv.slice(2);
  if (!osmInput || !coldStartInput || !output) {
    throw new Error(
      "Usage: tsx scripts/cuhk-bus-osm-geodata.ts <osm-full.json> <cold-start.json> <output.json>",
    );
  }
  const osmPath = resolve(osmInput);
  const coldStartPath = resolve(coldStartInput);
  const outputPath = resolve(output);
  const [osm, coldStart] = await Promise.all([
    readFile(osmPath, "utf8").then(
      (value) => JSON.parse(value) as OsmFullResponse,
    ),
    readFile(coldStartPath, "utf8").then(
      (value) => JSON.parse(value) as ColdStartDataset,
    ),
  ]);
  const geodata = buildOsmRouteGeodata(osm, coldStart);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    await format(JSON.stringify(geodata), { parser: "json" }),
  );
  console.log(
    `Wrote ${geodata.stopOccurrences.length} stop occurrences and ${geodata.geometry.geometry.coordinates.length} way geometries to ${outputPath}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
