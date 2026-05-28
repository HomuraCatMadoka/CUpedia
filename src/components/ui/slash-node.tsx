"use client";

import type { PlateEditor, PlateElementProps } from "platejs/react";

import {
  AlertTriangleIcon,
  Code2,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ImageIcon,
  InfoIcon,
  LightbulbIcon,
  ListIcon,
  ListOrdered,
  ListTreeIcon,
  MessageSquareWarningIcon,
  MinusIcon,
  PilcrowIcon,
  Quote,
  Square,
  Table,
} from "lucide-react";
import { type TComboboxInputElement, KEYS } from "platejs";
import { insertCallout } from "@platejs/callout";
import { PlateElement } from "platejs/react";

import { insertBlock } from "@/components/editor/transforms";

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem,
} from "./inline-combobox";

type Group = {
  group: string;
  items: {
    icon: React.ReactNode;
    value: string;
    onSelect: (editor: PlateEditor, value: string) => void;
    focusEditor?: boolean;
    keywords?: string[];
    label?: string;
  }[];
};

const groups: Group[] = [
  {
    group: "基本块",
    items: [
      {
        icon: <PilcrowIcon />,
        keywords: ["paragraph", "text"],
        label: "正文",
        value: KEYS.p,
      },
      {
        icon: <Heading1Icon />,
        keywords: ["title", "h1"],
        label: "标题 1",
        value: KEYS.h1,
      },
      {
        icon: <Heading2Icon />,
        keywords: ["subtitle", "h2"],
        label: "标题 2",
        value: KEYS.h2,
      },
      {
        icon: <Heading3Icon />,
        keywords: ["subtitle", "h3"],
        label: "标题 3",
        value: KEYS.h3,
      },
      {
        icon: <ListIcon />,
        keywords: ["unordered", "ul", "-"],
        label: "无序列表",
        value: KEYS.ul,
      },
      {
        icon: <ListOrdered />,
        keywords: ["ordered", "ol", "1"],
        label: "有序列表",
        value: KEYS.ol,
      },
      {
        icon: <Square />,
        keywords: ["checklist", "task", "checkbox", "[]"],
        label: "任务列表",
        value: KEYS.listTodo,
      },
      {
        icon: <Code2 />,
        keywords: ["```"],
        label: "代码块",
        value: KEYS.codeBlock,
      },
      {
        icon: <Table />,
        label: "表格",
        value: KEYS.table,
      },
      {
        icon: <Quote />,
        keywords: ["citation", "blockquote", ">"],
        label: "引用",
        value: KEYS.blockquote,
      },
      {
        icon: <MinusIcon />,
        keywords: ["divider", "separator", "---"],
        label: "分割线",
        value: KEYS.hr,
      },
      {
        icon: <ImageIcon />,
        keywords: ["image", "picture", "photo"],
        label: "图片",
        value: KEYS.img,
      },
      {
        icon: <ListTreeIcon />,
        keywords: ["toc", "table of contents", "outline"],
        label: "目录",
        value: KEYS.toc,
      },
    ].map((item) => ({
      ...item,
      onSelect: (editor: PlateEditor, value: string) => {
        insertBlock(editor, value, { upsert: true });
      },
    })),
  },
  {
    group: "提示框",
    items: [
      {
        icon: <InfoIcon />,
        keywords: ["callout", "info", "admonition"],
        label: "信息",
        value: "callout_info",
        onSelect: (editor: PlateEditor) => {
          insertCallout(editor, { select: true, variant: "info", icon: "ℹ️" });
          editor.tf.removeNodes({ previousEmptyBlock: true });
        },
      },
      {
        icon: <LightbulbIcon />,
        keywords: ["callout", "tip", "hint"],
        label: "提示",
        value: "callout_tip",
        onSelect: (editor: PlateEditor) => {
          insertCallout(editor, { select: true, variant: "tip", icon: "💡" });
          editor.tf.removeNodes({ previousEmptyBlock: true });
        },
      },
      {
        icon: <AlertTriangleIcon />,
        keywords: ["callout", "warning", "caution"],
        label: "警告",
        value: "callout_warning",
        onSelect: (editor: PlateEditor) => {
          insertCallout(editor, {
            select: true,
            variant: "warning",
            icon: "⚠️",
          });
          editor.tf.removeNodes({ previousEmptyBlock: true });
        },
      },
      {
        icon: <MessageSquareWarningIcon />,
        keywords: ["callout", "error", "danger"],
        label: "危险",
        value: "callout_error",
        onSelect: (editor: PlateEditor) => {
          insertCallout(editor, { select: true, variant: "error", icon: "🚫" });
          editor.tf.removeNodes({ previousEmptyBlock: true });
        },
      },
    ],
  },
];

export function SlashInputElement(
  props: PlateElementProps<TComboboxInputElement>,
) {
  const { editor } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={props.element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent>
          <InlineComboboxEmpty>无结果</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>

              {items.map(
                ({ focusEditor, icon, keywords, label, value, onSelect }) => (
                  <InlineComboboxItem
                    key={value}
                    value={value}
                    onClick={() => onSelect(editor, value)}
                    label={label}
                    focusEditor={focusEditor}
                    group={group}
                    keywords={keywords}
                  >
                    <div className="mr-2 text-muted-foreground">{icon}</div>
                    {label ?? value}
                  </InlineComboboxItem>
                ),
              )}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  );
}
