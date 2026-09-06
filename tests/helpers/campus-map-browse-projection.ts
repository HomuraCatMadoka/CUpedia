import {
  projectCampusMapBrowse,
  type CampusMapBrowseProjection,
} from "@/lib/campus-map/browse-projection";
import type { CampusMapCurrentPlace } from "@/lib/campus-map/fact-store";
import type { CampusMapPlaceType } from "@/lib/campus-map/place-type-contract";

interface CampusMapTestBuilding {
  id: string;
  name: string;
  englishName: string;
  code: string | null;
  position: readonly [number, number] | null;
  aliases: readonly string[];
  floorIds: readonly string[];
}

interface CampusMapTestFacility {
  id: string;
  buildingId: string;
  category: CampusMapPlaceType;
  name: string;
  floorId: string;
  access: string;
}

export const CAMPUS_MAP_TEST_BUILDINGS: readonly CampusMapTestBuilding[] = [
  {
    id: "science-centre",
    name: "科学馆",
    englishName: "University Science Centre",
    code: "H10",
    position: [114.20801, 22.41966] as const,
    aliases: ["科学馆", "科學館", "Science Centre"],
    floorIds: ["LG", "G", "1", "2", "3", "4"],
  },
  {
    id: "high-kun-building",
    name: "高锟楼",
    englishName: "Charles Kuen Kao Building",
    code: null,
    position: null,
    aliases: ["高錕樓", "科学馆北座高锟楼", "科學館北座高錕樓"],
    floorIds: [],
  },
  {
    id: "ma-lin-building",
    name: "马临楼",
    englishName: "Ma Lin Building",
    code: null,
    position: null,
    aliases: ["馬臨樓", "科学馆南座马临楼", "科學館南座馬臨樓"],
    floorIds: [],
  },
  {
    id: "wmy",
    name: "伍何曼原楼",
    englishName: "Wu Ho Man Yuen Building",
    code: "C39b",
    position: [114.21161413192749, 22.416696837628166] as const,
    aliases: ["伍何曼原楼", "Wu Ho Man Yuen Building", "WMY"],
    floorIds: ["G", "1", "2", "3", "4", "5", "6"],
  },
  {
    id: "university-library",
    name: "大学图书馆",
    englishName: "University Library",
    code: "UL",
    position: [114.20491129159927, 22.419498675716074] as const,
    aliases: ["大学图书馆", "大學圖書館", "University Library"],
    floorIds: ["G", "1", "2", "3", "4"],
  },
] as const;

export const CAMPUS_MAP_TEST_FACILITIES: readonly CampusMapTestFacility[] = [
  {
    id: "71000000-0000-4000-8000-000000000001",
    buildingId: "science-centre",
    category: "toilet",
    name: "洗手间",
    floorId: "LG",
    access: "公众可达",
  },
  {
    id: "71000000-0000-4000-8000-000000000002",
    buildingId: "science-centre",
    category: "water",
    name: "饮水机",
    floorId: "1",
    access: "公众可达",
  },
  {
    id: "71000000-0000-4000-8000-000000000003",
    buildingId: "wmy",
    category: "toilet",
    name: "洗手间",
    floorId: "5",
    access: "需 CUHK 身份",
  },
  {
    id: "71000000-0000-4000-8000-000000000004",
    buildingId: "wmy",
    category: "printer",
    name: "打印站",
    floorId: "6",
    access: "需 CUHK 身份",
  },
  {
    id: "71000000-0000-4000-8000-000000000005",
    buildingId: "university-library",
    category: "water",
    name: "饮水机",
    floorId: "G",
    access: "进入图书馆后可用",
  },
] as const;

/**
 * Deterministic canonical facts for component tests. Production reads the
 * Current-facts projection and never imports this fixture.
 */
export function createCampusMapBrowseFixture(): CampusMapBrowseProjection {
  const buildingById = new Map(
    CAMPUS_MAP_TEST_BUILDINGS.map((building) => [building.id, building]),
  );
  const places: CampusMapCurrentPlace[] = CAMPUS_MAP_TEST_FACILITIES.flatMap(
    (facility) => {
      const building = buildingById.get(facility.buildingId);
      if (!building) return [];
      return [
        {
          id: facility.id,
          revisionId: facility.id.replace("71000000", "72000000"),
          factSchemaVersion: 2,
          name: facility.name,
          placeType: facility.category,
          regularHours: null,
          officialActions: [],
          visitNote: null,
          capabilities: [],
          gender: null,
          wheelchairAccess: null,
          location: {
            kind: "floor",
            building: {
              id: building.id,
              name: building.name,
              englishName: building.englishName,
              code: building.code,
            },
            floor: {
              id: facility.floorId,
              displayLabel: `${facility.floorId}/F`,
              sortOrder: building.floorIds.indexOf(facility.floorId),
            },
          },
          observedAt: null,
          verifiedAt: null,
          publishedAt: new Date("2026-08-14T00:00:00.000Z"),
          provenance: [],
        } satisfies CampusMapCurrentPlace,
      ];
    },
  );

  return projectCampusMapBrowse({
    buildings: CAMPUS_MAP_TEST_BUILDINGS.map((building) => ({
      buildingId: building.id,
      name: building.name,
      englishName: building.englishName,
      code: building.code,
      aliases: building.aliases,
      anchor: building.position
        ? {
            longitude: building.position[0],
            latitude: building.position[1],
            crs: "wgs84" as const,
          }
        : null,
      floors: building.floorIds.map((floorId, sortOrder) => ({
        floorId,
        displayLabel: `${floorId}/F`,
        sortOrder,
      })),
    })),
    places,
  });
}
