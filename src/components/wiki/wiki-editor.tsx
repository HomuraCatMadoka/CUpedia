"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plate, usePlateEditor } from "platejs/react";

import { useAutosave, type AutosaveSaveReason } from "@/hooks/use-autosave";

import { BasicNodesKit } from "@/components/editor/plugins/basic-nodes-kit";
import { CalloutKit } from "@/components/editor/plugins/callout-kit";
import { CommentKit } from "@/components/editor/plugins/comment-kit";
import { CodeBlockKit } from "@/components/editor/plugins/code-block-kit";
import { DndKit } from "@/components/editor/plugins/dnd-kit";
import { LinkKit } from "@/components/editor/plugins/link-kit";
import { MathKit } from "@/components/editor/plugins/math-kit";
import { ListKit } from "@/components/editor/plugins/list-kit";
import { MediaKit } from "@/components/editor/plugins/media-kit";
import { TableKit } from "@/components/editor/plugins/table-kit";
import { TocKit } from "@/components/editor/plugins/toc-kit";
import { SlashKit } from "@/components/editor/plugins/slash-kit";
import { WikiLinkKit } from "@/components/editor/plugins/wiki-link-kit";
import {
  WikiLinkPagesProvider,
  type WikiLinkPage,
} from "@/components/ui/wiki-link-node";
import { FixedToolbarKit } from "@/components/editor/plugins/fixed-toolbar-kit";
import { FloatingToolbarKit } from "@/components/editor/plugins/floating-toolbar-kit";
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit";
import { EditorContainer, Editor } from "@/components/ui/editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DiscussionProvider } from "@/components/wiki/discussion-context";
import { DiscussionSidebar } from "@/components/wiki/discussion-sidebar";
import {
  EditConflictDialog,
  type EditConflict,
} from "@/components/wiki/edit-conflict-dialog";
import type { Discussion } from "@/lib/discussion-actions";
import { useContributorSetup } from "@/components/auth/contributor-setup-provider";
import {
  extractText,
  normalizeInitialValue,
  parseContent,
  type PlateValue,
} from "@/lib/plate-utils";

