"use client";

import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { DndPlugin } from "@platejs/dnd";

import { DraggableBlock } from "@/components/ui/draggable-node";

function DndContext({ children }: { children: React.ReactNode }) {
  return <DndProvider backend={HTML5Backend}>{children}</DndProvider>;
}

export const DndKit = [
  DndPlugin.configure({
    render: {
      aboveSlate: DndContext,
      aboveNodes: DraggableBlock,
    },
  }),
];
