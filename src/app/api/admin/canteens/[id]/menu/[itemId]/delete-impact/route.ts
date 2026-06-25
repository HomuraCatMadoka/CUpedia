import { NextRequest, NextResponse } from "next/server";
import { getMenuItemDeleteImpact } from "@/lib/canteen-admin-actions";
import { getAdminUserForApi } from "@/lib/auth-guard";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string; itemId: string }> },
) {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { itemId } = await context.params;
  const impact = await getMenuItemDeleteImpact(itemId);
  return NextResponse.json({ impact });
}
