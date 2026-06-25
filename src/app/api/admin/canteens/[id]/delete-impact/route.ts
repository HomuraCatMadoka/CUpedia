import { NextRequest, NextResponse } from "next/server";
import { getCanteenDeleteImpact } from "@/lib/canteen-admin-actions";
import { getAdminUserForApi } from "@/lib/auth-guard";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!(await getAdminUserForApi())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await context.params;
  const impact = await getCanteenDeleteImpact(id);
  return NextResponse.json({ impact });
}
