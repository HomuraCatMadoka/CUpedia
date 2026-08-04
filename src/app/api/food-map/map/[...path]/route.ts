const OPEN_FREE_MAP_ORIGIN = "https://tiles.openfreemap.org";
const PROXY_PATH = "/api/food-map/map";
// Keep this narrow: the endpoint exists only to make the map resource chain
// same-origin, not to expose a general-purpose proxy.
const ALLOWED_ROOTS = new Set([
  "fonts",
  "natural_earth",
  "planet",
  "sprites",
  "styles",
]);

function isValidPath(path: string[]) {
  return (
    path.length > 0 &&
    ALLOWED_ROOTS.has(path[0]) &&
    path.every(
      (segment) =>
        segment.length > 0 &&
        segment !== "." &&
        segment !== ".." &&
        !segment.includes("/") &&
        !segment.includes("\\"),
    )
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  if (!isValidPath(path)) {
    return Response.json({ error: "Invalid map resource" }, { status: 400 });
  }

  const upstreamUrl = new URL(
    path.map(encodeURIComponent).join("/"),
    `${OPEN_FREE_MAP_ORIGIN}/`,
  );
  upstreamUrl.search = new URL(request.url).search;

  try {
    const upstream = await fetch(upstreamUrl, {
      next: { revalidate: 86_400 },
    });

    if (!upstream.ok) {
      return Response.json(
        { error: "Map resource unavailable" },
        { status: upstream.status === 404 ? 404 : 502 },
      );
    }

    const contentType =
      upstream.headers.get("content-type") ?? "application/octet-stream";
    const isJson = contentType.includes("json");
    const body = isJson
      ? (await upstream.text()).replaceAll(
          OPEN_FREE_MAP_ORIGIN,
          `${new URL(request.url).origin}${PROXY_PATH}`,
        )
      : await upstream.arrayBuffer();

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": isJson
          ? "public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800"
          : "public, max-age=86400, s-maxage=604800, stale-while-revalidate=2592000",
      },
    });
  } catch {
    return Response.json(
      { error: "Map resource unavailable" },
      { status: 502 },
    );
  }
}
