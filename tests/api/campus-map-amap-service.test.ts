import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockGetOptionalUser } = vi.hoisted(() => ({
  mockGetOptionalUser: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  getOptionalUser: mockGetOptionalUser,
}));

import {
  DELETE,
  GET,
  HEAD,
  OPTIONS,
  PATCH,
  POST,
  PUT,
} from "@/app/%5FAMapService/[...path]/route";

const originalSecurityCode = process.env.AMAP_SECURITY_JS_CODE;
const originalWebKey = process.env.AMAP_WEB_KEY;

function request(
  path: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  return new NextRequest(`http://localhost:3000/_AMapService/${path}`, init);
}

function sdkQuery(parameters: ReadonlyArray<readonly [string, string]>) {
  const searchParams = new URLSearchParams();
  const sdkParameters: ReadonlyArray<readonly [string, string]> = [
    ["platform", "JS"],
    ["s", "rsx1"],
    ["s", "rsv3"],
    ["logversion", "2.0"],
    ["key", "public-web-key"],
    ["key", "public-web-key"],
    ["sdkversion", "2.3.5.6"],
    ["appname", encodeURIComponent("http://localhost:3000/campus-map")],
    ["csid", "C15E9ECD-1EBB-4BC8-A875-C5A49E53EC4F"],
  ];
  for (const [key, value] of sdkParameters) searchParams.append(key, value);
  for (const [key, value] of parameters) searchParams.append(key, value);
  searchParams.append("callback", "jsonp_123456_1788092270566_");
  return searchParams.toString();
}

function reverseGeocodeRequest(
  init?: ConstructorParameters<typeof NextRequest>[1],
  language = "zh_cn",
) {
  return request(
    `v3/geocode/regeo?${sdkQuery([
      ["language", language],
      ["location", "114.2,22.4"],
      ["radius", "150"],
      ["extensions", "all"],
    ])}`,
    init,
  );
}

function coordinateConvertRequest(locations = "114.2,22.4") {
  return request(
    `v3/assistant/coordinate/convert?${sdkQuery([
      ["locations", locations],
      ["coordsys", "gps"],
    ])}`,
  );
}

function context(...path: string[]) {
  return { params: Promise.resolve({ path }) };
}

