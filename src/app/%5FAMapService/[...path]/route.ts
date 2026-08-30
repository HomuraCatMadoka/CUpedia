import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store" };
const AMAP_UPSTREAM = "https://restapi.amap.com";
const MAX_REQUEST_QUERY_BYTES = 8_192;
const MAX_RESPONSE_BYTES = 1_048_576;
const SDK_METADATA_PARAMETER_COUNTS = {
  appname: 1,
  callback: 1,
  csid: 1,
  key: 2,
  logversion: 1,
  platform: 1,
  s: 2,
  sdkversion: 1,
} as const;
const REQUEST_PARAMETER_COUNTS_BY_PATH = new Map<
  string,
  Readonly<Record<string, number>>
>([
  [
    "v3/assistant/coordinate/convert",
    { ...SDK_METADATA_PARAMETER_COUNTS, coordsys: 1, locations: 1 },
  ],
  [
    "v3/geocode/regeo",
    {
      ...SDK_METADATA_PARAMETER_COUNTS,
      extensions: 1,
      location: 1,
      radius: 1,
    },
  ],
]);

function isCoordinatePair(value: string) {
  const parts = value.split(",");
  if (parts.length !== 2) return false;
  const [longitudeText, latitudeText] = parts;
  if (!longitudeText || !latitudeText) return false;
  const coordinatePart = /^-?\d+(?:\.\d{1,6})?$/;
  if (
    !coordinatePart.test(longitudeText) ||
    !coordinatePart.test(latitudeText)
  ) {
    return false;
  }
  const longitude = Number(longitudeText);
  const latitude = Number(latitudeText);
  return (
    longitude >= -180 && longitude <= 180 && latitude >= -90 && latitude <= 90
  );
}

function hasExpectedParameterCounts(
  searchParams: URLSearchParams,
  expectedCounts: Readonly<Record<string, number>>,
) {
  const expectedTotal = Object.values(expectedCounts).reduce(
    (total, count) => total + count,
    0,
  );
  return (
    [...searchParams.entries()].length === expectedTotal &&
    Object.entries(expectedCounts).every(
      ([key, count]) => searchParams.getAll(key).length === count,
    )
  );
}

function matchesRuntimePayload(
  upstreamPath: string,
  expectedCounts: Readonly<Record<string, number>>,
  searchParams: URLSearchParams,
  webKey: string,
  serviceOrigin: string,
) {
  if (!hasExpectedParameterCounts(searchParams, expectedCounts)) {
    return false;
  }
  if (!searchParams.getAll("key").every((value) => value === webKey)) {
    return false;
  }
  if (
    searchParams.get("platform") !== "JS" ||
    searchParams.get("logversion") !== "2.0" ||
    !/^\d+(?:\.\d+){1,3}$/.test(searchParams.get("sdkversion") ?? "") ||
    searchParams.get("appname") !==
      encodeURIComponent(`${serviceOrigin}/campus-map`) ||
    !/^[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}$/i.test(
      searchParams.get("csid") ?? "",
    ) ||
    !/^jsonp_\d+_\d+_$/.test(searchParams.get("callback") ?? "") ||
    !searchParams.getAll("s").every((value) => /^[A-Za-z0-9_-]{4}$/.test(value))
  ) {
    return false;
  }

  if (upstreamPath === "v3/assistant/coordinate/convert") {
    const locations = searchParams.get("locations")?.split("|") ?? [];
    return (
      locations.length > 0 &&
      locations.length <= 40 &&
      locations.every(isCoordinatePair) &&
      searchParams.get("coordsys") === "gps"
    );
  }

  return (
    isCoordinatePair(searchParams.get("location") ?? "") &&
    searchParams.get("radius") === "150" &&
    searchParams.get("extensions") === "all"
  );
}

function errorResponse(status: number, error: string) {
  return NextResponse.json({ error }, { status, headers: responseHeaders });
}

async function readLimitedBody(response: Response) {
  const declaredLength = Number(response.headers.get("Content-Length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_RESPONSE_BYTES) {
    return null;
  }
  if (!response.body) return new Uint8Array();

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

function methodNotAllowed() {
  return NextResponse.json(
    { error: "method not allowed" },
    { status: 405, headers: { ...responseHeaders, Allow: "GET" } },
  );
}

export const HEAD = methodNotAllowed;
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const OPTIONS = methodNotAllowed;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const user = await getOptionalUser();
  if (!user) return errorResponse(401, "authentication required");

  const { path } = await context.params;
  const upstreamPath = path.join("/");
  const expectedParameterCounts =
    REQUEST_PARAMETER_COUNTS_BY_PATH.get(upstreamPath);
  if (!expectedParameterCounts) {
    return errorResponse(404, "unsupported AMap service path");
  }

  if (
    new TextEncoder().encode(request.nextUrl.search).byteLength >
    MAX_REQUEST_QUERY_BYTES
  ) {
    return errorResponse(413, "AMap service request too large");
  }

  if (
    [...request.nextUrl.searchParams.keys()].some(
      (key) => !Object.hasOwn(expectedParameterCounts, key.toLowerCase()),
    )
  ) {
    return errorResponse(400, "unsupported AMap service request");
  }

  const webKey = process.env.AMAP_WEB_KEY;
  const securityCode = process.env.AMAP_SECURITY_JS_CODE;
  if (!webKey || !securityCode) {
    return errorResponse(503, "AMap service unavailable");
  }
  if (
    !matchesRuntimePayload(
      upstreamPath,
      expectedParameterCounts,
      request.nextUrl.searchParams,
      webKey,
      request.nextUrl.origin,
    )
  ) {
    return errorResponse(400, "unsupported AMap service request");
  }

  const upstreamUrl = new URL(`/${upstreamPath}`, AMAP_UPSTREAM);
  request.nextUrl.searchParams.forEach((value, key) => {
    upstreamUrl.searchParams.append(key, value);
  });
  upstreamUrl.searchParams.set("jscode", securityCode);

  try {
    const upstream = await fetch(upstreamUrl, {
      method: "GET",
      headers: { Accept: "application/json, text/javascript" },
      redirect: "error",
      signal: AbortSignal.timeout(5_000),
    });
    if (!upstream.ok) return errorResponse(502, "AMap service unavailable");
    const body = await readLimitedBody(upstream);
    if (!body) return errorResponse(502, "AMap service unavailable");
    if (new TextDecoder().decode(body).includes(securityCode)) {
      return errorResponse(502, "AMap service unavailable");
    }
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...responseHeaders,
        "Content-Type":
          upstream.headers.get("Content-Type") ?? "application/json",
      },
    });
  } catch {
    return errorResponse(502, "AMap service unavailable");
  }
}
