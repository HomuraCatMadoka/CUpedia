import {
  and,
  avg,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
  sql,
} from "drizzle-orm";

import { db } from "@/db";
import {
  accounts,
  campusMapCurrentRevisions,
  campusMapPlaceFeedback,
  campusMapPlaceFeedbackVisibility,
  campusMapPlaces,
  users,
} from "@/db/schema";
import { isCanonicalCampusMapUuid } from "@/lib/campus-map/canonical-uuid";
import { isAllowedEmail } from "@/lib/email";
import {
  assertNoSensitiveContent,
  SENSITIVE_CONTENT_ERROR,
} from "@/lib/sensitive-content";

type DatabaseTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type CampusMapPlaceFeedbackCommand =
  | {
      kind: "create";
      placeId: string;
      rating: number;
      content: string | null;
    }
  | {
      kind: "update";
      feedbackId: string;
      expectedVersion: number;
      rating: number;
      content: string | null;
    }
  | {
      kind: "delete";
      feedbackId: string;
      expectedVersion: number;
    };

export interface CampusMapPlaceFeedbackContext {
  actorId: string | null;
  now?: Date;
}

export interface CampusMapPlaceFeedbackView {
  id: string;
  placeId: string;
  rating: number;
  content: string | null;
  version: number;
  visibility: "public" | "hidden";
  createdAt: string;
  updatedAt: string;
}

export type CampusMapPlaceFeedbackCommandResult =
  | { status: "created" | "updated"; feedback: CampusMapPlaceFeedbackView }
  | { status: "deleted"; feedbackId: string; placeId: string }
  | { status: "authentication-required"; code: "authentication-required" }
  | {
      status: "forbidden";
      code:
        | "actor-not-eligible"
        | "actor-banned"
        | "profile-incomplete"
        | "feedback-not-owned"
        | "place-read-only";
    }
  | {
      status: "validation-failed";
      errors: Array<{ field: string; code: string }>;
    }
  | { status: "not-found"; code: "place-not-found" | "feedback-not-found" }
  | {
      status: "conflict";
      code: "feedback-already-exists" | "feedback-version-conflict";
    };

export interface CampusMapPlaceFeedbackSummary {
  placeId: string;
  averageRating: number | null;
  ratingCount: number;
  reviewCount: number;
}

