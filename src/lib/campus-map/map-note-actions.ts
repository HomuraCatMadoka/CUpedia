"use server";

import { headers } from "next/headers";

import { getOptionalUser } from "@/lib/auth-guard";
import {
  commandCampusMapNote,
  setCampusMapNoteSubscription,
} from "@/lib/campus-map/map-notes";
import type {
  CampusMapNoteCommand,
  CampusMapNoteCommandResult,
} from "@/lib/campus-map/map-notes-contract";
import { requestClientIp } from "@/lib/campus-map/request-client-ip";

export async function commandCampusMapNoteAction(
  command: CampusMapNoteCommand,
): Promise<CampusMapNoteCommandResult> {
  const [user, requestHeaders] = await Promise.all([
    getOptionalUser(),
    headers(),
  ]);
  return commandCampusMapNote(command, {
    actorId: user?.id ?? null,
    clientIp: requestClientIp(requestHeaders),
  });
}

export async function setCampusMapNoteSubscriptionAction(
  noteId: string,
  subscribed: boolean,
) {
  const user = await getOptionalUser();
  return setCampusMapNoteSubscription(noteId, subscribed, user?.id ?? null);
}
