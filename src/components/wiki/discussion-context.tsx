"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Discussion } from "@/lib/discussion-actions";
import { getDiscussions } from "@/lib/discussion-actions";

type DiscussionContextValue = {
  discussions: Discussion[];
  activeCommentId: string | null;
  setActiveCommentId: (id: string | null) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  panelTriggerRef: React.RefObject<HTMLButtonElement | null>;
  refresh: () => void;
  pending: boolean;
};

const DiscussionContext = createContext<DiscussionContextValue | null>(null);

export function DiscussionProvider({
  pageId,
  initialDiscussions,
  children,
}: {
  pageId: string;
  initialDiscussions: Discussion[];
  children: React.ReactNode;
}) {
  const [discussions, setDiscussions] =
    useState<Discussion[]>(initialDiscussions);
  const [activeCommentId, setActiveCommentIdState] = useState<string | null>(
    null,
  );
  const [panelOpen, setPanelOpen] = useState(false);
  const panelTriggerRef = useRef<HTMLButtonElement>(null);
  const [pending, startTransition] = useTransition();

  const setActiveCommentId = useCallback((id: string | null) => {
    setActiveCommentIdState(id);
    if (id) setPanelOpen(true);
  }, []);

  const refresh = useCallback(() => {
    startTransition(async () => {
      const data = await getDiscussions(pageId);
      setDiscussions(data);
    });
  }, [pageId]);

  return (
    <DiscussionContext.Provider
      value={{
        discussions,
        activeCommentId,
        setActiveCommentId,
        panelOpen,
        setPanelOpen,
        panelTriggerRef,
        refresh,
        pending,
      }}
    >
      {children}
    </DiscussionContext.Provider>
  );
}

export function useDiscussions() {
  const ctx = useContext(DiscussionContext);
  if (!ctx)
    throw new Error("useDiscussions must be used within DiscussionProvider");
  return ctx;
}
