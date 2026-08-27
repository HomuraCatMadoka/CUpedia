import { createHash, randomUUID } from "node:crypto";

import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

import { db } from "@/db";
import {
  accounts,
  campusMapBuildings,
  campusMapCurrentFacts,
  campusMapPlaces,
  campusMapProviderMappingEvents,
  campusMapProviderMappingRequests,
  campusMapProviderMappings,
  campusMapProvenanceSources,
  campusMapRevisionVisibility,
  users,
} from "@/db/schema";
import { isCanonicalCampusMapUuid } from "./canonical-uuid";
import type { CampusMapSelectionTarget } from "./fact-store";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface CampusMapProviderIdentity {
  provider: string;
  providerObjectId: string;
}

export type CampusMapProviderMappingTarget =
  | { kind: "building"; buildingId: string }
  | { kind: "place"; placeId: string };

interface CampusMapProviderMappingCommandBase {
  idempotencyKey: string;
  identity: CampusMapProviderIdentity;
  reason: string;
  provenanceId: string;
}

export type CampusMapProviderMappingCommand =
  | (CampusMapProviderMappingCommandBase & {
      kind: "bind";
      target: CampusMapProviderMappingTarget;
    })
  | (CampusMapProviderMappingCommandBase & {
      kind: "unlink";
      previousTarget: CampusMapProviderMappingTarget;
    })
  | (CampusMapProviderMappingCommandBase & {
      kind: "rebind";
      previousTarget: CampusMapProviderMappingTarget;
      newTarget: CampusMapProviderMappingTarget;
    });

export type CampusMapProviderMappingCommandResult =
  | {
      status: "mapped";
      outcome: "bound" | "unlinked" | "rebound" | "unchanged";
      identity: CampusMapProviderIdentity;
      previousTarget: CampusMapProviderMappingTarget | null;
      target: CampusMapProviderMappingTarget | null;
      eventId: string | null;
    }
  | { status: "authentication-required"; code: "authentication-required" }
  | {
      status: "forbidden";
      code:
        | "actor-not-eligible"
        | "actor-banned"
        | "profile-incomplete"
        | "admin-required";
    }
  | {
      status: "validation-failed";
      errors: Array<{ code: string; field: string }>;
    }
  | {
      status: "not-found";
      code:
        | "mapping-target-not-found"
        | "mapping-target-kind-mismatch"
        | "mapping-provenance-not-found";
    }
  | {
      status: "conflict";
      code: "provider-mapping-conflict";
      currentTarget: CampusMapProviderMappingTarget | null;
    }
  | {
      status: "temporarily-unavailable";
      code: "provider-mapping-unavailable";
    };

function hasExactKeys(
  value: Record<string, unknown>,
  expectedKeys: readonly string[],
) {
  const keys = Object.keys(value);
  return (
    keys.length === expectedKeys.length &&
    keys.every((key) => expectedKeys.includes(key))
  );
}

function canonicalTarget(
  target: CampusMapProviderMappingTarget,
): CampusMapProviderMappingTarget {
  return target.kind === "building"
    ? { kind: "building", buildingId: target.buildingId.toLowerCase() }
    : { kind: "place", placeId: target.placeId.toLowerCase() };
}

function normalizeTarget(
  value: unknown,
): CampusMapProviderMappingTarget | null {
  if (!value || typeof value !== "object") return null;
  const target = value as Record<string, unknown>;
  if (
    target.kind === "building" &&
    typeof target.buildingId === "string" &&
    hasExactKeys(target, ["kind", "buildingId"])
  ) {
    return canonicalTarget({
      kind: "building",
      buildingId: target.buildingId,
    });
  }
  if (
    target.kind === "place" &&
    typeof target.placeId === "string" &&
    hasExactKeys(target, ["kind", "placeId"])
  ) {
    return canonicalTarget({ kind: "place", placeId: target.placeId });
  }
  return null;
}

