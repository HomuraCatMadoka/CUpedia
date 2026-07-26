"use client";

import {
  BoldIcon,
  Code2Icon,
  ItalicIcon,
  StrikethroughIcon,
  UnderlineIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import { useEditorReadOnly } from "platejs/react";

import { CommentToolbarButton } from "./comment-toolbar-button";
import { LinkToolbarButton } from "./link-toolbar-button";
import { MarkToolbarButton } from "./mark-toolbar-button";
import { ToolbarGroup, ToolbarSeparator } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly();

  if (readOnly) return null;

  return (
    <>
      <ToolbarGroup>
        <TurnIntoToolbarButton />

        <MarkToolbarButton
          aria-label="粗体"
          nodeType={KEYS.bold}
          tooltip="粗体 (⌘+B)"
        >
          <BoldIcon />
        </MarkToolbarButton>

        <MarkToolbarButton
          aria-label="斜体"
          nodeType={KEYS.italic}
          tooltip="斜体 (⌘+I)"
        >
          <ItalicIcon />
        </MarkToolbarButton>

        <MarkToolbarButton
          aria-label="下划线"
          nodeType={KEYS.underline}
          tooltip="下划线 (⌘+U)"
        >
          <UnderlineIcon />
        </MarkToolbarButton>

        <MarkToolbarButton
          aria-label="删除线"
          nodeType={KEYS.strikethrough}
          tooltip="删除线 (⌘+⇧+X)"
        >
          <StrikethroughIcon />
        </MarkToolbarButton>

        <MarkToolbarButton
          aria-label="行内代码"
          nodeType={KEYS.code}
          tooltip="行内代码 (⌘+E)"
        >
          <Code2Icon />
        </MarkToolbarButton>

        <LinkToolbarButton aria-label="链接" />
      </ToolbarGroup>

      <ToolbarSeparator />

      <ToolbarGroup>
        <CommentToolbarButton />
      </ToolbarGroup>
    </>
  );
}
