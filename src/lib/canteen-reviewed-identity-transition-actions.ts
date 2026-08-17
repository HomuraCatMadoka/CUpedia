"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "./auth-guard";
import {
  executeReviewedIdentityTransition,
  isReviewedIdentityTransitionKey,
  listReviewedIdentityTransitions,
  type ReviewedIdentityTransitionExecution,
} from "./canteen-reviewed-identity-transition";
import { normalizeSyncErrorCode } from "./sync-error-code";

export type ExecuteReviewedIdentityTransitionResult =
  | { ok: true; execution: ReviewedIdentityTransitionExecution }
  | { ok: false; code: string };

export async function executeReviewedIdentityTransitionAction(
  input: unknown,
): Promise<ExecuteReviewedIdentityTransitionResult> {
  await requireAdmin();
  if (!input || typeof input !== "object") {
    return { ok: false, code: "REVIEWED_TRANSITION_NOT_ALLOWED" };
  }
  const { key, confirmation } = input as Record<string, unknown>;
  if (!isReviewedIdentityTransitionKey(key)) {
    return { ok: false, code: "REVIEWED_TRANSITION_NOT_ALLOWED" };
  }
  const option = listReviewedIdentityTransitions().find(
    (candidate) => candidate.key === key,
  );
  if (
    !option ||
    typeof confirmation !== "string" ||
    confirmation.trim() !== option.externalStoreId
  ) {
    return { ok: false, code: "REVIEWED_TRANSITION_CONFIRMATION_MISMATCH" };
  }

  try {
    const execution = await executeReviewedIdentityTransition(key);
    revalidatePath("/admin/canteen-sync");
    return { ok: true, execution };
  } catch (error) {
    return {
      ok: false,
      code: normalizeSyncErrorCode(
        error instanceof Error ? error.message : undefined,
      ),
    };
  }
}
