"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plate, usePlateEditor } from "platejs/react";

import { BasicNodesKit } from "@/components/editor/plugins/basic-nodes-kit";
import { CodeBlockKit } from "@/components/editor/plugins/code-block-kit";
import { LinkKit } from "@/components/editor/plugins/link-kit";
import { ListKit } from "@/components/editor/plugins/list-kit";
import { MediaKit } from "@/components/editor/plugins/media-kit";
import { TableKit } from "@/components/editor/plugins/table-kit";
import { SlashKit } from "@/components/editor/plugins/slash-kit";
import { FloatingToolbarKit } from "@/components/editor/plugins/floating-toolbar-kit";
import { MarkdownKit } from "@/components/editor/plugins/markdown-kit";
import { EditorContainer, Editor } from "@/components/ui/editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { PlateValue } from "@/lib/plate-utils";

interface WikiEditorProps {
  mode: "create" | "edit";
  initialTitle?: string;
  initialValue?: PlateValue;
  initialSlug?: string;
  expectedUpdatedAt?: string;
  parentId?: string | null;
  onSubmit: (data: {
    slug: string;
    title: string;
    content: string;
    editSummary?: string;
    parentId?: string | null;
    expectedUpdatedAt?: string;
  }) => Promise<{ error?: string; slug?: string }>;
}

export function WikiEditor({
  mode,
  initialTitle = "",
  initialValue,
  initialSlug = "",
  expectedUpdatedAt,
  parentId,
  onSubmit,
}: WikiEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(initialSlug);
  const [editSummary, setEditSummary] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  const editor = usePlateEditor({
    plugins: [
      ...BasicNodesKit,
      ...CodeBlockKit,
      ...LinkKit,
      ...ListKit,
      ...MediaKit,
      ...TableKit,
      ...SlashKit,
      ...FloatingToolbarKit,
      ...MarkdownKit,
    ],
    value: initialValue,
  });

  const handleSubmit = useCallback(async () => {
    setError("");
    setSubmitting(true);

    if (!title.trim()) {
      setError("标题不能为空");
      setSubmitting(false);
      return;
    }

    const content = editor.api.markdown.serialize();

    const result = await onSubmit({
      slug,
      title,
      content,
      editSummary: editSummary || undefined,
      parentId,
      expectedUpdatedAt,
    });

    if (result.error === "EDIT_CONFLICT") {
      setError("编辑冲突：该页面已被其他用户修改。请刷新页面查看最新版本。");
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
    slug,
    editSummary,
    parentId,
    expectedUpdatedAt,
    editor,
    onSubmit,
    router,
  ]);

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
      <div className="rounded-lg border">
        <Plate editor={editor}>
          <EditorContainer>
            <Editor variant="fullWidth" placeholder="开始编辑..." />
          </EditorContainer>
        </Plate>
      </div>
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
      <Button onClick={handleSubmit} disabled={submitting}>
        {submitting ? "保存中..." : "保存"}
      </Button>
    </div>
  );
}