function normalizeCommand(
  value: unknown,
): CampusMapProviderMappingCommand | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (
    typeof raw.idempotencyKey !== "string" ||
    typeof raw.reason !== "string" ||
    typeof raw.provenanceId !== "string" ||
    !raw.identity ||
    typeof raw.identity !== "object"
  ) {
    return null;
  }
  const rawIdentity = raw.identity as Record<string, unknown>;
  if (
    typeof rawIdentity.provider !== "string" ||
    typeof rawIdentity.providerObjectId !== "string" ||
    !hasExactKeys(rawIdentity, ["provider", "providerObjectId"])
  ) {
    return null;
  }
  const common: CampusMapProviderMappingCommandBase = {
    idempotencyKey: raw.idempotencyKey.toLowerCase(),
    identity: {
      provider: rawIdentity.provider,
      providerObjectId: rawIdentity.providerObjectId,
    },
    reason: raw.reason,
    provenanceId: raw.provenanceId.toLowerCase(),
  };
  if (raw.kind === "bind") {
    if (
      !hasExactKeys(raw, [
        "kind",
        "idempotencyKey",
        "identity",
        "target",
        "reason",
        "provenanceId",
      ])
    ) {
      return null;
    }
    const target = normalizeTarget(raw.target);
    return target ? { ...common, kind: "bind", target } : null;
  }
  if (raw.kind === "unlink") {
    if (
      !hasExactKeys(raw, [
        "kind",
        "idempotencyKey",
        "identity",
        "previousTarget",
        "reason",
        "provenanceId",
      ])
    ) {
      return null;
    }
    const previousTarget = normalizeTarget(raw.previousTarget);
    return previousTarget
      ? { ...common, kind: "unlink", previousTarget }
      : null;
  }
  if (raw.kind === "rebind") {
    if (
      !hasExactKeys(raw, [
        "kind",
        "idempotencyKey",
        "identity",
        "previousTarget",
        "newTarget",
        "reason",
        "provenanceId",
      ])
    ) {
      return null;
    }
    const previousTarget = normalizeTarget(raw.previousTarget);
    const newTarget = normalizeTarget(raw.newTarget);
    return previousTarget && newTarget
      ? { ...common, kind: "rebind", previousTarget, newTarget }
      : null;
  }
  return null;
}

function targetColumns(target: CampusMapProviderMappingTarget) {
  return target.kind === "building"
    ? {
        targetKind: "building" as const,
        buildingId: target.buildingId,
        placeId: null,
      }
    : {
        targetKind: "place" as const,
        buildingId: null,
        placeId: target.placeId,
      };
}

function mappingTarget(mapping: {
  targetKind: string;
  buildingId: string | null;
  placeId: string | null;
}): CampusMapProviderMappingTarget | null {
  if (mapping.targetKind === "building" && mapping.buildingId) {
    return { kind: "building", buildingId: mapping.buildingId };
  }
  if (mapping.targetKind === "place" && mapping.placeId) {
    return { kind: "place", placeId: mapping.placeId };
  }
  return null;
}

function sameTarget(
  left: CampusMapProviderMappingTarget,
  right: CampusMapProviderMappingTarget,
) {
  return left.kind === "building"
    ? right.kind === "building" && left.buildingId === right.buildingId
    : right.kind === "place" && left.placeId === right.placeId;
}

function validateProviderIdentity(identity: CampusMapProviderIdentity) {
  const errors: Array<{ code: string; field: string }> = [];
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(identity.provider)) {
    errors.push({ code: "invalid-provider", field: "identity.provider" });
  }
  if (
    identity.providerObjectId.trim() === "" ||
    identity.providerObjectId !== identity.providerObjectId.trim() ||
    Buffer.byteLength(identity.providerObjectId, "utf8") > 512 ||
    /[\u0000-\u001f\u007f]/.test(identity.providerObjectId)
  ) {
    errors.push({
      code: "invalid-provider-object-id",
      field: "identity.providerObjectId",
    });
  }
  return errors;
}

type CampusMapProviderMappingTargetField =
  | "target"
  | "previousTarget"
  | "newTarget";

function mappingCommandTargets(
  command: CampusMapProviderMappingCommand,
): Array<{
  field: CampusMapProviderMappingTargetField;
  target: CampusMapProviderMappingTarget;
}> {
  if (command.kind === "bind") {
    return [{ field: "target", target: command.target }];
  }
  if (command.kind === "unlink") {
    return [{ field: "previousTarget", target: command.previousTarget }];
  }
  return [
    { field: "previousTarget", target: command.previousTarget },
    { field: "newTarget", target: command.newTarget },
  ];
}

