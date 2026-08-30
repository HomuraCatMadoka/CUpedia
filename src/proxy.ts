import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  CAMPUS_MAP_RETURN_PATH_HEADER,
  getCampusMapReturnPath,
} from "@/lib/campus-map/auth-return-path";

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    CAMPUS_MAP_RETURN_PATH_HEADER,
    getCampusMapReturnPath(request.url),
  );

  return NextResponse.next({ request: { headers: requestHeaders } });
}

export const config = {
  matcher: "/campus-map/:path*",
};
