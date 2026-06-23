import { NextResponse } from "next/server";
import { getAdminUserForApi } from "@/lib/auth-guard-api";

export async function requireAdminApi() {
  const user = await getAdminUserForApi();
  if (!user) {
    return {
      user: null as null,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { user, response: null as null };
}
