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
import {
  IndentToolbarButton,
  OutdentToolbarButton,
} from "./indent-toolbar-button";
import { LinkToolbarButton } from "./link-toolbar-button";
import {
  BulletedListToolbarButton,
  NumberedListToolbarButton,
  TodoListToolbarButton,
} from "./list-toolbar-button";
import { MarkToolbarButton } from "./mark-toolbar-button";
import { TableToolbarButton } from "./table-toolbar-button";
import { ToolbarGroup, ToolbarSeparator } from "./toolbar";
import { TurnIntoToolbarButton } from "./turn-into-toolbar-button";

export function FixedToolbarButtons() {
  const readOnly = useEditorReadOnly();

  return (
    <div className="flex w-full" data-testid="fixed-toolbar-buttons">
      {!readOnly && (
        <>
          <ToolbarGroup>
            <TurnIntoToolbarButton />
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
              <BoldIcon />
            </MarkToolbarButton>

            <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
              <ItalicIcon />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.underline}
              tooltip="Underline (⌘+U)"
            >
              <UnderlineIcon />
            </MarkToolbarButton>

            <MarkToolbarButton
              nodeType={KEYS.strikethrough}
              tooltip="Strikethrough (⌘+⇧+X)"
            >
              <StrikethroughIcon />
            </MarkToolbarButton>

            <MarkToolbarButton nodeType={KEYS.code} tooltip="Code (⌘+E)">
              <Code2Icon />
            </MarkToolbarButton>
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <BulletedListToolbarButton />
            <NumberedListToolbarButton />
            <TodoListToolbarButton />
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <OutdentToolbarButton />
            <IndentToolbarButton />
          </ToolbarGroup>

          <ToolbarSeparator />

          <ToolbarGroup>
            <LinkToolbarButton />
            <TableToolbarButton />
          </ToolbarGroup>
        </>
      )}

      <div className="grow" />

      <ToolbarGroup>
        <CommentToolbarButton />
      </ToolbarGroup>
    </div>
  );
}
