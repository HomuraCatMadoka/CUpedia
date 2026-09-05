"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  SIDEBAR_COLLAPSED_ATTRIBUTE,
  SIDEBAR_PREFERENCE_STORAGE_KEY,
} from "@/lib/sidebar-preference";

type SidebarState = "expanded" | "collapsed" | "mobile-open";

interface SidebarContextValue {
  state: SidebarState;
  isMobile: boolean;
  expand: () => void;
  collapse: () => void;
  toggle: () => void;
  openMobile: () => void;
  closeMobile: () => void;
  mobileTriggerRef: React.RefObject<HTMLButtonElement | null>;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

function persist(collapsed: boolean) {
  document.documentElement.toggleAttribute(
    SIDEBAR_COLLAPSED_ATTRIBUTE,
    collapsed,
  );

  try {
    if (collapsed) {
      window.localStorage.setItem(SIDEBAR_PREFERENCE_STORAGE_KEY, "collapsed");
    } else {
      window.localStorage.removeItem(SIDEBAR_PREFERENCE_STORAGE_KEY);
    }
  } catch {
    // The React state still keeps this tab usable when storage is unavailable.
  }
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const state: SidebarState = isMobile
    ? mobileOpen
      ? "mobile-open"
      : "collapsed"
    : desktopCollapsed
      ? "collapsed"
      : "expanded";

  useEffect(() => {
    const preferenceTimer = window.setTimeout(() => {
      try {
        setDesktopCollapsed(
          window.localStorage.getItem(SIDEBAR_PREFERENCE_STORAGE_KEY) ===
            "collapsed",
        );
      } catch {
        // Expanded is the safe default when storage is unavailable.
      }
    }, 0);

    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => {
      setIsMobile(mq.matches);
      if (!mq.matches) setMobileOpen(false);
    };
    update();
    mq.addEventListener("change", update);
    return () => {
      window.clearTimeout(preferenceTimer);
      mq.removeEventListener("change", update);
    };
  }, []);

  const expand = useCallback(() => {
    if (isMobile) return;
    setDesktopCollapsed(false);
    persist(false);
  }, [isMobile]);

  const collapse = useCallback(() => {
    if (isMobile) return;
    setDesktopCollapsed(true);
    persist(true);
  }, [isMobile]);

  const toggle = useCallback(() => {
    if (isMobile) return;
    setDesktopCollapsed((collapsed) => {
      persist(!collapsed);
      return !collapsed;
    });
  }, [isMobile]);

  const openMobile = useCallback(() => setMobileOpen(true), []);
  const closeMobile = useCallback(() => setMobileOpen(false), []);

  return (
    <SidebarContext.Provider
      value={{
        state,
        isMobile,
        expand,
        collapse,
        toggle,
        openMobile,
        closeMobile,
        mobileTriggerRef,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}
