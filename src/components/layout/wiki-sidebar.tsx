"use client";

import {
  createContext,
  useCallback,
  useContext,
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
  ArrowDownIcon,
  ArrowUpIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronsLeftIcon,
  EllipsisIcon,
  FileTextIcon,
  GripVerticalIcon,
  HomeIcon,
  LoaderCircleIcon,
  PlusIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isFocusedWikiEditorRoute } from "@/lib/wiki-routes";
import { getWikiDisplayTitle } from "@/lib/wiki-title";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { PrefetchLink } from "@/components/layout/prefetch-link";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WikiCreateButton } from "@/components/wiki/wiki-create-button";
import { useOptionalWikiTree } from "@/components/wiki/wiki-tree-provider";
import { reorderWikiPage } from "@/lib/wiki-actions";
import type { WikiPageMove } from "@/lib/wiki-tree-state";

type TreeNode = {
  id: string;
  title: string;
  icon: string | null;
  parentId: string | null;
  children: TreeNode[];
};

const STORAGE_KEY = "wiki-sidebar-collapsed";
const NAVIGATION_FEEDBACK_DELAY_MS = 180;
const MOBILE_LONG_PRESS_MS = 500;
const MOBILE_LONG_PRESS_MOVE_TOLERANCE = 10;
const DEFAULT_COLLAPSED_SNAPSHOT = "";
const collapsedSubscribers = new Set<() => void>();

type NavigateToPage = (
  event: MouseEvent<HTMLAnchorElement>,
  href: string,
) => void;

type OpenMobilePageActions = (node: TreeNode, trigger: HTMLElement) => void;

interface WikiTreeReorderContextValue {
  draggedPage: Pick<TreeNode, "id" | "parentId"> | null;
  moving: boolean;
  movePage: (pageId: string, move: WikiPageMove) => void;
  setDraggedPage: (page: Pick<TreeNode, "id" | "parentId"> | null) => void;
}

const WikiTreeReorderContext =
  createContext<WikiTreeReorderContextValue | null>(null);

function useWikiTreeReorder() {
  const context = useContext(WikiTreeReorderContext);
  if (!context) {
    throw new Error("Wiki tree reorder context is unavailable");
  }
  return context;
}

function buildTree(
  pages: {
    id: string;
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
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_COLLAPSED_SNAPSHOT;
  } catch {
    return DEFAULT_COLLAPSED_SNAPSHOT;
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
    pathname === `/wiki/${pageId}` || pathname === `/wiki/history/${pageId}`
  );
}

