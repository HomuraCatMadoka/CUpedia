"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";

import {
  createWikiTreeState,
  projectWikiTreePages,
  wikiTreeReducer,
  type WikiTreePage,
  type WikiTreePagePatch,
} from "@/lib/wiki-tree-state";

interface WikiTreeContextValue {
  pages: WikiTreePage[];
  projectUpsert: (patch: WikiTreePagePatch) => string | null;
  projectDelete: (pageId: string) => string;
  confirm: (token: string | null, patch?: WikiTreePagePatch) => void;
  rollback: (token: string | null) => void;
}

const WikiTreeContext = createContext<WikiTreeContextValue | null>(null);

function samePage(left: WikiTreePage, right: WikiTreePage) {
  return (
    left.title === right.title &&
    left.icon === right.icon &&
    left.parentId === right.parentId &&
    left.sortOrder === right.sortOrder
  );
}

export function WikiTreeProvider({
  initialPages,
  children,
}: {
  initialPages: WikiTreePage[];
  children: ReactNode;
}) {
  const [state, dispatch] = useReducer(
    wikiTreeReducer,
    initialPages,
    createWikiTreeState,
  );
  const pages = useMemo(() => projectWikiTreePages(state), [state]);

  useEffect(() => {
    dispatch({ type: "hydrate", pages: initialPages });
  }, [initialPages]);

  const projectUpsert = useCallback(
    (patch: WikiTreePagePatch) => {
      const current = pages.find((page) => page.id === patch.id);
      const page: WikiTreePage = {
        id: patch.id,
        title: patch.title ?? current?.title ?? "",
        icon: patch.icon !== undefined ? patch.icon : (current?.icon ?? null),
        parentId:
          patch.parentId !== undefined
            ? patch.parentId
            : (current?.parentId ?? null),
        sortOrder:
          patch.sortOrder ??
          current?.sortOrder ??
          Math.max(-1, ...pages.map((candidate) => candidate.sortOrder)) + 1,
      };
      if (current && samePage(current, page)) return null;

      const token = crypto.randomUUID();
      dispatch({
        type: "project",
        mutation: { token, type: "upsert", page },
      });
      return token;
    },
    [pages],
  );

  const projectDelete = useCallback((pageId: string) => {
    const token = crypto.randomUUID();
    dispatch({
      type: "project",
      mutation: { token, type: "delete", pageId },
    });
    return token;
  }, []);

  const confirm = useCallback(
    (token: string | null, page?: WikiTreePagePatch) => {
      if (token) dispatch({ type: "confirm", token, page });
    },
    [],
  );

  const rollback = useCallback((token: string | null) => {
    if (token) dispatch({ type: "rollback", token });
  }, []);

  const value = useMemo(
    () => ({ pages, projectUpsert, projectDelete, confirm, rollback }),
    [confirm, pages, projectDelete, projectUpsert, rollback],
  );

  return (
    <WikiTreeContext.Provider value={value}>
      {children}
    </WikiTreeContext.Provider>
  );
}

export function useWikiTree() {
  const context = useContext(WikiTreeContext);
  if (!context) {
    throw new Error("useWikiTree must be used within WikiTreeProvider");
  }
  return context;
}

export function useOptionalWikiTree() {
  return useContext(WikiTreeContext);
}
