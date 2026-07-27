"use client";

import type { PlateElementProps } from "platejs/react";

import { type TComboboxInputElement } from "platejs";
import { PlateElement } from "platejs/react";

import {
  getBlockCommandGroups,
  insertBlockCommand,
} from "@/components/editor/block-command-catalog";

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
  InlineComboboxQuery,
} from "./inline-combobox";

const groups = getBlockCommandGroups("insert");

export function SlashInputElement(
  props: PlateElementProps<TComboboxInputElement>,
) {
  const { editor } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={props.element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent
          aria-label="Slash 命令"
          className="max-h-[330px] w-[320px] rounded-[7px] border border-border p-1.5 shadow-[0_10px_30px_color-mix(in_srgb,var(--foreground)_14%,transparent)]"
          data-testid="slash-command-menu"
        >
          <InlineComboboxQuery placeholder="搜索块类型" />
          <InlineComboboxEmpty className="mx-0 h-auto min-h-14 flex-col items-start justify-center px-2.5 py-2 text-muted-foreground">
            <span className="text-sm text-foreground">未找到匹配的块</span>
            <span className="mt-0.5 text-xs">试试“标题”或“表格”</span>
          </InlineComboboxEmpty>

          {groups.map(({ id, label: groupLabel, commands }) => (
            <InlineComboboxGroup key={id}>
              <InlineComboboxGroupLabel>{groupLabel}</InlineComboboxGroupLabel>

              {commands.map((command) => {
                const Icon = command.icon;

                return (
                  <InlineComboboxItem
                    key={command.id}
                    value={command.id}
                    onClick={() => insertBlockCommand(editor, command)}
                    label={command.label}
                    group={groupLabel}
                    keywords={[...command.keywords]}
                    aria-label={`${command.label}：${command.description}`}
                    className="mx-0 h-auto min-h-11 gap-2.5 rounded-[5px] px-[7px] py-[5px]"
                    data-block-command={command.id}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded border border-border text-muted-foreground">
                      <Icon aria-hidden="true" className="size-4" />
                    </span>
                    <span className="grid min-w-0 text-left leading-tight">
                      <span className="truncate text-sm font-medium">
                        {command.label}
                      </span>
                      <span className="mt-0.5 truncate text-xs text-muted-foreground">
                        {command.description}
                      </span>
                    </span>
                  </InlineComboboxItem>
                );
              })}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
