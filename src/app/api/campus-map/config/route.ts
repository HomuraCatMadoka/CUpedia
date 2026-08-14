import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  const key = process.env.AMAP_WEB_KEY;
  const securityCode = process.env.AMAP_SECURITY_JS_CODE;

  if (!key || !securityCode) {
    return NextResponse.json(
      { configured: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(
    { configured: true, key, securityCode },
    { headers: { "Cache-Control": "no-store" } },
  );
}
