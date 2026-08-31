"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getAuthenticatedUserStateForApi } from "@/lib/auth-guard";
import { isCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import type { CampusMapLifecycleOperationIdentity } from "@/lib/campus-map/place-lifecycle-source";
import { governCampusMapFacts } from "@/lib/campus-map/publish";
import type { CampusMapPublishResult } from "@/lib/campus-map/publish-contract";
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

  const requestHeaders = await headers();
  const result = await governCampusMapFacts(
    {
      kind: operation,
      idempotencyKey: input.idempotencyKey,
      reason: input.reason,
      client: CLIENT,
      placeId: input.placeId,
      baseRevisionId: input.baseRevisionId,
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