interface WikiEditorProps {
  mode: "create" | "edit";
  pageId?: string;
  initialTitle?: string;
  initialValue?: PlateValue;
  initialSlug?: string;
  expectedVersion?: number;
  expectedUpdatedAt?: string;
  parentId?: string | null;
  linkablePages?: WikiLinkPage[];
  initialDiscussions?: Discussion[];
  onSubmit: (data: {
    slug: string;
    title: string;
    content: string;
    editSummary?: string;
    parentId?: string | null;
    expectedVersion?: number;
    expectedUpdatedAt?: string;
    baseTitle?: string;
    baseContent?: string;
  }) => Promise<{
    error?: string;
    slug?: string;
    title?: string;
    content?: string;
    version?: number;
    updatedAt?: string;
    conflict?: boolean;
    theirContent?: string;
    theirTitle?: string;
    theirVersion?: number;
    theirUpdatedAt?: string;
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  unsaved: "未保存",
  saving: "保存中…",
  saved: "已保存",
  error: "保存失败",
};
const SAVE_PERMISSION_ERROR = "编辑权限不足，请联系管理员。";
const SAVE_RETRY_ERROR = "保存失败，请检查网络后重试。";

interface WikiDraftSnapshot {
  title: string;
  content: string;
}

function serializeDraftSnapshot(snapshot: WikiDraftSnapshot) {
  return JSON.stringify(snapshot);
}

function parseDraftSnapshot(snapshot: string): WikiDraftSnapshot {
  return JSON.parse(snapshot) as WikiDraftSnapshot;
}

export function WikiEditor({
  mode,
  pageId,
  initialTitle = "",
  initialValue,
  initialSlug = "",
  expectedVersion,
  expectedUpdatedAt,
  parentId,
  linkablePages = [],
  initialDiscussions = [],
  onSubmit,
}: WikiEditorProps) {
  // Stabilize node ids across the SSR render and the client hydration of this
  // `"use client"` editor: both passes normalize the same initialValue prop to
  // identical deterministic ids, so React sees no hydration mismatch (#204).
  // The editor value, the autosave dirty-baseline (`content`), and the
  // three-way-merge base (`baseContentRef`) all derive from this one value so
  // they never disagree.
  const normalizedInitialValue = useMemo(
    () => normalizeInitialValue(initialValue),
    [initialValue],
  );
  // The serialized form of the initial document: the persisted baseline shared
  // by the three-way merge base and the autosave dirty-baseline.
  const initialContent = useMemo(
    () => JSON.stringify(normalizedInitialValue),
    [normalizedInitialValue],
  );
  const initialDraftSnapshot = useMemo(
    () =>
      serializeDraftSnapshot({
        title: initialTitle,
        content: initialContent,
      }),
    [initialContent, initialTitle],
  );

  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(initialSlug);
  const [editSummary, setEditSummary] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [conflict, setConflict] = useState<EditConflict | null>(null);
  const [autosaveConflict, setAutosaveConflict] = useState(false);
  const pendingConflictRef = useRef<EditConflict | null>(null);
  const router = useRouter();
  const { ensureContributorSetup } = useContributorSetup();

  const baselineRef = useRef(expectedVersion);
  const updatedAtBaselineRef = useRef(expectedUpdatedAt);
  const baseTitleRef = useRef(initialTitle);
  const baseContentRef = useRef(initialContent);
  const titleRef = useRef(initialTitle);
  const autosaveEnabled = mode === "edit" && Boolean(pageId);

  const editor = usePlateEditor({
    plugins: [
      ...BasicNodesKit,
      ...CalloutKit,
      ...CodeBlockKit,
      ...CommentKit,
      ...LinkKit,
      ...ListKit,
      ...MathKit,
      ...MediaKit,
      ...TableKit,
      ...TocKit,
      ...SlashKit,
      ...WikiLinkKit,
      ...DndKit,
      ...FixedToolbarKit,
      ...FloatingToolbarKit,
      ...MarkdownKit,
    ],
    value: normalizedInitialValue,
  });

  const save = useCallback(
    async (nextSnapshot: string, reason: AutosaveSaveReason = "explicit") => {
      const next = parseDraftSnapshot(nextSnapshot);
      const result = await onSubmit({
        slug,
        title: next.title,
        content: next.content,
        editSummary: editSummary || undefined,
        parentId,
        expectedVersion: baselineRef.current,
        expectedUpdatedAt: updatedAtBaselineRef.current,
        baseTitle: baseTitleRef.current,
        baseContent: baseContentRef.current,
      });
      // Adopt the document the server actually persisted. A clean three-way
      // merge can contain blocks from another editor that were absent from
      // this request; using `next` here would leave both the visible editor and
      // the next merge ancestor stale.
      if (result.version !== undefined && result.updatedAt) {
        const authoritativeContent = result.content ?? next.content;
        const authoritativeTitle = result.title ?? next.title;
        const currentContent = JSON.stringify(editor.children);
        const contentDrifted = currentContent !== next.content;
        const titleDrifted = titleRef.current !== next.title;

        // A response must not overwrite input made while it was in flight.
        // Keeping the old optimistic-lock baseline in that case makes the
        // trailing autosave merge from the original common ancestor.
        if (!contentDrifted && !titleDrifted) {
          baselineRef.current = result.version;
          updatedAtBaselineRef.current = result.updatedAt;
        }
        if (!contentDrifted) {
          baseContentRef.current = authoritativeContent;
          if (authoritativeContent !== next.content) {
            editor.tf.setValue(parseContent(authoritativeContent));
          }
        } else if (authoritativeContent === next.content) {
          baseContentRef.current = authoritativeContent;
        }
        if (!titleDrifted) {
          titleRef.current = authoritativeTitle;
          baseTitleRef.current = authoritativeTitle;
          setTitle(authoritativeTitle);
        } else if (authoritativeTitle === next.title) {
          baseTitleRef.current = authoritativeTitle;
        }

        pendingConflictRef.current = null;
        setAutosaveConflict(false);
        setError((current) =>
          current === SAVE_PERMISSION_ERROR || current === SAVE_RETRY_ERROR
            ? ""
            : current,
        );
        return {
          ...result,
          content: serializeDraftSnapshot({
            title: authoritativeTitle,
            content: authoritativeContent,
          }),
        };
      }
      if (result.conflict && result.theirContent) {
        const nextConflict = {
          theirContent: result.theirContent,
          theirTitle: result.theirTitle ?? next.title,
          theirVersion: result.theirVersion ?? baselineRef.current ?? 0,
          theirUpdatedAt:
            result.theirUpdatedAt ?? updatedAtBaselineRef.current ?? "",
        };
        pendingConflictRef.current = nextConflict;
        if (reason === "explicit") {
          setAutosaveConflict(false);
          setConflict(nextConflict);
        } else {
          setAutosaveConflict(true);
        }
        // Surface as an error so autosave halts rather than dropping the edit.
        return {
          ...result,
          error: "EDIT_CONFLICT",
          haltAutosave: true,
        };
      }
      return result;
    },
    [slug, editSummary, parentId, onSubmit, editor],
  );

  // Serialize the document only when a save fires, never per keystroke — the
  // editor holds the source of truth in `editor.children` and the hook pulls it
  // lazily. This keeps typing off the React render path (#205).
  const autosave = useAutosave({
    getContent: () =>
      serializeDraftSnapshot({
        title: titleRef.current,
        content: JSON.stringify(editor.children),
      }),
    onSave: save,
    initialContent: initialDraftSnapshot,
    enabled: autosaveEnabled,
  });
  // Stable across renders (memoized inside the hook); safe as an effect/callback dep.
  const { resetBaseline: resetAutosaveBaseline } = autosave;
  const { flush: flushAutosave } = autosave;
  const surfaceAutosaveFailure = useCallback((saveError: string) => {
    if (saveError === "EDIT_PERMISSION_DENIED") {
      setError(SAVE_PERMISSION_ERROR);
      return;
    }
    if (saveError === "EDIT_CONFLICT") {
      const pendingConflict = pendingConflictRef.current;
      if (pendingConflict) {
        setAutosaveConflict(false);
        setConflict(pendingConflict);
      }
      return;
    }
    setError(SAVE_RETRY_ERROR);
  }, []);

  const handleSubmit = useCallback(async () => {
    setError("");
    if (!title.trim()) {
      setError("标题不能为空");
      return;
    }
    if (!(await ensureContributorSetup())) return;
    setSubmitting(true);

    if (autosaveEnabled) {
      const outcome = await flushAutosave();
      setSubmitting(false);
      if (outcome.status === "error") {
        surfaceAutosaveFailure(outcome.error);
        return;
      }
      router.push(`/wiki/${slug}`);
      return;
    }

    const result = await save(
      serializeDraftSnapshot({
        title: titleRef.current,
        content: JSON.stringify(editor.children),
      }),
    );

    if (result.conflict && result.theirContent) {
      setConflict({
        theirContent: result.theirContent,
        theirTitle: result.theirTitle ?? title,
        theirVersion: result.theirVersion ?? baselineRef.current ?? 0,
        theirUpdatedAt:
          result.theirUpdatedAt ?? updatedAtBaselineRef.current ?? "",
      });
      setSubmitting(false);
      return;
    }
    if (result.error === "EDIT_PERMISSION_DENIED") {
      setError("编辑权限不足，请联系管理员。");
      setSubmitting(false);
      return;
    }
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }

    router.push(`/wiki/${result.slug}`);
  }, [
    title,
    autosaveEnabled,
    flushAutosave,
    save,
    editor,
    router,
    ensureContributorSetup,
    slug,
    surfaceAutosaveFailure,
  ]);

