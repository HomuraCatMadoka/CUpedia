import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import transition102830Json from "../../docs/operations/artifacts/aigens-102830-identity-transition-v5.json";
import transition112891Json from "../../docs/operations/artifacts/aigens-112891-identity-transition-v4.json";
import transition4898Json from "../../docs/operations/artifacts/pinme-4898-identity-transition-v5.json";
import { db } from "@/db";
import {
  canteenMenuSources,
  type CanteenMenuSourceProvider,
} from "@/db/schema";
import { parseMenuIdentityTransitionArtifact } from "./canteen-menu-identity-transition";
import { fetchMenuFromProvider } from "./canteen-menu-source-adapters";
import {
  type MenuSourceSyncResult,
  syncCanteenMenuSource,
} from "./canteen-menu-source-sync";
import { applyApprovedMenuIdentityTransition } from "./canteen-menu-sync-store";
import { normalizeSyncErrorCode } from "./sync-error-code";

const REVIEWED_TRANSITIONS = {
  "aigens-102830": parseMenuIdentityTransitionArtifact(transition102830Json),
  "aigens-112891": parseMenuIdentityTransitionArtifact(transition112891Json),
  "pinme-4898": parseMenuIdentityTransitionArtifact(transition4898Json),
} as const;

export type ReviewedIdentityTransitionKey = keyof typeof REVIEWED_TRANSITIONS;

export type ReviewedIdentityTransitionOption = {
  key: ReviewedIdentityTransitionKey;
  provider: CanteenMenuSourceProvider;
  externalStoreId: string;
  existingCount: number;
  incomingCount: number;
  canonicalizationCount: number;
  mergeCount: number;
  additionCount: number;
  removalCount: number;
};

export type ReviewedIdentityTransitionExecution = {
  sourceId: string;
  transition: {
    status: "applied" | "unchanged";
    itemCount: number;
    createdCount: number;
    updatedCount: number;
    deactivatedCount: number;
  };
  retry: Pick<MenuSourceSyncResult, "status" | "code"> & {
    itemCount?: number;
  };
};

export function isReviewedIdentityTransitionKey(
  value: unknown,
): value is ReviewedIdentityTransitionKey {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(REVIEWED_TRANSITIONS, value)
  );
}

function artifactFor(key: ReviewedIdentityTransitionKey) {
  return REVIEWED_TRANSITIONS[key];
}

export function listReviewedIdentityTransitions(): ReviewedIdentityTransitionOption[] {
  return (
    Object.keys(REVIEWED_TRANSITIONS) as ReviewedIdentityTransitionKey[]
  ).map((key) => {
    const artifact = artifactFor(key);
    return {
      key,
      provider: artifact.source.provider,
      externalStoreId: artifact.source.externalStoreId,
      existingCount: artifact.audit.summary.existingCount,
      incomingCount: artifact.audit.summary.incomingCount,
      canonicalizationCount:
        artifact.audit.summary.canonicalizationCandidateCount,
      mergeCount: artifact.audit.summary.mergeCandidateCount,
      additionCount: artifact.audit.summary.additionCount,
      removalCount: artifact.audit.summary.removalCount,
    };
  });
}

export async function executeReviewedIdentityTransition(
  key: ReviewedIdentityTransitionKey,
): Promise<ReviewedIdentityTransitionExecution> {
  const artifact = artifactFor(key);
  const source = await db.query.canteenMenuSources.findFirst({
    where: and(
      eq(canteenMenuSources.provider, artifact.source.provider),
      eq(canteenMenuSources.externalStoreId, artifact.source.externalStoreId),
      artifact.source.externalOwnerId === null
        ? isNull(canteenMenuSources.externalOwnerId)
        : eq(
            canteenMenuSources.externalOwnerId,
            artifact.source.externalOwnerId,
          ),
    ),
  });
  if (!source) throw new Error("MENU_SOURCE_NOT_FOUND");

  const fetched = await fetchMenuFromProvider(source);
  const evaluation = await applyApprovedMenuIdentityTransition(
    source.id,
    { ...fetched, takeOverLegacyItems: false },
    artifact,
  );
  const actions = evaluation.plan.actions;
  let retry: ReviewedIdentityTransitionExecution["retry"];
  try {
    const result = await syncCanteenMenuSource(source.id);
    retry = {
      status: result.status,
      code: result.code,
      ...(result.status === "applied" || result.status === "unchanged"
        ? { itemCount: result.itemCount }
        : {}),
    };
  } catch (error) {
    retry = {
      status: "internal-failure",
      code: normalizeSyncErrorCode(
        error instanceof Error ? error.message : undefined,
      ) as MenuSourceSyncResult["code"],
    };
  }

  return {
    sourceId: source.id,
    transition: {
      status: actions.length === 0 ? "unchanged" : "applied",
      itemCount: evaluation.canonicalState.input.items.length,
      createdCount: actions.filter((action) => action.action === "create")
        .length,
      updatedCount: actions.filter((action) =>
        ["update", "reactivate", "claim"].includes(action.action),
      ).length,
      deactivatedCount: actions.filter(
        (action) => action.action === "deactivate",
      ).length,
    },
    retry,
  };
}
