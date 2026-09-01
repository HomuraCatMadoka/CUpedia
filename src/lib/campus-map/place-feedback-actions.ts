"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { getAuthenticatedUserStateForApi } from "@/lib/auth-guard";
import {
  commandCampusMapModeration,
  type CampusMapReportSignal,
} from "@/lib/campus-map/moderation-governance";
import {
  commandCampusMapPlaceFeedback,
  type CampusMapPlaceFeedbackCommand,
  type CampusMapPlaceFeedbackCommandResult,
} from "@/lib/campus-map/place-feedback";
import { requestClientIp } from "@/lib/campus-map/request-client-ip";

export async function runCampusMapPlaceFeedbackAction(
  command: CampusMapPlaceFeedbackCommand,
): Promise<CampusMapPlaceFeedbackCommandResult> {
  const viewer = await getAuthenticatedUserStateForApi();
  const result = await commandCampusMapPlaceFeedback(command, {
    actorId: viewer?.id ?? null,
  });
  if (
    result.status === "created" ||
    result.status === "updated" ||
    result.status === "deleted"
  ) {
    const placeId =
      result.status === "deleted" ? result.placeId : result.feedback.placeId;
    revalidatePath("/campus-map");
    revalidatePath(`/campus-map/places/${placeId}`);
  }
  return result;
}

export async function reportCampusMapPlaceFeedback(input: {
  feedbackId: string;
  signal: CampusMapReportSignal;
  details: string;
  idempotencyKey: string;
}) {
  const [viewer, requestHeaders] = await Promise.all([
    getAuthenticatedUserStateForApi(),
    headers(),
  ]);
  return commandCampusMapModeration(
    {
      kind: "report",
      idempotencyKey: input.idempotencyKey,
      target: { kind: "place-feedback", id: input.feedbackId },
      signal: input.signal,
      details: input.details,
      evidence: null,
    },
    {
      actorId: viewer?.id ?? null,
      clientIp: requestClientIp(requestHeaders),
    },
  );
}

export async function hideCampusMapPlaceFeedback(input: {
  feedbackId: string;
  reason: string;
  idempotencyKey: string;
  placeId: string;
}) {
  const [viewer, requestHeaders] = await Promise.all([
    getAuthenticatedUserStateForApi(),
    headers(),
  ]);
  const result = await commandCampusMapModeration(
    {
      kind: "hide-place-feedback",
      idempotencyKey: input.idempotencyKey,
      feedbackId: input.feedbackId,
      expectedVisibility: "public",
      reason: input.reason,
      caseId: null,
    },
    {
      actorId: viewer?.id ?? null,
      clientIp: requestClientIp(requestHeaders),
    },
  );
  if (result.status === "decided") {
    revalidatePath("/campus-map");
    revalidatePath(`/campus-map/places/${input.placeId}`);
  }
  return result;
}
