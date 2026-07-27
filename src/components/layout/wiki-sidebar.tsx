"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Drawer } from "@base-ui/react/drawer";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  EllipsisIcon,
  FileTextIcon,
  HomeIcon,
  LoaderCircleIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isFocusedWikiEditorRoute } from "@/lib/wiki-routes";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { PrefetchLink } from "@/components/layout/prefetch-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type TreeNode = {
  id: string;
  slug: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  children: TreeNode[];
};

const STORAGE_KEY = "wiki-sidebar-collapsed";
const NAVIGATION_FEEDBACK_DELAY_MS = 180;
const MOBILE_LONG_PRESS_MS = 500;
const MOBILE_LONG_PRESS_MOVE_TOLERANCE = 10;
const EMPTY_COLLAPSED_SNAPSHOT = "[]";
const collapsedSubscribers = new Set<() => void>();

type NavigateToPage = (
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
) => void;

type OpenMobilePageActions = (node: TreeNode, trigger: HTMLElement) => void;

function buildTree(
  pages: {
    id: string;
    slug: string;
    title: string;
    icon?: string | null;
    parentId: string | null;
  }[],
): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];
  for (const p of pages) {
    map.set(p.id, { ...p, icon: p.icon ?? null, children: [] });
  }
  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

function parseCollapsed(snapshot: string): Set<string> {
  try {
    const ids: unknown = JSON.parse(snapshot);
    return Array.isArray(ids)
      ? new Set(ids.filter((id): id is string => typeof id === "string"))
      : new Set();
  } catch {
    return new Set();
  }
}

function getCollapsedSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? EMPTY_COLLAPSED_SNAPSHOT;
  } catch {
    return EMPTY_COLLAPSED_SNAPSHOT;
  }
}

function subscribeCollapsed(onStoreChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };

  collapsedSubscribers.add(onStoreChange);
  window.addEventListener("storage", onStorage);
  return () => {
    collapsedSubscribers.delete(onStoreChange);
    window.removeEventListener("storage", onStorage);
  };
}

function saveCollapsed(ids: Set<string>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    collapsedSubscribers.forEach((notify) => notify());
  } catch {
    /* noop */
  }
}

function isCurrentWikiPage(pathname: string, pageId: string) {
  return (
    pathname === `/wiki/${pageId}` ||
    pathname === `/wiki/edit/${pageId}` ||
    pathname === `/wiki/history/${pageId}`
  );
}

function getActiveTreeState(
  pages: { id: string; slug: string; parentId: string | null }[],
  pathname: string,
) {
  const byId = new Map(pages.map((page) => [page.id, page]));
  const activePage =
    pages.find((page) => isCurrentWikiPage(pathname, page.id)) ?? null;
  const ancestorIds = new Set<string>();
  const visited = new Set<string>();
  let parentId = activePage?.parentId ?? null;

  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    const parent = byId.get(parentId);
    if (!parent) break;
    ancestorIds.add(parent.id);
    parentId = parent.parentId;
  }

  return { activeNodeId: activePage?.id ?? null, ancestorIds };
}

type TreeItemKeyDown = (
  event: KeyboardEvent<HTMLLIElement>,
  node: TreeNode,
  collapsed: boolean,
) => void;

function PageIcon({
  icon,
  className,
  testId = true,
}: {
  icon: string | null;
  className?: string;
  testId?: boolean;
}) {
  if (icon) {
    return (
      <span
        data-testid={testId ? "wiki-page-icon" : undefined}
        aria-hidden="true"
        className={cn("text-[17px] leading-none", className)}
      >
        {icon}
      </span>
    );
  }

  return (
    <FileTextIcon
      data-testid={testId ? "wiki-page-icon" : undefined}
      aria-hidden="true"
      className={cn("size-[18px]", className)}
    />
  );
}

