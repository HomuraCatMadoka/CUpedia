import { NextRequest, NextResponse } from "next/server";
import { getCanteenById } from "@/lib/canteen-actions";
import { deleteCanteen, updateCanteen } from "@/lib/canteen-admin-actions";
import { getAdminUserForApi } from "@/lib/auth-guard";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const canteen = await getCanteenById(id);
  if (!canteen) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ canteen });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const input = body as {
    name?: unknown;
    location?: unknown;
    announcement?: unknown;
  };
  try {
    const canteen = await updateCanteen(id, {
      name: input.name,
      location: input.location,
      announcement: input.announcement,
    });
    return NextResponse.json({ canteen });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bad request";
    if (message === "CANTEEN_NOT_FOUND") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
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

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  try {
    await deleteCanteen(id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Bad request";
    if (message === "CANTEEN_NOT_FOUND") {
      return NextResponse.json({ error: message }, { status: 404 });
    }
    throw e;
  }
}