function validateCommand(command: CampusMapProviderMappingCommand) {
  const errors: Array<{ code: string; field: string }> = [];
  if (!isCanonicalCampusMapUuid(command.idempotencyKey.toLowerCase())) {
    errors.push({ code: "invalid-idempotency-key", field: "idempotencyKey" });
  }
  errors.push(...validateProviderIdentity(command.identity));
  for (const { field, target } of mappingCommandTargets(command)) {
    const targetId =
      target.kind === "building" ? target.buildingId : target.placeId;
    if (!isCanonicalCampusMapUuid(targetId.toLowerCase())) {
      errors.push({ code: "invalid-target-id", field });
    }
  }
  if (
    command.reason.trim() === "" ||
    Buffer.byteLength(command.reason, "utf8") > 2_000
  ) {
    errors.push({ code: "invalid-reason", field: "reason" });
  }
  if (!isCanonicalCampusMapUuid(command.provenanceId.toLowerCase())) {
    errors.push({ code: "invalid-provenance-id", field: "provenanceId" });
  }
  return errors;
}

async function readAdmin(
  transaction: DatabaseTransaction,
  actorId: string,
): Promise<
  | { id: string; nickname: string }
  | Extract<CampusMapProviderMappingCommandResult, { status: "forbidden" }>
> {
  const [actor] = await transaction
    .select({
      id: users.id,
      emailVerified: users.emailVerified,
      nickname: users.nickname,
      role: users.role,
      banned: users.banned,
    })
    .from(users)
    .where(eq(users.id, actorId))
    .for("update")
    .limit(1);
  if (!actor || !actor.emailVerified) {
    return { status: "forbidden", code: "actor-not-eligible" };
  }
  if (actor.banned) return { status: "forbidden", code: "actor-banned" };
  if (actor.role !== "admin") {
    return { status: "forbidden", code: "admin-required" };
  }
  const [credential] = await transaction
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, actor.id),
        eq(accounts.providerId, "credential"),
        isNotNull(accounts.password),
      ),
    )
    .limit(1);
  if (actor.nickname.trim() === "" || !credential) {
    return { status: "forbidden", code: "profile-incomplete" };
  }
  return { id: actor.id, nickname: actor.nickname };
}

async function validateCanonicalTargetIdentity(
  transaction: DatabaseTransaction,
  target: CampusMapProviderMappingTarget,
): Promise<"valid" | "not-found" | "kind-mismatch"> {
  if (target.kind === "building") {
    const [building] = await transaction
      .select({ id: campusMapBuildings.id })
      .from(campusMapBuildings)
      .where(eq(campusMapBuildings.id, target.buildingId))
      .limit(1);
    if (building) return "valid";
    const [place] = await transaction
      .select({ id: campusMapPlaces.id })
      .from(campusMapPlaces)
      .where(eq(campusMapPlaces.id, target.buildingId))
      .limit(1);
    return place ? "kind-mismatch" : "not-found";
  }
  const [place] = await transaction
    .select({ id: campusMapPlaces.id })
    .from(campusMapPlaces)
    .where(eq(campusMapPlaces.id, target.placeId))
    .limit(1);
  if (place) return "valid";
  const [building] = await transaction
    .select({ id: campusMapBuildings.id })
    .from(campusMapBuildings)
    .where(eq(campusMapBuildings.id, target.placeId))
    .limit(1);
  return building ? "kind-mismatch" : "not-found";
}

async function validatePublicMappingTarget(
  transaction: DatabaseTransaction,
  target: CampusMapProviderMappingTarget,
): Promise<"valid" | "not-found" | "kind-mismatch"> {
  if (target.kind === "building") {
    return validateCanonicalTargetIdentity(transaction, target);
  }
  const [activePlace] = await transaction
    .select({ id: campusMapCurrentFacts.placeId })
    .from(campusMapCurrentFacts)
    .innerJoin(
      campusMapRevisionVisibility,
      eq(
        campusMapCurrentFacts.revisionId,
        campusMapRevisionVisibility.revisionId,
      ),
    )
    .where(
      and(
        eq(campusMapCurrentFacts.placeId, target.placeId),
        eq(campusMapCurrentFacts.status, "active"),
        eq(campusMapRevisionVisibility.visibility, "public"),
      ),
    )
    .limit(1);
  if (activePlace) return "valid";
  const identityValidation = await validateCanonicalTargetIdentity(
    transaction,
    target,
  );
  return identityValidation === "kind-mismatch" ? "kind-mismatch" : "not-found";
}

