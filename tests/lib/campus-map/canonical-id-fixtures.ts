import type {
  CampusMapSceneCatalog,
  CampusMapSession,
} from "@/lib/campus-map/scene-kernel";

export interface NonCanonicalCampusMapIdentityCase {
  label: string;
  catalog: CampusMapSceneCatalog;
  session: CampusMapSession;
  reason: string;
}

export function buildNonCanonicalCampusMapIdentityCases(
  catalog: CampusMapSceneCatalog,
): readonly NonCanonicalCampusMapIdentityCase[] {
  return [
    {
      label: "category ID",
      catalog: { ...catalog, categories: [" water "] },
      session: {
        mode: "browse",
        scene: {
          kind: "category-results",
          category: " water ",
          snap: "peek",
        },
      },
      reason: "unknown-category",
    },
    {
      label: "empty category ID",
      catalog: { ...catalog, categories: [""] },
      session: {
        mode: "browse",
        scene: { kind: "category-results", category: "", snap: "peek" },
      },
      reason: "unknown-category",
    },
    {
      label: "building ID",
      catalog: {
        ...catalog,
        buildings: { " science ": { floorIds: ["1"] } },
      },
      session: {
        mode: "browse",
        scene: {
          kind: "building",
          buildingId: " science ",
          floorId: null,
          snap: "peek",
        },
      },
      reason: "unknown-building",
    },
    {
      label: "floor ID",
      catalog: {
        ...catalog,
        buildings: { science: { floorIds: [" 4 "] } },
      },
      session: {
        mode: "browse",
        scene: {
          kind: "building",
          buildingId: "science",
          floorId: " 4 ",
          snap: "peek",
        },
      },
      reason: "unknown-building",
    },
    {
      label: "facility ID",
      catalog: {
        ...catalog,
        places: {
          " fountain ": {
            buildingId: "science",
            floorId: "1",
            category: "water",
          },
        },
      },
      session: {
        mode: "browse",
        scene: { kind: "place", placeId: " fountain ", snap: "peek" },
      },
      reason: "unknown-place",
    },
    {
      label: "content ID",
      catalog: {
        ...catalog,
        contents: {
          " room401 ": {
            buildingId: "science",
            floorId: "4",
            category: "classroom",
            kind: "room",
          },
        },
      },
      session: {
        mode: "browse",
        scene: { kind: "content", contentId: " room401 ", snap: "full" },
      },
      reason: "unknown-content",
    },
    {
      label: "facility building relation",
      catalog: {
        ...catalog,
        buildings: { " science ": { floorIds: ["1"] } },
        places: {
          fountain: {
            buildingId: " science ",
            floorId: "1",
            category: "water",
          },
        },
      },
      session: {
        mode: "browse",
        scene: { kind: "place", placeId: "fountain", snap: "peek" },
      },
      reason: "unknown-place",
    },
    {
      label: "facility floor relation",
      catalog: {
        ...catalog,
        buildings: { science: { floorIds: [" 1 "] } },
        places: {
          fountain: {
            buildingId: "science",
            floorId: " 1 ",
            category: "water",
          },
        },
      },
      session: {
        mode: "browse",
        scene: { kind: "place", placeId: "fountain", snap: "peek" },
      },
      reason: "unknown-place",
    },
    {
      label: "content category relation",
      catalog: {
        ...catalog,
        categories: [" classroom "],
        contents: {
          room401: {
            buildingId: "science",
            floorId: "4",
            category: " classroom ",
            kind: "room",
          },
        },
      },
      session: {
        mode: "browse",
        scene: { kind: "content", contentId: "room401", snap: "full" },
      },
      reason: "unknown-content",
    },
    {
      label: "task anchor ID",
      catalog: {
        ...catalog,
        buildings: { " science ": { floorIds: ["1"] } },
      },
      session: {
        mode: "task",
        task: {
          kind: "create",
          anchor: { kind: "building", buildingId: " science " },
        },
      },
      reason: "unknown-building",
    },
  ];
}
