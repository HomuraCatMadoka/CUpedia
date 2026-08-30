"use server";

import { headers } from "next/headers";

import { getOptionalUser } from "@/lib/auth-guard";
import { commandCampusMapModeration } from "@/lib/campus-map/moderation-governance";
import type {
  CampusMapModerationCommand,
  CampusMapModerationCommandResult,
} from "@/lib/campus-map/moderation-governance-contract";
import { requestClientIp } from "@/lib/campus-map/request-client-ip";

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
    clientIp: requestClientIp(requestHeaders),
  });
}
