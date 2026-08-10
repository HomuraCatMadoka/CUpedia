import type { WikiDocumentKind } from "./wiki-sync";

export const WIKI_DRAFT_SCHEMA_VERSION = 2 as const;

interface WikiDraftRecordFields {
  userId: string;
  pageId: string;
  sessionId: string;
  baseVersion: number;
  contentGeneration: number;
  baseSnapshot: string;
  /** Last request sent without a confirmed response; survives reloads. */
  submittedSnapshot?: string;
  /** Causal identity for current-schema submissions. */
  submitted?: WikiDraftSubmission;
  /** Recovery fences that must never be replayed as an ordinary local edit. */
  recoveryDisposition?: "manual" | "legacy-ambiguous";
  draftSnapshot: string;
  updatedAt: number;
}

export interface WikiDraftSubmission {
  id: string;
  snapshot: string;
}

export interface WikiDraftRecord extends WikiDraftRecordFields {
  schemaVersion: typeof WIKI_DRAFT_SCHEMA_VERSION;
  documentKind: WikiDocumentKind;
}

/** The only Local draft format deployed before document-kind isolation. */
export interface LegacyWikiDraftRecord extends WikiDraftRecordFields {
  schemaVersion: 1;
  documentKind?: undefined;
}

export interface WikiDraftServerState {
  userId: string;
  pageId: string;
  documentKind: WikiDocumentKind;
  version: number;
  contentGeneration: number;
  snapshot: string;
}

export type WikiDraftBaseline = Pick<
  WikiDraftServerState,
  "version" | "contentGeneration" | "snapshot"
>;

/** Orders server baselines by causal generation first, then revision version. */
export function compareWikiDraftBaselines(
  left: WikiDraftBaseline,
  right: WikiDraftBaseline,
) {
  if (left.contentGeneration !== right.contentGeneration) {
    return left.contentGeneration - right.contentGeneration;
  }
  return left.version - right.version;
}

export function createWikiDraftKey(
  record: Pick<
    WikiDraftRecord,
    "userId" | "pageId" | "documentKind" | "sessionId"
  >,
) {
  return `${record.userId}:${record.documentKind}:${record.pageId}:${record.sessionId}`;
}

/** Key format deployed before Local drafts distinguished document kinds. */
export function createLegacyWikiDraftKey(
  record: Pick<WikiDraftRecord, "userId" | "pageId" | "sessionId">,
) {
  return `${record.userId}:${record.pageId}:${record.sessionId}`;
}

type DraftNode = {
  type?: string;
  text?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  code?: boolean;
  url?: string;
  children?: DraftNode[];
};

function formatInlineNode(node: DraftNode): string {
  if (typeof node.text === "string") {
    let text = node.text;
    if (node.code) text = `\`${text}\``;
    if (node.bold) text = `**${text}**`;
    if (node.italic) text = `_${text}_`;
    if (node.underline) text = `<u>${text}</u>`;
    if (node.strikethrough) text = `~~${text}~~`;
    return text;
  }
  const text = (node.children ?? []).map(formatInlineNode).join("");
  return node.type === "a" && node.url ? `[${text}](${node.url})` : text;
}

function formatBlock(node: DraftNode) {
  const text = (node.children ?? []).map(formatInlineNode).join("");
  switch (node.type) {
    case "h1":
      return `# ${text}`;
    case "h2":
      return `## ${text}`;
    case "h3":
      return `### ${text}`;
    case "blockquote":
      return `> ${text}`;
    case "li":
    case "lic":
      return `- ${text}`;
    case "code_block":
      return `\`\`\`\n${text}\n\`\`\``;
    case "p":
    case undefined:
      return text;
    default:
      return `[${node.type}] ${text}`.trimEnd();
  }
}

export function formatWikiContentForDiff(content: string) {
  try {
    const nodes = JSON.parse(content) as DraftNode[];
    return nodes.map(formatBlock).join("\n\n");
  } catch {
    return content;
  }
}
