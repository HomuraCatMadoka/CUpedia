"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/components/layout/sidebar-provider";

type TreeNode = {
  id: string;
  slug: string;
  title: string;
  parentId: string | null;
  children: TreeNode[];
};

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

function getAncestorIds(
  pages: { id: string; parentId: string | null }[],
  activeId: string | undefined,
): Set<string> {
  if (!activeId) return new Set();
  const byId = new Map(pages.map((p) => [p.id, p]));
  const ids = new Set<string>();
  let node = byId.get(activeId);
  while (node?.parentId) {
    ids.add(node.parentId);
    node = byId.get(node.parentId);
  }
  return ids;
}

function TreeItem({
  node,
  depth,
  expandedIds,
  onToggle,
}: {
  node: TreeNode;
  depth: number;
  expandedIds: Set<string>;
  onToggle: (id: string) => void;
}) {
  const pathname = usePathname();
  const { closeMobile, isMobile } = useSidebar();
  const href = `/wiki/${node.slug}`;
  const active = pathname === href;
  const hasChildren = node.children.length > 0;
  const expanded = expandedIds.has(node.id);

  return (
    <li>
      <div className="flex items-center">
        {hasChildren ? (
          <button
            onClick={() => onToggle(node.id)}
            className="flex h-5 w-5 shrink-0 items-center justify-center text-xs text-muted-foreground"
            aria-label={expanded ? "折叠" : "展开"}
          >
            {expanded ? "▼" : "▶"}
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}
        <Link
          href={href}
          onClick={isMobile ? closeMobile : undefined}
          className={cn(
            "block flex-1 truncate rounded px-2 py-1 text-sm hover:bg-[var(--sidebar-active-bg)]",
            active && "bg-[var(--sidebar-active-bg)] font-medium",
          )}
          style={{ paddingLeft: `${depth * 12}px` }}
        >
          {node.title}
        </Link>
      </div>
      {hasChildren && expanded && (
        <ul>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expandedIds={expandedIds}
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
  pages: { id: string; slug: string; title: string; parentId: string | null }[];
}) {
  const { state, collapse, closeMobile } = useSidebar();
  const pathname = usePathname();
  const tree = buildTree(pages);

  const activeSlug = pathname.startsWith("/wiki/")
    ? decodeURIComponent(pathname.slice(6))
    : undefined;
  const activePage = pages.find((p) => p.slug === activeSlug);
  const ancestorIds = getAncestorIds(pages, activePage?.id);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(ancestorIds);
  const [prevPathname, setPrevPathname] = useState(pathname);

  if (prevPathname !== pathname) {
    setPrevPathname(pathname);
    const merged = new Set([...expandedIds, ...ancestorIds]);
    if (merged.size !== expandedIds.size) {
      setExpandedIds(merged);
    }
  }

  const onToggle = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
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
          "flex h-[calc(100vh-3.5rem)] w-[var(--sidebar-width)] shrink-0 flex-col overflow-y-auto border-r bg-[var(--sidebar-bg)]",
          isOverlay ? "fixed left-0 top-14 z-50 shadow-lg" : "sticky top-14",
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
            ✕
          </button>
        </div>
        <ul className="flex-1 space-y-0.5 p-2">
          {tree.map((node) => (
            <TreeItem
              key={node.id}
              node={node}
              depth={0}
              expandedIds={expandedIds}
              onToggle={onToggle}
            />
          ))}
        </ul>
      </nav>
    </>
  );
}
