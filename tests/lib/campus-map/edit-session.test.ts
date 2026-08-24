import { describe, expect, it } from "vitest";

import {
  CAMPUS_MAP_EDIT_SNAPSHOT_VERSION,
  createCampusMapEditDraft,
  decodeCampusMapEditSnapshot,
  deriveCampusMapPublishCommand,
  encodeCampusMapEditSnapshot,
  isCampusMapEditDirty,
  transitionCampusMapEdit,
  type CampusMapEditSession,
} from "@/lib/campus-map/edit-session";
import type {
  CampusMapPublishFactInput,
  CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish-contract";

const firstKey = "10000000-0000-4000-8000-000000000001";
const secondKey = "10000000-0000-4000-8000-000000000002";
const placeId = "20000000-0000-4000-8000-000000000001";
const baseRevisionId = "30000000-0000-4000-8000-000000000001";
const currentRevisionId = "30000000-0000-4000-8000-000000000002";

const source: CampusMapPublishSourceInput = {
  kind: "field-observation",
  ref: "现场观察 2026-08-25",
  url: null,
  owner: null,
  version: null,
  snapshotHash: null,
  accessedOn: "2026-08-25",
  observedAt: "2026-08-25T04:00:00.000Z",
  rightsStatus: "original-observation",
  limitations: null,
  note: null,
  sourceCoordinate: null,
};

const fact: CampusMapPublishFactInput = {
  name: "大学图书馆饮水机",
  buildingId: null,
  floorId: null,
  pinType: "water",
  capabilities: [],
  gender: "unknown",
  wheelchairAccess: "unknown",
  audience: "unknown",
  credentialRequirement: "unknown",
  accessSchedule: { kind: "unknown" },
  reservationRequirement: "unknown",
  temporaryStatus: "unknown",
  location: {
    kind: "outdoor-point",
    longitude: 114.2049,
    latitude: 22.4195,
    crs: "wgs84",
    precision: "approximate",
  },
  observedAt: "2026-08-25T04:00:00.000Z",
};

function editSession(): CampusMapEditSession {
  return transitionCampusMapEdit(null, {
    type: "START_EDIT",
    placeId,
    baseRevisionId,
    fact,
    sources: [source],
    idempotencyKey: firstKey,
  }).session!;
}

describe("Campus Map edit session transition", () => {
  it("accepts an Add intent once and locks a keyboard-confirmed WGS84 point", () => {
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey: firstKey,
    });
    const duplicate = transitionCampusMapEdit(started.session, {
      type: "START_ADD",
      idempotencyKey: secondKey,
    });
    const positioned = transitionCampusMapEdit(started.session, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.2072,
        latitude: 22.4191,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    });

    expect(started.session?.status).toBe("placing");
    expect(started.commands).toContainEqual({
      kind: "scene",
      intent: "start-create",
    });
    expect(duplicate).toMatchObject({
      accepted: false,
      session: started.session,
    });
    expect(positioned.session).toMatchObject({
      status: "editing",
      draft: {
        fact: {
          location: {
            kind: "outdoor-point",
            longitude: 114.2072,
            latitude: 22.4191,
            crs: "wgs84",
            precision: "approximate",
          },
        },
        placementMethod: "keyboard",
      },
    });
  });

  it("starts Edit with stable identity and a clean baseline", () => {
    const session = editSession();

    expect(session).toMatchObject({
      status: "editing",
      draft: { mode: "edit", placeId, baseRevisionId },
    });
    expect(isCampusMapEditDirty(session)).toBe(false);
  });

  it("asks before closing a dirty draft and supports continue or discard", () => {
    const changed = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "大学图书馆新饮水点" },
    }).session;
    const closing = transitionCampusMapEdit(changed, { type: "REQUEST_CLOSE" });
    const continued = transitionCampusMapEdit(closing.session, {
      type: "CONTINUE_EDITING",
    });
    const discarded = transitionCampusMapEdit(closing.session, {
      type: "DISCARD",
    });

    expect(isCampusMapEditDirty(changed)).toBe(true);
    expect(closing.session?.status).toBe("confirm-discard");
    expect(continued.session?.status).toBe("editing");
    expect(discarded.session).toBeNull();
    expect(discarded.commands).toEqual([
      { kind: "clear-snapshot" },
      { kind: "scene", intent: "cancel-task" },
    ]);
  });

  it("round-trips a versioned draft and safely rejects damaged snapshots", () => {
    const changed = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "可恢复名称" },
    }).session;
    const encoded = encodeCampusMapEditSnapshot(changed!);

    expect(JSON.parse(encoded)).toMatchObject({
      version: CAMPUS_MAP_EDIT_SNAPSHOT_VERSION,
      session: { draft: { placeId, baseRevisionId } },
    });
    expect(decodeCampusMapEditSnapshot(encoded)).toEqual({
      status: "restored",
      session: changed,
    });
    expect(decodeCampusMapEditSnapshot("{broken")).toEqual({
      status: "discarded",
      reason: "invalid-json",
    });
    expect(
      decodeCampusMapEditSnapshot(
        JSON.stringify({ version: 999, session: changed }),
      ),
    ).toEqual({ status: "discarded", reason: "unsupported-version" });
  });

  it("derives typed comment/source summary and always disables review requests", () => {
    const changed = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "大学图书馆新饮水点", wheelchairAccess: "yes" },
    }).session!;
    const command = deriveCampusMapPublishCommand(changed.draft);

    expect(command).toMatchObject({
      kind: "single",
      idempotencyKey: firstKey,
      reviewRequested: false,
      comment: "更新地点：名称、无障碍通行",
      sourceSummary: "来源：现场观察",
      changes: [{ operation: "update", placeId, baseRevisionId }],
    });
    expect(command).not.toHaveProperty("discussion");
  });

  it("focuses local errors and blocks publishing an unchanged Edit", () => {
    const unchanged = transitionCampusMapEdit(editSession(), {
      type: "REQUEST_PUBLISH",
    });
    const invalidDraft = createCampusMapEditDraft({
      mode: "add",
      idempotencyKey: firstKey,
      fact: { ...fact, name: "" },
      sources: [],
    });
    const invalid = transitionCampusMapEdit(
      { status: "editing", draft: invalidDraft },
      { type: "REQUEST_PUBLISH" },
    );

    expect(unchanged.accepted).toBe(false);
    expect(unchanged.commands).toEqual([]);
    expect(invalid.session).toMatchObject({
      status: "editing",
      localError: "name",
    });
    expect(invalid.commands).toContainEqual({ kind: "focus", target: "name" });
  });

  it("uses a new attempt for acknowledged server warnings and invalidates it after edits", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "有重复候选的饮水点" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const warned = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "validation-failed",
        errors: [],
        warnings: [
          {
            code: "duplicate-candidate",
            fingerprint: "a".repeat(64),
            anchor: { changeIndex: 0, field: "name" },
          },
        ],
        suggestions: [],
      },
    });
    const acknowledged = transitionCampusMapEdit(warned.session, {
      type: "ACKNOWLEDGE_WARNINGS",
      idempotencyKey: secondKey,
    });
    const changedAgain = transitionCampusMapEdit(warned.session, {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "不再相同" },
    });

    expect(warned.session?.status).toBe("warning");
    expect(acknowledged.session).toMatchObject({
      status: "publishing",
      draft: {
        idempotencyKey: secondKey,
        warningAcknowledgements: [
          {
            changeIndex: 0,
            code: "duplicate-candidate",
            fingerprint: "a".repeat(64),
          },
        ],
      },
    });
    expect(changedAgain.session).toMatchObject({
      status: "editing",
      draft: { warningAcknowledgements: [] },
    });
  });

  it("keeps auth, rate limit, and transient retry as distinct resumable states", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "准备发布" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;

    for (const [result, expected] of [
      [
        { status: "authentication-required", code: "authentication-required" },
        "authentication-required",
      ],
      [
        {
          status: "rate-limited",
          code: "publish-rate-limit",
          scope: "actor",
          policy: "burst",
          retryAfter: 12,
        },
        "rate-limited",
      ],
      [
        {
          status: "temporarily-unavailable",
          code: "publish-unavailable",
          retryable: true,
        },
        "temporarily-unavailable",
      ],
    ] as const) {
      const next = transitionCampusMapEdit(publishing, {
        type: "PUBLISH_RESULT",
        idempotencyKey: firstKey,
        result,
      });
      expect(next.session?.status).toBe(expected);
      expect(
        decodeCampusMapEditSnapshot(encodeCampusMapEditSnapshot(next.session!)),
      ).toMatchObject({
        status: "restored",
        session: { status: expected },
      });
    }

    const auth = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "authentication-required",
        code: "authentication-required",
      },
    });
    expect(
      transitionCampusMapEdit(auth.session, { type: "AUTH_RETURNED" }).session
        ?.status,
    ).toBe("editing");
  });

  it("does not retry a rate-limited attempt before the server delay elapses", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "等待限流" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const limited = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "rate-limited",
        code: "publish-rate-limit",
        scope: "actor",
        policy: "burst",
        retryAfter: 12,
      },
    });

    expect(limited.commands).toContainEqual({
      kind: "schedule-rate-retry",
      afterSeconds: 12,
    });
    expect(
      transitionCampusMapEdit(limited.session, { type: "RETRY_PUBLISH" })
        .accepted,
    ).toBe(false);
    const ready = transitionCampusMapEdit(limited.session, {
      type: "RATE_LIMIT_ELAPSED",
    });
    expect(ready.session).toMatchObject({
      status: "rate-limited",
      retryAfter: 0,
    });
    expect(
      transitionCampusMapEdit(ready.session, { type: "RETRY_PUBLISH" }).session
        ?.status,
    ).toBe("publishing");
  });

  it("ignores stale responses and keeps the same key for transient retry", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "准备重试" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const stale = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: secondKey,
      result: {
        status: "temporarily-unavailable",
        code: "publish-unavailable",
        retryable: true,
      },
    });
    const unavailable = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "temporarily-unavailable",
        code: "publish-unavailable",
        retryable: true,
      },
    });
    const retry = transitionCampusMapEdit(unavailable.session, {
      type: "RETRY_PUBLISH",
    });

    expect(stale.accepted).toBe(false);
    expect(stale.session).toBe(publishing);
    expect(retry.session).toMatchObject({
      status: "publishing",
      draft: { idempotencyKey: firstKey },
    });
    expect(retry.commands).toContainEqual(
      expect.objectContaining({
        kind: "publish",
        command: expect.objectContaining({ idempotencyKey: firstKey }),
      }),
    );
  });

  it("keeps user input on conflict and rebases only through an explicit new attempt", () => {
    const mine = { ...fact, name: "我的名称" };
    const current = { ...fact, name: "服务器最新名称" };
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: mine,
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const conflicted = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "conflict",
        code: "base-revision-conflict",
        conflicts: [
          {
            code: "base-revision-conflict",
            anchor: { changeIndex: 0, placeId },
            placeId,
            expectedRevisionId: baseRevisionId,
            currentRevisionId,
            currentStatus: "active",
            currentSnapshot: { ...current, factSchemaVersion: 1 },
          },
        ],
      },
    });
    const continued = transitionCampusMapEdit(conflicted.session, {
      type: "CONTINUE_FROM_CONFLICT",
      idempotencyKey: secondKey,
    });

    expect(conflicted.session).toMatchObject({
      status: "conflict",
      draft: { fact: mine },
    });
    expect(continued.session).toMatchObject({
      status: "editing",
      draft: {
        fact: mine,
        baseRevisionId: currentRevisionId,
        idempotencyKey: secondKey,
        warningAcknowledgements: [],
      },
    });
  });

  it("clears the draft on success and makes published terminal against duplicate publish", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "发布后的名称" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;
    const published = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RESULT",
      idempotencyKey: firstKey,
      result: {
        status: "published",
        changesetId: "40000000-0000-4000-8000-000000000001",
        changes: [{ placeId, revisionId: currentRevisionId }],
        warnings: [],
        suggestions: [],
      },
    });
    const duplicate = transitionCampusMapEdit(published.session, {
      type: "REQUEST_PUBLISH",
    });

    expect(published.session).toMatchObject({
      status: "published",
      receipt: {
        placeId,
        revisionId: currentRevisionId,
        changesetId: "40000000-0000-4000-8000-000000000001",
      },
    });
    expect(published.commands).toContainEqual({ kind: "clear-snapshot" });
    expect(duplicate.accepted).toBe(false);
    expect(duplicate.commands).toEqual([]);
  });

  it("keeps a publishing payload immutable until its matching result arrives", () => {
    const dirty = transitionCampusMapEdit(editSession(), {
      type: "CHANGE_FACT",
      fact: { ...fact, name: "正在发布" },
    }).session!;
    const publishing = transitionCampusMapEdit(dirty, {
      type: "REQUEST_PUBLISH",
    }).session!;

    expect(
      transitionCampusMapEdit(publishing, {
        type: "CHANGE_FACT",
        fact: { ...fact, name: "竞态覆盖" },
      }),
    ).toMatchObject({ accepted: false, session: publishing });
    expect(
      transitionCampusMapEdit(publishing, { type: "REQUEST_CLOSE" }).accepted,
    ).toBe(false);
  });

  it("discards a structurally corrupted snapshot before rendering", () => {
    const encoded = encodeCampusMapEditSnapshot(editSession());
    const snapshot = JSON.parse(encoded) as {
      session: { draft: { fact: unknown } };
    };
    snapshot.session.draft.fact = { name: "missing controlled fields" };

    expect(decodeCampusMapEditSnapshot(JSON.stringify(snapshot))).toEqual({
      status: "discarded",
      reason: "invalid-snapshot",
    });
  });
});
