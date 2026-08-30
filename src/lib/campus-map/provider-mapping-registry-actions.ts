"use server";

import { getOptionalUser } from "@/lib/auth-guard";
import {
  commandCampusMapProviderMapping,
  type CampusMapProviderMappingCommand,
  type CampusMapProviderMappingCommandResult,
} from "@/lib/campus-map/provider-mapping-registry";

/** Clients provide explicit intent; authenticated identity is server-owned. */
export async function commandCampusMapProviderMappingAction(
  command: CampusMapProviderMappingCommand,
): Promise<CampusMapProviderMappingCommandResult> {
  const user = await getOptionalUser();
  return commandCampusMapProviderMapping(command, {
    actorId: user?.id ?? null,
  });
}