async function appendMappingEvent(
  transaction: DatabaseTransaction,
  input: {
    id: string;
    identity: CampusMapProviderIdentity;
    kind: "bind" | "unlink" | "rebind";
    previousTarget: CampusMapProviderMappingTarget | null;
    newTarget: CampusMapProviderMappingTarget | null;
    actor: { id: string; nickname: string };
    reason: string;
    provenanceId: string;
    createdAt: Date;
  },
) {
  const previous = input.previousTarget
    ? targetColumns(input.previousTarget)
    : null;
  const next = input.newTarget ? targetColumns(input.newTarget) : null;
  await transaction.insert(campusMapProviderMappingEvents).values({
    id: input.id,
    provider: input.identity.provider,
    providerObjectId: input.identity.providerObjectId,
    commandKind: input.kind,
    previousTargetKind: previous?.targetKind ?? null,
    previousBuildingId: previous?.buildingId ?? null,
    previousPlaceId: previous?.placeId ?? null,
    newTargetKind: next?.targetKind ?? null,
    newBuildingId: next?.buildingId ?? null,
    newPlaceId: next?.placeId ?? null,
    actorUserId: input.actor.id,
    actorIdSnapshot: input.actor.id,
    actorNicknameSnapshot: input.actor.nickname,
    reason: input.reason.trim(),
    provenanceId: input.provenanceId,
    createdAt: input.createdAt,
  });
}

async function storeMappingCommandResult(
  transaction: DatabaseTransaction,
  input: {
    actorId: string;
    idempotencyKey: string;
    fingerprint: string;
    result: CampusMapProviderMappingCommandResult;
    createdAt: Date;
  },
) {
  await transaction.insert(campusMapProviderMappingRequests).values({
    actorUserId: input.actorId,
    actorIdSnapshot: input.actorId,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: input.fingerprint,
    result: input.result,
    createdAt: input.createdAt,
  });
}

