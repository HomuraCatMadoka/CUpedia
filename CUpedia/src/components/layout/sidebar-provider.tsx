"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

type SidebarState = "expanded" | "collapsed" | "mobile-open";

interface SidebarContextValue {
  state: SidebarState;
  isMobile: boolean;
  expand: () => void;
  collapse: () => void;
  toggle: () => void;
  openMobile: () => void;
  closeMobile: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "wiki-sidebar-state";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = useState(false);
  const [state, setState] = useState<SidebarState>(() => {
    if (typeof window === "undefined") return "expanded";
    if (window.matchMedia("(max-width: 767px)").matches) return "collapsed";
    return localStorage.getItem(STORAGE_KEY) === "collapsed"
      ? "collapsed"
      : "expanded";
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const update = () => {
      const mobile = mq.matches;
      setIsMobile(mobile);
      if (mobile) {
        setState("collapsed");
      } else {
        const saved = localStorage.getItem(STORAGE_KEY);
        setState(saved === "collapsed" ? "collapsed" : "expanded");
      }
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  const expand = useCallback(() => {
    setState("expanded");
    if (!isMobile) localStorage.setItem(STORAGE_KEY, "expanded");
  }, [isMobile]);

  const collapse = useCallback(() => {
    setState("collapsed");
    if (!isMobile) localStorage.setItem(STORAGE_KEY, "collapsed");
  }, [isMobile]);

  const toggle = useCallback(() => {
    setState((s) => {
      const next = s === "expanded" ? "collapsed" : "expanded";
      if (!isMobile) localStorage.setItem(STORAGE_KEY, next);
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
