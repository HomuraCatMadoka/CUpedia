"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getAuthenticatedUserStateForApi } from "@/lib/auth-guard";
import { isCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import { getCampusMapPlaceRevision } from "@/lib/campus-map/fact-store";
import {
  createCampusMapLifecycleSource,
  type CampusMapLifecycleOperationIdentity,
} from "@/lib/campus-map/place-lifecycle-source";
import { publishCampusMapChangeset } from "@/lib/campus-map/publish";
import type {
  CampusMapPublishCommand,
  CampusMapPublishFactInput,
  CampusMapPublishResult,
} from "@/lib/campus-map/publish-contract";
import { requestClientIp } from "@/lib/campus-map/request-client-ip";

export interface CampusMapPlaceLifecycleInput extends CampusMapLifecycleOperationIdentity {
  placeId: string;
  baseRevisionId: string;
}

export type CampusMapPlaceLifecycleActionResult =
  | Extract<CampusMapPublishResult, { status: "published" }>
  | { status: "failed"; code: string };

const CLIENT = { name: "campus-map-place-lifecycle", version: "1" } as const;

/** Admin-only adapter. The publish seam remains the final authorization check. */
export async function retireCampusMapPlace(
  input: CampusMapPlaceLifecycleInput,
): Promise<CampusMapPublishResult> {
  return publishLifecycleChange("retire", input);
}

/** Restores the exact last public retired fact instead of trusting client data. */
export async function restoreCampusMapPlace(
  input: CampusMapPlaceLifecycleInput,
): Promise<CampusMapPublishResult> {
  return publishLifecycleChange("restore", input);
}

/** UI-friendly lifecycle entry point with one stable error shape. */
export async function runCampusMapPlaceLifecycleAction(
  input: CampusMapPlaceLifecycleInput & {
    operation: "retire" | "restore";
  },
): Promise<CampusMapPlaceLifecycleActionResult> {
  if (input.operation !== "retire" && input.operation !== "restore") {
    return { status: "failed", code: "operation-not-allowed" };
  }
  const result = await publishLifecycleChange(input.operation, input);
  if (result.status === "published") return result;
  if ("code" in result) return { status: "failed", code: result.code };
  return {
    status: "failed",
    code: result.errors[0]?.code ?? "validation-failed",
  };
}

async function publishLifecycleChange(
  operation: "retire" | "restore",
  input: CampusMapPlaceLifecycleInput,
): Promise<CampusMapPublishResult> {
  const user = await getAuthenticatedUserStateForApi();
  if (!user) {
    return {
      status: "authentication-required",
      code: "authentication-required",
    };
  }
  if (user.banned) {
    return { status: "forbidden", code: "actor-banned" };
  }
  if (user.role !== "admin") {
    return { status: "forbidden", code: "admin-required" };
  }

  const identityErrors = [];
  if (!isCampusMapUuid(input.placeId)) {
    identityErrors.push({
      code: "invalid-place-id",
      anchor: { changeIndex: 0, field: "placeId" },
    });
  }
  if (!isCampusMapUuid(input.baseRevisionId)) {
    identityErrors.push({
      code: "invalid-base-revision-id",
      anchor: { changeIndex: 0, field: "baseRevisionId" },
    });
  }
  if (identityErrors.length > 0) {
    return {
      status: "validation-failed",
      errors: identityErrors,
      warnings: [],
      suggestions: [],
    };
  }

  // Authorize before reading a client-selected historical revision. The
  // publish seam repeats the fresh role check immediately before the write.
  const [requestHeaders, baseRevision] = await Promise.all([
    headers(),
    getCampusMapPlaceRevision(input.placeId, input.baseRevisionId),
  ]);
  const source = createCampusMapLifecycleSource(input, user.id);
  let changes: CampusMapPublishCommand["changes"];

  if (operation === "restore") {
    const fact = restorationFact(baseRevision);
    if (!fact) return lifecycleSnapshotUnavailable(input.placeId);
    changes = [
      {
        operation: "restore",
        placeId: input.placeId,
        baseRevisionId: input.baseRevisionId,
        fact,
        sources: [source],
      },
    ];
  } else {
    changes = [
      {
        operation: "retire",
        placeId: input.placeId,
        baseRevisionId: input.baseRevisionId,
        sources: [source],
      },
    ];
  }

  const result = await publishCampusMapChangeset(
    {
      kind: "single",
      idempotencyKey: input.idempotencyKey,
      comment: input.reason,
      sourceSummary: "管理员地点生命周期操作",
      reviewRequested: false,
      client: CLIENT,
      warningAcknowledgements: [],
      changes,
    },
    {
      actorId: user?.id ?? null,
      clientIp: requestClientIp(requestHeaders),
    },
  );

  if (result.status === "published") {
    revalidatePath("/campus-map");
    revalidatePath(`/campus-map/places/${input.placeId}`);
    revalidatePath(`/campus-map/places/${input.placeId}/history`);
  }
  return result;
}

function restorationFact(
  revision: Awaited<ReturnType<typeof getCampusMapPlaceRevision>>,
): CampusMapPublishFactInput | null {
  if (!revision || revision.content.visibility !== "public") return null;
  const fact = revision.content.fact;
  let location: CampusMapPublishFactInput["location"];
  if (fact.locationKind === "building") {
    location = { kind: "building" };
  } else if (fact.locationKind === "floor") {
    location = { kind: "floor" };
  } else if (
    fact.locationKind === "outdoor-point" &&
    fact.longitude !== null &&
    fact.latitude !== null &&
    fact.coordinateCrs === "wgs84" &&
    fact.pointPrecision !== null
  ) {
    location = {
      kind: "outdoor-point",
      longitude: fact.longitude,
      latitude: fact.latitude,
      crs: "wgs84",
      precision: fact.pointPrecision,
    };
  } else {
    return null;
  }
  return {
    name: fact.name,
    buildingId: fact.buildingId,
    floorId: fact.floorId,
    pinType: fact.pinType,
    capabilities: fact.capabilities,
    gender: fact.gender,
    wheelchairAccess: fact.wheelchairAccess,
    audience: fact.audience,
    credentialRequirement: fact.credentialRequirement,
    accessSchedule: fact.accessSchedule,
    reservationRequirement: fact.reservationRequirement,
    temporaryStatus: fact.temporaryStatus,
    location,
    observedAt: fact.observedAt?.toISOString() ?? null,
  };
}

function lifecycleSnapshotUnavailable(placeId: string): CampusMapPublishResult {
  return {
    status: "validation-failed",
    errors: [
      {
        code: "lifecycle-base-revision-unavailable",
        anchor: { placeId, field: "baseRevisionId" },
      },
    ],
    warnings: [],
    suggestions: [],
  };
}
