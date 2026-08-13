"use client";

import { useCallback, useEffect, useRef } from "react";

const DISCARD_CHANGES_MESSAGE = "当前公告有未保存更改，确定要放弃这些更改吗？";
const HISTORY_GUARD_STATE_KEY = "cupediaAnnouncementNavigationGuardToken";

type AnnouncementNavigationGuardOptions = {
  isDirty: boolean;
};

/**
 * Protects an announcement draft from browser and in-app navigation.
 *
 * Callers only decide whether the draft is dirty and ask before local state
 * transitions. Browser lifecycle, link filtering, and history traversal stay
 * private to this module.
 */
export function useUnsavedAnnouncementNavigation({
  isDirty,
}: AnnouncementNavigationGuardOptions) {
  const isDirtyRef = useRef(isDirty);

  useEffect(() => {
    isDirtyRef.current = isDirty;
  }, [isDirty]);

  const confirmDiscardChanges = useCallback(
    () => !isDirtyRef.current || window.confirm(DISCARD_CHANGES_MESSAGE),
    [],
  );

  useEffect(() => {
    const state = window.history.state as Record<string, unknown> | null;
    const existingToken = state?.[HISTORY_GUARD_STATE_KEY];
    const guardToken =
      typeof existingToken === "string"
        ? existingToken
        : `announcement-${Date.now()}-${Math.random()}`;
    const guardedUrl = window.location.href;

    if (typeof existingToken !== "string") {
      window.history.pushState(
        { ...state, [HISTORY_GUARD_STATE_KEY]: guardToken },
        "",
        guardedUrl,
      );
    }

    let skipNextTraversal = false;
    const handleHistoryNavigation = (event: PopStateEvent) => {
      const nextState = event.state as Record<string, unknown> | null;
      if (skipNextTraversal) {
        skipNextTraversal = false;
        return;
      }
      if (nextState?.[HISTORY_GUARD_STATE_KEY] === guardToken) {
        return;
      }

      const stayedOnGuardedUrl = window.location.href === guardedUrl;
      if (confirmDiscardChanges()) {
        if (stayedOnGuardedUrl) {
          skipNextTraversal = true;
          window.history.back();
        }
        return;
      }

      window.history.pushState(
        {
          ...window.history.state,
          [HISTORY_GUARD_STATE_KEY]: guardToken,
        },
        "",
        guardedUrl,
      );
    };

    window.addEventListener("popstate", handleHistoryNavigation);
    return () => {
      window.removeEventListener("popstate", handleHistoryNavigation);
    };
  }, [confirmDiscardChanges]);

  useEffect(() => {
    if (!isDirty) return;

    const preventUnsavedExit = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    const preventUnsavedNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      if (!(target instanceof Element)) return;
      const link = target.closest<HTMLAnchorElement>("a[href]");
      if (!link || link.target === "_blank" || link.hasAttribute("download")) {
        return;
      }

      const destination = new URL(link.href, window.location.href);
      if (
        destination.origin === window.location.origin &&
        destination.href !== window.location.href &&
        !confirmDiscardChanges()
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    window.addEventListener("beforeunload", preventUnsavedExit);
    document.addEventListener("click", preventUnsavedNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", preventUnsavedExit);
      document.removeEventListener("click", preventUnsavedNavigation, true);
    };
  }, [confirmDiscardChanges, isDirty]);

  return { confirmDiscardChanges };
}
