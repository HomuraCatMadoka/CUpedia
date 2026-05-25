"use client";

import { useEffect, useRef, useState } from "react";
import type VditorType from "vditor";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface WikiEditorProps {
  mode: "create" | "edit";
  initialTitle?: string;
  initialContent?: string;
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
  initialContent = "",
  initialSlug = "",
  expectedUpdatedAt,
  parentId,
  onSubmit,
}: WikiEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const vditorRef = useRef<VditorType | null>(null);
  const [title, setTitle] = useState(initialTitle);
  const [slug, setSlug] = useState(initialSlug);
  const [editSummary, setEditSummary] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    import("vditor/dist/index.css");
    let vditor: VditorType | undefined;
    import("vditor").then((Vditor) => {
      vditor = new Vditor.default(editorRef.current!, {
        height: 500,
        mode: "wysiwyg",
        value: initialContent,
        toolbar: [
          "headings",
          "bold",
          "italic",
          "strike",
          "|",
          "list",
          "ordered-list",
          "check",
          "|",
          "quote",
          "code",
          "inline-code",
          "|",
          "upload",
          "link",
          "table",
          "|",
          "undo",
          "redo",
        ],
        upload: {
          url: "/api/upload",
          fieldName: "file",
          max: 5 * 1024 * 1024,
          accept: "image/jpeg,image/png,image/gif,image/webp",
          format(files: File[], responseText: string) {
            const res = JSON.parse(responseText);
            return JSON.stringify({
              msg: "",
              code: 0,
              data: { errFiles: [], succMap: { [files[0].name]: res.url } },
            });
          },
        },
        cache: { enable: false },
      });
      vditorRef.current = vditor;
    });
    return () => vditor?.destroy();
  }, [initialContent]);

  async function handleSubmit() {
    setError("");
    setSubmitting(true);

    const content = vditorRef.current?.getValue() ?? "";
    if (!title.trim()) {
      setError("标题不能为空");
      setSubmitting(false);
      return;
    }

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
  }

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
      <div ref={editorRef} />
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
