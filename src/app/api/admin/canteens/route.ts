import { NextRequest, NextResponse } from "next/server";
import { getCanteens } from "@/lib/canteen-actions";
import { createCanteen } from "@/lib/canteen-admin-actions";
import { getAdminUserForApi } from "@/lib/auth-guard";

export async function GET() {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const canteens = await getCanteens();
  return NextResponse.json({ canteens });
}

export async function POST(request: NextRequest) {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const input = body as {
    name?: unknown;
    location?: unknown;
    announcement?: unknown;
  };
  if (input.name === undefined) {
    return NextResponse.json({ error: "INVALID_NAME" }, { status: 400 });
  }
  try {
    const canteen = await createCanteen({
      name: input.name,
      location: input.location,
      announcement: input.announcement,
    });
    return NextResponse.json({ canteen }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bad request";
    if (
      message === "INVALID_NAME" ||
      message === "INVALID_LOCATION" ||
      message === "INVALID_ANNOUNCEMENT"
    ) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    throw e;
  }
}
