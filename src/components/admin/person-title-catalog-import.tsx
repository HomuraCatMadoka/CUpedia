"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  previewPersonTitleCatalog,
  publishPersonTitleCatalog,
} from "@/lib/person-title-catalog-actions";

type Preview = Awaited<ReturnType<typeof previewPersonTitleCatalog>>;

export function PersonTitleCatalogImport({
  initialJson,
}: {
  initialJson: string;
}) {
  const router = useRouter();
  const [rawJson, setRawJson] = useState(initialJson);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function runPreview() {
    setMessage("");
    startTransition(async () => {
      try {
        setPreview(await previewPersonTitleCatalog(rawJson));
      } catch (cause) {
        setPreview(null);
        setMessage(cause instanceof Error ? cause.message : "预览失败");
      }
    });
  }

  function publish() {
    if (!preview) return;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await publishPersonTitleCatalog(rawJson);
        setPreview(null);
        setMessage(
          `人名称号目录 v${result.version} 已发布，共 ${result.recipeCount} 条`,
        );
        router.refresh();
      } catch (cause) {
        setMessage(cause instanceof Error ? cause.message : "发布失败");
      }
    });
  }

  return (
    <section
      aria-labelledby="person-title-catalog-import"
      className="rounded-xl border p-5"
    >
      <h2 className="font-medium" id="person-title-catalog-import">
        批量发布人名称号
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        已载入审核后的单专业清单；预览会核对当前已启用的专业金标，确认后才原子发布。
      </p>
      <Textarea
        aria-label="人名称号目录 JSON"
        className="mt-4 min-h-56 font-mono text-xs"
        onChange={(event) => {
          setRawJson(event.target.value);
          setPreview(null);
          setMessage("");
        }}
        value={rawJson}
      />
      {preview && (
        <div className="mt-4 rounded-lg bg-muted p-4 text-sm" role="status">
          <p className="font-medium">
            v{preview.version} · {preview.recipeCount} 条配方 ·{" "}
            {preview.sourceCount} 个来源专业
          </p>
          <p className="mt-1 text-muted-foreground">
            启用 {preview.enabledCount} 条；来源：{preview.sourceLabel}
          </p>
        </div>
      )}
      {message && (
        <p className="mt-3 text-sm text-muted-foreground" role="status">
          {message}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <Button
          disabled={pending || !rawJson.trim()}
          onClick={runPreview}
          type="button"
          variant="outline"
        >
          {pending ? "校验中…" : "预览人名称号"}
        </Button>
        <Button disabled={pending || !preview} onClick={publish} type="button">
          确认发布
        </Button>
      </div>
    </section>
  );
}
