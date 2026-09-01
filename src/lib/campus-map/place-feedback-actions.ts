"use server";

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
  type CampusMapPlaceFeedbackPage,
  getCampusMapPlaceFeedbackPage,
  getCampusMapPlaceFeedbackPageForFeedback,
} from "@/lib/campus-map/place-feedback";
import { requestClientIp } from "@/lib/campus-map/request-client-ip";

type CampusMapPlaceFeedbackActionSuccess = Extract<
  CampusMapPlaceFeedbackCommandResult,
  { status: "created" | "updated" | "deleted" }
> & { snapshot: CampusMapPlaceFeedbackPage };

export type CampusMapPlaceFeedbackActionResult =
  | Exclude<
      CampusMapPlaceFeedbackCommandResult,
      { status: "created" | "updated" | "deleted" }
    >
  | CampusMapPlaceFeedbackActionSuccess;

export async function runCampusMapPlaceFeedbackAction(
  command: CampusMapPlaceFeedbackCommand,
): Promise<CampusMapPlaceFeedbackActionResult> {
  const viewer = await getAuthenticatedUserStateForApi();
  const result = await commandCampusMapPlaceFeedback(command, {
    actorId: viewer?.id ?? null,
  });
  switch (result.status) {
    case "created":
    case "updated":
      return {
        ...result,
        snapshot: await getCampusMapPlaceFeedbackPage(result.feedback.placeId, {
          limit: 10,
        }),
      };
    case "deleted":
      return {
        ...result,
        snapshot: await getCampusMapPlaceFeedbackPage(result.placeId, {
          limit: 10,
        }),
      };
    default:
      return result;
  }
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
  if (result.status !== "decided") return result;
  return {
    ...result,
    snapshot: await getCampusMapPlaceFeedbackPageForFeedback(input.feedbackId, {
      limit: 10,
    }),
  };
}
