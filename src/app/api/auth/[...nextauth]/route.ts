import { auth } from "@/lib/auth";
import { toNextJsHandler } from "better-auth/next-js";

const { GET: authGet, POST } = toNextJsHandler(auth);

export { POST };

function isGetSessionPath(pathname: string): boolean {
  return pathname === "/api/auth/get-session" || pathname.endsWith("/get-session");
}

/**
 * When Postgres is down, better-auth returns 500 for get-session and the
 * client throws Uncaught APIError — which breaks soft-nav into pages that
 * otherwise work in CANTEEN_MOCK_DATA mode. Treat session lookup failures as
 * "logged out" so public browsing stays usable offline.
 */
export async function GET(
  request: Request,
  context: { params: Promise<{ nextauth: string[] }> },
) {
  try {
    const response = await authGet(request, context);
    if (
      response.status >= 500 &&
      isGetSessionPath(new URL(request.url).pathname)
    ) {
      return Response.json(null);
    }
    return response;
  } catch (error) {
    if (isGetSessionPath(new URL(request.url).pathname)) {
      return Response.json(null);
    }
    throw error;
  }
}
