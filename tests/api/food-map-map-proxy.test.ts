import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/food-map/map/[...path]/route";

const ROUTE_URL = "http://localhost:3000/api/food-map/map";

function makeParams(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /api/food-map/map/[...path]", () => {
  it("rewrites every OpenFreeMap URL in JSON resources to the same-origin proxy", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          sprite: "https://tiles.openfreemap.org/sprites/ofm/ofm",
          glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
          sources: {
            map: { url: "https://tiles.openfreemap.org/planet" },
          },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(`${ROUTE_URL}/styles/positron`),
      makeParams(["styles", "positron"]),
    );
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).not.toContain("https://tiles.openfreemap.org");
    expect(body).toContain(
      "http://localhost:3000/api/food-map/map/sprites/ofm/ofm",
    );
    expect(body).toContain(
      "http://localhost:3000/api/food-map/map/fonts/{fontstack}/{range}.pbf",
    );
    expect(body).toContain("http://localhost:3000/api/food-map/map/planet");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://tiles.openfreemap.org/styles/positron",
    );
    expect(response.headers.get("cache-control")).toContain("s-maxage=86400");
  });

  it("passes binary tiles through and preserves the request query", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "application/x-protobuf" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(`${ROUTE_URL}/planet/14/1/2.pbf?key=value`),
      makeParams(["planet", "14", "1", "2.pbf"]),
    );

    expect(new Uint8Array(await response.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://tiles.openfreemap.org/planet/14/1/2.pbf?key=value",
    );
    expect(response.headers.get("content-type")).toBe("application/x-protobuf");
  });

  it("rejects path traversal without requesting the upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(
      new Request(`${ROUTE_URL}/styles/../planet`),
      makeParams(["styles", "..", "planet"]),
    );

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
