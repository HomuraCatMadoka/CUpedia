"use client";

import * as React from "react";

import { Dialog } from "@base-ui/react/dialog";
import { BaseCommentPlugin } from "@platejs/comment";
import { triggerFloatingLink } from "@platejs/link/react";
import { PlaceholderPlugin } from "@platejs/media/react";
import {
  ArrowLeftIcon,
  BoldIcon,
  CheckIcon,
  ChevronDownIcon,
  Code2Icon,
  EllipsisIcon,
  ImageIcon,
  ItalicIcon,
  KeyboardIcon,
  LinkIcon,
  MessageSquareTextIcon,
  PlusIcon,
  StrikethroughIcon,
  Trash2Icon,
  UnderlineIcon,
} from "lucide-react";
import { KEYS, type Path, PathApi, RangeApi, type TElement } from "platejs";
import { useEditorRef, useEditorSelection } from "platejs/react";
import { toast } from "sonner";
import { useFilePicker } from "use-file-picker";

import {
  getBlockCommandGroups,
  insertBlockCommand,
  turnIntoBlockCommand,
} from "@/components/editor/block-command-catalog";
import { openWikiLinkCombobox } from "@/components/editor/plugins/wiki-link-kit";
import { getBlockType } from "@/components/editor/transforms";
import { useDiscussions } from "@/components/wiki/discussion-context";
import { useVisualViewport } from "@/hooks/use-visual-viewport";

type MobileEditorSurface = "format" | "insert" | "turnInto" | null;
type MobileSurfaceHistoryEntry = {
  surface: Exclude<MobileEditorSurface, null>;
  token: string;
};

function readSurfaceHistoryEntry(
  state: unknown,
): MobileSurfaceHistoryEntry | null {
  const value = state as {
    cupediaMobileEditorSurface?: MobileEditorSurface;
    cupediaMobileEditorSurfaceToken?: string;
  } | null;
  if (!value?.cupediaMobileEditorSurfaceToken) return null;
  if (
    value.cupediaMobileEditorSurface !== "format" &&
    value.cupediaMobileEditorSurface !== "insert" &&
    value.cupediaMobileEditorSurface !== "turnInto"
  ) {
    return null;
  }
  return {
    surface: value.cupediaMobileEditorSurface,
    token: value.cupediaMobileEditorSurfaceToken,
  };
}

const insertGroups = getBlockCommandGroups("insert");
const allInsertCommands = insertGroups.flatMap((group) => group.commands);
const mobileInsertOrder = [
  "text",
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "bulleted-list",
  "numbered-list",
  "todo-list",
  "callout-info",
  "quote",
  "code",
  "divider",
  "table",
  "image",
  "equation",
  "table-of-contents",
  "callout-tip",
  "callout-warning",
  "callout-error",
] as const;
const mobileInsertCommands = mobileInsertOrder.flatMap((id) => {
  const command = allInsertCommands.find((item) => item.id === id);
  return command ? [command] : [];
});
const mobileInsertHints: Record<string, string> = {
  "bulleted-list": "-",
  "heading-1": "#",
  "heading-2": "##",
  "heading-3": "###",
  "heading-4": "####",
  "numbered-list": "1.",
  "todo-list": "[]",
  code: "```",
  divider: "---",
  quote: '"',
};
const mobileInsertGroups = [
  {
    label: "基础块",
    commandIds: [
      "text",
      "heading-1",
      "heading-2",
      "heading-3",
      "heading-4",
      "bulleted-list",
      "numbered-list",
      "todo-list",
      "callout-info",
      "quote",
    ],
  },
  {
    label: "丰富内容",
    commandIds: [
      "code",
      "divider",
      "table",
      "image",
      "equation",
      "table-of-contents",
    ],
  },
  {
    label: "提示框",
    commandIds: ["callout-tip", "callout-warning", "callout-error"],
  },
]
  .map((group) => ({
    label: group.label,
    commands: group.commandIds.flatMap((id) => {
      const command = mobileInsertCommands.find((item) => item.id === id);
      return command ? [command] : [];
    }),
  }))
  .filter((group) => group.commands.length > 0);
