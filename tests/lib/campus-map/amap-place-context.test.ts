import { describe, expect, it, vi } from "vitest";

import {
  createAmapGeocoderAdapter,
  createAmapPlaceContextResolver,
} from "@/lib/campus-map/amap-place-context";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("AMap place context resolver", () => {
  it("adapts the AMap callback result at one provider boundary", async () => {
    const getAddress = vi.fn(
      (
        _position: readonly [number, number],
        callback: (status: string, result: unknown) => void,
      ) =>
        callback("complete", {
          regeocode: {
            formattedAddress: "香港新界沙田区香港中文大学科学馆",
            pois: [
              {
                id: "B0FFHYPOTHETICAL",
                name: "科学馆",
                address: "中央大道",
                distance: "18",
              },
            ],
          },
        }),
    );
    const adapter = createAmapGeocoderAdapter({ getAddress });

    await expect(
      adapter.reverseGeocode({
        longitude: 114.2101,
        latitude: 22.4198,
        crs: "gcj02",
      }),
    ).resolves.toEqual({
      status: "complete",
      formattedAddress: "香港新界沙田区香港中文大学科学馆",
      pois: [
        {
          id: "B0FFHYPOTHETICAL",
          name: "科学馆",
          address: "中央大道",
          distanceMeters: 18,
        },
      ],
    });
    expect(getAddress).toHaveBeenCalledWith(
      [114.2101, 22.4198],
      expect.any(Function),
    );
  });

  it("classifies an AMap quota response as rate-limited", async () => {
    const adapter = createAmapGeocoderAdapter({
      getAddress: (_position, callback) =>
        callback("error", {
          info: "CUQPS_HAS_EXCEEDED_THE_LIMIT",
          infocode: "10021",
        }),
    });

    await expect(
      adapter.reverseGeocode({
        longitude: 114.2101,
        latitude: 22.4198,
        crs: "gcj02",
      }),
    ).resolves.toEqual({ status: "error", reason: "rate-limited" });
  });

  it.each([
    ["no_data", {}, { status: "no-data" }],
    [
      "error",
      { info: "SERVER_IS_BUSY", infocode: "10016" },
      { status: "error", reason: "transient" },
    ],
    [
      "error",
      { info: "INVALID_USER_KEY", infocode: "10001" },
      { status: "error", reason: "permanent" },
    ],
  ])(
    "maps AMap %s failures without inventing context",
    async (status, raw, expected) => {
      const adapter = createAmapGeocoderAdapter({
        getAddress: (_position, callback) => callback(status, raw),
      });

      await expect(
        adapter.reverseGeocode({
          longitude: 114.2101,
          latitude: 22.4198,
          crs: "gcj02",
        }),
      ).resolves.toEqual(expected);
    },
  );

  it("normalizes the nearest provider POI without turning it into a Campus Map fact", async () => {
    const reverseGeocode = vi.fn().mockResolvedValue({
      status: "complete" as const,
      formattedAddress: "香港新界沙田区香港中文大学科学馆",
      pois: [
        {
          id: "B0FFHYPOTHETICAL",
          name: "科学馆",
          address: "中央大道",
          distanceMeters: 18,
        },
      ],
    });
    const resolver = createAmapPlaceContextResolver({ reverseGeocode });

    const result = await resolver.resolveLatest({
      longitude: 114.2101,
      latitude: 22.4198,
      crs: "gcj02",
    });

    expect(reverseGeocode).toHaveBeenCalledOnce();
    expect(result).toEqual({
      status: "resolved",
      context: {
        providerPosition: {
          longitude: 114.2101,
          latitude: 22.4198,
          crs: "gcj02",
        },
        label: "科学馆",
        address: "香港新界沙田区香港中文大学科学馆",
        providerPoiId: "B0FFHYPOTHETICAL",
        distanceMeters: 18,
      },
    });
    expect(result).not.toHaveProperty("fact");
    expect(result).not.toHaveProperty("source");
  });

  it("prefers a nearby building over the campus container", async () => {
    const resolver = createAmapPlaceContextResolver({
      reverseGeocode: vi.fn().mockResolvedValue({
        status: "complete" as const,
        formattedAddress: "香港新界沙田区中央道香港中文大学",
        pois: [
          {
            id: "campus",
            name: "香港中文大学",
            distanceMeters: 0,
          },
          {
            id: "shaw-hall",
            name: "邵逸夫堂",
            distanceMeters: 14,
          },
        ],
      }),
    });

    await expect(
      resolver.resolveLatest({
        longitude: 114.2098,
        latitude: 22.4197,
        crs: "gcj02",
      }),
    ).resolves.toMatchObject({
      status: "resolved",
      context: {
        label: "邵逸夫堂",
        providerPoiId: "shaw-hall",
        distanceMeters: 14,
      },
    });
  });

  it("prefers the nearest specific POI instead of the provider array order", async () => {
    const resolver = createAmapPlaceContextResolver({
      reverseGeocode: vi.fn().mockResolvedValue({
        status: "complete" as const,
        formattedAddress: "香港新界沙田区中央道香港中文大学",
        pois: [
          {
            id: "art-museum",
            name: "文物馆 Art Museum",
            distanceMeters: 145,
          },
          {
            id: "shaw-hall",
            name: "邵逸夫堂",
            distanceMeters: 14,
          },
        ],
      }),
    });

    await expect(
      resolver.resolveLatest({
        longitude: 114.212,
        latitude: 22.4173,
        crs: "gcj02",
      }),
    ).resolves.toMatchObject({
      status: "resolved",
      context: {
        label: "邵逸夫堂",
        providerPoiId: "shaw-hall",
        distanceMeters: 14,
      },
    });
  });

  it("does not present a far nearby POI as the pin location", async () => {
    const resolver = createAmapPlaceContextResolver({
      reverseGeocode: vi.fn().mockResolvedValue({
        status: "complete" as const,
        formattedAddress: "香港新界沙田区中央道香港中文大学",
        pois: [
          {
            id: "art-museum",
            name: "文物馆 Art Museum",
            distanceMeters: 145,
          },
          {
            id: "campus",
            name: "香港中文大学",
            distanceMeters: 0,
          },
        ],
      }),
    });

    await expect(
      resolver.resolveLatest({
        longitude: 114.212,
        latitude: 22.4173,
        crs: "gcj02",
      }),
    ).resolves.toEqual({
      status: "resolved",
      context: {
        providerPosition: {
          longitude: 114.212,
          latitude: 22.4173,
          crs: "gcj02",
        },
        label: "地图中心位置",
        address: "香港新界沙田区中央道香港中文大学",
        providerPoiId: null,
        distanceMeters: null,
      },
    });
  });

  it("does not attribute a building 64 metres away to the pin", async () => {
    const resolver = createAmapPlaceContextResolver({
      reverseGeocode: vi.fn().mockResolvedValue({
        status: "complete" as const,
        formattedAddress: "香港新界沙田区中央道香港中文大学",
        pois: [
          {
            id: "yc-liang-hall",
            name: "香港中文大学润昌堂",
            distanceMeters: 64,
          },
        ],
      }),
    });

    await expect(
      resolver.resolveLatest({
        longitude: 114.212,
        latitude: 22.4174,
        crs: "gcj02",
      }),
    ).resolves.toMatchObject({
      status: "resolved",
      context: {
        label: "地图中心位置",
        providerPoiId: null,
        distanceMeters: null,
      },
    });
  });

  it("lets only the newest map center update visible context", async () => {
    const first = deferred<{
      status: "complete";
      formattedAddress: string;
    }>();
    const second = deferred<{
      status: "complete";
      formattedAddress: string;
    }>();
    const reverseGeocode = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const resolver = createAmapPlaceContextResolver({ reverseGeocode });

    const oldRequest = resolver.resolveLatest({
      longitude: 114.21,
      latitude: 22.42,
      crs: "gcj02",
    });
    const newRequest = resolver.resolveLatest({
      longitude: 114.211,
      latitude: 22.421,
      crs: "gcj02",
    });
    second.resolve({ status: "complete", formattedAddress: "新位置" });
    await expect(newRequest).resolves.toMatchObject({
      status: "resolved",
      context: { label: "地图中心位置", address: "新位置" },
    });
    first.resolve({ status: "complete", formattedAddress: "旧位置" });

    await expect(oldRequest).resolves.toEqual({ status: "superseded" });
  });

  it("reuses one pending request and its short-lived result for the same center", async () => {
    const response = deferred<{
      status: "complete";
      formattedAddress: string;
    }>();
    const reverseGeocode = vi.fn().mockReturnValue(response.promise);
    const resolver = createAmapPlaceContextResolver({ reverseGeocode });
    const position = {
      longitude: 114.21012,
      latitude: 22.41982,
      crs: "gcj02" as const,
    };

    const first = resolver.resolveLatest(position);
    const second = resolver.resolveLatest(position);
    expect(reverseGeocode).toHaveBeenCalledOnce();
    response.resolve({ status: "complete", formattedAddress: "科学馆" });

    await expect(first).resolves.toEqual({ status: "superseded" });
    await expect(second).resolves.toMatchObject({ status: "resolved" });
    await expect(resolver.resolveLatest(position)).resolves.toMatchObject({
      status: "resolved",
      context: { label: "地图中心位置", address: "科学馆" },
    });
    expect(reverseGeocode).toHaveBeenCalledOnce();
  });

  it("retries one transient provider failure before showing an error", async () => {
    const reverseGeocode = vi
      .fn()
      .mockResolvedValueOnce({ status: "error", reason: "transient" })
      .mockResolvedValueOnce({
        status: "complete",
        formattedAddress: "香港中文大学科学馆",
      });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const resolver = createAmapPlaceContextResolver(
      { reverseGeocode },
      { sleep },
    );

    await expect(
      resolver.resolveLatest({
        longitude: 114.2101,
        latitude: 22.4198,
        crs: "gcj02",
      }),
    ).resolves.toMatchObject({
      status: "resolved",
      context: {
        label: "地图中心位置",
        address: "香港中文大学科学馆",
      },
    });
    expect(reverseGeocode).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(200);
  });

  it("stops after one transient retry", async () => {
    const reverseGeocode = vi.fn().mockResolvedValue({
      status: "error",
      reason: "transient",
    });
    const resolver = createAmapPlaceContextResolver(
      { reverseGeocode },
      { sleep: vi.fn().mockResolvedValue(undefined) },
    );

    await expect(
      resolver.resolveLatest({
        longitude: 114.2101,
        latitude: 22.4198,
        crs: "gcj02",
      }),
    ).resolves.toEqual({ status: "transient-error" });
    expect(reverseGeocode).toHaveBeenCalledTimes(2);
  });

  it("does not retry provider rate limits", async () => {
    const reverseGeocode = vi.fn().mockResolvedValue({
      status: "error",
      reason: "rate-limited",
      retryAfterSeconds: 12,
    });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const resolver = createAmapPlaceContextResolver(
      { reverseGeocode },
      { sleep },
    );

    await expect(
      resolver.resolveLatest({
        longitude: 114.2101,
        latitude: 22.4198,
        crs: "gcj02",
      }),
    ).resolves.toEqual({
      status: "rate-limited",
      retryAfterSeconds: 12,
    });
    expect(reverseGeocode).toHaveBeenCalledOnce();
    expect(sleep).not.toHaveBeenCalled();
  });

  it("invalidates an in-flight callback when editing closes", async () => {
    const response = deferred<{
      status: "complete";
      formattedAddress: string;
    }>();
    const resolver = createAmapPlaceContextResolver({
      reverseGeocode: vi.fn().mockReturnValue(response.promise),
    });
    const request = resolver.resolveLatest({
      longitude: 114.2101,
      latitude: 22.4198,
      crs: "gcj02",
    });

    resolver.invalidate();
    response.resolve({ status: "complete", formattedAddress: "已过期位置" });

    await expect(request).resolves.toEqual({ status: "superseded" });
  });

  it("bounds its short-lived center cache", async () => {
    const reverseGeocode = vi.fn(async (position: { longitude: number }) => ({
      status: "complete" as const,
      formattedAddress: String(position.longitude),
    }));
    const resolver = createAmapPlaceContextResolver(
      { reverseGeocode },
      { maxCacheEntries: 2 },
    );
    const at = (longitude: number) =>
      resolver.resolveLatest({
        longitude,
        latitude: 22.42,
        crs: "gcj02",
      });

    await at(114.21);
    await at(114.22);
    await at(114.23);
    await at(114.21);

    expect(reverseGeocode).toHaveBeenCalledTimes(4);
  });
});
