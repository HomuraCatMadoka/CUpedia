"use client";

import Link from "next/link";
import { BusFrontIcon, FlaskConicalIcon } from "lucide-react";
import {
  useCallback,
  useRef,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import { CampusBusBoardingPlacePicker } from "@/components/campus-transport/campus-bus-boarding-place-picker";
import { CampusBusRouteList } from "@/components/campus-transport/campus-bus-route-list";
import type { CampusBusPassengerRoute } from "@/lib/campus-transport/campus-bus";

type CampusBusHomeTab = "nearby" | "routes";

type CampusBusHomeProps = {
  initialNow: number;
  modelOperationsEnabled: boolean;
  routes: CampusBusPassengerRoute[];
};

export const CAMPUS_BUS_HOME_TAB_STORAGE_KEY = "cupedia:campus-bus-home-tab:v1";
const TAB_CHANGE_EVENT = "cupedia:campus-bus-home-tab-change";

function storedTab(): CampusBusHomeTab {
  try {
    const value = JSON.parse(
      window.localStorage.getItem(CAMPUS_BUS_HOME_TAB_STORAGE_KEY) ?? "null",
    );
    return value?.version === 1 && value?.tab === "routes"
      ? "routes"
      : "nearby";
  } catch {
    return "nearby";
  }
}

function serverTab(): CampusBusHomeTab {
  return "nearby";
}

function subscribeToTabChange(onStoreChange: () => void) {
  window.addEventListener(TAB_CHANGE_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(TAB_CHANGE_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function selectStoredTab(nextTab: CampusBusHomeTab) {
  try {
    window.localStorage.setItem(
      CAMPUS_BUS_HOME_TAB_STORAGE_KEY,
      JSON.stringify({ tab: nextTab, version: 1 }),
    );
  } catch {
    // Storage can be unavailable in private or restricted browsing.
  }
  window.dispatchEvent(new Event(TAB_CHANGE_EVENT));
}

export function CampusBusHome({
  initialNow,
  modelOperationsEnabled,
  routes,
}: CampusBusHomeProps) {
  const tab = useSyncExternalStore(subscribeToTabChange, storedTab, serverTab);
  const nearbyTabRef = useRef<HTMLButtonElement>(null);
  const routesTabRef = useRef<HTMLButtonElement>(null);
  const selectTab = useCallback((nextTab: CampusBusHomeTab) => {
    selectStoredTab(nextTab);
  }, []);
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const nextTab = tab === "nearby" ? "routes" : "nearby";
    selectTab(nextTab);
    (nextTab === "nearby" ? nearbyTabRef : routesTabRef).current?.focus();
  }

  return (
    <section className="w-full overflow-hidden bg-background shadow-sm ring-1 ring-black/5 sm:rounded-2xl">
      <header className="flex items-center justify-between gap-4 bg-[#5b2a73] px-5 py-7 text-white sm:px-7">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-white/12">
            <BusFrontIcon className="size-6" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">中大校巴</h1>
            <p className="mt-0.5 text-sm text-white/78">
              今日班次與預計到站時間
            </p>
          </div>
        </div>
        {modelOperationsEnabled ? (
          <Link
            href="/campus-bus/lab"
            className="grid size-11 place-items-center rounded-xl bg-white/10 text-white transition-colors hover:bg-white/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
            aria-label="模型實驗室"
          >
            <FlaskConicalIcon className="size-4" aria-hidden="true" />
          </Link>
        ) : null}
      </header>

      <div
        className="grid grid-cols-2 border-b bg-background"
        role="tablist"
        aria-label="校巴首頁內容"
      >
        <button
          type="button"
          role="tab"
          ref={nearbyTabRef}
          id="campus-bus-nearby-tab"
          aria-controls="campus-bus-nearby-panel"
          aria-selected={tab === "nearby"}
          tabIndex={tab === "nearby" ? 0 : -1}
          onClick={() => selectTab("nearby")}
          onKeyDown={handleTabKeyDown}
          className="relative min-h-13 touch-manipulation px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b2a73]/40 aria-selected:text-[#5b2a73] aria-selected:after:absolute aria-selected:after:inset-x-7 aria-selected:after:bottom-0 aria-selected:after:h-0.5 aria-selected:after:bg-[#5b2a73] dark:aria-selected:text-[#e7c9f1] dark:aria-selected:after:bg-[#d8b9e4]"
        >
          附近
        </button>
        <button
          type="button"
          role="tab"
          ref={routesTabRef}
          id="campus-bus-routes-tab"
          aria-controls="campus-bus-routes-panel"
          aria-selected={tab === "routes"}
          tabIndex={tab === "routes" ? 0 : -1}
          onClick={() => selectTab("routes")}
          onKeyDown={handleTabKeyDown}
          className="relative min-h-13 touch-manipulation px-4 py-3 text-sm font-semibold text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#5b2a73]/40 aria-selected:text-[#5b2a73] aria-selected:after:absolute aria-selected:after:inset-x-7 aria-selected:after:bottom-0 aria-selected:after:h-0.5 aria-selected:after:bg-[#5b2a73] dark:aria-selected:text-[#e7c9f1] dark:aria-selected:after:bg-[#d8b9e4]"
        >
          全部路線
        </button>
      </div>

      <div
        role="tabpanel"
        id={`campus-bus-${tab}-panel`}
        aria-labelledby={`campus-bus-${tab}-tab`}
      >
        {tab === "nearby" ? (
          <CampusBusBoardingPlacePicker
            initialNow={initialNow}
            routes={routes}
          />
        ) : (
          <CampusBusRouteList initialNow={initialNow} routes={routes} />
        )}
      </div>

      <footer className="border-t px-5 py-3 text-center text-xs text-muted-foreground sm:px-7">
        今日班次依官方資料整理 · 預計到站時間由模型推算
      </footer>
    </section>
  );
}