export interface CampusMapPublicPlaceFeedback {
  id: string;
  author: { nickname: string };
  rating: number;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface CampusMapPlaceFeedbackPage {
  placeStatus: "active" | "retired" | "merged" | null;
  summary: CampusMapPlaceFeedbackSummary;
  page: {
    items: CampusMapPublicPlaceFeedback[];
    nextCursor: string | null;
  };
}

const MAX_REVIEW_PAGE_SIZE = 50;

export async function commandCampusMapPlaceFeedback(
  command: CampusMapPlaceFeedbackCommand,
  context: CampusMapPlaceFeedbackContext,
): Promise<CampusMapPlaceFeedbackCommandResult> {
  if (context.actorId === null) {
    return {
      status: "authentication-required",
      code: "authentication-required",
    };
  }
  if (!isCanonicalCampusMapUuid(context.actorId)) {
    return { status: "forbidden", code: "actor-not-eligible" };
  }
  let normalized: ReturnType<typeof normalizeCommand>;
  try {
    normalized = normalizeCommand(command);
  } catch (error) {
    if (error instanceof Error && error.message === SENSITIVE_CONTENT_ERROR) {
      return {
        status: "validation-failed",
        errors: [{ field: "content", code: "sensitive-content" }],
      };
    }
    throw error;
  }
  if (!normalized.ok) {
    return { status: "validation-failed", errors: normalized.errors };
  }

  try {
    return await db.transaction(async (transaction) => {
      const actorFailure = await readEligibleActor(
        transaction,
        context.actorId!,
      );
      if (actorFailure) return actorFailure;
      const now = context.now ?? new Date();

      if (normalized.command.kind === "create") {
        const placeStatus = await readPlaceStatus(
          transaction,
          normalized.command.placeId,
        );
        if (placeStatus === null) {
          return { status: "not-found", code: "place-not-found" } as const;
        }
        if (placeStatus !== "active") {
          return { status: "forbidden", code: "place-read-only" } as const;
        }
        const [created] = await transaction
          .insert(campusMapPlaceFeedback)
          .values({
            placeId: normalized.command.placeId,
            userId: context.actorId!,
            rating: normalized.command.rating,
            content: normalized.command.content,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing({
            target: [
              campusMapPlaceFeedback.placeId,
              campusMapPlaceFeedback.userId,
            ],
          })
          .returning();
        if (!created) {
          return {
            status: "conflict",
            code: "feedback-already-exists",
          } as const;
        }
        await transaction.insert(campusMapPlaceFeedbackVisibility).values({
          feedbackId: created.id,
          visibility: "public",
          updatedAt: now,
        });
        return {
          status: "created",
          feedback: toFeedbackView(created, "public"),
        } as const;
      }

      const [stored] = await transaction
        .select({
          id: campusMapPlaceFeedback.id,
          placeId: campusMapPlaceFeedback.placeId,
          userId: campusMapPlaceFeedback.userId,
          rating: campusMapPlaceFeedback.rating,
          content: campusMapPlaceFeedback.content,
          version: campusMapPlaceFeedback.version,
          createdAt: campusMapPlaceFeedback.createdAt,
          updatedAt: campusMapPlaceFeedback.updatedAt,
          visibility: campusMapPlaceFeedbackVisibility.visibility,
        })
        .from(campusMapPlaceFeedback)
        .innerJoin(
          campusMapPlaceFeedbackVisibility,
          eq(
            campusMapPlaceFeedbackVisibility.feedbackId,
            campusMapPlaceFeedback.id,
          ),
        )
        .where(eq(campusMapPlaceFeedback.id, normalized.command.feedbackId))
        .for("update", { of: campusMapPlaceFeedback })
        .limit(1);
      if (!stored) {
        return { status: "not-found", code: "feedback-not-found" } as const;
      }
      if (stored.userId !== context.actorId) {
        return { status: "forbidden", code: "feedback-not-owned" } as const;
      }
      const placeStatus = await readPlaceStatus(transaction, stored.placeId);
      if (placeStatus !== "active") {
        return { status: "forbidden", code: "place-read-only" } as const;
      }
      if (stored.version !== normalized.command.expectedVersion) {
        return {
          status: "conflict",
          code: "feedback-version-conflict",
        } as const;
      }

      if (normalized.command.kind === "delete") {
        await transaction
          .delete(campusMapPlaceFeedback)
          .where(eq(campusMapPlaceFeedback.id, stored.id));
        return {
          status: "deleted",
          feedbackId: stored.id,
          placeId: stored.placeId,
        } as const;
      }

      const [updated] = await transaction
        .update(campusMapPlaceFeedback)
        .set({
          rating: normalized.command.rating,
          content: normalized.command.content,
          version: sql`${campusMapPlaceFeedback.version} + 1`,
          updatedAt: now,
        })
        .where(
          and(
            eq(campusMapPlaceFeedback.id, stored.id),
            eq(campusMapPlaceFeedback.version, stored.version),
          ),
        )
        .returning();
      if (!updated) {
        return {
          status: "conflict",
          code: "feedback-version-conflict",
        } as const;
      }
      return {
        status: "updated",
        feedback: toFeedbackView(updated, stored.visibility),
      } as const;
    });
  } catch (error) {
    if (error instanceof Error && error.message === SENSITIVE_CONTENT_ERROR) {
      return {
        status: "validation-failed",
        errors: [{ field: "content", code: "sensitive-content" }],
      };
    }
    throw error;
  }
}

export async function getCampusMapPlaceFeedbackSummaries(
  placeIds: readonly string[],
): Promise<Record<string, CampusMapPlaceFeedbackSummary>> {
  const canonicalIds = [
    ...new Set(
      placeIds
        .filter((placeId): placeId is string => typeof placeId === "string")
        .map((placeId) => placeId.toLowerCase())
        .filter(isCanonicalCampusMapUuid),
    ),
  ];
  if (canonicalIds.length === 0) return {};

  const rows = await db
    .select({
      placeId: campusMapPlaceFeedback.placeId,
      averageRating: avg(campusMapPlaceFeedback.rating),
      ratingCount: count(campusMapPlaceFeedback.id),
      reviewCount: sql<number>`count(${campusMapPlaceFeedback.content})::int`,
    })
    .from(campusMapPlaceFeedback)
    .innerJoin(
      campusMapPlaceFeedbackVisibility,
      and(
        eq(
          campusMapPlaceFeedbackVisibility.feedbackId,
          campusMapPlaceFeedback.id,
        ),
        eq(campusMapPlaceFeedbackVisibility.visibility, "public"),
      ),
    )
    .where(inArray(campusMapPlaceFeedback.placeId, canonicalIds))
    .groupBy(campusMapPlaceFeedback.placeId);

  return Object.fromEntries(
    rows.map((row) => [
      row.placeId,
      {
        placeId: row.placeId,
        averageRating:
          row.averageRating === null
            ? null
            : Math.round(Number(row.averageRating) * 10) / 10,
        ratingCount: Number(row.ratingCount),
        reviewCount: Number(row.reviewCount),
      },
    ]),
  );
}

export async function getCampusMapPlaceFeedbackPage(
  placeId: string,
  query: { cursor?: string | null; limit?: number } = {},
): Promise<CampusMapPlaceFeedbackPage> {
  const canonicalPlaceId = placeId.toLowerCase();
  const limit = Math.max(1, Math.min(query.limit ?? 10, MAX_REVIEW_PAGE_SIZE));
  const cursor = query.cursor ? decodeCursor(query.cursor) : null;
  const emptySummary: CampusMapPlaceFeedbackSummary = {
    placeId: canonicalPlaceId,
    averageRating: null,
    ratingCount: 0,
    reviewCount: 0,
  };
  if (
    !isCanonicalCampusMapUuid(canonicalPlaceId) ||
    (query.cursor && !cursor)
  ) {
    return {
      placeStatus: null,
      summary: emptySummary,
      page: { items: [], nextCursor: null },
    };
  }

  const predicates = [
    eq(campusMapPlaceFeedback.placeId, canonicalPlaceId),
    eq(campusMapPlaceFeedbackVisibility.visibility, "public"),
    isNotNull(campusMapPlaceFeedback.content),
  ];
  if (cursor) {
    predicates.push(
      or(
        lt(campusMapPlaceFeedback.createdAt, cursor.createdAt),
        and(
          eq(campusMapPlaceFeedback.createdAt, cursor.createdAt),
          lt(campusMapPlaceFeedback.id, cursor.id),
        ),
      )!,
    );
  }

  const [statusRows, summaries, rows] = await Promise.all([
    db
      .select({ status: campusMapCurrentRevisions.status })
      .from(campusMapPlaces)
      .leftJoin(
        campusMapCurrentRevisions,
        eq(campusMapCurrentRevisions.placeId, campusMapPlaces.id),
      )
      .where(eq(campusMapPlaces.id, canonicalPlaceId))
      .limit(1),
    getCampusMapPlaceFeedbackSummaries([canonicalPlaceId]),
    db
      .select({
        id: campusMapPlaceFeedback.id,
        nickname: users.nickname,
        rating: campusMapPlaceFeedback.rating,
        content: campusMapPlaceFeedback.content,
        createdAt: campusMapPlaceFeedback.createdAt,
        updatedAt: campusMapPlaceFeedback.updatedAt,
      })
      .from(campusMapPlaceFeedback)
      .innerJoin(users, eq(users.id, campusMapPlaceFeedback.userId))
      .innerJoin(
        campusMapPlaceFeedbackVisibility,
        eq(
          campusMapPlaceFeedbackVisibility.feedbackId,
          campusMapPlaceFeedback.id,
        ),
      )
      .where(and(...predicates))
      .orderBy(
        desc(campusMapPlaceFeedback.createdAt),
        desc(campusMapPlaceFeedback.id),
      )
      .limit(limit + 1),
  ]);
  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return {
    placeStatus: statusRows[0]?.status ?? null,
    summary: summaries[canonicalPlaceId] ?? emptySummary,
    page: {
      items: visible.map((row) => ({
        id: row.id,
        author: { nickname: row.nickname },
        rating: row.rating,
        content: row.content!,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
      nextCursor:
        rows.length > limit && last
          ? encodeCursor(last.createdAt, last.id)
          : null,
    },
  };
}

export async function getCampusMapViewerPlaceFeedback(
  placeId: string,
  actorId: string,
): Promise<CampusMapPlaceFeedbackView | null> {
  const canonicalPlaceId = placeId.toLowerCase();
  const canonicalActorId = actorId.toLowerCase();
  if (
    !isCanonicalCampusMapUuid(canonicalPlaceId) ||
    !isCanonicalCampusMapUuid(canonicalActorId)
  ) {
    return null;
  }
  const [row] = await db
    .select({
      id: campusMapPlaceFeedback.id,
      placeId: campusMapPlaceFeedback.placeId,
      rating: campusMapPlaceFeedback.rating,
      content: campusMapPlaceFeedback.content,
      version: campusMapPlaceFeedback.version,
      visibility: campusMapPlaceFeedbackVisibility.visibility,
      createdAt: campusMapPlaceFeedback.createdAt,
      updatedAt: campusMapPlaceFeedback.updatedAt,
    })
    .from(campusMapPlaceFeedback)
    .innerJoin(
      campusMapPlaceFeedbackVisibility,
      eq(
        campusMapPlaceFeedbackVisibility.feedbackId,
        campusMapPlaceFeedback.id,
      ),
    )
    .where(
      and(
        eq(campusMapPlaceFeedback.placeId, canonicalPlaceId),
        eq(campusMapPlaceFeedback.userId, canonicalActorId),
      ),
    )
    .limit(1);
  return row ? toFeedbackView(row, row.visibility) : null;
}

async function readEligibleActor(
  transaction: DatabaseTransaction,
  actorId: string,
): Promise<Extract<
  CampusMapPlaceFeedbackCommandResult,
  { status: "forbidden" }
> | null> {
  const [actor] = await transaction
    .select({
      email: users.email,
      emailVerified: users.emailVerified,
      nickname: users.nickname,
      role: users.role,
      banned: users.banned,
    })
    .from(users)
    .where(eq(users.id, actorId))
    .for("update")
    .limit(1);
  if (
    !actor ||
    !actor.emailVerified ||
    !isAllowedEmail(actor.email) ||
    (actor.role !== "user" && actor.role !== "admin")
  ) {
    return { status: "forbidden", code: "actor-not-eligible" };
  }
  if (actor.banned) return { status: "forbidden", code: "actor-banned" };
  const [credential] = await transaction
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, actorId),
        eq(accounts.providerId, "credential"),
        isNotNull(accounts.password),
        ne(accounts.password, ""),
      ),
    )
    .limit(1);
  return actor.nickname.trim() === "" || !credential
    ? { status: "forbidden", code: "profile-incomplete" }
    : null;
}

async function readPlaceStatus(
  transaction: DatabaseTransaction,
  placeId: string,
): Promise<"active" | "retired" | "merged" | null> {
  const [row] = await transaction
    .select({ status: campusMapCurrentRevisions.status })
    .from(campusMapPlaces)
    .leftJoin(
      campusMapCurrentRevisions,
      eq(campusMapCurrentRevisions.placeId, campusMapPlaces.id),
    )
    .where(eq(campusMapPlaces.id, placeId))
    .limit(1);
  return row?.status ?? null;
}

function normalizeCommand(
  command: CampusMapPlaceFeedbackCommand,
):
  | { ok: true; command: CampusMapPlaceFeedbackCommand }
  | { ok: false; errors: Array<{ field: string; code: string }> } {
  const errors: Array<{ field: string; code: string }> = [];
  const candidate: unknown = command;
  if (
    candidate === null ||
    typeof candidate !== "object" ||
    Array.isArray(candidate)
  ) {
    return {
      ok: false,
      errors: [{ field: "command", code: "invalid-command" }],
    };
  }
  const input = candidate as Record<string, unknown>;
  if (
    input.kind !== "create" &&
    input.kind !== "update" &&
    input.kind !== "delete"
  ) {
    return {
      ok: false,
      errors: [{ field: "kind", code: "invalid-command-kind" }],
    };
  }

  if (input.kind === "create") {
    if (
      typeof input.placeId !== "string" ||
      !isCanonicalCampusMapUuid(input.placeId.toLowerCase())
    ) {
      errors.push({ field: "placeId", code: "invalid-place-id" });
    }
  } else {
    if (
      typeof input.feedbackId !== "string" ||
      !isCanonicalCampusMapUuid(input.feedbackId.toLowerCase())
    ) {
      errors.push({ field: "feedbackId", code: "invalid-feedback-id" });
    }
    if (
      !Number.isSafeInteger(input.expectedVersion) ||
      (input.expectedVersion as number) < 1
    ) {
      errors.push({ field: "expectedVersion", code: "invalid-version" });
    }
  }
  if (input.kind !== "delete") {
    if (
      !Number.isSafeInteger(input.rating) ||
      (input.rating as number) < 1 ||
      (input.rating as number) > 5
    ) {
      errors.push({ field: "rating", code: "invalid-rating" });
    }
    if (input.content !== null && typeof input.content !== "string") {
      errors.push({ field: "content", code: "invalid-content" });
    }
    const content =
      typeof input.content === "string" ? input.content.trim() || null : null;
    if (
      content !== null &&
      (Array.from(content).length > 2000 ||
        Buffer.byteLength(content, "utf8") > 8192)
    ) {
      errors.push({ field: "content", code: "content-too-long" });
    }
    if (errors.length === 0 && content !== null) {
      assertNoSensitiveContent(content);
    }
    if (errors.length > 0) return { ok: false, errors };
    return {
      ok: true,
      command:
        input.kind === "create"
          ? {
              kind: "create",
              placeId: (input.placeId as string).toLowerCase(),
              rating: input.rating as number,
              content,
            }
          : {
              kind: "update",
              feedbackId: (input.feedbackId as string).toLowerCase(),
              expectedVersion: input.expectedVersion as number,
              rating: input.rating as number,
              content,
            },
    };
  }
  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    command: {
      kind: "delete",
      feedbackId: (input.feedbackId as string).toLowerCase(),
      expectedVersion: input.expectedVersion as number,
    },
  };
}

function toFeedbackView(
  row: {
    id: string;
    placeId: string;
    rating: number;
    content: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  },
  visibility: "public" | "hidden",
): CampusMapPlaceFeedbackView {
  return {
    id: row.id,
    placeId: row.placeId,
    rating: row.rating,
    content: row.content,
    version: row.version,
    visibility,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(JSON.stringify([createdAt.toISOString(), id])).toString(
    "base64url",
  );
}

function decodeCursor(value: string): { createdAt: Date; id: string } | null {
  try {
    const parsed: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    );
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const [timestamp, id] = parsed;
    if (typeof timestamp !== "string" || typeof id !== "string") return null;
    const createdAt = new Date(timestamp);
    if (Number.isNaN(createdAt.getTime()) || !isCanonicalCampusMapUuid(id)) {
      return null;
    }
    return { createdAt, id };
  } catch {
    return null;
  }
}
