import { NextRequest, NextResponse } from "next/server";
import { getMenuItemDeleteImpact } from "@/lib/canteen-admin-actions";
import { requireAdminApi } from "@/lib/admin-api";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const { itemId } = await context.params;
  try {
    const impact = await getMenuItemDeleteImpact(itemId);
    return NextResponse.json({ impact });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