export async function commandCampusMapProviderMapping(
  rawCommand: CampusMapProviderMappingCommand,
  context: { actorId: string | null; now?: Date },
): Promise<CampusMapProviderMappingCommandResult> {
  if (context.actorId === null) {
    return {
      status: "authentication-required",
      code: "authentication-required",
    };
  }
  const actorId = context.actorId.toLowerCase();
  if (!isCanonicalCampusMapUuid(actorId)) {
    return { status: "forbidden", code: "actor-not-eligible" };
  }
  const command = normalizeCommand(rawCommand);
  let serialized: string | null = null;
  try {
    serialized = command ? JSON.stringify(command) : null;
  } catch {
    // Invalid runtime values are returned as a typed validation failure below.
  }
  const errors =
    command && serialized
      ? [
          ...validateCommand(command),
          ...(Buffer.byteLength(serialized, "utf8") > 32_768
            ? [{ code: "command-too-large", field: "command" }]
            : []),
        ]
      : [{ code: "invalid-command", field: "command" }];
  const now = context.now ?? new Date();

  try {
    return await db.transaction(async (transaction) => {
      const actor = await readAdmin(transaction, actorId);
      if ("status" in actor) return actor;
      if (command === null || serialized === null || errors.length > 0) {
        return { status: "validation-failed", errors };
      }
      const fingerprint = createHash("sha256")
        .update(serialized, "utf8")
        .digest("hex");

      await transaction.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(
            ${`campus-map-provider-request:${actor.id}:${command.idempotencyKey}`},
            0
          )
        )
      `);
      const [stored] = await transaction
        .select({
          requestFingerprint:
            campusMapProviderMappingRequests.requestFingerprint,
          result: campusMapProviderMappingRequests.result,
        })
        .from(campusMapProviderMappingRequests)
        .where(
          and(
            eq(campusMapProviderMappingRequests.actorIdSnapshot, actor.id),
            eq(
              campusMapProviderMappingRequests.idempotencyKey,
              command.idempotencyKey,
            ),
          ),
        )
        .limit(1);
      if (stored) {
        return stored.requestFingerprint === fingerprint
          ? (stored.result as CampusMapProviderMappingCommandResult)
          : {
              status: "validation-failed",
              errors: [
                {
                  code: "idempotency-key-reused",
                  field: "idempotencyKey",
                },
              ],
            };
      }

      await transaction.execute(sql`
        select pg_advisory_xact_lock(
          hashtextextended(
            ${`campus-map-provider-identity:${command.identity.provider}:${command.identity.providerObjectId}`},
            0
          )
        )
      `);
      const [provenance] = await transaction
        .select({ id: campusMapProvenanceSources.id })
        .from(campusMapProvenanceSources)
        .where(eq(campusMapProvenanceSources.id, command.provenanceId))
        .limit(1);
      if (!provenance) {
        const result = {
          status: "not-found",
          code: "mapping-provenance-not-found",
        } as const;
        await storeMappingCommandResult(transaction, {
          actorId: actor.id,
          idempotencyKey: command.idempotencyKey,
          fingerprint,
          result,
          createdAt: now,
        });
        return result;
      }
      for (const { field, target } of mappingCommandTargets(command)) {
        const targetValidation =
          field === "previousTarget"
            ? await validateCanonicalTargetIdentity(transaction, target)
            : await validatePublicMappingTarget(transaction, target);
        if (targetValidation !== "valid") {
          const result = {
            status: "not-found",
            code:
              targetValidation === "kind-mismatch"
                ? "mapping-target-kind-mismatch"
                : "mapping-target-not-found",
          } as const;
          await storeMappingCommandResult(transaction, {
            actorId: actor.id,
            idempotencyKey: command.idempotencyKey,
            fingerprint,
            result,
            createdAt: now,
          });
          return result;
        }
      }
      const [active] = await transaction
        .select({
          targetKind: campusMapProviderMappings.targetKind,
          buildingId: campusMapProviderMappings.buildingId,
          placeId: campusMapProviderMappings.placeId,
        })
        .from(campusMapProviderMappings)
        .where(
          and(
            eq(campusMapProviderMappings.provider, command.identity.provider),
            eq(
              campusMapProviderMappings.providerObjectId,
              command.identity.providerObjectId,
            ),
          ),
        )
        .for("update")
        .limit(1);
      const currentTarget = active ? mappingTarget(active) : null;
      let result: CampusMapProviderMappingCommandResult;
      if (command.kind === "bind" && currentTarget) {
        result = sameTarget(currentTarget, command.target)
          ? {
              status: "mapped",
              outcome: "unchanged",
              identity: command.identity,
              previousTarget: currentTarget,
              target: command.target,
              eventId: null,
            }
          : {
              status: "conflict",
              code: "provider-mapping-conflict",
              currentTarget,
            };
      } else if (command.kind === "bind") {
        const eventId = randomUUID();
        const columns = targetColumns(command.target);
        await transaction.insert(campusMapProviderMappings).values({
          provider: command.identity.provider,
          providerObjectId: command.identity.providerObjectId,
          ...columns,
          provenanceId: command.provenanceId,
          createdAt: now,
        });
        await appendMappingEvent(transaction, {
          id: eventId,
          identity: command.identity,
          kind: "bind",
          previousTarget: null,
          newTarget: command.target,
          actor,
          reason: command.reason.trim(),
          provenanceId: command.provenanceId,
          createdAt: now,
        });
        result = {
          status: "mapped",
          outcome: "bound",
          identity: command.identity,
          previousTarget: null,
          target: command.target,
          eventId,
        };
      } else if (command.kind === "unlink") {
        if (currentTarget === null) {
          result = {
            status: "mapped",
            outcome: "unchanged",
            identity: command.identity,
            previousTarget: command.previousTarget,
            target: null,
            eventId: null,
          };
        } else if (!sameTarget(currentTarget, command.previousTarget)) {
          result = {
            status: "conflict",
            code: "provider-mapping-conflict",
            currentTarget,
          };
        } else {
          const eventId = randomUUID();
          await transaction
            .delete(campusMapProviderMappings)
            .where(
              and(
                eq(
                  campusMapProviderMappings.provider,
                  command.identity.provider,
                ),
                eq(
                  campusMapProviderMappings.providerObjectId,
                  command.identity.providerObjectId,
                ),
              ),
            );
          await appendMappingEvent(transaction, {
            id: eventId,
            identity: command.identity,
            kind: "unlink",
            previousTarget: currentTarget,
            newTarget: null,
            actor,
            reason: command.reason.trim(),
            provenanceId: command.provenanceId,
            createdAt: now,
          });
          result = {
            status: "mapped",
            outcome: "unlinked",
            identity: command.identity,
            previousTarget: currentTarget,
            target: null,
            eventId,
          };
        }
      } else if (
        currentTarget === null ||
        !sameTarget(currentTarget, command.previousTarget)
      ) {
        result = {
          status: "conflict",
          code: "provider-mapping-conflict",
          currentTarget,
        };
      } else if (sameTarget(currentTarget, command.newTarget)) {
        result = {
          status: "mapped",
          outcome: "unchanged",
          identity: command.identity,
          previousTarget: currentTarget,
          target: currentTarget,
          eventId: null,
        };
      } else {
        const eventId = randomUUID();
        const next = targetColumns(command.newTarget);
        await transaction
          .update(campusMapProviderMappings)
          .set({
            ...next,
            provenanceId: command.provenanceId,
            createdAt: now,
          })
          .where(
            and(
              eq(campusMapProviderMappings.provider, command.identity.provider),
              eq(
                campusMapProviderMappings.providerObjectId,
                command.identity.providerObjectId,
              ),
            ),
          );
        await appendMappingEvent(transaction, {
          id: eventId,
          identity: command.identity,
          kind: "rebind",
          previousTarget: currentTarget,
          newTarget: command.newTarget,
          actor,
          reason: command.reason.trim(),
          provenanceId: command.provenanceId,
          createdAt: now,
        });
        result = {
          status: "mapped",
          outcome: "rebound",
          identity: command.identity,
          previousTarget: currentTarget,
          target: command.newTarget,
          eventId,
        };
      }
      await storeMappingCommandResult(transaction, {
        actorId: actor.id,
        idempotencyKey: command.idempotencyKey,
        fingerprint,
        result,
        createdAt: now,
      });
      return result;
    });
  } catch {
    return {
      status: "temporarily-unavailable",
      code: "provider-mapping-unavailable",
    };
  }
}

export type CampusMapProviderMappingGovernanceResult =
  | {
      status: "ok";
      identity: CampusMapProviderIdentity;
      activeTarget: CampusMapProviderMappingTarget | null;
      events: Array<{
        id: string;
        kind: "bind" | "unlink" | "rebind";
        previousTarget: CampusMapProviderMappingTarget | null;
        newTarget: CampusMapProviderMappingTarget | null;
        actor: { id: string; nickname: string };
        reason: string;
        provenanceId: string;
        occurredAt: string;
      }>;
    }
  | { status: "authentication-required"; code: "authentication-required" }
  | Extract<CampusMapProviderMappingCommandResult, { status: "forbidden" }>
  | Extract<
      CampusMapProviderMappingCommandResult,
      { status: "validation-failed" | "temporarily-unavailable" }
    >;

/** Admin-only lifecycle projection; public callers use the exact resolver. */
export async function getCampusMapProviderMappingGovernance(
  identity: CampusMapProviderIdentity,
  context: { actorId: string | null },
): Promise<CampusMapProviderMappingGovernanceResult> {
  if (context.actorId === null) {
    return {
      status: "authentication-required",
      code: "authentication-required",
    };
  }
  const actorId = context.actorId.toLowerCase();
  if (!isCanonicalCampusMapUuid(actorId)) {
    return { status: "forbidden", code: "actor-not-eligible" };
  }
  const identityErrors = validateProviderIdentity(identity);
  if (identityErrors.length > 0) {
    return {
      status: "validation-failed",
      errors: identityErrors,
    };
  }
  try {
    return await db.transaction(async (transaction) => {
      const actor = await readAdmin(transaction, actorId);
      if ("status" in actor) return actor;
      const [activeRows, events] = await Promise.all([
        transaction
          .select({
            targetKind: campusMapProviderMappings.targetKind,
            buildingId: campusMapProviderMappings.buildingId,
            placeId: campusMapProviderMappings.placeId,
          })
          .from(campusMapProviderMappings)
          .where(
            and(
              eq(campusMapProviderMappings.provider, identity.provider),
              eq(
                campusMapProviderMappings.providerObjectId,
                identity.providerObjectId,
              ),
            ),
          )
          .limit(1),
        transaction
          .select({
            id: campusMapProviderMappingEvents.id,
            kind: campusMapProviderMappingEvents.commandKind,
            previousTargetKind:
              campusMapProviderMappingEvents.previousTargetKind,
            previousBuildingId:
              campusMapProviderMappingEvents.previousBuildingId,
            previousPlaceId: campusMapProviderMappingEvents.previousPlaceId,
            newTargetKind: campusMapProviderMappingEvents.newTargetKind,
            newBuildingId: campusMapProviderMappingEvents.newBuildingId,
            newPlaceId: campusMapProviderMappingEvents.newPlaceId,
            actorId: campusMapProviderMappingEvents.actorIdSnapshot,
            actorNickname: campusMapProviderMappingEvents.actorNicknameSnapshot,
            reason: campusMapProviderMappingEvents.reason,
            provenanceId: campusMapProviderMappingEvents.provenanceId,
            occurredAt: campusMapProviderMappingEvents.createdAt,
          })
          .from(campusMapProviderMappingEvents)
          .where(
            and(
              eq(campusMapProviderMappingEvents.provider, identity.provider),
              eq(
                campusMapProviderMappingEvents.providerObjectId,
                identity.providerObjectId,
              ),
            ),
          )
          .orderBy(
            asc(campusMapProviderMappingEvents.createdAt),
            asc(campusMapProviderMappingEvents.id),
          ),
      ]);
      const active = activeRows[0];
      return {
        status: "ok",
        identity,
        activeTarget: active ? mappingTarget(active) : null,
        events: events.map((event) => ({
          id: event.id,
          kind: event.kind as "bind" | "unlink" | "rebind",
          previousTarget: mappingTarget({
            targetKind: event.previousTargetKind ?? "",
            buildingId: event.previousBuildingId,
            placeId: event.previousPlaceId,
          }),
          newTarget: mappingTarget({
            targetKind: event.newTargetKind ?? "",
            buildingId: event.newBuildingId,
            placeId: event.newPlaceId,
          }),
          actor: { id: event.actorId, nickname: event.actorNickname },
          reason: event.reason,
          provenanceId: event.provenanceId,
          occurredAt: event.occurredAt.toISOString(),
        })),
      };
    });
  } catch {
    return {
      status: "temporarily-unavailable",
      code: "provider-mapping-unavailable",
    };
  }
}

/** Resolves only an exact active mapping to a public canonical target. */
export async function resolveCampusMapProviderSelection(
  provider: string,
  providerObjectId: string,
): Promise<CampusMapSelectionTarget | null> {
  if (
    provider.length === 0 ||
    provider !== provider.trim() ||
    providerObjectId.length === 0 ||
    providerObjectId !== providerObjectId.trim()
  ) {
    return null;
  }
  const [mapping] = await db
    .select({
      targetKind: campusMapProviderMappings.targetKind,
      buildingId: campusMapProviderMappings.buildingId,
      placeId: campusMapProviderMappings.placeId,
    })
    .from(campusMapProviderMappings)
    .where(
      and(
        eq(campusMapProviderMappings.provider, provider),
        eq(campusMapProviderMappings.providerObjectId, providerObjectId),
      ),
    )
    .limit(1);
  if (!mapping) return null;
  if (mapping.targetKind === "building" && mapping.buildingId) {
    return { kind: "building", buildingId: mapping.buildingId };
  }
  if (mapping.targetKind !== "place" || !mapping.placeId) return null;
  const [place] = await db
    .select({
      placeId: campusMapCurrentFacts.placeId,
      buildingId: campusMapCurrentFacts.buildingId,
      floorId: campusMapCurrentFacts.floorId,
    })
    .from(campusMapCurrentFacts)
    .innerJoin(
      campusMapRevisionVisibility,
      eq(
        campusMapCurrentFacts.revisionId,
        campusMapRevisionVisibility.revisionId,
      ),
    )
    .where(
      and(
        eq(campusMapCurrentFacts.placeId, mapping.placeId),
        eq(campusMapCurrentFacts.status, "active"),
        eq(campusMapRevisionVisibility.visibility, "public"),
      ),
    )
    .limit(1);
  return place ? { kind: "place", ...place } : null;
}
