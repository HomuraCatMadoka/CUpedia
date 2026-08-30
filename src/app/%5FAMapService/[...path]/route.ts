import { NextRequest, NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

const responseHeaders = { "Cache-Control": "no-store" };
const AMAP_UPSTREAM = "https://restapi.amap.com";
const MAX_REQUEST_QUERY_BYTES = 8_192;
const MAX_RESPONSE_BYTES = 1_048_576;
const ALLOWED_PATHS = new Set([
  "v3/assistant/coordinate/convert",
  "v3/geocode/regeo",
]);
const FORBIDDEN_QUERY_KEYS = new Set([
  "host",
  "hostname",
  "jscode",
  "proxy",
  "scode",
  "securitycode",
  "securityjscode",
  "target",
  "upstream",
  "uri",
  "url",
]);

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

export function POST() {
  return NextResponse.json(
    { error: "method not allowed" },
    { status: 405, headers: { ...responseHeaders, Allow: "GET" } },
  );
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const user = await getOptionalUser();
  if (!user) return errorResponse(401, "authentication required");

  const { path } = await context.params;
  const upstreamPath = path.join("/");
  if (!ALLOWED_PATHS.has(upstreamPath)) {
    return errorResponse(404, "unsupported AMap service path");
  }

  if (
    new TextEncoder().encode(request.nextUrl.search).byteLength >
    MAX_REQUEST_QUERY_BYTES
  ) {
    return errorResponse(413, "AMap service request too large");
  }

  if (
    [...request.nextUrl.searchParams.keys()].some((key) =>
      FORBIDDEN_QUERY_KEYS.has(key.toLowerCase()),
    )
  ) {
    return errorResponse(400, "unsupported AMap service request");
  }

  const securityCode = process.env.AMAP_SECURITY_JS_CODE;
  if (!securityCode) return errorResponse(503, "AMap service unavailable");

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