function PageTreeItem({
  node,
  depth,
  pathname,
  focusedEditor,
  canEdit,
  isMobile,
  collapsedIds,
  onToggle,
  rovingId,
  onRovingChange,
  onTreeItemKeyDown,
  onNavigate,
  onOpenMobileActions,
  pendingHref,
  feedbackHref,
}: {
  node: TreeNode;
  depth: number;
  pathname: string;
  focusedEditor: boolean;
  canEdit: boolean;
  isMobile: boolean;
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
  rovingId: string | null;
  onRovingChange: (id: string) => void;
  onTreeItemKeyDown: TreeItemKeyDown;
  onNavigate: NavigateToPage;
  onOpenMobileActions: OpenMobilePageActions;
  pendingHref: string | null;
  feedbackHref: string | null;
}) {
  const href = `/wiki/${node.id}`;
  const editHref = `/wiki/edit/${node.id}`;
  const newChildHref = `/wiki/new?parent=${encodeURIComponent(node.id)}`;
  const active = isCurrentWikiPage(pathname, node.id);
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedIds.has(node.id);
  const pending = pendingHref === href;
  const showFeedback = feedbackHref === href;
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const longPressOriginRef = useRef<{
    pointerId: number;
    x: number;
    y: number;
  } | null>(null);
  const suppressNextClickRef = useRef(false);

  const clearLongPress = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressOriginRef.current = null;
  }, []);

  const openMobileActions = useCallback(
    (trigger: HTMLElement) => {
      suppressNextClickRef.current = true;
      if (suppressResetTimerRef.current) {
        clearTimeout(suppressResetTimerRef.current);
      }
      suppressResetTimerRef.current = setTimeout(() => {
        suppressNextClickRef.current = false;
      }, 800);
      onRovingChange(node.id);
      trigger.focus({ preventScroll: true });
      onOpenMobileActions(node, trigger);
    },
    [node, onOpenMobileActions, onRovingChange],
  );

  const startLongPress = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!isMobile || event.pointerType === "mouse" || event.button !== 0) {
        return;
      }

      clearLongPress();
      const trigger =
        event.currentTarget.closest<HTMLElement>('[role="treeitem"]') ??
        event.currentTarget;
      longPressOriginRef.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      longPressTimerRef.current = setTimeout(() => {
        longPressTimerRef.current = null;
        longPressOriginRef.current = null;
        openMobileActions(trigger);
      }, MOBILE_LONG_PRESS_MS);
    },
    [clearLongPress, isMobile, openMobileActions],
  );

  const moveLongPress = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const origin = longPressOriginRef.current;
      if (!origin || origin.pointerId !== event.pointerId) return;
      if (
        Math.abs(event.clientX - origin.x) > MOBILE_LONG_PRESS_MOVE_TOLERANCE ||
        Math.abs(event.clientY - origin.y) > MOBILE_LONG_PRESS_MOVE_TOLERANCE
      ) {
        clearLongPress();
      }
    },
    [clearLongPress],
  );

  useEffect(
    () => () => {
      clearLongPress();
      if (suppressResetTimerRef.current) {
        clearTimeout(suppressResetTimerRef.current);
      }
    },
    [clearLongPress],
  );

  return (
    <li
      role="treeitem"
      aria-label={node.title}
      aria-level={depth + 1}
      aria-expanded={hasChildren ? !collapsed : undefined}
      aria-current={active ? "page" : undefined}
      aria-selected={active}
      aria-keyshortcuts="Shift+F10"
      data-wiki-tree-node-id={node.id}
      tabIndex={rovingId === node.id ? 0 : -1}
      onFocus={(event) => {
        if (event.target === event.currentTarget) onRovingChange(node.id);
      }}
      onKeyDown={(event) => {
        if (event.target === event.currentTarget) {
          if (
            event.key === "ContextMenu" ||
            (event.shiftKey && event.key === "F10")
          ) {
            event.preventDefault();
            setPageMenuOpen(true);
            return;
          }
          onTreeItemKeyDown(event, node, collapsed);
        }
      }}
      className="group/tree-item outline-none"
    >
      <div
        onPointerDown={startLongPress}
        onPointerMove={moveLongPress}
        onPointerUp={clearLongPress}
        onPointerCancel={clearLongPress}
        onContextMenu={(event) => {
          if (!isMobile) return;
          event.preventDefault();
          clearLongPress();
          const trigger =
            event.currentTarget.closest<HTMLElement>('[role="treeitem"]') ??
            event.currentTarget;
          openMobileActions(trigger);
        }}
        className={cn(
          "wiki-tree-row group/row relative flex min-h-11 touch-manipulation select-none items-center rounded-md transition-colors hover:bg-[#eeeceb] group-focus-visible/tree-item:ring-3 group-focus-visible/tree-item:ring-ring/50 md:min-h-[30px]",
          focusedEditor && active && "bg-[#eeeceb]",
        )}
        style={{
          paddingLeft: `${(isMobile ? 2 : 10) + depth * 8}px`,
          paddingRight: "4px",
        }}
      >
        {hasChildren ? (
          <button
            type="button"
            tabIndex={-1}
            onClick={(event) => {
              onRovingChange(node.id);
              event.currentTarget
                .closest<HTMLElement>('[role="treeitem"]')
                ?.focus({ preventScroll: true });
              onToggle(node.id);
            }}
            className="relative hidden size-5 shrink-0 items-center justify-center rounded-md text-[#a09e9a] transition-[background-color,transform] group-hover/row:bg-black/[0.045] active:scale-95 focus-visible:outline-none md:flex"
            aria-label={`${collapsed ? "展开" : "折叠"} ${node.title}`}
          >
            <PageIcon
              icon={node.icon}
              className="group-hover/row:opacity-0 group-focus-visible/tree-item:opacity-0"
            />
            {collapsed ? (
              <ChevronRightIcon
                data-testid="wiki-disclosure-icon"
                aria-hidden="true"
                strokeWidth={2.25}
                className="absolute size-4 text-[#5f5e5a] opacity-0 group-hover/row:opacity-100 group-focus-visible/tree-item:opacity-100"
              />
            ) : (
              <ChevronDownIcon
                data-testid="wiki-disclosure-icon"
                aria-hidden="true"
                strokeWidth={2.25}
                className="absolute size-4 text-[#5f5e5a] opacity-0 group-hover/row:opacity-100 group-focus-visible/tree-item:opacity-100"
              />
            )}
          </button>
        ) : (
          <span
            aria-hidden="true"
            className="hidden size-5 shrink-0 items-center justify-center text-[#a09e9a] md:flex"
          >
            <PageIcon icon={node.icon} />
          </span>
        )}
        <PrefetchLink
          href={href}
          onClick={(event) => {
            if (suppressNextClickRef.current) {
              event.preventDefault();
              event.stopPropagation();
              suppressNextClickRef.current = false;
              return;
            }
            onNavigate(event, href);
          }}
          aria-busy={showFeedback || undefined}
          aria-disabled={pending || undefined}
          aria-current={active ? "page" : undefined}
          aria-label={showFeedback ? `${node.title}，正在打开` : undefined}
          data-wiki-tree-link
          tabIndex={-1}
          onPointerDown={(event) => {
            if (event.button !== 0) return;
            onRovingChange(node.id);
            event.currentTarget
              .closest<HTMLElement>('[role="treeitem"]')
              ?.focus({ preventScroll: true });
          }}
          className={cn(
            "flex min-h-11 min-w-0 flex-1 touch-manipulation items-center truncate rounded py-1 pr-2 text-sm font-medium text-[#5f5e5a] transition-[color,transform,padding] hover:text-[#2c2c2b] active:scale-[0.99] focus-visible:outline-none md:min-h-[30px] md:px-2",
            canEdit
              ? "md:group-focus-within/row:pr-11 md:group-hover/row:pr-11"
              : "md:group-focus-within/row:pr-6 md:group-hover/row:pr-6",
            focusedEditor &&
              "rounded-md px-2 py-0 text-sm normal-case tracking-normal",
            active && "bg-[#eeeceb] font-semibold text-[#2c2c2b]",
            showFeedback &&
              "bg-[#eeeceb] font-medium motion-reduce:transition-none",
          )}
        >
          <span
            aria-hidden="true"
            className="flex size-8 shrink-0 items-center justify-center text-[#a09e9a] md:hidden"
          >
            <PageIcon icon={node.icon} testId={false} />
          </span>
          <span className="min-w-0 flex-1 truncate">{node.title}</span>
          {showFeedback && (
            <LoaderCircleIcon
              data-testid="wiki-navigation-pending"
              aria-hidden="true"
              className="ml-2 size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
            />
          )}
        </PrefetchLink>
        <div
          data-testid="wiki-tree-row-actions"
          className="pointer-events-none absolute right-1 hidden items-center gap-0.5 opacity-0 transition-opacity group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100 md:flex"
        >
          {canEdit && (
            <Link
              href={newChildHref}
              tabIndex={-1}
              aria-label={`在 ${node.title} 下新建页面`}
              className="flex size-5 items-center justify-center rounded text-[#787774] hover:bg-black/[0.06] hover:text-[#37352f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <PlusIcon aria-hidden="true" className="size-3.5" />
            </Link>
          )}
          <DropdownMenu
            open={pageMenuOpen}
            onOpenChange={setPageMenuOpen}
            modal={false}
          >
            <DropdownMenuTrigger
              tabIndex={-1}
              aria-label={`打开 ${node.title} 的页面菜单`}
              className="flex size-5 items-center justify-center rounded text-[#787774] hover:bg-black/[0.06] hover:text-[#37352f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <EllipsisIcon aria-hidden="true" className="size-3.5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem render={<Link href={href} />}>
                <FileTextIcon aria-hidden="true" />
                打开页面
              </DropdownMenuItem>
              {canEdit && (
                <>
                  <DropdownMenuItem render={<Link href={newChildHref} />}>
                    <PlusIcon aria-hidden="true" />
                    新建子页面
                  </DropdownMenuItem>
                  <DropdownMenuItem render={<Link href={editHref} />}>
                    <PencilIcon aria-hidden="true" />
                    编辑页面
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      {hasChildren && !collapsed && (
        <ul role="group" className="mt-px space-y-px">
          {node.children.map((child) => (
            <PageTreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              pathname={pathname}
              focusedEditor={focusedEditor}
              canEdit={canEdit}
              isMobile={isMobile}
              collapsedIds={collapsedIds}
              onToggle={onToggle}
              rovingId={rovingId}
              onRovingChange={onRovingChange}
              onTreeItemKeyDown={onTreeItemKeyDown}
              onNavigate={onNavigate}
              onOpenMobileActions={onOpenMobileActions}
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
  pathname,
  activeNodeId,
  focusedEditor = false,
  canEdit,
  isMobile,
  collapsedIds,
  onToggle,
  onNavigate,
  onOpenMobileActions,
  pendingHref,
  feedbackHref,
}: {
  tree: TreeNode[];
  pathname: string;
  activeNodeId: string | null;
  focusedEditor?: boolean;
  canEdit: boolean;
  isMobile: boolean;
  collapsedIds: Set<string>;
  onToggle: (id: string) => void;
  onNavigate: NavigateToPage;
  onOpenMobileActions: OpenMobilePageActions;
  pendingHref: string | null;
  feedbackHref: string | null;
}) {
  const treeRef = useRef<HTMLUListElement>(null);
  const firstNodeId = tree[0]?.id ?? null;
  const [rovingState, setRovingState] = useState<{
    pathname: string;
    id: string | null;
  }>({ pathname, id: activeNodeId ?? firstNodeId });
  const rovingId =
    rovingState.pathname === pathname
      ? rovingState.id
      : (activeNodeId ?? firstNodeId);
  const setRovingId = useCallback(
    (id: string) => setRovingState({ pathname, id }),
    [pathname],
  );

  const focusTreeItem = useCallback(
    (item: HTMLElement | undefined) => {
      if (!item) return;
      const id = item.dataset.wikiTreeNodeId;
      if (!id) return;
      setRovingId(id);
      item.focus();
    },
    [setRovingId],
  );

  const handleToggle = useCallback(
    (id: string) => {
      setRovingId(id);
      onToggle(id);
    },
    [onToggle, setRovingId],
  );

  const handleTreeItemKeyDown = useCallback<TreeItemKeyDown>(
    (event, node, collapsed) => {
      const current = event.currentTarget;
      const items = Array.from(
        treeRef.current?.querySelectorAll<HTMLElement>('[role="treeitem"]') ??
          [],
      );
      const index = items.indexOf(current);
      let target: HTMLElement | undefined;

      switch (event.key) {
        case "ArrowDown":
          target = items[index + 1];
          break;
        case "ArrowUp":
          target = items[index - 1];
          break;
        case "Home":
          target = items[0];
          break;
        case "End":
          target = items.at(-1);
          break;
        case "ArrowRight":
          if (node.children.length > 0) {
            if (collapsed) {
              handleToggle(node.id);
            } else {
              target =
                current.querySelector<HTMLElement>(
                  ':scope > [role="group"] > [role="treeitem"]',
                ) ?? undefined;
            }
          }
          break;
        case "ArrowLeft":
          if (node.children.length > 0 && !collapsed) {
            handleToggle(node.id);
          } else {
            target =
              current.parentElement?.closest<HTMLElement>(
                '[role="treeitem"]',
              ) ?? undefined;
          }
          break;
        case "Enter":
          current
            .querySelector<HTMLAnchorElement>(
              ":scope > .wiki-tree-row a[data-wiki-tree-link]",
            )
            ?.click();
          break;
        case " ":
          if (node.children.length > 0) handleToggle(node.id);
          break;
        default:
          return;
      }

      event.preventDefault();
      focusTreeItem(target);
    },
    [focusTreeItem, handleToggle],
  );

  return (
    <ul
      ref={treeRef}
      role="tree"
      aria-label="Wiki 页面层级"
      className={cn(
        focusedEditor ? "space-y-px px-1 pt-1 pb-2" : "space-y-px p-2",
      )}
    >
      {tree.map((node) => (
        <PageTreeItem
          key={node.id}
          node={node}
          depth={0}
          pathname={pathname}
          focusedEditor={focusedEditor}
          canEdit={canEdit}
          isMobile={isMobile}
          collapsedIds={collapsedIds}
          onToggle={handleToggle}
          rovingId={rovingId}
          onRovingChange={setRovingId}
          onTreeItemKeyDown={handleTreeItemKeyDown}
          onNavigate={onNavigate}
          onOpenMobileActions={onOpenMobileActions}
          pendingHref={pendingHref}
          feedbackHref={feedbackHref}
        />
      ))}
    </ul>
  );
}

function MobilePageActionsSheet({
  node,
  collapsed,
  canEdit,
  triggerRef,
  onClose,
  onCloseNavigation,
  onToggle,
  onNavigate,
}: {
  node: TreeNode | null;
  collapsed: boolean;
  canEdit: boolean;
  triggerRef: RefObject<HTMLElement | null>;
  onClose: () => void;
  onCloseNavigation: () => void;
  onToggle: (id: string) => void;
  onNavigate: NavigateToPage;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);

  if (!node) return null;

  const href = `/wiki/${node.id}`;
  const hasChildren = node.children.length > 0;
  const newChildHref = `/wiki/new?parent=${encodeURIComponent(node.id)}`;

  return (
    <Drawer.Root
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      swipeDirection="down"
    >
      <Drawer.Portal>
        <Drawer.Backdrop
          data-testid="wiki-page-actions-backdrop"
          className="fixed inset-0 z-[60] bg-black/35 opacity-100 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0"
        />
        <Drawer.Viewport className="pointer-events-none fixed inset-0 z-[70] flex items-end overflow-hidden">
          <Drawer.Popup
            data-testid="wiki-mobile-page-actions"
            initialFocus={closeRef}
            finalFocus={triggerRef}
            className="pointer-events-auto w-full translate-y-0 rounded-t-2xl border-t bg-[#fbfbfa] text-[#37352f] shadow-2xl outline-none transition-transform duration-200 ease-out data-ending-style:translate-y-full data-starting-style:translate-y-full dark:bg-[#252525] dark:text-[#efefef]"
          >
            <Drawer.Content className="flex max-h-[min(72dvh,34rem)] min-h-0 flex-col overscroll-contain pb-[env(safe-area-inset-bottom)]">
              <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-[#9b9a97]/35" />
              <Drawer.Title className="sr-only">
                {node.title} 页面操作
              </Drawer.Title>
              <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4 dark:border-white/10">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center text-[#787774]"
                >
                  <PageIcon icon={node.icon} testId={false} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {node.title}
                </span>
                <Drawer.Close
                  ref={closeRef}
                  aria-label="关闭页面操作"
                  className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-[#787774] hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-white/10"
                >
                  <XIcon aria-hidden="true" className="size-4" />
                </Drawer.Close>
              </div>
              <div className="min-h-0 touch-pan-y overflow-y-auto overscroll-contain p-2">
                <Link
                  href={href}
                  onClick={(event) => {
                    if (event.defaultPrevented) return;
                    onClose();
                    onNavigate(event, href);
                  }}
                  className="flex min-h-12 touch-manipulation items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-white/10"
                >
                  <FileTextIcon
                    aria-hidden="true"
                    className="size-[18px] text-[#787774]"
                  />
                  打开页面
                </Link>
                {hasChildren && (
                  <button
                    type="button"
                    onClick={() => {
                      onToggle(node.id);
                      onClose();
                    }}
                    className="flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-white/10"
                  >
                    {collapsed ? (
                      <ChevronRightIcon
                        aria-hidden="true"
                        className="size-[18px] text-[#787774]"
                      />
                    ) : (
                      <ChevronDownIcon
                        aria-hidden="true"
                        className="size-[18px] text-[#787774]"
                      />
                    )}
                    {collapsed ? "显示子页面" : "隐藏子页面"}
                  </button>
                )}
                {canEdit && (
                  <>
                    <Link
                      href={newChildHref}
                      onClick={(event) => {
                        if (event.defaultPrevented) return;
                        onClose();
                        onCloseNavigation();
                      }}
                      className="flex min-h-12 touch-manipulation items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-white/10"
                    >
                      <PlusIcon
                        aria-hidden="true"
                        className="size-[18px] text-[#787774]"
                      />
                      新建子页面
                    </Link>
                    <Link
                      href={`/wiki/edit/${node.id}`}
                      onClick={(event) => {
                        if (event.defaultPrevented) return;
                        onClose();
                        onCloseNavigation();
                      }}
                      className="flex min-h-12 touch-manipulation items-center gap-3 rounded-lg px-3 text-sm font-medium hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 dark:hover:bg-white/10"
                    >
                      <PencilIcon
                        aria-hidden="true"
                        className="size-[18px] text-[#787774]"
                      />
                      编辑页面
                    </Link>
                  </>
                )}
              </div>
            </Drawer.Content>
          </Drawer.Popup>
        </Drawer.Viewport>
      </Drawer.Portal>
    </Drawer.Root>
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
    icon?: string | null;
    parentId: string | null;
  }[];
  canEdit?: boolean;
}) {
  const { state, isMobile, collapse, closeMobile, mobileTriggerRef } =
    useSidebar();
  const pathname = usePathname();
  const focusedEditor = isFocusedWikiEditorRoute(pathname);
  const router = useRouter();
  const tree = useMemo(() => buildTree(pages), [pages]);
  const { activeNodeId, ancestorIds: activeAncestorIds } = useMemo(
    () => getActiveTreeState(pages, pathname),
    [pages, pathname],
  );
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const pendingHrefRef = useRef<string | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isPending, startTransition] = useTransition();
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [feedbackHref, setFeedbackHref] = useState<string | null>(null);
  const mobileActionTriggerRef = useRef<HTMLElement>(null);
  const [mobileActionNode, setMobileActionNode] = useState<TreeNode | null>(
    null,
  );

  const collapsedSnapshot = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    () => EMPTY_COLLAPSED_SNAPSHOT,
  );
  const collapsedIds = useMemo(
    () => parseCollapsed(collapsedSnapshot),
    [collapsedSnapshot],
  );
  const [manualCollapseState, setManualCollapseState] = useState<{
    pathname: string;
    ids: Set<string>;
  }>(() => ({ pathname, ids: new Set() }));
  const manuallyCollapsedIds = useMemo(
    () =>
      manualCollapseState.pathname === pathname
        ? manualCollapseState.ids
        : new Set<string>(),
    [manualCollapseState, pathname],
  );

  const visibleCollapsedIds = useMemo(
    () =>
      new Set(
        [...collapsedIds].filter(
          (id) => !activeAncestorIds.has(id) || manuallyCollapsedIds.has(id),
        ),
      ),
    [activeAncestorIds, collapsedIds, manuallyCollapsedIds],
  );

  const onToggle = useCallback(
    (id: string) => {
      const wasCollapsed = visibleCollapsedIds.has(id);
      const nextCollapsedIds = new Set(collapsedIds);
      if (wasCollapsed) nextCollapsedIds.delete(id);
      else nextCollapsedIds.add(id);
      saveCollapsed(nextCollapsedIds);

      setManualCollapseState((previous) => {
        const next =
          previous.pathname === pathname
            ? new Set(previous.ids)
            : new Set<string>();
        if (wasCollapsed || !activeAncestorIds.has(id)) next.delete(id);
        else next.add(id);
        return { pathname, ids: next };
      });
    },
    [activeAncestorIds, collapsedIds, pathname, visibleCollapsedIds],
  );

  const clearPending = useCallback(() => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
    pendingHrefRef.current = null;
    setPendingHref(null);
    setFeedbackHref(null);
  }, []);

  const openMobilePageActions = useCallback<OpenMobilePageActions>(
    (node, trigger) => {
      mobileActionTriggerRef.current = trigger;
      setMobileActionNode(node);
    },
    [],
  );

  const closeMobilePageActions = useCallback(() => {
    setMobileActionNode(null);
  }, []);

  const onNavigate = useCallback<NavigateToPage>(
    (event, href) => {
      if (
        event.defaultPrevented ||
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
          className={cn(
            "sticky hidden w-[var(--sidebar-width)] shrink-0 flex-col overflow-y-auto border-r bg-[#f9f8f7] md:flex",
            focusedEditor
              ? "top-0 h-dvh"
              : "top-[var(--navbar-height)] h-[calc(100dvh-var(--navbar-height))] md:top-14",
          )}
          style={{ borderColor: "var(--sidebar-border-color)" }}
        >
          {focusedEditor ? (
            <div className="px-2 pt-2">
              <div className="mb-1 flex min-h-[34px] items-center gap-1 rounded-md px-2 text-sm font-medium text-foreground">
                <Link
                  href="/wiki"
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <span
                    aria-hidden="true"
                    className="flex size-6 shrink-0 items-center justify-center rounded-[5px] bg-foreground text-xs font-semibold text-background"
                  >
                    C
                  </span>
                  <span className="truncate">CUpedia</span>
                </Link>
                <button
                  type="button"
                  onClick={collapse}
                  className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[#eeeceb] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label="收起导航"
                >
                  <ChevronsLeftIcon aria-hidden="true" className="size-4" />
                </button>
              </div>
              <Link
                href="/wiki/search"
                className="flex min-h-[34px] items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-[#eeeceb] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <SearchIcon aria-hidden="true" className="size-4" />
                <span>搜索</span>
              </Link>
              <Link
                href="/wiki"
                className="flex min-h-[34px] items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-[#eeeceb] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <HomeIcon aria-hidden="true" className="size-4" />
                <span>首页</span>
              </Link>
              <div
                data-testid="wiki-tree-section-label"
                className="px-1 pt-4 text-xs font-medium text-[#a09e9a]"
              >
                Wiki
              </div>
            </div>
          ) : (
            <div
              className="flex items-center justify-between border-b px-3 py-2"
              style={{ borderColor: "var(--sidebar-border-color)" }}
            >
              <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Pages
              </span>
              <button
                type="button"
                onClick={collapse}
                className="rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                aria-label="收起导航"
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
            </div>
          )}
          <PageTree
            tree={tree}
            pathname={pathname}
            activeNodeId={activeNodeId}
            focusedEditor={focusedEditor}
            canEdit={canEdit}
            isMobile={false}
            collapsedIds={visibleCollapsedIds}
            onToggle={onToggle}
            onNavigate={onNavigate}
            onOpenMobileActions={openMobilePageActions}
            pendingHref={pendingHref}
            feedbackHref={feedbackHref}
          />
        </nav>
      )}

      <Drawer.Root
        open={mobileOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeMobilePageActions();
            closeMobile();
          }
        }}
        swipeDirection="left"
      >
        <Drawer.Portal>
          <Drawer.Backdrop
            data-testid="wiki-drawer-backdrop"
            className="fixed inset-0 z-40 bg-black/35 opacity-100 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none md:hidden"
          />
          <Drawer.Viewport className="pointer-events-none fixed inset-0 z-50 flex justify-start overflow-hidden md:hidden">
            <Drawer.Popup
              id="wiki-mobile-drawer"
              initialFocus={mobileCloseRef}
              finalFocus={mobileTriggerRef}
              className="pointer-events-auto h-[100dvh] w-[min(20rem,calc(100vw-3rem))] -translate-x-0 bg-[#f9f8f7] text-foreground shadow-2xl outline-none transition-transform duration-200 ease-out data-ending-style:-translate-x-full data-starting-style:-translate-x-full motion-reduce:transform-none motion-reduce:transition-none"
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
                      className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] hover:bg-[#eeeceb] hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      aria-label="新建页面"
                    >
                      <PlusIcon aria-hidden="true" className="size-4" />
                    </Link>
                  )}
                  <Drawer.Close
                    ref={mobileCloseRef}
                    className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] hover:bg-[#eeeceb] hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    aria-label="关闭导航"
                  >
                    <XIcon aria-hidden="true" className="size-4" />
                  </Drawer.Close>
                </div>
                <nav
                  aria-label="Wiki 页面树"
                  className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain"
                >
                  {focusedEditor && (
                    <div className="px-2 pt-2">
                      <Link
                        href="/wiki"
                        onClick={closeMobile}
                        className="mb-1 flex min-h-11 items-center gap-2 rounded-md px-2 text-sm font-medium text-foreground transition-colors hover:bg-[#eeeceb] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <span
                          aria-hidden="true"
                          className="flex size-6 shrink-0 items-center justify-center rounded-[5px] bg-foreground text-xs font-semibold text-background"
                        >
                          C
                        </span>
                        <span className="truncate">CUpedia</span>
                      </Link>
                      <Link
                        href="/wiki/search"
                        onClick={closeMobile}
                        className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-[#eeeceb] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <SearchIcon aria-hidden="true" className="size-4" />
                        <span>搜索</span>
                      </Link>
                      <Link
                        href="/wiki"
                        onClick={closeMobile}
                        className="flex min-h-11 items-center gap-2 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-[#eeeceb] hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <HomeIcon aria-hidden="true" className="size-4" />
                        <span>首页</span>
                      </Link>
                      <div
                        data-testid="wiki-tree-section-label"
                        className="px-1 pt-4 text-xs font-medium text-[#a09e9a]"
                      >
                        Wiki
                      </div>
                    </div>
                  )}
                  <PageTree
                    tree={tree}
                    pathname={pathname}
                    activeNodeId={activeNodeId}
                    focusedEditor={focusedEditor}
                    canEdit={canEdit}
                    isMobile
                    collapsedIds={visibleCollapsedIds}
                    onToggle={onToggle}
                    onNavigate={onNavigate}
                    onOpenMobileActions={openMobilePageActions}
                    pendingHref={pendingHref}
                    feedbackHref={feedbackHref}
                  />
                </nav>
                <MobilePageActionsSheet
                  node={mobileActionNode}
                  collapsed={
                    mobileActionNode
                      ? visibleCollapsedIds.has(mobileActionNode.id)
                      : false
                  }
                  canEdit={canEdit}
                  triggerRef={mobileActionTriggerRef}
                  onClose={closeMobilePageActions}
                  onCloseNavigation={closeMobile}
                  onToggle={onToggle}
                  onNavigate={onNavigate}
                />
              </Drawer.Content>
            </Drawer.Popup>
          </Drawer.Viewport>
        </Drawer.Portal>
      </Drawer.Root>
    </>
  );
}
