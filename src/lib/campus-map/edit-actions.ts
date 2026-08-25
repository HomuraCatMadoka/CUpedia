"use server";

import { headers } from "next/headers";

import { getOptionalUser } from "@/lib/auth-guard";
import { getCampusMapCurrentPlace } from "./fact-store";
import { publishCampusMapChangeset } from "./publish";
import type {
  CampusMapPublishFactInput,
  CampusMapPublishCommand,
  CampusMapPublishResult,
} from "./publish-contract";

export interface CampusMapEditablePlace {
  placeId: string;
  baseRevisionId: string;
  fact: CampusMapPublishFactInput;
}

/** Reads #717's canonical current fact; it never derives facts from map shapes. */
export async function loadCampusMapEditablePlace(
  placeId: string,
): Promise<CampusMapEditablePlace | null> {
  const place = await getCampusMapCurrentPlace(placeId);
  if (!place) return null;
  const buildingId =
    place.location.kind === "building" || place.location.kind === "floor"
      ? place.location.building.id
      : null;
  const floorId =
    place.location.kind === "floor" ? place.location.floor.id : null;
  const location: CampusMapPublishFactInput["location"] =
    place.location.kind === "outdoor-point"
      ? { kind: "outdoor-point", ...place.location.point }
      : place.location.kind === "floor"
        ? { kind: "floor" }
        : { kind: "building" };
  return {
    placeId: place.id,
    baseRevisionId: place.revisionId,
    fact: {
      name: place.name,
      buildingId,
      floorId,
      pinType: place.pinType,
      capabilities: place.capabilities,
      gender: place.facets.gender,
      wheelchairAccess: place.facets.wheelchairAccess,
      audience: place.access.audience,
      credentialRequirement: place.access.credentialRequirement,
      accessSchedule: place.access.schedule,
      reservationRequirement: place.access.reservationRequirement,
      temporaryStatus: place.access.temporaryStatus,
      location,
      observedAt: place.observedAt?.toISOString() ?? null,
    },
  };
}

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