const turnIntoGroups = getBlockCommandGroups("turnInto");
const allTurnIntoCommands = turnIntoGroups.flatMap((group) => group.commands);
const mobileTurnIntoOrder = [
  "text",
  "heading-1",
  "heading-2",
  "heading-3",
  "heading-4",
  "bulleted-list",
  "numbered-list",
  "todo-list",
  "code",
  "quote",
] as const;
const mobileTurnIntoCommands = mobileTurnIntoOrder.flatMap((id) => {
  const command = allTurnIntoCommands.find((item) => item.id === id);
  return command ? [command] : [];
});
const formatBlockCommands = insertGroups
  .flatMap((group) => group.commands)
  .filter((command) =>
    ["text", "heading-1", "heading-2", "heading-3", "heading-4"].includes(
      command.id,
    ),
  );
const formatActions = [
  { icon: BoldIcon, key: KEYS.bold, label: "粗体" },
  { icon: ItalicIcon, key: KEYS.italic, label: "斜体" },
  { icon: UnderlineIcon, key: KEYS.underline, label: "下划线" },
  { icon: StrikethroughIcon, key: KEYS.strikethrough, label: "删除线" },
  { icon: Code2Icon, key: KEYS.code, label: "行内代码" },
] as const;

const toolbarButtonClass =
  "flex size-11 shrink-0 touch-manipulation items-center justify-center rounded-md text-[#5f5e5b] transition-colors hover:bg-black/[0.055] hover:text-[#37352f] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-30 dark:text-[#b8b8b8] dark:hover:bg-white/10 dark:hover:text-[#efefef]";
const panelButtonClass =
  "flex min-h-12 touch-manipulation items-center gap-3 rounded-md px-3 text-left text-sm transition-colors hover:bg-black/[0.055] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-pressed:bg-black/[0.075] disabled:opacity-35 dark:hover:bg-white/10 dark:aria-pressed:bg-white/10";

type SelectionPreservingButtonProps = Omit<
  React.ComponentPropsWithoutRef<"button">,
  "onClick" | "onPointerDown" | "onPointerUp"
> & {
  onAction: () => void;
};

function SelectionPreservingButton({
  onAction,
  ...props
}: SelectionPreservingButtonProps) {
  const directPointerActivationAtRef = React.useRef(0);

  return (
    <button
      {...props}
      onPointerDown={(event) => {
        // Keep the editor selection and virtual keyboard stable while pressed.
        // WebKit may omit click after a canceled touch pointerdown, so direct
        // pointers activate on pointerup and suppress any synthetic click.
        event.preventDefault();
      }}
      onPointerUp={(event) => {
        if (event.pointerType === "mouse") return;
        event.preventDefault();
        directPointerActivationAtRef.current = Date.now();
        onAction();
      }}
      onClick={() => {
        if (Date.now() - directPointerActivationAtRef.current < 750) {
          directPointerActivationAtRef.current = 0;
          return;
        }
        onAction();
      }}
    />
  );
}

