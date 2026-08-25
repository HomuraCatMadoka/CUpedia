"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  loadCampusMapEditablePlace,
  publishCampusMapEdit,
} from "@/lib/campus-map/edit-actions";
import {
  decodeCampusMapEditSnapshot,
  encodeCampusMapEditSnapshot,
  isCampusMapEditDirty,
  transitionCampusMapEdit,
  type CampusMapEditEvent,
  type CampusMapEditSession,
} from "@/lib/campus-map/edit-session";
import type {
  CampusMapDriverIntent,
  CampusMapSceneDriver,
} from "@/lib/campus-map/scene-driver";

const SNAPSHOT_KEY = "cupedia:campus-map:edit-session:v1";

export function useCampusMapEditSessionOwner({
  driver,
  dispatch,
}: {
  driver: CampusMapSceneDriver;
  dispatch(intent: CampusMapDriverIntent): void;
}) {
  const [session, setSession] = useState<CampusMapEditSession | null>(null);
  const sessionRef = useRef<CampusMapEditSession | null>(null);
  const dispatcherRef = useRef<(event: CampusMapEditEvent) => void>(() => {});
  const restoredRef = useRef(false);
  const editLoadTokenRef = useRef(0);
  const rateLimitTimerRef = useRef<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const [restoreNotice, setRestoreNotice] = useState("");

  const dispatchEvent = useCallback(
    (event: CampusMapEditEvent) => {
      const transition = transitionCampusMapEdit(sessionRef.current, event);
      if (!transition.accepted) return;
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
        } else if (command.kind === "focus") {
          if (command.target === "form-heading") {
            driver.focusContributionForm();
          } else {
            driver.focusEditField(command.target);
          }
        } else if (command.kind === "announce") {
          setAnnouncement("");
          window.requestAnimationFrame(() => setAnnouncement(command.message));
        } else if (command.kind === "publish") {
          const idempotencyKey = command.command.idempotencyKey;
          void publishCampusMapEdit(command.command).then(
            (result) =>
              dispatcherRef.current({
                type: "PUBLISH_RESULT",
                idempotencyKey,
                result,
              }),
            () =>
              dispatcherRef.current({
                type: "PUBLISH_RESULT",
                idempotencyKey,
                result: {
                  status: "temporarily-unavailable",
                  code: "publish-unavailable",
                  retryable: true,
                },
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
    [dispatch, driver],
  );

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

  const startEdit = useCallback(
    async (placeId: string) => {
      const token = ++editLoadTokenRef.current;
      try {
        const current = await loadCampusMapEditablePlace(placeId);
        if (token !== editLoadTokenRef.current) return;
        if (!current) {
          setAnnouncement("这项原型资料尚未连接到正式 Place，暂时不能修改");
          return;
        }
        dispatchEvent({
          type: "START_EDIT",
          placeId: current.placeId,
          baseRevisionId: current.baseRevisionId,
          fact: current.fact,
          sources: [],
          idempotencyKey: window.crypto.randomUUID(),
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
      if (driver.getSnapshot().session.mode === "task") {
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
    const matchesUrlTask =
      urlSession.mode !== "task" ||
      (urlSession.task.kind === "create"
        ? restored.session.draft.mode === "add"
        : restored.session.draft.mode === "edit" &&
          restored.session.draft.placeId === urlSession.task.placeId);
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
    sessionRef.current = next;
    if (next !== restored.session) {
      window.sessionStorage.setItem(
        SNAPSHOT_KEY,
        encodeCampusMapEditSnapshot(next!),
      );
    }
    queueMicrotask(() => {
      setSession(next);
      window.requestAnimationFrame(() => {
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
    if (next && driver.getSnapshot().session.mode !== "task") {
      dispatch(
        next.draft.mode === "add"
          ? { type: "START_CREATE" }
          : { type: "START_EDIT", placeId: next.draft.placeId! },
      );
    }
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
    queueMicrotask(() => setAnnouncement("已恢复未发布的地图编辑草稿"));
  }, [dispatch, driver]);

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
    startEdit,
    announcement,
    restoreNotice,
  };
}
