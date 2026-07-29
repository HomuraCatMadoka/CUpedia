"use client";

import type { TElement } from "platejs";
import type { PlateElementProps, RenderNodeWrapper } from "platejs/react";

import { DndPlugin, useDraggable, useDropLine } from "@platejs/dnd";
import { useBlockSelected } from "@platejs/selection/react";
import { PlusIcon } from "lucide-react";
import { useEditorRef, usePath } from "platejs/react";
import { useEffect } from "react";

import { insertSlashCommandAfterBlock } from "@/components/editor/transforms";
import { cn } from "@/lib/utils";
import { WikiBlockMenu } from "@/components/ui/wiki-block-menu";

const SKIP_TYPES = new Set(["img", "video", "tr", "td", "th", "code_line"]);

export const DraggableBlock: RenderNodeWrapper = ({ element }) => {
  if (SKIP_TYPES.has(element.type)) return;

  return function DraggableWrapper({ children }: PlateElementProps) {
    return (
      <DraggableBlockNode element={element}>{children}</DraggableBlockNode>
    );
  };
};

function DraggableBlockNode({
  element,
  children,
}: {
  element: TElement;
  children: React.ReactNode;
}) {
  const editor = useEditorRef();
  const path = usePath();
  const isTopLevel = path.length === 1;
  const { isDragging, handleRef, nodeRef } = useDraggable({ element });
  const { dropLine } = useDropLine({ id: element.id as string });
  const isBlockSelected = useBlockSelected(element.id as string);

  useEffect(() => {
    const node = nodeRef?.current;
    if (!node || !isTopLevel) return;
    let dropTargetTimer: number | undefined;

    const showDropLineImmediately = (event: DragEvent) => {
      const draggingId = editor.getOption(DndPlugin, "draggingId");
      if (
        (Array.isArray(draggingId)
          ? draggingId
          : draggingId
            ? [draggingId]
            : []
        ).includes(element.id as string)
      ) {
        return;
      }

      const rect = node.getBoundingClientRect();
      const line =
        event.clientY < rect.top + rect.height / 2 ? "top" : "bottom";
      const dropTarget = {
        id: element.id as string,
        line,
      } as const;

      window.clearTimeout(dropTargetTimer);
      dropTargetTimer = window.setTimeout(() => {
        editor.setOption(DndPlugin, "dropTarget", dropTarget);
      }, 0);
    };

    node.addEventListener("dragenter", showDropLineImmediately);

    return () => {
      window.clearTimeout(dropTargetTimer);
      node.removeEventListener("dragenter", showDropLineImmediately);
    };
  }, [editor, element.id, isTopLevel, nodeRef]);

  if (!isTopLevel) return <>{children}</>;

  return (
    <div
      ref={nodeRef}
      data-testid="wiki-editor-block"
      data-block-selected={isBlockSelected ? "true" : undefined}
      className={cn(
        "group/block relative [&>[data-slate-node=element]]:relative [&>[data-slate-node=element]]:z-[1]",
        isDragging && "opacity-50",
      )}
    >
      {isBlockSelected && !isDragging && (
        <div
          aria-hidden="true"
          data-testid="wiki-block-selection"
          className="pointer-events-none absolute -inset-x-1.5 -inset-y-0.5 z-0 rounded-[4px] bg-[#e4edfa] dark:bg-[#244160]"
        />
      )}

      <div
        contentEditable={false}
        data-testid="wiki-block-gutter"
        className={cn(
          "pointer-events-none absolute top-1.5 -left-15 z-20 hidden w-12 items-center gap-0.5 opacity-0 md:flex",
          "focus-within:pointer-events-auto focus-within:opacity-100 group-data-[block-selected=true]/block:pointer-events-auto group-data-[block-selected=true]/block:opacity-100",
          "[@media(hover:hover)_and_(pointer:fine)]:group-hover/block:pointer-events-auto [@media(hover:hover)_and_(pointer:fine)]:group-hover/block:opacity-100",
        )}
      >
        <button
          type="button"
          tabIndex={isBlockSelected ? 0 : -1}
          data-wiki-block-control
          aria-label="在此插入内容"
          className="flex size-5 cursor-pointer items-center justify-center rounded text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:bg-accent focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          onMouseDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
          }}
          onClick={() => insertSlashCommandAfterBlock(editor, path)}
        >
          <PlusIcon aria-hidden="true" className="size-3.5" />
        </button>
        <WikiBlockMenu
          dragHandleRef={handleRef}
          element={element}
          keyboardEnabled={Boolean(isBlockSelected)}
          path={path}
        />
      </div>

      {dropLine && (
        <div
          data-testid="wiki-block-drop-line"
          className={cn(
            "absolute inset-x-0 z-50 h-0.5 bg-ring",
            dropLine === "top" ? "-top-px" : "-bottom-px",
          )}
        />
      )}

      {children}
    </div>
  );
}