function getActiveTreeState(
  pages: { id: string; parentId: string | null }[],
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
  const displayTitle = getWikiDisplayTitle(node.title);
  const href = `/wiki/${node.id}`;
  const active = isCurrentWikiPage(pathname, node.id);
  const hasChildren = node.children.length > 0;
  const collapsed = collapsedIds.has(node.id);
  const pending = pendingHref === href;
  const showFeedback = feedbackHref === href;
  const [pageMenuOpen, setPageMenuOpen] = useState(false);
  const { draggedPage, moving, movePage, setDraggedPage } =
    useWikiTreeReorder();
  const [dropTarget, setDropTarget] = useState<{
    draggedPage: Pick<TreeNode, "id" | "parentId">;
    placement: "before" | "after";
  } | null>(null);
  const dropTargetRef = useRef(dropTarget);
  const dropPlacement =
    dropTarget?.draggedPage === draggedPage ? dropTarget.placement : null;
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
      aria-label={displayTitle}
      aria-level={depth + 1}
      aria-expanded={hasChildren ? !collapsed : undefined}
      aria-current={active ? "page" : undefined}
      aria-selected={active}
      aria-keyshortcuts={
        canEdit ? "Alt+ArrowUp Alt+ArrowDown Shift+F10" : "Shift+F10"
      }
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
        onDragOver={(event) => {
          if (
            !draggedPage ||
            draggedPage.id === node.id ||
            draggedPage.parentId !== node.parentId
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          event.dataTransfer.dropEffect = "move";
          const bounds = event.currentTarget.getBoundingClientRect();
          const nextDropTarget = {
            draggedPage,
            placement:
              event.clientY < bounds.top + bounds.height / 2
                ? "before"
                : "after",
          } as const;
          dropTargetRef.current = nextDropTarget;
          setDropTarget(nextDropTarget);
        }}
        onDragLeave={(event) => {
          if (
            !event.currentTarget.contains(event.relatedTarget as Node | null)
          ) {
            dropTargetRef.current = null;
            setDropTarget(null);
          }
        }}
        onDrop={(event) => {
          if (
            !draggedPage ||
            draggedPage.id === node.id ||
            draggedPage.parentId !== node.parentId
          ) {
            return;
          }
          event.preventDefault();
          event.stopPropagation();
          const bounds = event.currentTarget.getBoundingClientRect();
          const latestDropTarget = dropTargetRef.current;
          movePage(draggedPage.id, {
            targetPageId: node.id,
            placement:
              latestDropTarget?.draggedPage.id === draggedPage.id
                ? latestDropTarget.placement
                : event.clientY < bounds.top + bounds.height / 2
                  ? "before"
                  : "after",
          });
          dropTargetRef.current = null;
          setDropTarget(null);
        }}
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
        {dropPlacement && (
          <span
            aria-hidden="true"
            data-testid={`wiki-drop-indicator-${dropPlacement}`}
            className={cn(
              "pointer-events-none absolute right-1 left-1 z-10 h-0.5 rounded-full bg-blue-500",
              dropPlacement === "before" ? "top-0" : "bottom-0",
            )}
          />
        )}
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
            aria-label={`${collapsed ? "展开" : "折叠"} ${displayTitle}`}
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
          aria-label={showFeedback ? `${displayTitle}，正在打开` : undefined}
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
              ? "md:group-focus-within/row:pr-16 md:group-hover/row:pr-16"
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
          <span className="min-w-0 flex-1 truncate">{displayTitle}</span>
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
            <button
              type="button"
              tabIndex={-1}
              draggable={!moving}
              aria-label={`拖动 ${displayTitle} 调整顺序`}
              aria-grabbed={draggedPage?.id === node.id}
              onDragStart={(event) => {
                event.stopPropagation();
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", node.id);
                setDraggedPage({ id: node.id, parentId: node.parentId });
              }}
              onDragEnd={() => {
                setDraggedPage(null);
                dropTargetRef.current = null;
                setDropTarget(null);
              }}
              className="flex size-5 cursor-grab items-center justify-center rounded text-[#787774] hover:bg-black/[0.06] hover:text-[#37352f] active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <GripVerticalIcon aria-hidden="true" className="size-3.5" />
            </button>
          )}
          {canEdit && (
            <WikiCreateButton
              parentId={node.id}
              variant="ghost"
              size="icon-xs"
              tabIndex={-1}
              aria-label={`在 ${displayTitle} 下新建页面`}
              className="flex size-5 items-center justify-center rounded text-[#787774] hover:bg-black/[0.06] hover:text-[#37352f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <PlusIcon aria-hidden="true" className="size-3.5" />
            </WikiCreateButton>
          )}
          <DropdownMenu
            open={pageMenuOpen}
            onOpenChange={setPageMenuOpen}
            modal={false}
          >
            <DropdownMenuTrigger
              tabIndex={-1}
              aria-label={`打开 ${displayTitle} 的页面菜单`}
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
                  <DropdownMenuItem
                    disabled={moving}
                    onClick={() => movePage(node.id, { direction: "up" })}
                  >
                    <ArrowUpIcon aria-hidden="true" />
                    上移
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    disabled={moving}
                    onClick={() => movePage(node.id, { direction: "down" })}
                  >
                    <ArrowDownIcon aria-hidden="true" />
                    下移
                  </DropdownMenuItem>
                  <WikiCreateButton
                    parentId={node.id}
                    variant="ghost"
                    role="menuitem"
                    onCreated={() => setPageMenuOpen(false)}
                    className="h-auto w-full justify-start rounded-sm px-2 py-1.5 font-normal"
                  >
                    <PlusIcon aria-hidden="true" />
                    新建子页面
                  </WikiCreateButton>
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
  const { movePage } = useWikiTreeReorder();
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
      if (
        canEdit &&
        event.altKey &&
        (event.key === "ArrowUp" || event.key === "ArrowDown")
      ) {
        event.preventDefault();
        movePage(node.id, {
          direction: event.key === "ArrowUp" ? "up" : "down",
        });
        return;
      }

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
    [canEdit, focusTreeItem, handleToggle, movePage],
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
  const { moving, movePage } = useWikiTreeReorder();

  if (!node) return null;

  const displayTitle = getWikiDisplayTitle(node.title);
  const href = `/wiki/${node.id}`;
  const hasChildren = node.children.length > 0;

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
                {displayTitle} 页面操作
              </Drawer.Title>
              <div className="flex min-h-14 shrink-0 items-center gap-3 border-b border-black/10 px-4 dark:border-white/10">
                <span
                  aria-hidden="true"
                  className="flex size-8 shrink-0 items-center justify-center text-[#787774]"
                >
                  <PageIcon icon={node.icon} testId={false} />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {displayTitle}
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
                    <button
                      type="button"
                      disabled={moving}
                      onClick={() => {
                        movePage(node.id, { direction: "up" });
                        onClose();
                      }}
                      className="flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:hover:bg-white/10"
                    >
                      <ArrowUpIcon
                        aria-hidden="true"
                        className="size-[18px] text-[#787774]"
                      />
                      上移
                    </button>
                    <button
                      type="button"
                      disabled={moving}
                      onClick={() => {
                        movePage(node.id, { direction: "down" });
                        onClose();
                      }}
                      className="flex min-h-12 w-full touch-manipulation items-center gap-3 rounded-lg px-3 text-left text-sm font-medium hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 dark:hover:bg-white/10"
                    >
                      <ArrowDownIcon
                        aria-hidden="true"
                        className="size-[18px] text-[#787774]"
                      />
                      下移
                    </button>
                    <WikiCreateButton
                      parentId={node.id}
                      variant="ghost"
                      onCreated={() => {
                        onClose();
                        onCloseNavigation();
                      }}
                      className="min-h-12 w-full justify-start gap-3 rounded-lg px-3 text-sm font-medium"
                    >
                      <PlusIcon
                        aria-hidden="true"
                        className="size-[18px] text-[#787774]"
                      />
                      新建子页面
                    </WikiCreateButton>
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
  const wikiTree = useOptionalWikiTree();
  const projectedPages = wikiTree?.pages ?? pages;
  const tree = useMemo(() => buildTree(projectedPages), [projectedPages]);
  const { activeNodeId, ancestorIds: activeAncestorIds } = useMemo(
    () => getActiveTreeState(projectedPages, pathname),
    [pathname, projectedPages],
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
  const [draggedPage, setDraggedPage] = useState<Pick<
    TreeNode,
    "id" | "parentId"
  > | null>(null);
  const [moving, startMoveTransition] = useTransition();
  const [reorderAnnouncement, setReorderAnnouncement] = useState("");

  const collapsedSnapshot = useSyncExternalStore(
    subscribeCollapsed,
    getCollapsedSnapshot,
    () => DEFAULT_COLLAPSED_SNAPSHOT,
  );
  const collapsedIds = useMemo(
    () =>
      collapsedSnapshot === DEFAULT_COLLAPSED_SNAPSHOT
        ? new Set(
            projectedPages
              .map((page) => page.parentId)
              .filter((id): id is string => id !== null),
          )
        : parseCollapsed(collapsedSnapshot),
    [collapsedSnapshot, projectedPages],
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

  const movePage = useCallback(
    (pageId: string, move: WikiPageMove) => {
      const mutationToken = wikiTree?.projectReorder(pageId, move) ?? null;
      startMoveTransition(async () => {
        try {
          await reorderWikiPage(pageId, move);
          wikiTree?.confirm(mutationToken);
          router.refresh();
          setReorderAnnouncement("页面顺序已更新");
        } catch {
          wikiTree?.rollback(mutationToken);
          toast.error("调整页面顺序失败，请重试");
          setReorderAnnouncement("页面顺序更新失败");
        } finally {
          setDraggedPage(null);
        }
      });
    },
    [router, wikiTree],
  );

  const reorderContextValue = useMemo<WikiTreeReorderContextValue>(
    () => ({
      draggedPage,
      moving,
      movePage,
      setDraggedPage,
    }),
    [draggedPage, movePage, moving],
  );

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
    <WikiTreeReorderContext.Provider value={reorderContextValue}>
      <p className="sr-only" aria-live="polite">
        {reorderAnnouncement}
      </p>
      {state === "expanded" && (
        <nav
          data-wiki-sidebar-expanded=""
          aria-label="Wiki 页面树"
          className={cn(
            "sticky hidden w-[var(--sidebar-width)] shrink-0 flex-col overflow-y-auto border-r bg-[#f9f8f7] md:flex",
            focusedEditor
              ? "top-0 h-dvh"
              : "top-[var(--navbar-height)] h-[calc(100dvh-var(--navbar-height))]",
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
                {canEdit && (
                  <WikiCreateButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label="新建页面"
                    className="text-muted-foreground"
                  >
                    <PlusIcon aria-hidden="true" />
                  </WikiCreateButton>
                )}
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
              <div className="flex items-center gap-1">
                {canEdit && (
                  <WikiCreateButton
                    variant="ghost"
                    size="icon-sm"
                    aria-label="新建页面"
                    className="text-muted-foreground"
                  >
                    <PlusIcon aria-hidden="true" />
                  </WikiCreateButton>
                )}
                <button
                  type="button"
                  onClick={collapse}
                  className="rounded text-xs text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                  aria-label="收起导航"
                >
                  <XIcon aria-hidden="true" className="size-4" />
                </button>
              </div>
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
                    <WikiCreateButton
                      variant="ghost"
                      size="icon-lg"
                      onCreated={closeMobile}
                      className="flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] hover:bg-[#eeeceb] hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      aria-label="新建页面"
                    >
                      <PlusIcon aria-hidden="true" className="size-4" />
                    </WikiCreateButton>
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
    </WikiTreeReorderContext.Provider>
  );
}
