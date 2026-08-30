import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

type CampusMapAmapConfig =
  | { configured: false }
  | { configured: true; key: string; serviceHost: "/_AMapService" };

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function GET() {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json<CampusMapAmapConfig>(
      { configured: false },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const key = process.env.AMAP_WEB_KEY;
  const securityCode = process.env.AMAP_SECURITY_JS_CODE;

  if (!key || !securityCode) {
    return NextResponse.json<CampusMapAmapConfig>(
      { configured: false },
      { status: 503, headers: noStoreHeaders },
    );
  }

  return NextResponse.json<CampusMapAmapConfig>(
    { configured: true, key, serviceHost: "/_AMapService" },
    { headers: noStoreHeaders },
  );
}