  const keepMine = useCallback(async () => {
    if (!conflict) return;
    if (!(await ensureContributorSetup())) return;
    setSubmitting(true);
    baselineRef.current = conflict.theirVersion;
    updatedAtBaselineRef.current = conflict.theirUpdatedAt;
    baseTitleRef.current = conflict.theirTitle;
    const result = await save(
      serializeDraftSnapshot({
        title: titleRef.current,
        content: JSON.stringify(editor.children),
      }),
    );
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setConflict(null);
    router.push(`/wiki/${result.slug}`);
  }, [conflict, save, editor, router, ensureContributorSetup]);

  const discardMine = useCallback(() => {
    if (!conflict) return;
    editor.tf.setValue(parseContent(conflict.theirContent));
    baselineRef.current = conflict.theirVersion;
    updatedAtBaselineRef.current = conflict.theirUpdatedAt;
    baseTitleRef.current = conflict.theirTitle;
    baseContentRef.current = conflict.theirContent;
    titleRef.current = conflict.theirTitle;
    setTitle(conflict.theirTitle);
    resetAutosaveBaseline(
      serializeDraftSnapshot({
        title: conflict.theirTitle,
        content: conflict.theirContent,
      }),
    );
    pendingConflictRef.current = null;
    setAutosaveConflict(false);
    setConflict(null);
  }, [conflict, editor, resetAutosaveBaseline]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (autosaveEnabled) void autosave.save();
        else void handleSubmit();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [autosaveEnabled, autosave, handleSubmit]);

