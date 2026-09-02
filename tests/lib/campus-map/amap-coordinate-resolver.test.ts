import { describe, expect, it, vi } from "vitest";

import {
  CampusMapAmapCoordinateResolver,
  type CampusMapAmapCoordinateConverter,
} from "@/lib/campus-map/amap-coordinate-resolver";
import { asWgs84Position } from "@/lib/campus-map/amap-position";

function successfulConverter() {
  const batches: Array<ReadonlyArray<readonly [number, number]>> = [];
  const converter: CampusMapAmapCoordinateConverter = {
    convertFrom(positions, _source, callback) {
      batches.push(positions);
      callback("complete", {
        info: "ok",
        locations: positions.map(([longitude, latitude]) => ({
          lng: longitude + 0.01,
          lat: latitude + 0.01,
        })),
      });
    },
  };
  return { batches, converter };
}

describe("Campus Map AMap coordinate fallback resolver", () => {
  it("does nothing when the current overlay has no provider requests", async () => {
    const convertFrom = vi.fn();
    const resolver = new CampusMapAmapCoordinateResolver({ convertFrom });

    await expect(resolver.resolve([])).resolves.toEqual({});
    expect(convertFrom).not.toHaveBeenCalled();
  });

  it("deduplicates coordinates and keeps every provider batch at 40 or fewer", async () => {
    const { batches, converter } = successfulConverter();
    const resolver = new CampusMapAmapCoordinateResolver(converter);
    const requests = Array.from({ length: 42 }, (_, index) => ({
      key: `place:${index}`,
      position: asWgs84Position([114.2 + Math.min(index, 40) / 100_000, 22.4]),
    }));

    const result = await resolver.resolve(requests);

    expect(batches.map((batch) => batch.length)).toEqual([40, 1]);
    expect(Object.keys(result)).toHaveLength(42);
  });

  it("reuses both in-flight and successful coordinates within the map session", async () => {
    const callbacks: Array<
      Parameters<CampusMapAmapCoordinateConverter["convertFrom"]>[2]
    > = [];
    const converter: CampusMapAmapCoordinateConverter = {
      convertFrom: vi.fn((_positions, _source, callback) => {
        callbacks.push(callback);
      }),
    };
    const resolver = new CampusMapAmapCoordinateResolver(converter);
    const request = {
      key: "place:one",
      position: asWgs84Position([114.2078, 22.4188]),
    };

    const first = resolver.resolve([request]);
    const concurrent = resolver.resolve([{ ...request, key: "place:two" }]);
    await Promise.resolve();
    expect(converter.convertFrom).toHaveBeenCalledTimes(1);
    callbacks[0]!("complete", {
      info: "ok",
      locations: [{ lng: 114.212677, lat: 22.415968 }],
    });

    await expect(first).resolves.toEqual({
      "place:one": [114.212677, 22.415968],
    });
    await expect(concurrent).resolves.toEqual({
      "place:two": [114.212677, 22.415968],
    });
    await resolver.resolve([request]);
    expect(converter.convertFrom).toHaveBeenCalledTimes(1);
  });

  it("runs concurrent demand through one shared provider worker", async () => {
    let releaseFirstBatch!: () => void;
    let shouldBlock = true;
    const convertFrom = vi.fn<CampusMapAmapCoordinateConverter["convertFrom"]>(
      (positions, _source, callback) => {
        const respond = () =>
          callback("complete", {
            info: "ok",
            locations: positions.map(([longitude, latitude]) => ({
              lng: longitude + 0.01,
              lat: latitude + 0.01,
            })),
          });
        if (shouldBlock) {
          shouldBlock = false;
          releaseFirstBatch = respond;
          return;
        }
        respond();
      },
    );
    const resolver = new CampusMapAmapCoordinateResolver({ convertFrom });
    const first = resolver.resolve(
      Array.from({ length: 41 }, (_, index) => ({
        key: `first:${index}`,
        position: asWgs84Position([114.2 + index / 100_000, 22.4]),
      })),
    );
    const second = resolver.resolve([
      {
        key: "second",
        position: asWgs84Position([114.21, 22.41]),
      },
    ]);

    await Promise.resolve();
    const callsWhileFirstBatchWasPending = convertFrom.mock.calls.length;
    releaseFirstBatch();
    await Promise.all([first, second]);

    expect(callsWhileFirstBatchWasPending).toBe(1);
  });

  it("does not automatically retry a failed coordinate", async () => {
    const convertFrom = vi.fn<CampusMapAmapCoordinateConverter["convertFrom"]>(
      (_positions, _source, callback) => callback("error", {}),
    );
    const resolver = new CampusMapAmapCoordinateResolver({ convertFrom });
    const request = {
      key: "place:failed",
      position: asWgs84Position([114.2078, 22.4188]),
    };

    const first = await resolver.resolve([request]);
    await resolver.resolve([request]);

    expect(first).toEqual({});
    expect(convertFrom).toHaveBeenCalledTimes(1);

    await resolver.resolve([request], { retryFailed: true });
    expect(convertFrom).toHaveBeenCalledTimes(2);
  });

  it("does not start an abandoned demand's queued batches", async () => {
    let releaseFirstBatch!: () => void;
    let shouldBlock = true;
    const convertFrom = vi.fn<CampusMapAmapCoordinateConverter["convertFrom"]>(
      (positions, _source, callback) => {
        const respond = () =>
          callback("complete", {
            info: "ok",
            locations: positions.map(([longitude, latitude]) => ({
              lng: longitude + 0.01,
              lat: latitude + 0.01,
            })),
          });
        if (shouldBlock) {
          shouldBlock = false;
          releaseFirstBatch = respond;
          return;
        }
        respond();
      },
    );
    const controller = new AbortController();
    const resolver = new CampusMapAmapCoordinateResolver({ convertFrom });
    const resolving = resolver.resolve(
      Array.from({ length: 81 }, (_, index) => ({
        key: `place:${index}`,
        position: asWgs84Position([114.2 + index / 100_000, 22.4]),
      })),
      { signal: controller.signal },
    );

    await Promise.resolve();
    controller.abort();
    releaseFirstBatch();
    await resolving;

    expect(convertFrom).toHaveBeenCalledTimes(1);
  });

  it("reads successful session cache synchronously for the next projection", async () => {
    const { converter } = successfulConverter();
    const resolver = new CampusMapAmapCoordinateResolver(converter);
    const request = {
      key: "place:cached",
      position: asWgs84Position([114.2078, 22.4188]),
    };

    await resolver.resolve([request]);

    const cached = resolver.readCached([request])["place:cached"];
    expect(cached?.[0]).toBeCloseTo(114.2178, 12);
    expect(cached?.[1]).toBeCloseTo(22.4288, 12);
  });

  it("keeps successful batches when a later batch fails", async () => {
    let batch = 0;
    const converter: CampusMapAmapCoordinateConverter = {
      convertFrom(positions, _source, callback) {
        batch += 1;
        if (batch === 2) {
          callback("error", {});
          return;
        }
        callback("complete", {
          info: "ok",
          locations: positions.map(([longitude, latitude]) => ({
            lng: longitude + 0.01,
            lat: latitude + 0.01,
          })),
        });
      },
    };
    const resolver = new CampusMapAmapCoordinateResolver(converter);
    const requests = Array.from({ length: 41 }, (_, index) => ({
      key: `place:${index}`,
      position: asWgs84Position([114.2 + index / 100_000, 22.4]),
    }));

    const result = await resolver.resolve(requests);

    expect(Object.keys(result)).toHaveLength(40);
    expect(result).not.toHaveProperty("place:40");
  });

  it("protects canonical WGS84 tuples from provider input mutation", async () => {
    const canonical = asWgs84Position([114.2078, 22.4188]);
    const converter: CampusMapAmapCoordinateConverter = {
      convertFrom(positions, _source, callback) {
        const [longitude, latitude] = positions[0]!;
        const mutable = positions[0] as unknown as [number, number];
        mutable[0] = 0;
        mutable[1] = 0;
        callback("complete", {
          info: "ok",
          locations: [{ lng: longitude, lat: latitude }],
        });
      },
    };

    await expect(
      new CampusMapAmapCoordinateResolver(converter).resolve([
        { key: "place:one", position: canonical },
      ]),
    ).resolves.toEqual({ "place:one": [114.2078, 22.4188] });
    expect(canonical).toEqual([114.2078, 22.4188]);
  });
});
