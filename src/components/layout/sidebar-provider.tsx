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
export type HeaderSurface =
  | "search"
  | "notifications"
  | "account"
  | "products"
  | "wiki-navigation";

interface SidebarContextValue {
  state: SidebarState;
  isMobile: boolean;
  expand: () => void;
  collapse: () => void;
  toggle: () => void;
  openMobile: () => void;
  closeMobile: () => void;
  activeSurface: HeaderSurface | null;
  openSurface: (surface: HeaderSurface) => void;
  closeSurface: (surface: HeaderSurface) => void;
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
  const [activeSurface, setActiveSurface] = useState<HeaderSurface | null>(
    null,
  );
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      setState(mobile || initialCollapsed ? "collapsed" : "expanded");
      if (!mobile) {
        setActiveSurface((current) =>
          current === "wiki-navigation" || current === "products"
            ? null
            : current,
        );
      }
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

  const openSurface = useCallback((surface: HeaderSurface) => {
    setActiveSurface(surface);
    if (surface !== "wiki-navigation") {
      setState((current) =>
        current === "mobile-open" ? "collapsed" : current,
      );
    }
  }, []);

  const closeSurface = useCallback((surface: HeaderSurface) => {
    setActiveSurface((current) => (current === surface ? null : current));
    if (surface === "wiki-navigation") {
      setState((current) =>
        current === "mobile-open" ? "collapsed" : current,
      );
    }
  }, []);

  const openMobile = useCallback(() => {
    setActiveSurface("wiki-navigation");
    setState("mobile-open");
  }, []);
  const closeMobile = useCallback(() => {
    setActiveSurface((current) =>
      current === "wiki-navigation" ? null : current,
    );
    setState((current) => (current === "mobile-open" ? "collapsed" : current));
  }, []);

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
        activeSurface,
        openSurface,
        closeSurface,
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
