import { NextRequest, NextResponse } from "next/server";
import { getCanteenById, getCanteenMenuItems } from "@/lib/canteen-actions";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const canteen = await getCanteenById(id);
  if (!canteen) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const items = await getCanteenMenuItems(id);
  return NextResponse.json({ canteen, items });
}
