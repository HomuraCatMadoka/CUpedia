"use client";

import type { LucideIcon } from "lucide-react";
import type { Path } from "platejs";
import type { PlateEditor } from "platejs/react";

import { insertCallout } from "@platejs/callout";
import {
  AlertTriangleIcon,
  Code2Icon,
  createLucideIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  Heading4Icon,
  ImageIcon,
  LightbulbIcon,
  ListIcon,
  ListOrderedIcon,
  ListTodoIcon,
  ListTreeIcon,
  MessageSquareWarningIcon,
  MinusIcon,
  RadicalIcon,
  TableIcon,
  TypeIcon,
} from "lucide-react";
import { KEYS } from "platejs";

import { insertBlock, setBlockType } from "@/components/editor/transforms";

export type BlockCommandCapability = "insert" | "turnInto";
export type BlockCommandGroupId = "basic" | "lists" | "rich" | "callouts";

export type BlockCommand = {
  capabilities: readonly BlockCommandCapability[];
  description: string;
  group: BlockCommandGroupId;
  icon: LucideIcon;
  id: string;
  keywords: readonly string[];
  label: string;
  value: string;
  insert?: (editor: PlateEditor) => void;
};

export const BLOCK_COMMAND_GROUPS = [
  { id: "basic", label: "基础块" },
  { id: "lists", label: "列表" },
  { id: "rich", label: "丰富内容" },
  { id: "callouts", label: "提示框" },
] as const satisfies readonly {
  id: BlockCommandGroupId;
  label: string;
}[];

const INSERT_AND_TURN_INTO = ["insert", "turnInto"] as const;
const INSERT_ONLY = ["insert"] as const;

const NotionCalloutIcon = createLucideIcon("NotionCallout", [
  ["rect", { x: "3", y: "4", width: "18", height: "16", rx: "2", key: "box" }],
  ["path", { d: "M8 8h8", key: "cap" }],
  ["path", { d: "M12 8v8", key: "stem" }],
]);

const NotionOpeningQuoteIcon = createLucideIcon("NotionOpeningQuote", [
  [
    "path",
    {
      d: "M16 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
      key: "right",
      transform: "rotate(180 12 12)",
    },
  ],
  [
    "path",
    {
      d: "M5 3a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2 1 1 0 0 1 1 1v1a2 2 0 0 1-2 2 1 1 0 0 0-1 1v2a1 1 0 0 0 1 1 6 6 0 0 0 6-6V5a2 2 0 0 0-2-2z",
      key: "left",
      transform: "rotate(180 12 12)",
    },
  ],
]);

function insertCalloutVariant(
  editor: PlateEditor,
  variant: "error" | "info" | "tip" | "warning",
  icon: string,
) {
  insertCallout(editor, { icon, select: true, variant });
  editor.tf.removeNodes({ previousEmptyBlock: true });
}

