import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store" };
const AMAP_UPSTREAM = "https://restapi.amap.com";
const MAX_REQUEST_QUERY_BYTES = 8_192;
const MAX_RESPONSE_BYTES = 1_048_576;
const ALLOWED_QUERY_KEYS_BY_PATH = new Map<string, ReadonlySet<string>>([
  [
    "v3/assistant/coordinate/convert",
    new Set(["coordsys", "key", "locations"]),
  ],
  ["v3/geocode/regeo", new Set(["extensions", "key", "location", "radius"])],
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

function hasOneValueForEveryKey(
  searchParams: URLSearchParams,
  allowedKeys: ReadonlySet<string>,
) {
  return (
    [...searchParams.entries()].length === allowedKeys.size &&
    [...allowedKeys].every((key) => searchParams.getAll(key).length === 1)
  );
}

function matchesRuntimePayload(
  upstreamPath: string,
  searchParams: URLSearchParams,
  webKey: string,
) {
  const allowedKeys = ALLOWED_QUERY_KEYS_BY_PATH.get(upstreamPath);
  if (!allowedKeys || !hasOneValueForEveryKey(searchParams, allowedKeys)) {
    return false;
  }
  if (searchParams.get("key") !== webKey) return false;

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
  const allowedQueryKeys = ALLOWED_QUERY_KEYS_BY_PATH.get(upstreamPath);
  if (!allowedQueryKeys) {
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
      (key) => !allowedQueryKeys.has(key.toLowerCase()),
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
    !matchesRuntimePayload(upstreamPath, request.nextUrl.searchParams, webKey)
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
