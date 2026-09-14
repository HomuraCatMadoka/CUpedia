"use client";

import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState, type PointerEvent } from "react";

import {
  campusMapNearestBrowseSheetSnap,
  type CampusMapBrowseSheetSnap,
} from "@/lib/campus-map/card-layout";

export function CampusMapBrowseSheetControls({
  snap,
  onSnap,
}: {
  snap: CampusMapBrowseSheetSnap;
  onSnap: (snap: CampusMapBrowseSheetSnap) => void;
}) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const activatedControlRef = useRef<HTMLButtonElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    y: number;
    height: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const [canExpand, setCanExpand] = useState(false);

  useLayoutEffect(() => {
    const activated = activatedControlRef.current;
    activatedControlRef.current = null;
    if (
      activated &&
      !activated.isConnected &&
      document.activeElement === document.body
    ) {
      handleRef.current?.focus();
    }
  }, [snap]);

  function changeSnap(
    next: CampusMapBrowseSheetSnap,
    control: HTMLButtonElement,
  ) {
    activatedControlRef.current =
      document.activeElement === control ? control : null;
    onSnap(next);
  }

  useLayoutEffect(() => {
    const controls = controlsRef.current;
    const content = controls?.parentElement;
    const panel = content?.parentElement;
    if (!controls || !content || !panel) return;
    const measure = () => {
      const scroll = content.querySelector<HTMLElement>(
        "[data-campus-map-card-scroll]",
      );
      const naturalContent = scroll?.firstElementChild;
      let total = 0;
      let core = 0;
      for (const child of content.children) {
        const height =
          child === scroll && naturalContent
            ? naturalContent.getBoundingClientRect().height
            : child.getBoundingClientRect().height;
        total += height;
        if (child !== scroll) core += height;
      }
      panel.style.setProperty(
        "--campus-map-browse-content-height",
        `${Math.ceil(total)}px`,
      );
      panel.style.setProperty(
        "--campus-map-browse-core-height",
        `${Math.ceil(core)}px`,
      );
      panel.parentElement?.style.setProperty(
        "--campus-map-browse-content-height",
        `${Math.ceil(total)}px`,
      );
      panel.parentElement?.style.setProperty(
        "--campus-map-browse-core-height",
        `${Math.ceil(core)}px`,
      );
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      panel.parentElement?.style.setProperty(
        "--campus-map-browse-viewport-height",
        `${viewport}px`,
      );
      const bottomInset = window.visualViewport
        ? Math.max(
            0,
            panel.parentElement!.getBoundingClientRect().height -
              viewport -
              window.visualViewport.offsetTop,
          )
        : 0;
      panel.parentElement?.style.setProperty(
        "--campus-map-browse-bottom-inset",
        `${bottomInset}px`,
      );
      setCanExpand(
        total - controls.getBoundingClientRect().height >
          Math.min(380, viewport * 0.45),
      );
    };
    const observer = new ResizeObserver(measure);
    const observeContent = () => {
      observer.disconnect();
      for (const child of content.children) observer.observe(child);
      const naturalContent = content.querySelector(
        "[data-campus-map-card-scroll]",
      )?.firstElementChild;
      if (naturalContent) observer.observe(naturalContent);
      measure();
    };
    const mutations = new MutationObserver(observeContent);
    mutations.observe(content, { childList: true, subtree: true });
    observeContent();
    window.visualViewport?.addEventListener("resize", measure);
    window.visualViewport?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      mutations.disconnect();
      window.visualViewport?.removeEventListener("resize", measure);
      window.visualViewport?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
      panel.style.removeProperty("--campus-map-drag-height");
      panel.parentElement?.style.removeProperty(
        "--campus-map-browse-content-height",
      );
      panel.parentElement?.style.removeProperty(
        "--campus-map-browse-core-height",
      );
      panel.parentElement?.style.removeProperty(
        "--campus-map-browse-viewport-height",
      );
      panel.parentElement?.style.removeProperty(
        "--campus-map-browse-bottom-inset",
      );
    };
  }, []);

  function finishDrag(
    event: PointerEvent<HTMLButtonElement>,
    cancelled = false,
  ) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    suppressClickRef.current = drag.moved;
    const panel = controlsRef.current?.parentElement?.parentElement;
    if (!panel) return;
    const height = panel.getBoundingClientRect().height;
    panel.style.removeProperty("--campus-map-drag-height");
    if (cancelled || !drag.moved) return;
    onSnap(
      campusMapNearestBrowseSheetSnap(
        height,
        Number.parseFloat(
          panel.style.getPropertyValue("--campus-map-browse-content-height"),
        ),
        Number.parseFloat(
          panel.style.getPropertyValue("--campus-map-browse-core-height"),
        ),
        window.visualViewport?.height ?? window.innerHeight,
      ),
    );
  }

  return (
    <div
      ref={controlsRef}
      hidden={!canExpand}
      className={
        canExpand
          ? "flex h-11 shrink-0 items-center justify-between px-5 md:hidden"
          : "hidden"
      }
    >
      <button
        ref={handleRef}
        type="button"
        aria-label="拖动或点击展开卡片"
        aria-controls="campus-map-card-details"
        aria-expanded={snap !== "peek"}
        className="grid h-11 w-16 touch-none place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={(event) => {
          const suppress = suppressClickRef.current;
          suppressClickRef.current = false;
          if (suppress && event.detail !== 0) return;
          onSnap(snap === "peek" ? "half" : snap === "half" ? "full" : "peek");
        }}
        onPointerDown={(event) => {
          if (!event.isPrimary || event.button !== 0) return;
          suppressClickRef.current = false;
          const panel = controlsRef.current?.parentElement?.parentElement;
          if (!panel) return;
          dragRef.current = {
            pointerId: event.pointerId,
            y: event.clientY,
            height: panel.getBoundingClientRect().height,
            moved: false,
          };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          const drag = dragRef.current;
          const panel = controlsRef.current?.parentElement?.parentElement;
          if (!drag || drag.pointerId !== event.pointerId || !panel) return;
          const delta = drag.y - event.clientY;
          if (Math.abs(delta) < 6 && !drag.moved) return;
          drag.moved = true;
          const viewport = window.visualViewport?.height ?? window.innerHeight;
          const core =
            Number.parseFloat(
              panel.style.getPropertyValue("--campus-map-browse-core-height"),
            ) || 0;
          panel.style.setProperty(
            "--campus-map-drag-height",
            `${Math.max(core, Math.min(viewport - 80, drag.height + delta))}px`,
          );
        }}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onLostPointerCapture={(event) => finishDrag(event, true)}
      >
        <span
          aria-hidden="true"
          className="h-1 w-10 rounded-full bg-muted-foreground/40"
        />
      </button>
      <div className="flex items-center gap-1">
        {snap !== "peek" ? (
          <button
            type="button"
            aria-controls="campus-map-card-details"
            aria-expanded="true"
            onClick={(event) =>
              changeSnap(snap === "full" ? "half" : "peek", event.currentTarget)
            }
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronDownIcon aria-hidden="true" className="size-4" />
            收起
          </button>
        ) : null}
        {snap !== "full" ? (
          <button
            type="button"
            aria-controls="campus-map-card-details"
            aria-expanded={snap !== "peek"}
            onClick={(event) =>
              changeSnap(snap === "peek" ? "half" : "full", event.currentTarget)
            }
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronUpIcon aria-hidden="true" className="size-4" />
            {snap === "peek" ? "展开详情" : "完全展开"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
