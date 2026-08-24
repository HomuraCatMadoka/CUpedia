"use server";

import { headers } from "next/headers";

import { getOptionalUser } from "@/lib/auth-guard";
import { publishCampusMapChangeset } from "@/lib/campus-map/publish";
import type {
  CampusMapPublishCommand,
  CampusMapPublishResult,
} from "@/lib/campus-map/publish-contract";

function requestClientIp(requestHeaders: Headers): string {
  const forwarded = requestHeaders
    .get("x-forwarded-for")
    ?.split(",")[0]
    ?.trim();
  return forwarded || requestHeaders.get("x-real-ip")?.trim() || "unknown";
}

/** Thin trusted-context adapter; #718 remains the only publish implementation. */
export async function publishCampusMapEdit(
  command: CampusMapPublishCommand,
): Promise<CampusMapPublishResult> {
  const [user, requestHeaders] = await Promise.all([
    getOptionalUser(),
    headers(),
  ]);
  return publishCampusMapChangeset(command, {
    actorId: user?.id ?? null,
    clientIp: requestClientIp(requestHeaders),
  });
}