beforeEach(() => {
  mockGetOptionalUser.mockReset();
  mockGetOptionalUser.mockResolvedValue({ id: "user-1" });
  process.env.AMAP_SECURITY_JS_CODE = "server-only-security-code";
  process.env.AMAP_WEB_KEY = "public-web-key";
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  if (originalSecurityCode === undefined)
    delete process.env.AMAP_SECURITY_JS_CODE;
  else process.env.AMAP_SECURITY_JS_CODE = originalSecurityCode;
  if (originalWebKey === undefined) delete process.env.AMAP_WEB_KEY;
  else process.env.AMAP_WEB_KEY = originalWebKey;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("campus map AMap same-origin service", () => {
  it("rejects an anonymous request before contacting AMap", async () => {
    mockGetOptionalUser.mockResolvedValueOnce(null);

    const response = await GET(
      reverseGeocodeRequest(),
      context("v3", "geocode", "regeo"),
    );

    expect(response.status).toBe(401);
    expect(fetch).not.toHaveBeenCalled();
    expect(await response.text()).not.toContain("server-only-security-code");
  });

  it("forwards an allowed SDK request only to the fixed AMap upstream", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{"status":"1","info":"OK"}', {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const response = await GET(
      reverseGeocodeRequest({
        headers: {
          Authorization: "Bearer client-secret",
          Cookie: "session=client-secret",
          "X-Forwarded-Host": "evil.example",
        },
      }),
      context("v3", "geocode", "regeo"),
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [upstream, options] = vi.mocked(fetch).mock.calls[0]!;
    const upstreamUrl = new URL(String(upstream));
    expect(upstreamUrl.origin).toBe("https://restapi.amap.com");
    expect(upstreamUrl.pathname).toBe("/v3/geocode/regeo");
    expect(upstreamUrl.searchParams.get("location")).toBe("114.2,22.4");
    expect(upstreamUrl.searchParams.get("jscode")).toBe(
      "server-only-security-code",
    );
    expect(options).toMatchObject({ method: "GET", redirect: "error" });
    expect(timeout).toHaveBeenCalledWith(5_000);
    expect(options?.headers).toEqual({
      Accept: "application/json, text/javascript",
    });
    expect(await response.text()).toBe('{"status":"1","info":"OK"}');
  });

  it("forwards only the coordinate-conversion parameters used by the SDK", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{"status":"1","locations":"114.2,22.4"}'),
    );

    const response = await GET(
      coordinateConvertRequest(),
      context("v3", "assistant", "coordinate", "convert"),
    );

    expect(response.status).toBe(200);
    const [upstream] = vi.mocked(fetch).mock.calls[0]!;
    const upstreamUrl = new URL(String(upstream));
    expect([...upstreamUrl.searchParams.keys()]).toEqual([
      "platform",
      "s",
      "s",
      "logversion",
      "key",
      "key",
      "sdkversion",
      "appname",
      "csid",
      "locations",
      "coordsys",
      "callback",
      "jscode",
    ]);
    expect(upstreamUrl.searchParams.get("jscode")).toBe(
      "server-only-security-code",
    );
  });

  it("forwards the semicolon-separated coordinate batches emitted by the SDK", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response('{"status":"1","locations":"114.2,22.4"}'),
    );

    const response = await GET(
      coordinateConvertRequest(
        "114.2083333333,22.41819984;114.2077777778,22.4191666667",
      ),
      context("v3", "assistant", "coordinate", "convert"),
    );

    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects a coordinate batch larger than the SDK limit", async () => {
    const response = await GET(
      coordinateConvertRequest(
        Array.from(
          { length: 41 },
          (_, index) => `${114.2 + index / 100_000},22.4`,
        ).join(";"),
      ),
      context("v3", "assistant", "coordinate", "convert"),
    );

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects a reverse-geocoding language the runtime does not use", async () => {
    const response = await GET(
      reverseGeocodeRequest(undefined, "en"),
      context("v3", "geocode", "regeo"),
    );

    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: "an unsupported path",
      url: "v3/place/text?keywords=library",
      path: ["v3", "place", "text"],
      status: 404,
    },
    {
      name: "path traversal",
      url: "v3/geocode/regeo",
      path: ["v3", "..", "geocode", "regeo"],
      status: 404,
    },
    {
      name: "an arbitrary upstream",
      url: "v3/geocode/regeo?url=https%3A%2F%2Fevil.example",
      path: ["v3", "geocode", "regeo"],
      status: 400,
    },
    {
      name: "a client-supplied security code",
      url: "v3/geocode/regeo?jscode=client-secret",
      path: ["v3", "geocode", "regeo"],
      status: 400,
    },
    {
      name: "an unknown reverse-geocoding parameter",
      url: "v3/geocode/regeo?location=114.2%2C22.4&unexpected=value",
      path: ["v3", "geocode", "regeo"],
      status: 400,
    },
    {
      name: "a coordinate-conversion parameter on reverse geocoding",
      url: "v3/geocode/regeo?location=114.2%2C22.4&coordsys=gps",
      path: ["v3", "geocode", "regeo"],
      status: 400,
    },
    {
      name: "a reverse-geocoding parameter on coordinate conversion",
      url: "v3/assistant/coordinate/convert?locations=114.2%2C22.4&radius=150",
      path: ["v3", "assistant", "coordinate", "convert"],
      status: 400,
    },
    {
      name: "an empty reverse-geocoding payload",
      url: "v3/geocode/regeo",
      path: ["v3", "geocode", "regeo"],
      status: 400,
    },
    {
      name: "a request using a different Web Key",
      url: "v3/geocode/regeo?key=another-key&location=114.2%2C22.4&radius=150&extensions=all",
      path: ["v3", "geocode", "regeo"],
      status: 400,
    },
    {
      name: "a duplicate reverse-geocoding location",
      url: "v3/geocode/regeo?key=public-web-key&location=114.2%2C22.4&location=114.3%2C22.5&radius=150&extensions=all",
      path: ["v3", "geocode", "regeo"],
      status: 400,
    },
    {
      name: "a reverse-geocoding coordinate outside the world",
      url: "v3/geocode/regeo?key=public-web-key&location=999%2C999&radius=150&extensions=all",
      path: ["v3", "geocode", "regeo"],
      status: 400,
    },
    {
      name: "a reverse-geocoding radius outside the runtime contract",
      url: "v3/geocode/regeo?key=public-web-key&location=114.2%2C22.4&radius=3000&extensions=all",
      path: ["v3", "geocode", "regeo"],
      status: 400,
    },
    {
      name: "a coordinate conversion from an unused coordinate system",
      url: "v3/assistant/coordinate/convert?key=public-web-key&locations=114.2%2C22.4&coordsys=baidu",
      path: ["v3", "assistant", "coordinate", "convert"],
      status: 400,
    },
  ])("rejects $name before contacting AMap", async ({ url, path, status }) => {
    const response = await GET(request(url), context(...path));

    expect(response.status).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
    const body = await response.text();
    expect(body).not.toContain("server-only-security-code");
    expect(body).not.toContain("client-secret");
    expect(body).not.toContain("evil.example");
  });

  it("rejects methods the SDK does not need", async () => {
    const handlers = [HEAD, POST, PUT, PATCH, DELETE, OPTIONS];

    for (const handler of handlers) {
      const response = await handler();
      expect(response.status).toBe(405);
      expect(response.headers.get("Allow")).toBe("GET");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("limits request and upstream response sizes", async () => {
    const oversizedRequest = await GET(
      request(`v3/geocode/regeo?location=${"1".repeat(8_193)}`),
      context("v3", "geocode", "regeo"),
    );
    expect(oversizedRequest.status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();

    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(new Uint8Array(1_048_577), {
        headers: { "Content-Type": "application/json" },
      }),
    );
    const oversizedResponse = await GET(
      reverseGeocodeRequest(),
      context("v3", "geocode", "regeo"),
    );
    expect(oversizedResponse.status).toBe(502);
    expect(await oversizedResponse.text()).toBe(
      '{"error":"AMap service unavailable"}',
    );
  });

  it("returns a generic error without logging or echoing secrets", async () => {
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response("upstream echoed server-only-security-code", {
        status: 200,
      }),
    );

    const upstreamFailure = await GET(
      reverseGeocodeRequest(),
      context("v3", "geocode", "regeo"),
    );

    expect(upstreamFailure.status).toBe(502);
    expect(await upstreamFailure.text()).toBe(
      '{"error":"AMap service unavailable"}',
    );
    expect(consoleError).not.toHaveBeenCalled();

    vi.mocked(fetch).mockRejectedValueOnce(
      new Error("timeout with server-only-security-code"),
    );
    const timeout = await GET(
      reverseGeocodeRequest(),
      context("v3", "geocode", "regeo"),
    );
    expect(timeout.status).toBe(502);
    expect(await timeout.text()).not.toContain("server-only-security-code");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
