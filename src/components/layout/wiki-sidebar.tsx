"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDownIcon, ChevronRightIcon, XIcon } from "lucide-react";
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
            className="flex h-5 w-5 shrink-0 items-center justify-center text-xs text-muted-foreground"
            aria-label={collapsed ? "展开" : "折叠"}
          >
            {collapsed ? (
              <ChevronRightIcon aria-hidden="true" className="size-3" />
            ) : (
              <ChevronDownIcon aria-hidden="true" className="size-3" />
            )}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <PrefetchLink
          href={href}
          onClick={isMobile ? closeMobile : undefined}
          className={cn(
            "block flex-1 truncate rounded px-2 py-1 text-sm hover:bg-[var(--sidebar-active-bg)]",
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
          className="flex h-4 w-4 shrink-0 items-center justify-center text-[10px] text-muted-foreground"
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
            "block flex-1 truncate text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground",
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

export function WikiSidebar({
  pages,
}: {
  pages: {
    id: string;
    slug: string;
    title: string;
    parentId: string | null;
  }[];
}) {
  const { state, collapse, closeMobile } = useSidebar();
  const tree = buildTree(pages);

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

  if (state === "collapsed") return null;

  const isOverlay = state === "mobile-open";

  return (
    <>
      {isOverlay && (
        <div className="fixed inset-0 z-40 bg-black/30" onClick={closeMobile} />
      )}
      <nav
        className={cn(
          "flex h-[calc(100dvh-var(--navbar-height))] w-[var(--sidebar-width)] shrink-0 flex-col overflow-y-auto border-r bg-[var(--sidebar-bg)]",
          isOverlay
            ? "fixed left-0 top-[var(--navbar-height)] z-50 shadow-lg"
            : "sticky top-[var(--navbar-height)] max-md:hidden md:top-14",
        )}
        style={{
          borderColor: "var(--sidebar-border-color)",
          transition: "var(--sidebar-transition)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-3 py-2"
          style={{ borderColor: "var(--sidebar-border-color)" }}
        >
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pages
          </span>
          <button
            onClick={isOverlay ? closeMobile : collapse}
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-label="收起导航"
          >
            <XIcon aria-hidden="true" className="size-4" />
          </button>
        </div>
        <ul className="flex-1 p-2">
          {tree.map((node) => (
            <SectionGroup
              key={node.id}
              node={node}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
            />
          ))}
        </ul>
      </nav>
    </>
  );
}
