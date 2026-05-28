"use client";

import type { TElement } from "platejs";
import type { PlateElementProps, RenderNodeWrapper } from "platejs/react";

import { useDraggable, useDropLine } from "@platejs/dnd";
import { GripVertical } from "lucide-react";
import { usePath } from "platejs/react";

import { cn } from "@/lib/utils";

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
  const path = usePath();
  const isTopLevel = path.length === 1;
  const { isDragging, handleRef, nodeRef } = useDraggable({ element });
  const { dropLine } = useDropLine({ id: element.id as string });

  if (!isTopLevel) return <>{children}</>;

  return (
    <div
      ref={nodeRef}
      className={cn("group/block relative", isDragging && "opacity-50")}
    >
      <div
        ref={handleRef}
        role="button"
        tabIndex={-1}
        contentEditable={false}
        className={cn(
          "absolute -left-7 top-0 z-50 flex cursor-grab items-start pt-[3px]",
          "opacity-0 transition-opacity group-hover/block:opacity-100",
          "active:cursor-grabbing",
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GripVertical className="size-4 text-muted-foreground" />
      </div>

      {dropLine && (
        <div
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
