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
} from "@/lib/campus-map/place-feedback";
import { requestClientIp } from "@/lib/campus-map/request-client-ip";

type CampusMapPlaceFeedbackActionSuccess = Extract<
  CampusMapPlaceFeedbackCommandResult,
  { status: "created" | "updated" | "deleted" }
> & { snapshot: CampusMapPlaceFeedbackPage | null };

export type CampusMapPlaceFeedbackActionResult =
  | Exclude<
      CampusMapPlaceFeedbackCommandResult,
      { status: "created" | "updated" | "deleted" }
    >
  | CampusMapPlaceFeedbackActionSuccess;

async function readFeedbackSnapshot(
  placeId: string,
  query: { cursor?: string | null } = {},
): Promise<CampusMapPlaceFeedbackPage | null> {
  try {
    return await getCampusMapPlaceFeedbackPage(placeId, {
      cursor: query.cursor,
      limit: 10,
    });
  } catch {
    // The command has already committed. A failed convenience read must not
    // turn that success into an error that encourages a duplicate retry.
    return null;
  }
}

type CampusMapPlaceFeedbackPageContext = {
  placeId?: string;
  cursor?: string | null;
};

export async function runCampusMapPlaceFeedbackAction(
  command: CampusMapPlaceFeedbackCommand,
  page: CampusMapPlaceFeedbackPageContext = {},
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
        snapshot: await readFeedbackSnapshot(
          page.placeId ?? result.feedback.placeId,
          page,
        ),
      };
    case "deleted":
      return {
        ...result,
        snapshot: await readFeedbackSnapshot(
          page.placeId ?? result.placeId,
          page,
        ),
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
  placeId: string;
  feedbackId: string;
  reason: string;
  idempotencyKey: string;
  reviewsAfter: string | null;
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
    // Keep the snapshot tied to the detail page that issued the command. The
    // feedback row may move or disappear immediately after moderation because
    // place merge and owner deletion are separate serialized workflows.
    snapshot: await readFeedbackSnapshot(input.placeId, {
      cursor: input.reviewsAfter,
    }),
  };
}
