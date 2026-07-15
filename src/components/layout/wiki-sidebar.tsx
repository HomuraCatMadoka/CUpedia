"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Drawer } from "@base-ui/react/drawer";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  LoaderCircleIcon,
  PlusIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { PrefetchLink } from "@/components/layout/prefetch-link";

type TreeNode = {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
  children: TreeNode[];
};

const STORAGE_KEY = "wiki-sidebar-collapsed";
const NAVIGATION_FEEDBACK_DELAY_MS = 180;

type NavigateToPage = (
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
) => void;

function buildTree(
  pages: { id: string; slug: string; title: string; parentId: string | null }[],
): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const p of pages) map.set(p.id, { ...p, children: [] });
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function loadCollapsed(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveCollapsed(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* noop */
  }
}

function ChildItem({
  node,
  depth,
  collapsedIds,
  onToggle,
  onNavigate,
  pendingHref,
  feedbackHref,
}: {
  node: TreeNode;
  depth: number;
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
  onNavigate: NavigateToPage;
  pendingHref: string | null;
  feedbackHref: string | null;
}) {
  const pathname = usePathname();
  const href = `/wiki/${node.slug}`;
  const active = pathname === href;
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedIds.has(node.id);
  const pending = pendingHref === href;
  const showFeedback = feedbackHref === href;

  return (
    <li>
      <div className="flex items-center">
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.id)}
            className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-xs text-muted-foreground transition-[background-color,transform] hover:bg-[var(--sidebar-active-bg)] active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:size-5"
            aria-label={collapsed ? "展开" : "折叠"}
          >
            {collapsed ? (
              <ChevronRightIcon aria-hidden="true" className="size-3" />
            ) : (
              <ChevronDownIcon aria-hidden="true" className="size-3" />
            )}
          </button>
        ) : (
          <span className="size-11 shrink-0 md:size-5" />
        )}
        <PrefetchLink
          href={href}
          onClick={(event) => onNavigate(event, href)}
          aria-busy={showFeedback || undefined}
          aria-disabled={pending || undefined}
          aria-label={showFeedback ? `${node.title}，正在打开` : undefined}
          className={cn(
            "flex min-h-11 flex-1 touch-manipulation items-center truncate rounded px-2 py-1 text-sm transition-[background-color,transform] hover:bg-[var(--sidebar-active-bg)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0",
            active &&
              "border-l-2 border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] font-medium",
            showFeedback &&
              "bg-[var(--sidebar-active-bg)] font-medium motion-reduce:transition-none",
          )}
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          <span className="min-w-0 flex-1 truncate">{node.title}</span>
          {showFeedback && (
            <LoaderCircleIcon
              data-testid="wiki-navigation-pending"
              aria-hidden="true"
              className="ml-2 size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
            />
          )}
        </PrefetchLink>
      </div>
      {hasChildren && !collapsed && (
        <ul>
          {node.children.map((child) => (
            <ChildItem
              key={child.id}
              node={child}
              depth={depth + 1}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
              onNavigate={onNavigate}
              pendingHref={pendingHref}
              feedbackHref={feedbackHref}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function SectionGroup({
  node,
  collapsedIds,
  onToggle,
  onNavigate,
  pendingHref,
  feedbackHref,
}: {
  node: TreeNode;
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
  onNavigate: NavigateToPage;
  pendingHref: string | null;
  feedbackHref: string | null;
}) {
  const pathname = usePathname();
  const href = `/wiki/${node.slug}`;
  const active = pathname === href;
  const collapsed = collapsedIds.has(node.id);
  const pending = pendingHref === href;
  const showFeedback = feedbackHref === href;

  return (
    <li className="mt-4 first:mt-0">
      <div className="flex items-center gap-1">
        <button
          onClick={() => onToggle(node.id)}
          className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-[10px] text-muted-foreground transition-[background-color,transform] hover:bg-[var(--sidebar-active-bg)] active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:size-4"
          aria-label={collapsed ? "展开" : "折叠"}
        >
          {collapsed ? (
            <ChevronRightIcon aria-hidden="true" className="size-3" />
          ) : (
            <ChevronDownIcon aria-hidden="true" className="size-3" />
          )}
        </button>
        <PrefetchLink
          href={href}
          onClick={(event) => onNavigate(event, href)}
          aria-busy={showFeedback || undefined}
          aria-disabled={pending || undefined}
          aria-label={showFeedback ? `${node.title}，正在打开` : undefined}
          className={cn(
            "flex min-h-11 flex-1 touch-manipulation items-center truncate rounded px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-[background-color,color,transform] hover:bg-[var(--sidebar-active-bg)] hover:text-foreground active:scale-[0.99] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0 md:rounded-none md:px-0",
            active &&
              "border-l-2 border-[var(--sidebar-active-border)] pl-1 text-foreground",
            showFeedback &&
              "bg-[var(--sidebar-active-bg)] text-foreground motion-reduce:transition-none",
          )}
        >
          <span className="min-w-0 flex-1 truncate">{node.title}</span>
          {showFeedback && (
            <LoaderCircleIcon
              data-testid="wiki-navigation-pending"
              aria-hidden="true"
              className="ml-2 size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
            />
          )}
        </PrefetchLink>
      </div>
      {!collapsed && node.children.length > 0 && (
        <ul className="mt-1 space-y-0.5">
          {node.children.map((child) => (
            <ChildItem
              key={child.id}
              node={child}
              depth={0}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
              onNavigate={onNavigate}
              pendingHref={pendingHref}
              feedbackHref={feedbackHref}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

function PageTree({
  tree,
  collapsedIds,
  onToggle,
  onNavigate,
  pendingHref,
  feedbackHref,
}: {
  tree: TreeNode[];
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
  onNavigate: NavigateToPage;
  pendingHref: string | null;
  feedbackHref: string | null;
}) {
  return (
    <ul className="p-2">
      {tree.map((node) => (
        <SectionGroup
          key={node.id}
          node={node}
          collapsedIds={collapsedIds}
          onToggle={onToggle}
          onNavigate={onNavigate}
          pendingHref={pendingHref}
          feedbackHref={feedbackHref}
        />
      ))}
    </ul>
  );
}

export function WikiSidebar({
  pages,
  canEdit = false,
}: {
  pages: {
    id: string;
    slug: string;
    title: string;
    parentId: string | null;
  }[];
  canEdit?: boolean;
}) {
  const { state, isMobile, collapse, closeMobile, mobileTriggerRef } =
    useSidebar();
  const pathname = usePathname();
  const router = useRouter();
  const tree = buildTree(pages);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const pendingHrefRef = useRef<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [feedbackHref, setFeedbackHref] = useState<string | null>(null);

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(loadCollapsed);

  const onToggle = (id: string) => {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsed(next);
      return next;
    });
  };

  const clearPending = useCallback(() => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
    pendingHrefRef.current = null;
    setPendingHref(null);
    setFeedbackHref(null);
  }, []);

  const onNavigate = useCallback<NavigateToPage>(
    (event, href) => {
      if (
        !isMobile ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      event.preventDefault();
      if (pendingHrefRef.current) return;
      if (href === pathname) {
        closeMobile();
        return;
      }

      pendingHrefRef.current = href;
      setPendingHref(href);
      feedbackTimerRef.current = setTimeout(() => {
        setFeedbackHref(href);
      }, NAVIGATION_FEEDBACK_DELAY_MS);

      startTransition(() => router.push(href));
    },
    [closeMobile, isMobile, pathname, router],
  );

  useEffect(() => {
    if (isPending || !pendingHref) return;
    const reachedTarget = pathname === pendingHref;
    const settle = window.setTimeout(() => {
      clearPending();
      if (reachedTarget) closeMobile();
    }, 0);
    return () => window.clearTimeout(settle);
  }, [clearPending, closeMobile, isPending, pathname, pendingHref]);

  useEffect(
    () => () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    },
    [],
  );

  const mobileOpen = state === "mobile-open";

  return (
    <>
      {state === "expanded" && (
        <nav
          aria-label="Wiki 页面树"
          className="sticky top-[var(--navbar-height)] hidden h-[calc(100dvh-var(--navbar-height))] w-[var(--sidebar-width)] shrink-0 flex-col overflow-y-auto border-r bg-[var(--sidebar-bg)] md:flex md:top-14"
          style={{ borderColor: "var(--sidebar-border-color)" }}
        >
          <div
            className="flex items-center justify-between border-b px-3 py-2"
            style={{ borderColor: "var(--sidebar-border-color)" }}
          >
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Pages
            </span>
            <button
              onClick={collapse}
              className="rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              aria-label="收起导航"
            >
              <XIcon aria-hidden="true" className="size-4" />
            </button>
          </div>
          <PageTree
            tree={tree}
            collapsedIds={collapsedIds}
            onToggle={onToggle}
            onNavigate={onNavigate}
            pendingHref={pendingHref}
            feedbackHref={feedbackHref}
          />
        </nav>
      )}

      <Drawer.Root
        open={mobileOpen}
        onOpenChange={(open) => {
          if (!open) closeMobile();
        }}
        swipeDirection="left"
      >
        <Drawer.Portal>
          <Drawer.Backdrop
            data-testid="wiki-drawer-backdrop"
            className="fixed inset-0 z-40 bg-black/35 opacity-100 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 md:hidden"
          />
          <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 flex justify-start overflow-hidden md:hidden">
            <Drawer.Popup
              id="wiki-mobile-drawer"
              initialFocus={mobileCloseRef}
              finalFocus={mobileTriggerRef}
              className="pointer-events-auto h-[100dvh] w-[min(20rem,calc(100vw-3rem))] -translate-x-0 bg-[var(--sidebar-bg)] text-foreground shadow-2xl outline-none transition-transform duration-200 ease-out data-ending-style:-translate-x-full data-starting-style:-translate-x-full"
            >
              <Drawer.Content className="flex h-full min-h-0 flex-col overflow-hidden pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]">
                <div
                  className="flex min-h-14 shrink-0 items-center gap-2 border-b px-3"
                  style={{ borderColor: "var(--sidebar-border-color)" }}
                >
                  <div className="min-w-0 flex-1">
                    <Drawer.Title className="text-sm font-semibold">
                      Wiki 页面
                    </Drawer.Title>
                  </div>
                  {canEdit && (
                    <Link
                      href="/wiki/new"
                      onClick={closeMobile}
                      className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] hover:bg-[var(--sidebar-active-bg)] hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      aria-label="新建页面"
                    >
                      <PlusIcon aria-hidden="true" className="size-4" />
                    </Link>
                  )}
                  <Drawer.Close
                    ref={mobileCloseRef}
                    className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] hover:bg-[var(--sidebar-active-bg)] hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label="关闭导航"
                  >
                    <XIcon aria-hidden="true" className="size-4" />
                  </Drawer.Close>
                </div>
                <nav
                  aria-label="Wiki 页面树"
                  className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
                >
                  <PageTree
                    tree={tree}
                    collapsedIds={collapsedIds}
                    onToggle={onToggle}
                    onNavigate={onNavigate}
                    pendingHref={pendingHref}
                    feedbackHref={feedbackHref}
                  />
                </nav>
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
