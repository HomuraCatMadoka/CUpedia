"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Drawer } from "@base-ui/react/drawer";
import {
  ChevronDownIcon,
  ChevronRightIcon,
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
}: {
  node: TreeNode;
  depth: number;
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const pathname = usePathname();
  const { closeMobile, isMobile } = useSidebar();
  const href = `/wiki/${node.slug}`;
  const active = pathname === href;
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedIds.has(node.id);

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
          onClick={isMobile ? closeMobile : undefined}
          className={cn(
            "flex min-h-11 flex-1 touch-manipulation items-center truncate rounded px-2 py-1 text-sm transition-[background-color,transform] hover:bg-[var(--sidebar-active-bg)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0",
            active &&
              "border-l-2 border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] font-medium",
          )}
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          {node.title}
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
}: {
  node: TreeNode;
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const pathname = usePathname();
  const { closeMobile, isMobile } = useSidebar();
  const href = `/wiki/${node.slug}`;
  const active = pathname === href;
  const collapsed = collapsedIds.has(node.id);

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
          onClick={isMobile ? closeMobile : undefined}
          className={cn(
            "flex min-h-11 flex-1 touch-manipulation items-center truncate rounded px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground transition-[background-color,color,transform] hover:bg-[var(--sidebar-active-bg)] hover:text-foreground active:scale-[0.99] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 md:min-h-0 md:rounded-none md:px-0",
            active &&
              "border-l-2 border-[var(--sidebar-active-border)] pl-1 text-foreground",
          )}
        >
          {node.title}
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
}: {
  tree: TreeNode[];
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <ul className="p-2">
      {tree.map((node) => (
        <SectionGroup
          key={node.id}
          node={node}
          collapsedIds={collapsedIds}
          onToggle={onToggle}
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
  const { state, collapse, closeMobile, mobileTriggerRef } = useSidebar();
  const tree = buildTree(pages);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);

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
                  className="flex min-h-16 shrink-0 items-center gap-2 border-b px-3"
                  style={{ borderColor: "var(--sidebar-border-color)" }}
                >
                  <div className="min-w-0 flex-1">
                    <Drawer.Title className="text-sm font-semibold">
                      Wiki 页面
                    </Drawer.Title>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      浏览中大百科页面树
                    </p>
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
