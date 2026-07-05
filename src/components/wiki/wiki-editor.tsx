"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plate, usePlateEditor } from "platejs/react";

import { useAutosave } from "@/hooks/use-autosave";

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
    expectedUpdatedAt?: string;
    baseContent?: string;
  }) => Promise<{
    error?: string;
    slug?: string;
    updatedAt?: string;
    conflict?: boolean;
    theirContent?: string;
    theirTitle?: string;
    theirUpdatedAt?: string;
  }>;
}

const STATUS_LABEL: Record<string, string> = {
  unsaved: "未保存",
  saving: "保存中...",
  saved: "已保存",
  error: "保存失败",
};

export function WikiEditor({
  mode,
  pageId,
  initialTitle = "",
  initialValue,
  initialSlug = "",
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

  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(initialSlug);
  const [editSummary, setEditSummary] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [content, setContent] = useState(() =>
    JSON.stringify(normalizedInitialValue),
  );
  const [conflict, setConflict] = useState<EditConflict | null>(null);
  const router = useRouter();

  const baselineRef = useRef(expectedUpdatedAt);
  const baseContentRef = useRef(JSON.stringify(normalizedInitialValue));
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
      ...FloatingToolbarKit,
      ...MarkdownKit,
    ],
    value: normalizedInitialValue,
  });

  const save = useCallback(
    async (next: string) => {
      const result = await onSubmit({
        slug,
        title,
        content: next,
        editSummary: editSummary || undefined,
        parentId,
        expectedUpdatedAt: baselineRef.current,
        baseContent: baseContentRef.current,
      });
      // A clean three-way merge advances the baseline to the new revision.
      if (result.updatedAt) {
        baselineRef.current = result.updatedAt;
        baseContentRef.current = next;
      }
      if (result.conflict && result.theirContent) {
        setConflict({
          theirContent: result.theirContent,
          theirTitle: result.theirTitle ?? title,
          theirUpdatedAt: result.theirUpdatedAt ?? baselineRef.current ?? "",
        });
        // Surface as an error so autosave halts rather than dropping the edit.
        return { ...result, error: "EDIT_CONFLICT" };
      }
      return result;
    },
    [slug, title, editSummary, parentId, onSubmit],
  );

  const autosave = useAutosave({
    content,
    onSave: save,
    enabled: autosaveEnabled,
  });

  const handleSubmit = useCallback(async () => {
    setError("");
    if (!title.trim()) {
      setError("标题不能为空");
      return;
    }
    setSubmitting(true);

    const result = await save(JSON.stringify(editor.children));

    if (result.conflict && result.theirContent) {
      setConflict({
        theirContent: result.theirContent,
        theirTitle: result.theirTitle ?? title,
        theirUpdatedAt: result.theirUpdatedAt ?? baselineRef.current ?? "",
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
  }, [title, save, editor, router]);

  const keepMine = useCallback(async () => {
    if (!conflict) return;
    setSubmitting(true);
    baselineRef.current = conflict.theirUpdatedAt;
    const result = await save(JSON.stringify(editor.children));
    if (result.error) {
      setError(result.error);
      setSubmitting(false);
      return;
    }
    setConflict(null);
    router.push(`/wiki/${result.slug}`);
  }, [conflict, save, editor, router]);

  const discardMine = useCallback(() => {
    if (!conflict) return;
    editor.tf.setValue(parseContent(conflict.theirContent));
    baselineRef.current = conflict.theirUpdatedAt;
    baseContentRef.current = conflict.theirContent;
    setContent(conflict.theirContent);
    setConflict(null);
  }, [conflict, editor]);

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
          onChange={(e) => setTitle(e.target.value)}
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
      <Plate
        editor={editor}
        onValueChange={({ value }) => setContent(JSON.stringify(value))}
      >
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
      {error && <p className="text-sm text-red-500">{error}</p>}
      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={submitting}>
          {submitting ? "保存中..." : "保存"}
        </Button>
        {autosaveEnabled && autosave.status !== "idle" && (
          <span className="text-sm text-muted-foreground">
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
          onCancel={() => setConflict(null)}
        />
      )}
    </div>
  );
}