  useEffect(() => {
    if (!autosave.isDirty) return;
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as HTMLElement)?.closest("a");
      if (!anchor || anchor.target === "_blank") return;
      if (!window.confirm("有未保存的修改，确定要离开吗？")) e.preventDefault();
    };
    document.addEventListener("click", handler, true);
    return () => document.removeEventListener("click", handler, true);
  }, [autosave.isDirty]);

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="title">标题</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => {
            titleRef.current = e.target.value;
            setTitle(e.target.value);
            autosave.notifyChange();
          }}
          placeholder="页面标题"
        />
      </div>
      {mode === "create" && (
        <div className="space-y-2">
          <Label htmlFor="slug">URL 路径</Label>
          <Input
            id="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="e.g. octopus"
          />
        </div>
      )}
      <Plate editor={editor} onValueChange={() => autosave.notifyChange()}>
        <WikiLinkPagesProvider pages={linkablePages}>
          <DiscussionProvider
            pageId={pageId ?? ""}
            initialDiscussions={initialDiscussions}
          >
            <div className="flex gap-4">
              <div className="min-w-0 flex-1 rounded-lg border">
                <EditorContainer>
                  <Editor variant="fullWidth" placeholder="开始编辑..." />
                </EditorContainer>
              </div>
              {mode === "edit" && pageId && (
                <div className="w-72 shrink-0">
                  <DiscussionSidebar pageId={pageId} />
                </div>
              )}
            </div>
          </DiscussionProvider>
        </WikiLinkPagesProvider>
      </Plate>
      <div className="space-y-2">
        <Label htmlFor="summary">编辑摘要（可选）</Label>
        <Textarea
          id="summary"
          value={editSummary}
          onChange={(e) => setEditSummary(e.target.value)}
          placeholder="简要描述你的修改"
          rows={2}
        />
      </div>
      {error && (
        <p
          role="alert"
          aria-label="保存错误"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {autosaveConflict && !conflict && (
        <p
          role="status"
          aria-label="自动保存已暂停"
          className="text-sm text-amber-700 dark:text-amber-300"
        >
          服务器版本已更新，自动保存已暂停。点击“完成”处理冲突。
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "完成中…" : "完成"}
        </Button>
        {autosaveEnabled &&
          autosave.status !== "idle" &&
          !error &&
          !autosaveConflict &&
          !conflict && (
            <span
              role="status"
              aria-label="保存状态"
              className="text-sm text-muted-foreground"
            >
              {STATUS_LABEL[autosave.status]}
            </span>
          )}
      </div>
      {conflict && (
        <EditConflictDialog
          mineText={extractText(JSON.stringify(editor.children))}
          theirText={extractText(conflict.theirContent)}
          saving={submitting}
          onKeepMine={() => void keepMine()}
          onDiscard={discardMine}
          onCancel={() => {
            setConflict(null);
            setAutosaveConflict(Boolean(pendingConflictRef.current));
          }}
        />
      )}
    </div>
  );
}