export const BLOCK_COMMANDS: readonly BlockCommand[] = [
  {
    id: "text",
    value: KEYS.p,
    label: "正文",
    description: "直接开始写作",
    group: "basic",
    icon: TypeIcon,
    keywords: ["文本", "段落", "paragraph", "plain", "text"],
    capabilities: INSERT_AND_TURN_INTO,
  },
  {
    id: "heading-1",
    value: KEYS.h1,
    label: "标题 1",
    description: "页面内最高层级标题",
    group: "basic",
    icon: Heading1Icon,
    keywords: ["一级标题", "title", "heading", "h1"],
    capabilities: INSERT_AND_TURN_INTO,
  },
  {
    id: "heading-2",
    value: KEYS.h2,
    label: "标题 2",
    description: "建立页面层级",
    group: "basic",
    icon: Heading2Icon,
    keywords: ["二级标题", "subtitle", "heading", "h2"],
    capabilities: INSERT_AND_TURN_INTO,
  },
  {
    id: "heading-3",
    value: KEYS.h3,
    label: "标题 3",
    description: "创建更小的分节标题",
    group: "basic",
    icon: Heading3Icon,
    keywords: ["三级标题", "subtitle", "heading", "h3"],
    capabilities: INSERT_AND_TURN_INTO,
  },
  {
    id: "heading-4",
    value: KEYS.h4,
    label: "标题 4",
    description: "创建更低层级的分节标题",
    group: "basic",
    icon: Heading4Icon,
    keywords: ["四级标题", "subtitle", "heading", "h4"],
    capabilities: INSERT_AND_TURN_INTO,
  },
  {
    id: "quote",
    value: KEYS.blockquote,
    label: "引用",
    description: "突出一段引用内容",
    group: "basic",
    icon: NotionOpeningQuoteIcon,
    keywords: ["引言", "citation", "blockquote", "quote", ">"],
    capabilities: INSERT_AND_TURN_INTO,
  },
  {
    id: "divider",
    value: KEYS.hr,
    label: "分割线",
    description: "分隔页面内容",
    group: "basic",
    icon: MinusIcon,
    keywords: ["分隔线", "divider", "separator", "rule", "---"],
    capabilities: INSERT_ONLY,
  },
  {
    id: "bulleted-list",
    value: KEYS.ul,
    label: "项目列表",
    description: "创建简单列表",
    group: "lists",
    icon: ListIcon,
    keywords: ["无序列表", "符号列表", "unordered", "bullet", "ul", "-"],
    capabilities: INSERT_AND_TURN_INTO,
  },
  {
    id: "numbered-list",
    value: KEYS.ol,
    label: "编号列表",
    description: "创建有序步骤",
    group: "lists",
    icon: ListOrderedIcon,
    keywords: ["有序列表", "数字列表", "ordered", "numbered", "ol", "1"],
    capabilities: INSERT_AND_TURN_INTO,
  },
  {
    id: "todo-list",
    value: KEYS.listTodo,
    label: "待办列表",
    description: "跟踪待完成事项",
    group: "lists",
    icon: ListTodoIcon,
    keywords: ["任务列表", "检查清单", "checklist", "task", "todo", "[]"],
    capabilities: INSERT_AND_TURN_INTO,
  },
  {
    id: "code",
    value: KEYS.codeBlock,
    label: "代码块",
    description: "编写带语法高亮的代码",
    group: "rich",
    icon: Code2Icon,
    keywords: ["代码", "code", "snippet", "```"],
    capabilities: INSERT_AND_TURN_INTO,
  },
  {
    id: "table",
    value: KEYS.table,
    label: "表格",
    description: "组织结构化信息",
    group: "rich",
    icon: TableIcon,
    keywords: ["数据", "行列", "table", "grid"],
    capabilities: INSERT_ONLY,
  },
  {
    id: "image",
    value: KEYS.img,
    label: "图片",
    description: "上传或嵌入图片",
    group: "rich",
    icon: ImageIcon,
    keywords: ["照片", "图像", "image", "picture", "photo"],
    capabilities: INSERT_ONLY,
  },
  {
    id: "equation",
    value: KEYS.equation,
    label: "公式",
    description: "插入数学表达式",
    group: "rich",
    icon: RadicalIcon,
    keywords: ["数学", "方程", "math", "formula", "equation", "latex", "katex"],
    capabilities: INSERT_ONLY,
  },
  {
    id: "table-of-contents",
    value: KEYS.toc,
    label: "目录",
    description: "根据页面标题生成目录",
    group: "rich",
    icon: ListTreeIcon,
    keywords: ["大纲", "导航", "toc", "table of contents", "outline"],
    capabilities: INSERT_ONLY,
  },
  {
    id: "callout-info",
    value: KEYS.callout,
    label: "信息提示",
    description: "补充需要留意的信息",
    group: "callouts",
    icon: NotionCalloutIcon,
    keywords: ["公告", "信息", "callout", "info", "admonition"],
    capabilities: INSERT_ONLY,
    insert: (editor) => insertCalloutVariant(editor, "info", "ℹ️"),
  },
  {
    id: "callout-tip",
    value: KEYS.callout,
    label: "实用提示",
    description: "突出建议或小技巧",
    group: "callouts",
    icon: LightbulbIcon,
    keywords: ["技巧", "建议", "提示", "callout", "tip", "hint"],
    capabilities: INSERT_ONLY,
    insert: (editor) => insertCalloutVariant(editor, "tip", "💡"),
  },
  {
    id: "callout-warning",
    value: KEYS.callout,
    label: "警告提示",
    description: "提醒读者谨慎操作",
    group: "callouts",
    icon: AlertTriangleIcon,
    keywords: ["注意", "警告", "callout", "warning", "caution"],
    capabilities: INSERT_ONLY,
    insert: (editor) => insertCalloutVariant(editor, "warning", "⚠️"),
  },
  {
    id: "callout-error",
    value: KEYS.callout,
    label: "危险提示",
    description: "标记风险或严重问题",
    group: "callouts",
    icon: MessageSquareWarningIcon,
    keywords: ["危险", "错误", "callout", "error", "danger"],
    capabilities: INSERT_ONLY,
    insert: (editor) => insertCalloutVariant(editor, "error", "🚫"),
  },
];

export function getBlockCommands(capability: BlockCommandCapability) {
  return BLOCK_COMMANDS.filter((command) =>
    command.capabilities.includes(capability),
  );
}

export function getBlockCommandGroups(capability: BlockCommandCapability) {
  const commands = getBlockCommands(capability);

  return BLOCK_COMMAND_GROUPS.map((group) => ({
    ...group,
    commands: commands.filter((command) => command.group === group.id),
  })).filter((group) => group.commands.length > 0);
}

export function insertBlockCommand(editor: PlateEditor, command: BlockCommand) {
  if (!command.capabilities.includes("insert")) return;

  if (command.insert) {
    command.insert(editor);
    return;
  }

  insertBlock(editor, command.value, { upsert: true });
}

export function turnIntoBlockCommand(
  editor: PlateEditor,
  command: BlockCommand,
  options: { at?: Path } = {},
) {
  if (!command.capabilities.includes("turnInto")) return;

  setBlockType(editor, command.value, options);
}
