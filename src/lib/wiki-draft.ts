export const WIKI_DRAFT_SCHEMA_VERSION = 1 as const;

export interface WikiDraftRecord {
  schemaVersion: typeof WIKI_DRAFT_SCHEMA_VERSION;
  userId: string;
  pageId: string;
  sessionId: string;
  baseVersion: number;
  contentGeneration: number;
  baseSnapshot: string;
  draftSnapshot: string;
  updatedAt: number;
}

export interface WikiDraftServerState {
  userId: string;
  pageId: string;
  version: number;
  contentGeneration: number;
  snapshot: string;
}

export type WikiDraftClassification =
  | "none"
  | "recoverable"
  | "stale-generation";

export function createWikiDraftKey(
  record: Pick<WikiDraftRecord, "userId" | "pageId" | "sessionId">,
) {
  return `${record.userId}:${record.pageId}:${record.sessionId}`;
}

export function classifyWikiDraft(
  record: WikiDraftRecord,
  server: WikiDraftServerState,
): WikiDraftClassification {
  if (
    record.schemaVersion !== WIKI_DRAFT_SCHEMA_VERSION ||
    record.userId !== server.userId ||
    record.pageId !== server.pageId ||
    record.draftSnapshot === record.baseSnapshot ||
    record.draftSnapshot === server.snapshot
  ) {
    return "none";
  }
  return record.contentGeneration === server.contentGeneration
    ? "recoverable"
    : "stale-generation";
}

export function resolveAcknowledgedWikiDraft(
  record: WikiDraftRecord,
  acknowledgedSnapshot: string,
  nextBase?: Pick<
    WikiDraftServerState,
    "version" | "contentGeneration" | "snapshot"
  >,
) {
  if (record.draftSnapshot === acknowledgedSnapshot) return null;
  if (!nextBase) return record;
  return {
    ...record,
    baseVersion: nextBase.version,
    contentGeneration: nextBase.contentGeneration,
    baseSnapshot: nextBase.snapshot,
  };
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
