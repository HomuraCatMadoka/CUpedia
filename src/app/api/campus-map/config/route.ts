import { NextResponse } from "next/server";
import { getOptionalUser } from "@/lib/auth-guard";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getOptionalUser();
  if (!user) {
    return NextResponse.json(
      { configured: false },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

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
