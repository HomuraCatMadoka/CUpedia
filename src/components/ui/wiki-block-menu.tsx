"use client";

import * as React from "react";

import { BaseCommentPlugin } from "@platejs/comment";
import { BlockSelectionPlugin } from "@platejs/selection/react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  GripVerticalIcon,
  MessageSquarePlusIcon,
  RefreshCwIcon,
  SearchIcon,
  Trash2Icon,
} from "lucide-react";
import { KEYS, PathApi, type Path, type TElement } from "platejs";
import { useEditorRef } from "platejs/react";
import { toast } from "sonner";

import {
  getBlockCommandGroups,
  turnIntoBlockCommand,
} from "@/components/editor/block-command-catalog";
import {
  WIKI_OPEN_BLOCK_MENU_EVENT,
  type WikiOpenBlockMenuDetail,
} from "@/components/editor/block-menu-events";
import { getBlockType } from "@/components/editor/transforms";
import { useDiscussions } from "@/components/wiki/discussion-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const turnIntoGroups = getBlockCommandGroups("turnInto");

export function WikiBlockMenu({
  dragHandleRef,
  element,
  keyboardEnabled,
  path,
}: {
  dragHandleRef: (node: HTMLButtonElement | null) => void;
  element: TElement;
  keyboardEnabled: boolean;
  path: Path;
}) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const { canCreateDiscussion, setActiveCommentId } = useDiscussions();
  const blockSelection = editor.getApi(BlockSelectionPlugin).blockSelection;
  const commentTransforms = editor.getTransforms(BaseCommentPlugin);
  const blockId = element.id as string;
  const currentType = getBlockType(element);
  const currentLabel =
    turnIntoGroups
      .flatMap((group) => group.commands)
      .find((command) => command.value === currentType)?.label ?? "块";
  const isFirst = path[0] === 0;
  const isLast = path[0] === editor.children.length - 1;
  const selectionAfterCloseRef = React.useRef<string | null>(null);
  const suppressOpenAfterDragRef = React.useRef(false);
  const dragResetFrameRef = React.useRef<number | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchesAction = (...terms: string[]) =>
    !normalizedQuery ||
    terms.some((term) => term.toLocaleLowerCase().includes(normalizedQuery));
  const showTurnInto = matchesAction(
    "转换为",
    "转换",
    "turn into",
    currentLabel,
    ...turnIntoGroups.flatMap((group) =>
      group.commands.flatMap((command) => [command.label, ...command.keywords]),
    ),
  );
  const showDuplicate = matchesAction("复制", "duplicate", "copy");
  const showMoveUp = matchesAction("上移", "向上移动", "move up");
  const showMoveDown = matchesAction("下移", "向下移动", "move down");
  const showComment =
    canCreateDiscussion && matchesAction("批注", "评论", "comment");
  const showDelete = matchesAction("删除", "delete", "remove");
  const hasVisibleAction =
    showTurnInto ||
    showDuplicate ||
    showMoveUp ||
    showMoveDown ||
    showComment ||
    showDelete;

  React.useEffect(() => {
    const handleOpenRequest = (event: Event) => {
      const requestedBlockId = (event as CustomEvent<WikiOpenBlockMenuDetail>)
        .detail.blockId;
      if (requestedBlockId !== blockId) return;

      setQuery("");
      selectionAfterCloseRef.current = blockId;
      blockSelection.set(blockId);
      setOpen(true);
    };

    window.addEventListener(WIKI_OPEN_BLOCK_MENU_EVENT, handleOpenRequest);
    return () =>
      window.removeEventListener(WIKI_OPEN_BLOCK_MENU_EVENT, handleOpenRequest);
  }, [blockId, blockSelection]);

  React.useEffect(() => {
    const selectedId = selectionAfterCloseRef.current;
    if (open || !selectedId) return;

    const frame = requestAnimationFrame(() => blockSelection.set(selectedId));
    return () => cancelAnimationFrame(frame);
  }, [blockSelection, open]);

  React.useEffect(
    () => () => {
      if (dragResetFrameRef.current !== null) {
        cancelAnimationFrame(dragResetFrameRef.current);
      }
    },
    [],
  );

  const closeMenu = () => {
    setOpen(false);
  };

  const moveBlock = (direction: "down" | "up") => {
    const destination = direction === "up" ? [path[0] - 1] : [path[0] + 2];

    editor.tf.moveNodes({ at: path, to: destination });
    closeMenu();
  };

  return (
    <DropdownMenu
      modal={false}
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && suppressOpenAfterDragRef.current) return;

        setOpen(nextOpen);
        if (nextOpen) {
          setQuery("");
          selectionAfterCloseRef.current = blockId;
          blockSelection.set(blockId);
        }
      }}
    >
      <DropdownMenuTrigger
        ref={dragHandleRef}
        type="button"
        tabIndex={keyboardEnabled ? 0 : -1}
        data-wiki-block-control
        aria-label="打开块菜单"
        title="拖动可排序，点击打开块菜单"
        className="flex size-5 cursor-grab items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 active:cursor-grabbing"
        data-plate-prevent-deselect
        onMouseDown={(event) => event.stopPropagation()}
        onDragStart={() => {
          suppressOpenAfterDragRef.current = true;
          setOpen(false);
        }}
        onDragEnd={() => {
          dragResetFrameRef.current = requestAnimationFrame(() => {
            suppressOpenAfterDragRef.current = false;
            dragResetFrameRef.current = null;
          });
        }}
      >
        <GripVerticalIcon aria-hidden="true" className="size-3.5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        aria-label="块操作"
        align="start"
        side="right"
        sideOffset={8}
        className="w-[264px] rounded-lg p-1.5"
      >
        <div className="relative mb-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <input
            autoFocus
            aria-label="搜索块操作"
            autoComplete="off"
            name="block-action-search"
            role="searchbox"
            spellCheck={false}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Escape") event.stopPropagation();
            }}
            placeholder="搜索操作…"
            className="h-8 w-full rounded-md border border-input bg-background pr-2 pl-8 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>

        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1">
            {currentLabel}
          </DropdownMenuLabel>

          {showTurnInto && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="min-h-8 gap-2 px-2 py-1.5">
                <RefreshCwIcon aria-hidden="true" />
                <span>转换为</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent
                aria-label="转换块类型"
                className="max-h-[min(480px,var(--available-height))] w-[264px] overflow-y-auto p-1.5"
              >
                {turnIntoGroups.map((group, groupIndex) => (
                  <React.Fragment key={group.id}>
                    {groupIndex > 0 && <DropdownMenuSeparator />}
                    <DropdownMenuGroup>
                      <DropdownMenuLabel className="px-2 py-1">
                        {group.label}
                      </DropdownMenuLabel>
                      {group.commands.map((command) => {
                        const Icon = command.icon;
                        const selected = command.value === currentType;

                        return (
                          <DropdownMenuItem
                            key={command.id}
                            className="min-h-8 gap-2 px-2 py-1.5"
                            onClick={() => {
                              turnIntoBlockCommand(editor, command, {
                                at: path,
                              });
                              closeMenu();
                            }}
                          >
                            <Icon
                              aria-hidden="true"
                              className="size-4 text-muted-foreground"
                            />
                            <span>{command.label}</span>
                            {selected && (
                              <CheckIcon
                                aria-hidden="true"
                                className="ml-auto size-4"
                              />
                            )}
                          </DropdownMenuItem>
                        );
                      })}
                    </DropdownMenuGroup>
                  </React.Fragment>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          {showDuplicate && (
            <DropdownMenuItem
              className="min-h-8 gap-2 px-2 py-1.5"
              onClick={() => {
                editor.tf.duplicateNodes({ at: path, block: true });
                closeMenu();
                requestAnimationFrame(() => {
                  const copy = editor.api.node<TElement>([path[0] + 1]);
                  const copyId = copy?.[0].id as string | undefined;
                  if (copyId) {
                    selectionAfterCloseRef.current = copyId;
                    blockSelection.set(copyId);
                  }
                });
              }}
            >
              <CopyIcon aria-hidden="true" />
              <span>复制</span>
            </DropdownMenuItem>
          )}
          {showMoveUp && (
            <DropdownMenuItem
              className="min-h-8 gap-2 px-2 py-1.5"
              disabled={isFirst}
              onClick={() => moveBlock("up")}
            >
              <ArrowUpIcon aria-hidden="true" />
              <span>上移</span>
            </DropdownMenuItem>
          )}
          {showMoveDown && (
            <DropdownMenuItem
              className="min-h-8 gap-2 px-2 py-1.5"
              disabled={isLast}
              onClick={() => moveBlock("down")}
            >
              <ArrowDownIcon aria-hidden="true" />
              <span>下移</span>
            </DropdownMenuItem>
          )}
          {showComment && (
            <DropdownMenuItem
              className="min-h-8 gap-2 px-2 py-1.5"
              onClick={() => {
                commentTransforms.comment.setDraft({ at: path });
                selectionAfterCloseRef.current = null;
                blockSelection.clear();
                closeMenu();
                setActiveCommentId("draft");
              }}
            >
              <MessageSquarePlusIcon aria-hidden="true" />
              <span>批注</span>
            </DropdownMenuItem>
          )}
        </DropdownMenuGroup>

        {showDelete && <DropdownMenuSeparator />}

        {showDelete && (
          <DropdownMenuGroup>
            <DropdownMenuItem
              className="min-h-8 gap-2 px-2 py-1.5"
              onClick={() => {
                selectionAfterCloseRef.current = null;
                const parentPath = PathApi.parent(path);
                const siblingIndex = path.at(-1) ?? 0;
                const previousPath =
                  siblingIndex > 0 ? PathApi.previous(path) : null;
                const nextPath = PathApi.next(path);
                const adjacentPoint =
                  (previousPath && editor.api.node(previousPath)
                    ? editor.api.end(previousPath)
                    : null) ??
                  (editor.api.node(nextPath)
                    ? editor.api.start(nextPath)
                    : null);
                const adjacentPointRef = adjacentPoint
                  ? editor.api.pointRef(adjacentPoint)
                  : null;

                editor.tf.withoutNormalizing(() => {
                  editor.tf.deselect();
                  editor.tf.removeNodes({ at: path });
                  if (editor.children.length === 0) {
                    editor.tf.insertNodes(
                      editor.api.create.block({ type: KEYS.p }),
                      { at: [0] },
                    );
                  }
                });

                const resolvedAdjacentPoint = adjacentPointRef?.unref() ?? null;
                const nextPoint =
                  (path.length > 1 ? editor.api.start(parentPath) : null) ??
                  resolvedAdjacentPoint ??
                  editor.api.start([]);
                if (nextPoint) editor.tf.select(nextPoint);
                blockSelection.clear();
                closeMenu();
                requestAnimationFrame(() => editor.tf.focus({ retries: 5 }));
                toast("已删除块", {
                  action: {
                    label: "撤销",
                    onClick: () => {
                      editor.undo();
                      requestAnimationFrame(() =>
                        editor.tf.focus({ retries: 5 }),
                      );
                    },
                  },
                });
              }}
            >
              <Trash2Icon aria-hidden="true" />
              <span>删除</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        )}

        {!hasVisibleAction && (
          <p
            role="status"
            className="px-2 py-5 text-center text-sm text-muted-foreground"
          >
            没有匹配的操作
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
