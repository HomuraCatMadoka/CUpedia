"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";

import {
  loadCampusMapEditablePlace,
  publishCampusMapEdit,
} from "@/lib/campus-map/edit-actions";
import {
  decodeCampusMapEditSnapshot,
  deriveCampusMapPublishCommand,
  encodeCampusMapEditSnapshot,
  isCampusMapEditDirty,
  isCampusMapPublishOutcomePending,
  transitionCampusMapEdit,
  type CampusMapEditDraft,
  type CampusMapEditEvent,
  type CampusMapIndoorLocationDisplay,
  type CampusMapEditSession,
  type CampusMapPlacement,
} from "@/lib/campus-map/edit-session";
import type {
  CampusMapDriverIntent,
  CampusMapSceneDriver,
} from "@/lib/campus-map/scene-driver";
import type { CampusMapPublishResult } from "@/lib/campus-map/publish-contract";
import type {
  CampusMapPublishReceiptOutcome,
  CampusMapPublishTransportResult,
} from "@/lib/campus-map/publish-receipt-consumer";

const SNAPSHOT_KEY = "cupedia:campus-map:edit-session:v1";
const CONFLICT_DISPLAY_TIMEOUT_MS = 1_500;

function removeSnapshotForPublish(idempotencyKey: string) {
  const encoded = window.sessionStorage.getItem(SNAPSHOT_KEY);
  if (!encoded) return;
  const snapshot = decodeCampusMapEditSnapshot(encoded);
  if (
    snapshot.status === "restored" &&
    snapshot.session.draft.idempotencyKey === idempotencyKey
  ) {
    window.sessionStorage.removeItem(SNAPSHOT_KEY);
  }
}

function conflictDisplayTarget(
  result: CampusMapPublishResult,
  draft: CampusMapEditDraft,
): { placeId: string; revisionId: string } | null {
  if (result.status !== "conflict") return null;
  const conflict = result.conflicts.find(
    (item) => item.currentRevisionId && item.currentSnapshot,
  );
  if (!conflict?.currentRevisionId || !conflict.currentSnapshot) return null;
  const current = conflict.currentSnapshot;
  const placementChanged =
    draft.fact.buildingId !== current.buildingId ||
    draft.fact.floorId !== current.floorId ||
    JSON.stringify(draft.fact.location) !== JSON.stringify(current.location);
  if (!placementChanged || current.location.kind === "outdoor-point") {
    return null;
  }
  return { placeId: conflict.placeId, revisionId: conflict.currentRevisionId };
}

async function loadConflictLocationDisplay(target: {
  placeId: string;
  revisionId: string;
}): Promise<CampusMapIndoorLocationDisplay | null> {
  let timeoutId: number | null = null;
  try {
    const current = await Promise.race([
      loadCampusMapEditablePlace(target.placeId),
      new Promise<null>((resolve) => {
        timeoutId = window.setTimeout(
          () => resolve(null),
          CONFLICT_DISPLAY_TIMEOUT_MS,
        );
      }),
    ]);
    return current?.baseRevisionId === target.revisionId
      ? current.locationDisplay
      : null;
  } catch {
    return null;
  } finally {
    if (timeoutId !== null) window.clearTimeout(timeoutId);
  }
}

