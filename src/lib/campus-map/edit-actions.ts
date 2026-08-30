"use server";

import { headers } from "next/headers";

import { getOptionalUser, requireAuth } from "@/lib/auth-guard";
import { getCampusMapCurrentPlace } from "@/lib/campus-map/fact-store";
import {
  publishCampusMapChangeset,
  reconcileCampusMapPublishReceipt,
} from "@/lib/campus-map/publish";
import type {
  CampusMapPublishActorIdentity,
  CampusMapPublishReconciliation,
  CampusMapPublishTransportResult,
} from "@/lib/campus-map/publish-receipt-consumer";
import type { CampusMapIndoorLocationDisplay } from "@/lib/campus-map/edit-session";
import type {
  CampusMapPublishCommand,
  CampusMapPublishFactInput,
} from "@/lib/campus-map/publish-contract";
import { requestClientIp } from "@/lib/campus-map/request-client-ip";

export interface CampusMapEditablePlace {
  placeId: string;
  baseRevisionId: string;
  fact: CampusMapPublishFactInput;
  locationDisplay: CampusMapIndoorLocationDisplay | null;
}

/** Reads #717's canonical current fact; it never derives facts from map shapes. */
export async function loadCampusMapEditablePlace(
  placeId: string,
): Promise<CampusMapEditablePlace | null> {
  await requireAuth();
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
  const locationDisplay: CampusMapIndoorLocationDisplay | null =
    place.location.kind === "outdoor-point"
      ? null
      : {
          buildingId: place.location.building.id,
          buildingName: place.location.building.name,
          floorId:
            place.location.kind === "floor" ? place.location.floor.id : null,
          floorLabel:
            place.location.kind === "floor"
              ? place.location.floor.displayLabel
              : null,
        };
  return {
    placeId: place.id,
    baseRevisionId: place.revisionId,
    locationDisplay,
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

/** Thin trusted-context adapter; #718 remains the only publish implementation. */
export async function publishCampusMapEdit(
  command: CampusMapPublishCommand,
  expectedActorId: string,
): Promise<CampusMapPublishTransportResult> {
  const [user, requestHeaders] = await Promise.all([
    getOptionalUser(),
    headers(),
  ]);
  if (!user) {
    return {
      status: "authentication-required",
      code: "authentication-required",
    };
  }
  if (user.id !== expectedActorId) return { status: "identity-mismatch" };
  return publishCampusMapChangeset(command, {
    actorId: user.id,
    clientIp: requestClientIp(requestHeaders),
  });
}

/** Reconciles the original command identity without creating another request. */
export async function reconcileCampusMapEditPublish(
  command: CampusMapPublishCommand,
  expectedActorId: string,
): Promise<CampusMapPublishReconciliation> {
  const user = await getOptionalUser();
  if (!user) return { status: "authentication-required" };
  if (user.id !== expectedActorId) return { status: "identity-mismatch" };
  try {
    return await reconcileCampusMapPublishReceipt(command, user.id);
  } catch {
    return { status: "unavailable" };
  }
}

/** Returns only the current actor's own stable identity for recovery binding. */
export async function identifyCampusMapEditPublisher(): Promise<CampusMapPublishActorIdentity> {
  try {
    const user = await getOptionalUser();
    return user
      ? { status: "authenticated", actorId: user.id }
      : { status: "authentication-required" };
  } catch {
    return { status: "unavailable" };
  }
}