export function MobileWikiEditorToolbar({
  onFileDialogChange,
  onDismiss,
  visible,
}: {
  onFileDialogChange: (open: boolean) => void;
  onDismiss: () => void;
  visible: boolean;
}) {
  const editor = useEditorRef();
  const selection = useEditorSelection();
  const selectionExpanded = RangeApi.isExpanded(selection);
  const { canCreateDiscussion, setActiveCommentId } = useDiscussions();
  const commentTransforms = editor.getTransforms(BaseCommentPlugin);
  const initialHistoryEntry =
    typeof window === "undefined"
      ? null
      : readSurfaceHistoryEntry(window.history.state);
  const [surface, setSurface] = React.useState<MobileEditorSurface>(
    initialHistoryEntry?.surface ?? null,
  );
  const [blockPath, setBlockPath] = React.useState<Path | null>(null);
  const blockPathRef = React.useRef<ReturnType<
    typeof editor.api.pathRef
  > | null>(null);
  const { bottomInset: visualViewportBottomInset } = useVisualViewport();
  const insertCancelRef = React.useRef<HTMLButtonElement>(null);
  const savedSelectionRef = React.useRef<typeof editor.selection>(selection);
  const restoreFocusAfterCloseRef = React.useRef(false);
  const surfaceHistoryEntryRef = React.useRef<MobileSurfaceHistoryEntry | null>(
    initialHistoryEntry,
  );
  const imagePickerPendingRef = React.useRef(false);
  const keyboardWasVisibleRef = React.useRef(false);
  const { openFilePicker: openImagePicker } = useFilePicker({
    accept: ["image/*"],
    multiple: true,
    readFilesContent: false,
    onFilesSelected: ({ plainFiles }) => {
      imagePickerPendingRef.current = false;
      onFileDialogChange(false);
      if (plainFiles.length === 0) {
        requestAnimationFrame(focusSavedSelection);
        return;
      }
      restoreSelection();
      editor.getTransforms(PlaceholderPlugin).insert.media(plainFiles);
      savedSelectionRef.current = editor.selection;
      requestAnimationFrame(focusSavedSelection);
    },
  });

  React.useEffect(() => {
    if (!visible) {
      keyboardWasVisibleRef.current = false;
      return;
    }
    if (surface !== null || imagePickerPendingRef.current) return;

    if (visualViewportBottomInset >= 120) {
      keyboardWasVisibleRef.current = true;
      return;
    }
    if (keyboardWasVisibleRef.current && visualViewportBottomInset <= 48) {
      keyboardWasVisibleRef.current = false;
      editor.tf.blur();
      onDismiss();
    }
  }, [editor, onDismiss, surface, visible, visualViewportBottomInset]);

  const currentBlockType = React.useMemo(() => {
    if (!blockPath) return null;
    const entry = editor.api.node<TElement>(blockPath);
    return entry ? getBlockType(entry[0]) : null;
  }, [blockPath, editor]);

  const saveSelection = React.useCallback(() => {
    const domSelection = window.getSelection();
    const slateSelection =
      domSelection && domSelection.rangeCount > 0
        ? editor.api.toSlateRange(domSelection, {
            exactMatch: false,
            suppressThrow: true,
          })
        : null;

    const nextSelection = slateSelection ?? editor.selection;
    if (nextSelection) savedSelectionRef.current = nextSelection;
  }, [editor]);

  React.useEffect(() => {
    if (selection) savedSelectionRef.current = selection;
  }, [selection]);

  const restoreSelection = React.useCallback(() => {
    if (savedSelectionRef.current) {
      editor.tf.select(savedSelectionRef.current);
    }
  }, [editor]);

  const rememberBlockPath = React.useCallback(
    (path: Path | null) => {
      blockPathRef.current?.unref();
      blockPathRef.current = path ? editor.api.pathRef(path) : null;
      setBlockPath(path);
    },
    [editor],
  );

  const resolveBlockPath = React.useCallback(
    () => blockPathRef.current?.current ?? editor.api.block()?.[1] ?? null,
    [editor],
  );

  React.useEffect(
    () => () => {
      blockPathRef.current?.unref();
    },
    [],
  );

  const restoreSelectionOrDocumentEnd = () => {
    restoreSelection();
    if (editor.selection) return;

    const documentEnd = editor.api.end([]);
    if (documentEnd) editor.tf.select(documentEnd);
  };

  const focusSavedSelection = React.useCallback(() => {
    const selectionToRestore = savedSelectionRef.current;
    if (selectionToRestore) editor.tf.select(selectionToRestore);
    editor.tf.focus({
      at: selectionToRestore ?? undefined,
      retries: 5,
    });

    if (!selectionToRestore) return;
    const domRange = editor.api.toDOMRange(selectionToRestore);
    const domSelection = window.getSelection();
    if (domRange && domSelection) {
      domSelection.removeAllRanges();
      domSelection.addRange(domRange);
    }
  }, [editor]);

  const closeSurface = React.useCallback(() => {
    restoreFocusAfterCloseRef.current = true;
    const entry = surfaceHistoryEntryRef.current;
    const currentToken = (
      window.history.state as {
        cupediaMobileEditorSurfaceToken?: string;
      } | null
    )?.cupediaMobileEditorSurfaceToken;
    if (entry && currentToken === entry.token) {
      window.history.back();
      return;
    }
    surfaceHistoryEntryRef.current = null;
    setSurface(null);
  }, []);

  const openSurface = React.useCallback(
    (nextSurface: Exclude<MobileEditorSurface, null>) => {
      if (!surfaceHistoryEntryRef.current) {
        const token = crypto.randomUUID();
        window.history.pushState(
          {
            ...window.history.state,
            cupediaMobileEditorSurface: nextSurface,
            cupediaMobileEditorSurfaceToken: token,
          },
          "",
          window.location.href,
        );
        surfaceHistoryEntryRef.current = {
          surface: nextSurface,
          token,
        };
      }
      setSurface(nextSurface);
    },
    [],
  );

  React.useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const nextEntry = readSurfaceHistoryEntry(event.state);
      if (nextEntry) {
        surfaceHistoryEntryRef.current = nextEntry;
        setBlockPath(blockPathRef.current?.current ?? null);
        setSurface(nextEntry.surface);
        return;
      }
      if (!surfaceHistoryEntryRef.current) return;
      surfaceHistoryEntryRef.current = null;
      restoreFocusAfterCloseRef.current = true;
      setSurface(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  React.useEffect(() => {
    const restoreAfterFileDialog = () => {
      if (!imagePickerPendingRef.current) return;
      imagePickerPendingRef.current = false;
      onFileDialogChange(false);
      requestAnimationFrame(focusSavedSelection);
    };
    window.addEventListener("focus", restoreAfterFileDialog);
    return () => {
      window.removeEventListener("focus", restoreAfterFileDialog);
      onFileDialogChange(false);
    };
  }, [focusSavedSelection, onFileDialogChange]);

  React.useEffect(() => {
    if (surface !== null || !restoreFocusAfterCloseRef.current) return;
    restoreFocusAfterCloseRef.current = false;

    const frame = requestAnimationFrame(focusSavedSelection);
    return () => cancelAnimationFrame(frame);
  }, [focusSavedSelection, surface]);

  React.useEffect(() => {
    if (surface !== "format") return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      closeSurface();
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [closeSurface, surface]);

  const openInsert = () => {
    saveSelection();
    openSurface("insert");
  };

  const openFormat = () => {
    saveSelection();
    rememberBlockPath(editor.api.block()?.[1] ?? null);
    openSurface("format");
  };

  const openBlock = () => {
    saveSelection();
    rememberBlockPath(editor.api.block()?.[1] ?? null);
    openSurface("turnInto");
  };

  const runInlineCommand = (command: () => void) => {
    saveSelection();
    restoreSelection();
    command();
    savedSelectionRef.current = editor.selection;
    requestAnimationFrame(focusSavedSelection);
  };

  const openMention = () => {
    restoreSelectionOrDocumentEnd();
    openWikiLinkCombobox(editor);
    savedSelectionRef.current = editor.selection;
  };

  const runAccessoryCommand = (command: () => void) => {
    restoreSelection();
    command();
    savedSelectionRef.current = editor.selection;
    requestAnimationFrame(focusSavedSelection);
  };

  const addComment = () => {
    if (!canCreateDiscussion) return;
    restoreSelectionOrDocumentEnd();
    if (RangeApi.isExpanded(editor.selection)) {
      commentTransforms.comment.setDraft();
    } else {
      const path = editor.api.block()?.[1];
      if (path) commentTransforms.comment.setDraft({ at: path });
    }
    setActiveCommentId("draft");
  };

  const deleteCurrentBlock = () => {
    saveSelection();
    const path = editor.api.block()?.[1];
    if (!path) return;

    const parentPath = PathApi.parent(path);
    const siblingIndex = path.at(-1) ?? 0;
    const previousPath = siblingIndex > 0 ? PathApi.previous(path) : null;
    const nextPath = PathApi.next(path);
    const adjacentPoint =
      (previousPath && editor.api.node(previousPath)
        ? editor.api.end(previousPath)
        : null) ??
      (editor.api.node(nextPath) ? editor.api.start(nextPath) : null) ??
      editor.api.before(path) ??
      editor.api.after(path);
    const adjacentPointRef = adjacentPoint
      ? editor.api.pointRef(adjacentPoint)
      : null;

    editor.tf.withoutNormalizing(() => {
      editor.tf.deselect();
      editor.tf.removeNodes({ at: path });
      if (editor.children.length === 0) {
        editor.tf.insertNodes(editor.api.create.block({ type: KEYS.p }), {
          at: [0],
        });
      }
    });

    const nestedParentPoint =
      path.length > 1 ? editor.api.start(parentPath) : null;
    const resolvedAdjacentPoint = adjacentPointRef?.unref() ?? null;
    const nextPoint =
      nestedParentPoint ??
      resolvedAdjacentPoint ??
      editor.api.start(parentPath) ??
      editor.api.start([]);
    if (nextPoint) {
      editor.tf.select(nextPoint);
      savedSelectionRef.current = editor.selection;
    }
    requestAnimationFrame(focusSavedSelection);
    toast("已删除块", {
      action: {
        label: "撤销",
        onClick: () => {
          editor.undo();
          requestAnimationFrame(focusSavedSelection);
        },
      },
    });
  };

  const insertCommand = (
    command: (typeof insertGroups)[number]["commands"][number],
  ) => {
    restoreSelection();
    insertBlockCommand(editor, command);
    savedSelectionRef.current = editor.selection;
    closeSurface();
  };

  const turnIntoCommand = (
    command: (typeof turnIntoGroups)[number]["commands"][number],
  ) => {
    restoreSelection();
    const path = resolveBlockPath();
    if (!path) return;

    turnIntoBlockCommand(editor, command, { at: path });
    savedSelectionRef.current = editor.selection;
    closeSurface();
  };

  // Stay mounted while focus is elsewhere so the history listener can restore
  // a Forward-traversed Insert/Turn into entry instead of leaving a dead state.
  if (!visible && surface === null) return null;

  const renderDismissButton = () => (
    <SelectionPreservingButton
      type="button"
      aria-label="收起键盘"
      onAction={() => {
        editor.tf.blur();
        onDismiss();
      }}
      className={`${toolbarButtonClass} border-l border-black/[0.07] dark:border-white/10`}
    >
      <ChevronDownIcon aria-hidden="true" className="size-[18px]" />
    </SelectionPreservingButton>
  );

  return (
    <>
      {surface !== "insert" && surface !== "turnInto" && (
        <div
          role="toolbar"
          aria-label="键盘上方编辑工具"
          data-mobile-editor-chrome="true"
          style={{
            bottom:
              surface === null
                ? `calc(${visualViewportBottomInset}px + 0.75rem + env(safe-area-inset-bottom))`
                : `${visualViewportBottomInset}px`,
          }}
          className={`fixed z-50 hidden flex-col text-[#37352f] max-md:flex [@media(pointer:coarse)]:flex dark:text-[#efefef] ${
            surface === null
              ? "right-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 overflow-hidden rounded-[18px] border border-black/[0.1] bg-[#f7f7f5] shadow-[0_2px_12px_rgba(0,0,0,0.08)] dark:border-white/[0.12] dark:bg-[#252525] dark:shadow-[0_2px_14px_rgba(0,0,0,0.35)]"
              : "inset-x-0 bottom-0 bg-[#fbfbfa]/98 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:bg-[#252525]/98"
          }`}
        >
          <div
            className={`flex w-full items-center ${
              surface === null
                ? "h-11"
                : "h-11 border-t border-black/[0.09] dark:border-white/10"
            }`}
          >
            <div
              data-testid="mobile-editor-action-scroll"
              className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {surface === null && !selectionExpanded && (
                <div className="grid h-11 w-full grid-cols-[44px_minmax(70px,1fr)_repeat(5,44px)] items-stretch divide-x divide-black/[0.08] min-[376px]:grid-cols-[48px_minmax(81px,1fr)_repeat(5,44px)] min-[393px]:grid-cols-[54px_minmax(93px,1fr)_repeat(5,44px)] dark:divide-white/[0.1]">
                  <SelectionPreservingButton
                    type="button"
                    aria-label="插入块"
                    aria-controls="mobile-insert-block-surface"
                    aria-expanded={surface === "insert"}
                    aria-haspopup="dialog"
                    onAction={openInsert}
                    className="flex touch-manipulation items-center justify-center gap-1 text-[#37352f] hover:bg-black/[0.055] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 dark:text-[#efefef] dark:hover:bg-white/10"
                  >
                    <PlusIcon aria-hidden="true" className="size-6" />
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="size-3.5 text-[#787774]"
                    />
                  </SelectionPreservingButton>
                  <SelectionPreservingButton
                    type="button"
                    aria-label="转换块类型"
                    aria-controls="mobile-turn-into-surface"
                    aria-expanded={surface === "turnInto"}
                    aria-haspopup="dialog"
                    onAction={openBlock}
                    className="flex min-w-0 touch-manipulation items-center justify-center gap-0.5 px-0.5 text-[#37352f] hover:bg-black/[0.055] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 min-[376px]:gap-1 min-[376px]:px-1 dark:text-[#efefef] dark:hover:bg-white/10"
                  >
                    <span className="truncate text-[11px] font-medium min-[361px]:text-[12px] min-[376px]:text-[13px] min-[393px]:text-[14px]">
                      Turn into
                    </span>
                    <ChevronDownIcon
                      aria-hidden="true"
                      className="size-3 shrink-0 text-[#787774] min-[376px]:size-3.5"
                    />
                  </SelectionPreservingButton>
                  <SelectionPreservingButton
                    type="button"
                    aria-label="提及页面"
                    onAction={() => {
                      saveSelection();
                      openMention();
                    }}
                    className="flex touch-manipulation items-center justify-center text-[25px] font-light text-[#37352f] hover:bg-black/[0.055] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 dark:text-[#efefef] dark:hover:bg-white/10"
                  >
                    <span aria-hidden="true">@</span>
                  </SelectionPreservingButton>
                  <SelectionPreservingButton
                    type="button"
                    aria-label="添加批注"
                    disabled={!canCreateDiscussion}
                    onAction={() => {
                      saveSelection();
                      addComment();
                    }}
                    className="flex touch-manipulation items-center justify-center text-[#37352f] hover:bg-black/[0.055] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 disabled:opacity-35 dark:text-[#efefef] dark:hover:bg-white/10"
                  >
                    <MessageSquareTextIcon
                      aria-hidden="true"
                      className="size-[21px]"
                    />
                  </SelectionPreservingButton>
                  <SelectionPreservingButton
                    type="button"
                    aria-label="插入图片"
                    onAction={() => {
                      saveSelection();
                      imagePickerPendingRef.current = true;
                      onFileDialogChange(true);
                      openImagePicker();
                    }}
                    className="flex touch-manipulation items-center justify-center text-[#37352f] hover:bg-black/[0.055] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 dark:text-[#efefef] dark:hover:bg-white/10"
                  >
                    <ImageIcon aria-hidden="true" className="size-[22px]" />
                  </SelectionPreservingButton>
                  <SelectionPreservingButton
                    type="button"
                    aria-label="删除当前块"
                    onAction={deleteCurrentBlock}
                    className="flex touch-manipulation items-center justify-center text-[#37352f] hover:bg-black/[0.055] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 dark:text-[#efefef] dark:hover:bg-white/10"
                  >
                    <Trash2Icon aria-hidden="true" className="size-[21px]" />
                  </SelectionPreservingButton>
                  <SelectionPreservingButton
                    type="button"
                    aria-label="收起键盘"
                    onAction={() => {
                      editor.tf.blur();
                      onDismiss();
                    }}
                    className="flex touch-manipulation items-center justify-center text-[#37352f] hover:bg-black/[0.055] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 dark:text-[#efefef] dark:hover:bg-white/10"
                  >
                    <KeyboardIcon aria-hidden="true" className="size-[21px]" />
                  </SelectionPreservingButton>
                </div>
              )}

              {surface === null && selectionExpanded && (
                <div
                  data-testid="mobile-selection-actions"
                  className="flex min-w-max items-center px-1"
                >
                  <SelectionPreservingButton
                    type="button"
                    aria-label="添加批注"
                    disabled={!canCreateDiscussion}
                    onAction={() => {
                      saveSelection();
                      addComment();
                    }}
                    className={toolbarButtonClass}
                  >
                    <MessageSquareTextIcon
                      aria-hidden="true"
                      className="size-[18px]"
                    />
                  </SelectionPreservingButton>
                  {formatActions.slice(0, 2).map((action) => {
                    const Icon = action.icon;
                    return (
                      <SelectionPreservingButton
                        key={action.key}
                        type="button"
                        aria-label={action.label}
                        aria-pressed={editor.api.hasMark(action.key)}
                        onAction={() =>
                          runInlineCommand(() =>
                            editor.tf.toggleMark(action.key),
                          )
                        }
                        className={toolbarButtonClass}
                      >
                        <Icon aria-hidden="true" className="size-[18px]" />
                      </SelectionPreservingButton>
                    );
                  })}
                  <SelectionPreservingButton
                    type="button"
                    aria-label="链接"
                    onAction={() =>
                      runInlineCommand(() =>
                        triggerFloatingLink(editor, { focused: true }),
                      )
                    }
                    className={toolbarButtonClass}
                  >
                    <LinkIcon aria-hidden="true" className="size-[18px]" />
                  </SelectionPreservingButton>
                  <SelectionPreservingButton
                    type="button"
                    aria-label="行内代码"
                    onAction={() =>
                      runInlineCommand(() => editor.tf.toggleMark(KEYS.code))
                    }
                    className={toolbarButtonClass}
                  >
                    <Code2Icon aria-hidden="true" className="size-[18px]" />
                  </SelectionPreservingButton>
                  <SelectionPreservingButton
                    type="button"
                    aria-label="更多格式"
                    aria-controls="mobile-format-surface"
                    aria-expanded={surface === "format"}
                    onAction={openFormat}
                    className={toolbarButtonClass}
                  >
                    <EllipsisIcon aria-hidden="true" className="size-[19px]" />
                  </SelectionPreservingButton>
                </div>
              )}

              {surface === "format" && (
                <div className="flex min-w-max items-center px-1">
                  <SelectionPreservingButton
                    type="button"
                    aria-label="返回编辑工具"
                    onAction={closeSurface}
                    className={toolbarButtonClass}
                  >
                    <ArrowLeftIcon aria-hidden="true" className="size-[18px]" />
                  </SelectionPreservingButton>
                  <span className="px-2 text-sm font-medium">Aa</span>
                  {formatActions.map((action) => {
                    const Icon = action.icon;
                    return (
                      <SelectionPreservingButton
                        key={action.key}
                        type="button"
                        aria-label={action.label}
                        aria-pressed={editor.api.hasMark(action.key)}
                        onAction={() =>
                          runAccessoryCommand(() =>
                            editor.tf.toggleMark(action.key),
                          )
                        }
                        className={toolbarButtonClass}
                      >
                        <Icon aria-hidden="true" className="size-[18px]" />
                      </SelectionPreservingButton>
                    );
                  })}
                </div>
              )}
            </div>

            {(surface !== null || selectionExpanded) && renderDismissButton()}
          </div>

          {surface === "format" && (
            <section
              id="mobile-format-surface"
              role="region"
              aria-label="文本样式"
              className="max-h-[min(42dvh,20rem)] overflow-y-auto border-t border-black/[0.07] bg-[#fbfbfa] px-3 pt-3 pb-4 overscroll-contain dark:border-white/10 dark:bg-[#252525]"
            >
              <h3 className="px-1 pb-2 text-xs font-medium text-[#9b9a97]">
                文字样式
              </h3>
              <div className="grid grid-cols-2 gap-1">
                {formatBlockCommands.map((command) => {
                  const Icon = command.icon;
                  return (
                    <SelectionPreservingButton
                      key={command.id}
                      type="button"
                      aria-label={command.label}
                      aria-pressed={currentBlockType === command.value}
                      onAction={() =>
                        runAccessoryCommand(() => {
                          const path = resolveBlockPath();
                          if (!path) return;
                          turnIntoBlockCommand(editor, command, { at: path });
                        })
                      }
                      className={panelButtonClass}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-5 shrink-0 text-[#787774]"
                      />
                      <span>{command.label}</span>
                    </SelectionPreservingButton>
                  );
                })}
              </div>
              <h3 className="px-1 pt-3 pb-2 text-xs font-medium text-[#9b9a97]">
                格式
              </h3>
              <div className="grid grid-cols-2 gap-1">
                {formatActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <SelectionPreservingButton
                      key={action.key}
                      type="button"
                      aria-label={action.label}
                      aria-pressed={editor.api.hasMark(action.key)}
                      onAction={() =>
                        runAccessoryCommand(() =>
                          editor.tf.toggleMark(action.key),
                        )
                      }
                      className={panelButtonClass}
                    >
                      <Icon
                        aria-hidden="true"
                        className="size-[18px] shrink-0 text-[#787774]"
                      />
                      <span>{action.label}</span>
                    </SelectionPreservingButton>
                  );
                })}
              </div>
            </section>
          )}
        </div>
      )}

      {surface === "insert" && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) closeSurface();
          }}
        >
          <Dialog.Portal>
            <Dialog.Popup
              id="mobile-insert-block-surface"
              data-testid="mobile-editor-sheet"
              data-mobile-editor-chrome="true"
              initialFocus={insertCancelRef}
              className="fixed inset-0 z-[70] hidden min-h-0 flex-col bg-[#f7f7f5] text-[#37352f] outline-none max-md:flex [@media(pointer:coarse)]:flex dark:bg-[#202020] dark:text-[#f1f1f1]"
            >
              <div className="relative flex min-h-14 shrink-0 items-center justify-center border-b border-black/[0.1] px-4 pt-[env(safe-area-inset-top)] dark:border-white/[0.08] dark:bg-[#191919]">
                <Dialog.Title className="text-[16px] font-semibold">
                  插入块
                </Dialog.Title>
                <Dialog.Close
                  ref={insertCancelRef}
                  className="absolute right-3 flex min-h-11 touch-manipulation items-center rounded-md px-3 text-[16px] font-medium text-[#007aff] hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-black/[0.08] dark:text-[#0a84ff] dark:hover:bg-white/10 dark:active:bg-white/[0.14]"
                >
                  取消
                </Dialog.Close>
              </div>

              <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                {mobileInsertGroups.map((group) => (
                  <section key={group.label}>
                    <h3 className="border-b border-black/[0.1] px-4 py-4 text-[16px] font-medium text-[#787774] dark:border-white/[0.08] dark:text-[#a5a5a5]">
                      {group.label}
                    </h3>
                    <div>
                      {group.commands.map((command) => {
                        const Icon = command.icon;
                        const hint = mobileInsertHints[command.id];
                        return (
                          <button
                            key={command.id}
                            type="button"
                            data-testid="mobile-insert-cell"
                            aria-label={command.label}
                            onClick={() => insertCommand(command)}
                            className="flex h-[46px] min-h-11 w-full touch-manipulation items-center border-b border-black/[0.1] px-4 text-left hover:bg-black/[0.045] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 active:bg-black/[0.075] dark:border-white/[0.08] dark:hover:bg-white/[0.06] dark:active:bg-white/[0.1]"
                          >
                            <span className="flex w-10 shrink-0 items-center justify-start text-[#5f5e5b] dark:text-[#dedede]">
                              <Icon
                                aria-hidden="true"
                                className="size-[21px] stroke-[1.7]"
                              />
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[16px]">
                              {command.label}
                            </span>
                            {hint && (
                              <span
                                aria-hidden="true"
                                className="ml-3 text-[14px] text-[#9b9a97] dark:text-[#777]"
                              >
                                {hint}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      )}

      {surface === "turnInto" && (
        <Dialog.Root
          open
          onOpenChange={(open) => {
            if (!open) closeSurface();
          }}
        >
          <Dialog.Portal>
            <Dialog.Popup
              id="mobile-turn-into-surface"
              data-testid="mobile-turn-into-sheet"
              data-mobile-editor-chrome="true"
              initialFocus={insertCancelRef}
              className="fixed inset-0 z-[70] hidden min-h-0 flex-col bg-[#f7f7f5] text-[#37352f] outline-none max-md:flex [@media(pointer:coarse)]:flex dark:bg-[#202020] dark:text-[#f1f1f1]"
            >
              <div className="relative flex min-h-14 shrink-0 items-center justify-center border-b border-black/[0.1] px-4 pt-[env(safe-area-inset-top)] dark:border-white/[0.08] dark:bg-[#191919]">
                <Dialog.Title className="text-[16px] font-semibold">
                  Turn into
                </Dialog.Title>
                <Dialog.Close
                  ref={insertCancelRef}
                  className="absolute right-3 flex min-h-11 touch-manipulation items-center rounded-md px-3 text-[16px] font-medium text-[#007aff] hover:bg-black/[0.05] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 active:bg-black/[0.08] dark:text-[#0a84ff] dark:hover:bg-white/10 dark:active:bg-white/[0.14]"
                >
                  取消
                </Dialog.Close>
              </div>

              <div className="min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain pb-[env(safe-area-inset-bottom)]">
                <div className="h-8 border-b border-black/[0.1] dark:border-white/[0.08] dark:bg-[#202020]" />
                {mobileTurnIntoCommands.map((command) => {
                  const Icon = command.icon;
                  const isCurrent = currentBlockType === command.value;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      data-testid="mobile-turn-into-cell"
                      aria-label={command.label}
                      aria-pressed={isCurrent}
                      onClick={() => turnIntoCommand(command)}
                      className="flex h-[46px] min-h-11 w-full touch-manipulation items-center border-b border-black/[0.1] px-4 text-left hover:bg-black/[0.045] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-ring/50 aria-pressed:bg-black/[0.05] active:bg-black/[0.075] dark:border-white/[0.08] dark:hover:bg-white/[0.06] dark:aria-pressed:bg-white/[0.055] dark:active:bg-white/[0.1]"
                    >
                      <span className="flex w-10 shrink-0 items-center justify-start text-[#5f5e5b] dark:text-[#dedede]">
                        <Icon
                          aria-hidden="true"
                          className="size-[21px] stroke-[1.7]"
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[16px]">
                        {command.label}
                      </span>
                      {isCurrent && (
                        <CheckIcon
                          aria-hidden="true"
                          className="ml-3 size-5 shrink-0 stroke-[2]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </Dialog.Popup>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}
