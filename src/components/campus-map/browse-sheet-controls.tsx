"use client";

import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import {
  useLayoutEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

import { campusMapNearestBrowseSheetSnap } from "@/lib/campus-map/card-layout";
import type { CampusMapBrowseSheetSnap } from "@/lib/campus-map/scene-kernel";

function resolvePanel(controls: HTMLElement | null) {
  return controls?.closest<HTMLElement>("[data-campus-map-panel]") ?? null;
}

export function CampusMapBrowseSheetControls({
  snap,
  onSnap,
  children,
}: {
  snap: CampusMapBrowseSheetSnap;
  onSnap: (snap: CampusMapBrowseSheetSnap) => void;
  children?: ReactNode;
}) {
  const controlsRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const handleRef = useRef<HTMLButtonElement>(null);
  const activatedControlRef = useRef<HTMLButtonElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    y: number;
    height: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const measurementsRef = useRef({ contentHeight: 0, coreHeight: 0 });
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
    const panel = resolvePanel(controls);
    const layoutRoot = panel?.parentElement;
    if (!controls || !content || !panel || !layoutRoot) return;
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
      measurementsRef.current = { contentHeight: total, coreHeight: core };
      layoutRoot.style.setProperty(
        "--campus-map-browse-content-height",
        `${Math.ceil(total)}px`,
      );
      layoutRoot.style.setProperty(
        "--campus-map-browse-core-height",
        `${Math.ceil(core)}px`,
      );
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      layoutRoot.style.setProperty(
        "--campus-map-browse-viewport-height",
        `${viewport}px`,
      );
      const bottomInset = window.visualViewport
        ? Math.max(
            0,
            layoutRoot.getBoundingClientRect().height -
              viewport -
              window.visualViewport.offsetTop,
          )
        : 0;
      layoutRoot.style.setProperty(
        "--campus-map-browse-bottom-inset",
        `${bottomInset}px`,
      );
      setCanExpand(
        total -
          controls.getBoundingClientRect().height -
          (footerRef.current?.getBoundingClientRect().height ?? 0) >
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
      layoutRoot.style.removeProperty("--campus-map-browse-content-height");
      layoutRoot.style.removeProperty("--campus-map-browse-core-height");
      layoutRoot.style.removeProperty("--campus-map-browse-viewport-height");
      layoutRoot.style.removeProperty("--campus-map-browse-bottom-inset");
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
    const panel = resolvePanel(controlsRef.current);
    if (!panel) return;
    const height = panel.getBoundingClientRect().height;
    panel.style.removeProperty("--campus-map-drag-height");
    if (cancelled || !drag.moved) return;
    onSnap(
      campusMapNearestBrowseSheetSnap(
        height,
        measurementsRef.current.contentHeight,
        measurementsRef.current.coreHeight,
        window.visualViewport?.height ?? window.innerHeight,
      ),
    );
  }

  return (
    <>
      <div
        ref={controlsRef}
        hidden={!canExpand}
        className={canExpand ? "relative h-6 shrink-0 md:hidden" : "hidden"}
      >
        <button
          ref={handleRef}
          type="button"
          aria-label="拖动或点击展开卡片"
          aria-controls="campus-map-card-details"
          aria-expanded={snap !== "peek"}
          className="absolute top-0 left-1/2 flex h-11 w-16 -translate-x-1/2 touch-none justify-center rounded-full pt-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={(event) => {
            const suppress = suppressClickRef.current;
            suppressClickRef.current = false;
            if (suppress && event.detail !== 0) return;
            onSnap(
              snap === "peek" ? "half" : snap === "half" ? "full" : "peek",
            );
          }}
          onPointerDown={(event) => {
            if (!event.isPrimary || event.button !== 0) return;
            suppressClickRef.current = false;
            const panel = resolvePanel(controlsRef.current);
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
            const panel = resolvePanel(controlsRef.current);
            if (!drag || drag.pointerId !== event.pointerId || !panel) return;
            const delta = drag.y - event.clientY;
            if (Math.abs(delta) < 6 && !drag.moved) return;
            drag.moved = true;
            const viewport =
              window.visualViewport?.height ?? window.innerHeight;
            const core = measurementsRef.current.coreHeight;
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
            className="h-1 w-8 rounded-full bg-[#bdc1c6] dark:bg-[#80868b]"
          />
        </button>
      </div>
      {children}
      <div
        ref={footerRef}
        hidden={!canExpand}
        className={
          canExpand
            ? "flex min-h-[50px] shrink-0 border-t border-border/50 px-5 md:hidden"
            : "hidden"
        }
      >
        {snap !== "peek" ? (
          <button
            type="button"
            aria-controls="campus-map-card-details"
            aria-expanded="true"
            onClick={(event) =>
              changeSnap(snap === "full" ? "half" : "peek", event.currentTarget)
            }
            className="inline-flex min-h-11 flex-1 items-center justify-between gap-2 rounded-lg text-sm font-medium text-[#235741] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-[#a9ddbc]"
          >
            收起
            <ChevronDownIcon aria-hidden="true" className="size-4" />
          </button>
        ) : null}
        {snap !== "full" ? (
          <button
            type="button"
            aria-controls="campus-map-card-details"
            aria-expanded={snap !== "peek"}
            onClick={(event) => changeSnap("full", event.currentTarget)}
            className="inline-flex min-h-11 flex-1 items-center justify-between gap-2 rounded-lg text-sm font-medium text-[#235741] hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-[#a9ddbc]"
          >
            {snap === "peek" ? "展开详情" : "完全展开"}
            <ChevronUpIcon aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
    </>
  );
}
