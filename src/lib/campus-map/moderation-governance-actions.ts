"use server";

import { headers } from "next/headers";

import { getOptionalUser } from "@/lib/auth-guard";
import { commandCampusMapModeration } from "./moderation-governance";
import type {
  CampusMapModerationCommand,
  CampusMapModerationCommandResult,
} from "./moderation-governance-contract";

/** Supplies authenticated identity and network context; clients send intent only. */
export async function commandCampusMapModerationAction(
  command: CampusMapModerationCommand,
): Promise<CampusMapModerationCommandResult> {
  const [user, requestHeaders] = await Promise.all([
    getOptionalUser(),
    headers(),
  ]);
  return commandCampusMapModeration(command, {
    actorId: user?.id ?? null,
    clientIp:
      requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      requestHeaders.get("x-real-ip")?.trim() ||
      "127.0.0.1",
  });
}
