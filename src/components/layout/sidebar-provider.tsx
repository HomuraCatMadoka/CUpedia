"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { serializeSidebarCookie } from "@/lib/sidebar-cookie";

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
  document.cookie = serializeSidebarCookie(collapsed);
}

export function SidebarProvider({
  children,
  initialCollapsed = false,
}: {
  children: React.ReactNode;
  initialCollapsed?: boolean;
}) {
  const [isMobile, setIsMobile] = useState(false);
  const [state, setState] = useState<SidebarState>(
    initialCollapsed ? "collapsed" : "expanded",
  );
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      setState(mobile || initialCollapsed ? "collapsed" : "expanded");
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [initialCollapsed]);

  const expand = useCallback(() => {
    setState("expanded");
    if (!isMobile) persist(false);
  }, [isMobile]);

  const collapse = useCallback(() => {
    setState("collapsed");
    if (!isMobile) persist(true);
  }, [isMobile]);

  const toggle = useCallback(() => {
    setState((s) => {
      const next = s === "expanded" ? "collapsed" : "expanded";
      if (!isMobile) persist(next === "collapsed");
      return next;
    });
  }, [isMobile]);

  const openMobile = useCallback(() => setState("mobile-open"), []);
  const closeMobile = useCallback(() => setState("collapsed"), []);

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
