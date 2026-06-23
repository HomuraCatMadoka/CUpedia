import { NextRequest, NextResponse } from "next/server";
import { getCanteens } from "@/lib/canteen-actions";
import { createCanteen } from "@/lib/canteen-admin-actions";
import { requireAdminApi } from "@/lib/admin-api";

export async function GET() {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const canteens = await getCanteens();
  return NextResponse.json({ canteens });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = body as { name?: unknown; location?: unknown };
  try {
    const canteen = await createCanteen(input);
    return NextResponse.json({ canteen }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bad request";
    if (message === "INVALID_NAME" || message === "INVALID_LOCATION") {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    throw e;
  }
}
