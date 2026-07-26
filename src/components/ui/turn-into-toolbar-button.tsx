"use client";

import * as React from "react";

import type { DropdownMenuProps } from "@radix-ui/react-dropdown-menu";
import type { TElement } from "platejs";

import { DropdownMenuItemIndicator } from "@radix-ui/react-dropdown-menu";
import { CheckIcon } from "lucide-react";
import { KEYS } from "platejs";
import { useEditorRef, useSelectionFragmentProp } from "platejs/react";

import {
  getBlockCommandGroups,
  getBlockCommands,
  turnIntoBlockCommand,
} from "@/components/editor/block-command-catalog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getBlockType } from "@/components/editor/transforms";

import { ToolbarButton, ToolbarMenuGroup } from "./toolbar";

const turnIntoItems = getBlockCommands("turnInto");
const turnIntoGroups = getBlockCommandGroups("turnInto");

export function TurnIntoToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef();
  const [open, setOpen] = React.useState(false);

  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as TElement),
  });
  const selectedItem = React.useMemo(
    () =>
      turnIntoItems.find((item) => item.value === (value ?? KEYS.p)) ??
      turnIntoItems[0],
    [value],
  );

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger
        render={
          <ToolbarButton
            className="min-w-[112px]"
            pressed={open}
            tooltip="转换块类型"
            isDropdown
          />
        }
      >
        {selectedItem.label}
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="ignore-click-outside/toolbar min-w-0"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          editor.tf.focus();
        }}
        align="start"
      >
        {turnIntoGroups.map((group) => (
          <ToolbarMenuGroup
            key={group.id}
            value={selectedItem.id}
            onValueChange={(commandId) => {
              const command = turnIntoItems.find(
                (item) => item.id === commandId,
              );
              if (command) {
                turnIntoBlockCommand(editor, command);
                requestAnimationFrame(() => editor.tf.focus());
              }
            }}
            label={group.label}
          >
            {group.commands.map((command) => {
              const Icon = command.icon;

              return (
                <DropdownMenuRadioItem
                  key={command.id}
                  className="min-w-[220px] gap-2 px-2 py-1.5 *:first:[span]:hidden"
                  value={command.id}
                >
                  <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
                    <DropdownMenuItemIndicator>
                      <CheckIcon />
                    </DropdownMenuItemIndicator>
                  </span>
                  <Icon
                    aria-hidden="true"
                    className="size-4 text-muted-foreground"
                  />
                  <span>{command.label}</span>
                </DropdownMenuRadioItem>
              );
            })}
          </ToolbarMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