export function useCampusMapEditSessionOwner({
  driver,
  dispatch,
  recoverPublish,
}: {
  driver: CampusMapSceneDriver;
  dispatch(intent: CampusMapDriverIntent): void;
  recoverPublish(
    command: Parameters<typeof publishCampusMapEdit>[0],
    transport?: (actorId: string) => Promise<CampusMapPublishTransportResult>,
    onIdentityVerified?: () => void,
  ): Promise<CampusMapPublishReceiptOutcome>;
}) {
  const { requestContributorSetup } = useContributorSetup();
  const [session, setSession] = useState<CampusMapEditSession | null>(null);
  const sessionRef = useRef<CampusMapEditSession | null>(null);
  const dispatcherRef = useRef<(event: CampusMapEditEvent) => void>(() => {});
  const restoredRef = useRef(false);
  const editLoadTokenRef = useRef(0);
  const rateLimitTimerRef = useRef<number | null>(null);
  const focusCommandTokenRef = useRef(0);
  const mountedRef = useRef(false);
  const [announcement, setAnnouncement] = useState("");
  const [restoreNotice, setRestoreNotice] = useState("");
  const clearPublishAnnouncement = useCallback(
    (idempotencyKey: string, mode: "publishing-only" | "all") => {
      const intentToken = driver.getIntentToken();
      const clear = (current: string) =>
        mode === "all" || current === "正在发布地点资料" ? "" : current;
      setAnnouncement(clear);
      window.requestAnimationFrame(() => {
        const current = sessionRef.current;
        if (
          driver.getIntentToken() !== intentToken ||
          (current && current.draft.idempotencyKey !== idempotencyKey)
        ) {
          return;
        }
        setAnnouncement(clear);
      });
    },
    [driver],
  );
  const releaseSupersededPublish = useCallback(
    (idempotencyKey: string) => {
      const current = sessionRef.current;
      if (current && current.draft.idempotencyKey !== idempotencyKey) {
        return;
      }
      if (current) {
        sessionRef.current = null;
        setSession(null);
      }
      removeSnapshotForPublish(idempotencyKey);
      clearPublishAnnouncement(idempotencyKey, "publishing-only");
    },
    [clearPublishAnnouncement],
  );

  const applyPublishOutcome = useCallback(
    async (
      idempotencyKey: string,
      intentToken: number,
      outcome: CampusMapPublishReceiptOutcome,
    ) => {
      if (sessionRef.current?.draft.idempotencyKey !== idempotencyKey) {
        return;
      }
      if (
        (outcome.status === "recoverable" &&
          (outcome.reason === "superseded" ||
            outcome.reason === "projection-superseded")) ||
        (outcome.status !== "applied" &&
          driver.getIntentToken() !== intentToken)
      ) {
        releaseSupersededPublish(idempotencyKey);
        return;
      }
      if (
        outcome.status === "applied" ||
        outcome.status === "already-consumed"
      ) {
        if (
          outcome.status === "already-consumed" &&
          driver.getSnapshot().session.mode === "task"
        ) {
          dispatch({ type: "CANCEL_TASK" });
        }
        dispatcherRef.current({
          type: "PUBLISH_HANDOFF_COMPLETED",
          idempotencyKey,
        });
        clearPublishAnnouncement(idempotencyKey, "all");
        return;
      }
      if (outcome.status === "recoverable") {
        dispatcherRef.current({
          type: "PUBLISH_RECOVERY_RESULT",
          idempotencyKey,
          reason: outcome.reason,
        });
        return;
      }
      const result = outcome.result;
      const draft = sessionRef.current?.draft;
      const target = draft ? conflictDisplayTarget(result, draft) : null;
      const conflictLocationDisplay = target
        ? await loadConflictLocationDisplay(target)
        : null;
      if (
        sessionRef.current?.draft.idempotencyKey !== idempotencyKey ||
        driver.getIntentToken() !== intentToken
      ) {
        releaseSupersededPublish(idempotencyKey);
        return;
      }
      dispatcherRef.current({
        type: "PUBLISH_RESULT",
        idempotencyKey,
        result,
        conflictLocationDisplay,
      });
    },
    [clearPublishAnnouncement, dispatch, driver, releaseSupersededPublish],
  );

  const applyEvent = useCallback(
    (event: CampusMapEditEvent) => {
      const previousSession = sessionRef.current;
      const transition = transitionCampusMapEdit(previousSession, event);
      if (!transition.accepted) return;
      const focusCommandToken = ++focusCommandTokenRef.current;
      sessionRef.current = transition.session;
      setSession(transition.session);

      for (const command of transition.commands) {
        if (command.kind === "persist-snapshot" && transition.session) {
          window.sessionStorage.setItem(
            SNAPSHOT_KEY,
            encodeCampusMapEditSnapshot(transition.session),
          );
        } else if (command.kind === "clear-snapshot") {
          window.sessionStorage.removeItem(SNAPSHOT_KEY);
        } else if (command.kind === "scene") {
          if (command.intent === "start-create") {
            dispatch({ type: "START_CREATE" });
          } else if (command.intent === "start-edit" && transition.session) {
            dispatch({
              type: "START_EDIT",
              placeId: transition.session.draft.placeId!,
            });
          } else if (command.intent === "cancel-task") {
            dispatch({ type: "CANCEL_TASK" });
          }
        } else if (command.kind === "camera") {
          driver.recenterEditPosition(command.position, "reposition");
        } else if (command.kind === "focus") {
          const intentToken = driver.getIntentToken();
          window.setTimeout(() => {
            if (
              focusCommandTokenRef.current !== focusCommandToken ||
              sessionRef.current !== transition.session ||
              driver.getIntentToken() !== intentToken
            ) {
              return;
            }
            if (command.target === "form-heading") {
              driver.focusContributionForm();
            } else {
              driver.focusEditField(command.target);
            }
          }, 0);
        } else if (command.kind === "announce") {
          const intentToken = driver.getIntentToken();
          setAnnouncement("");
          window.requestAnimationFrame(() => {
            if (
              sessionRef.current !== transition.session ||
              driver.getIntentToken() !== intentToken
            ) {
              return;
            }
            setAnnouncement(command.message);
          });
        } else if (command.kind === "publish") {
          const idempotencyKey = command.command.idempotencyKey;
          const intentToken = driver.getIntentToken();
          const transport =
            previousSession?.status === "temporarily-unavailable" ||
            previousSession?.status === "publish-unknown" ||
            previousSession?.status === "publish-identity" ||
            previousSession?.status === "publish-recovery-unavailable"
              ? undefined
              : (actorId: string) =>
                  publishCampusMapEdit(command.command, actorId);
          void recoverPublish(command.command, transport).then(
            (outcome) =>
              applyPublishOutcome(idempotencyKey, intentToken, outcome),
            () =>
              applyPublishOutcome(idempotencyKey, intentToken, {
                status: "recoverable",
                reason: "reconciliation-unavailable",
              }),
          );
        } else if (command.kind === "schedule-rate-retry") {
          if (rateLimitTimerRef.current !== null) {
            window.clearTimeout(rateLimitTimerRef.current);
          }
          rateLimitTimerRef.current = window.setTimeout(
            () =>
              dispatcherRef.current({
                type: "RATE_LIMIT_ELAPSED",
                idempotencyKey: command.idempotencyKey,
              }),
            Math.min(Math.max(command.afterSeconds, 0), 86_400) * 1000,
          );
        }
      }
      if (
        event.type === "CONFIRM_POSITION" &&
        event.position.method === "keyboard"
      ) {
        driver.recenterEditPosition(
          [event.position.longitude, event.position.latitude],
          "keyboard-placement",
        );
      }
    },
    [applyPublishOutcome, dispatch, driver, recoverPublish],
  );

  const dispatchEvent = useCallback(
    (event: CampusMapEditEvent) => {
      if (
        event.type !== "REQUEST_PUBLISH" &&
        event.type !== "CONTRIBUTOR_SETUP_COMPLETED"
      ) {
        applyEvent(event);
        return;
      }
      const requestedSession = sessionRef.current;
      void requestContributorSetup({
        recheck: event.type === "CONTRIBUTOR_SETUP_COMPLETED",
      }).then((outcome) => {
        if (
          !mountedRef.current ||
          sessionRef.current !== requestedSession ||
          outcome === "cancelled"
        ) {
          return;
        }
        applyEvent(event);
      });
    },
    [applyEvent, requestContributorSetup],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    dispatcherRef.current = dispatchEvent;
  }, [dispatchEvent]);

  useEffect(
    () =>
      driver.subscribe(() => {
        editLoadTokenRef.current += 1;
      }),
    [driver],
  );

  const startAdd = useCallback(() => {
    editLoadTokenRef.current += 1;
    dispatchEvent({
      type: "START_ADD",
      idempotencyKey: window.crypto.randomUUID(),
    });
  }, [dispatchEvent]);

  const startAddAtPosition = useCallback(
    (position: CampusMapPlacement) => {
      editLoadTokenRef.current += 1;
      dispatchEvent({
        type: "START_ADD_AT_POSITION",
        idempotencyKey: window.crypto.randomUUID(),
        position,
      });
    },
    [dispatchEvent],
  );

  const startEdit = useCallback(
    async (placeId: string) => {
      const token = ++editLoadTokenRef.current;
      try {
        const current = await loadCampusMapEditablePlace(placeId);
        if (token !== editLoadTokenRef.current) return;
        if (!current) {
          setAnnouncement("这项地点资料暂时不能修改");
          return;
        }
        dispatchEvent({
          type: "START_EDIT",
          placeId: current.placeId,
          baseRevisionId: current.baseRevisionId,
          fact: current.fact,
          sources: [],
          idempotencyKey: window.crypto.randomUUID(),
          locationDisplay: current.locationDisplay,
        });
      } catch {
        if (token !== editLoadTokenRef.current) return;
        setAnnouncement("暂时无法读取地点的最新资料，请稍后重试");
      }
    },
    [dispatchEvent],
  );

  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    driver.start();
    const encoded = window.sessionStorage.getItem(SNAPSHOT_KEY);
    if (!encoded) {
      const urlSession = driver.getSnapshot().session;
      if (urlSession.mode === "task" && urlSession.task.kind === "edit") {
        const placeId = urlSession.task.placeId;
        queueMicrotask(() => void startEdit(placeId));
      } else if (urlSession.mode === "task") {
        dispatch({ type: "CANCEL_TASK" });
        queueMicrotask(() =>
          setRestoreNotice("这项地图编辑已结束，没有可恢复的草稿。"),
        );
      }
      return;
    }
    const restored = decodeCampusMapEditSnapshot(encoded);
    if (restored.status === "discarded") {
      window.sessionStorage.removeItem(SNAPSHOT_KEY);
      queueMicrotask(() =>
        setRestoreNotice("已丢弃损坏或不兼容的地图编辑草稿。"),
      );
      if (driver.getSnapshot().session.mode === "task") {
        dispatch({ type: "CANCEL_TASK" });
      }
      return;
    }
    const urlSession = driver.getSnapshot().session;
    const matchesExactUrlTask =
      urlSession.mode === "task" &&
      (urlSession.task.kind === "create"
        ? restored.session.draft.mode === "add"
        : restored.session.draft.mode === "edit" &&
          restored.session.draft.placeId === urlSession.task.placeId);
    const isRecoveringPublish = isCampusMapPublishOutcomePending(
      restored.session.status,
    );
    const matchesUrlTask = isRecoveringPublish
      ? matchesExactUrlTask
      : urlSession.mode !== "task" || matchesExactUrlTask;
    if (!matchesUrlTask) {
      window.sessionStorage.removeItem(SNAPSHOT_KEY);
      dispatch({ type: "CANCEL_TASK" });
      queueMicrotask(() =>
        setRestoreNotice(
          "草稿与当前编辑目标不一致，已为安全起见丢弃这份草稿。",
        ),
      );
      return;
    }
    const next =
      restored.session.status === "authentication-required"
        ? transitionCampusMapEdit(restored.session, { type: "AUTH_RETURNED" })
            .session
        : restored.session;
    const revealRestoredSession = () => {
      sessionRef.current = next;
      if (next !== restored.session) {
        window.sessionStorage.setItem(
          SNAPSHOT_KEY,
          encodeCampusMapEditSnapshot(next!),
        );
      }
      if (next && driver.getSnapshot().session.mode !== "task") {
        dispatch(
          next.draft.mode === "add"
            ? { type: "START_CREATE" }
            : { type: "START_EDIT", placeId: next.draft.placeId! },
        );
      }
      const intentToken = driver.getIntentToken();
      queueMicrotask(() => {
        if (
          sessionRef.current !== next ||
          driver.getIntentToken() !== intentToken
        ) {
          return;
        }
        setSession(next);
        window.requestAnimationFrame(() => {
          if (
            sessionRef.current !== next ||
            driver.getIntentToken() !== intentToken
          ) {
            return;
          }
          driver.focusContributionForm();
          const restoredPosition =
            next?.draft.placementCandidate ??
            (next?.draft.fact.location?.kind === "outdoor-point"
              ? {
                  longitude: next.draft.fact.location.longitude,
                  latitude: next.draft.fact.location.latitude,
                }
              : null);
          if (restoredPosition) {
            driver.recenterEditPosition(
              [restoredPosition.longitude, restoredPosition.latitude],
              "draft-restore",
            );
          }
        });
      });
      if (next?.status === "rate-limited" && (next.retryAfter ?? 0) > 0) {
        rateLimitTimerRef.current = window.setTimeout(
          () =>
            dispatcherRef.current({
              type: "RATE_LIMIT_ELAPSED",
              idempotencyKey: next.draft.idempotencyKey,
            }),
          Math.min(next.retryAfter ?? 0, 86_400) * 1000,
        );
      }
      queueMicrotask(() => {
        if (
          sessionRef.current === next &&
          driver.getIntentToken() === intentToken
        ) {
          setAnnouncement("已恢复未发布的地图编辑草稿");
        }
      });
    };
    if (next && isCampusMapPublishOutcomePending(next.status)) {
      const command = deriveCampusMapPublishCommand(next.draft);
      const intentToken = driver.getIntentToken();
      void recoverPublish(command).then((outcome) => {
        if (
          (outcome.status === "recoverable" &&
            (outcome.reason === "superseded" ||
              outcome.reason === "projection-superseded")) ||
          (outcome.status !== "applied" &&
            driver.getIntentToken() !== intentToken)
        ) {
          releaseSupersededPublish(command.idempotencyKey);
          return;
        }
        if (
          sessionRef.current &&
          sessionRef.current.draft.idempotencyKey !== command.idempotencyKey
        ) {
          return;
        }
        sessionRef.current = next;
        setSession(next);
        void applyPublishOutcome(command.idempotencyKey, intentToken, outcome);
      });
    } else {
      revealRestoredSession();
    }
  }, [
    applyPublishOutcome,
    dispatch,
    driver,
    recoverPublish,
    releaseSupersededPublish,
    startEdit,
  ]);

  useEffect(() => {
    if (!isCampusMapEditDirty(session)) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [session]);

  useEffect(
    () => () => {
      if (rateLimitTimerRef.current !== null) {
        window.clearTimeout(rateLimitTimerRef.current);
      }
    },
    [],
  );

  return {
    session,
    dispatchEvent,
    startAdd,
    startAddAtPosition,
    startEdit,
    announcement,
    restoreNotice,
  };
}
