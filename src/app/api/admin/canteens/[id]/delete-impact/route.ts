import { NextRequest, NextResponse } from "next/server";
import { getCanteenDeleteImpact } from "@/lib/canteen-admin-actions";
import { requireAdminApi } from "@/lib/admin-api";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminApi();
  if (auth.response) return auth.response;
  const { id } = await context.params;
  try {
    const impact = await getCanteenDeleteImpact(id);
    return NextResponse.json({ impact });
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
}
