import { describe, expect, it } from "vitest";

import type { CampusMapBrowseProjection } from "@/lib/campus-map/browse-projection";
import { CampusMapBrowseProjectionStore } from "@/lib/campus-map/browse-projection-store";

const EMPTY_PROJECTION: CampusMapBrowseProjection = {
  buildings: [],
  places: [],
  presences: [],
  markers: [],
};

describe("Campus Map browse projection refresh (#647)", () => {
  it("refetches after a publish receipt and returns its canonical Place target", async () => {
    const placeId = "30000000-0000-4000-8000-000000000009";
    const publishedProjection: CampusMapBrowseProjection = {
      ...EMPTY_PROJECTION,
      places: [
        {
          placeId,
          revisionId: "40000000-0000-4000-8000-000000000009",
          name: "饮水机",
          pinType: "water",
          capabilities: [],
          access: {
            audience: "unknown",
            credentialRequirement: "unknown",
            schedule: { kind: "unknown" },
            reservationRequirement: "unknown",
            temporaryStatus: "unknown",
          },
          facets: { gender: "unknown", wheelchairAccess: "unknown" },
          buildingId: null,
          floorId: null,
          floorLabel: null,
          location: {
            kind: "outdoor-point",
            point: {
              longitude: 114.21,
              latitude: 22.42,
              crs: "wgs84",
              precision: "approximate",
            },
          },
          publishedAt: "2026-08-26T00:00:00.000Z",
          selectionTarget: {
            kind: "place",
            placeId,
            buildingId: null,
            floorId: null,
          },
        },
      ],
    };
    const store = new CampusMapBrowseProjectionStore(
      EMPTY_PROJECTION,
      async () => publishedProjection,
    );

    await expect(store.refresh({ placeId })).resolves.toEqual({
      status: "applied",
      selectionTarget: {
        kind: "place",
        placeId,
        buildingId: null,
        floorId: null,
      },
    });
    expect(store.getSnapshot()).toMatchObject({
      status: "ready",
      projection: publishedProjection,
    });
  });

  it("does not let an older response overwrite the latest projection", async () => {
    function deferred() {
      let resolve!: (projection: CampusMapBrowseProjection) => void;
      const promise = new Promise<CampusMapBrowseProjection>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    }
    const first = deferred();
    const second = deferred();
    const latestProjection: CampusMapBrowseProjection = {
      ...EMPTY_PROJECTION,
      buildings: [
        {
          buildingId: "10000000-0000-4000-8000-000000000002",
          name: "最新建筑",
          englishName: null,
          code: null,
          aliases: [],
          anchor: null,
          floors: [],
          placeIds: [],
          selectionTarget: {
            kind: "building",
            buildingId: "10000000-0000-4000-8000-000000000002",
          },
        },
      ],
    };
    let call = 0;
    const store = new CampusMapBrowseProjectionStore(EMPTY_PROJECTION, () =>
      call++ === 0 ? first.promise : second.promise,
    );

    const olderRefresh = store.refresh();
    const latestRefresh = store.refresh();
    second.resolve(latestProjection);
    await expect(latestRefresh).resolves.toMatchObject({ status: "applied" });
    first.resolve(EMPTY_PROJECTION);
    await expect(olderRefresh).resolves.toEqual({ status: "superseded" });

    expect(store.getSnapshot()).toEqual({
      status: "ready",
      projection: latestProjection,
    });
  });

  it("keeps the last public projection on failure and can recover on retry", async () => {
    let attempt = 0;
    const recoveredProjection: CampusMapBrowseProjection = {
      ...EMPTY_PROJECTION,
      buildings: [
        {
          buildingId: "10000000-0000-4000-8000-000000000003",
          name: "恢复后的建筑",
          englishName: null,
          code: null,
          aliases: [],
          anchor: null,
          floors: [],
          placeIds: [],
          selectionTarget: {
            kind: "building",
            buildingId: "10000000-0000-4000-8000-000000000003",
          },
        },
      ],
    };
    const store = new CampusMapBrowseProjectionStore(
      EMPTY_PROJECTION,
      async () => {
        if (attempt++ === 0) throw new Error("temporary read failure");
        return recoveredProjection;
      },
    );

    await expect(store.refresh()).resolves.toEqual({ status: "failed" });
    expect(store.getSnapshot()).toEqual({
      status: "error",
      projection: EMPTY_PROJECTION,
    });
    await expect(store.refresh()).resolves.toMatchObject({ status: "applied" });
    expect(store.getSnapshot()).toEqual({
      status: "ready",
      projection: recoveredProjection,
    });
  });
});
