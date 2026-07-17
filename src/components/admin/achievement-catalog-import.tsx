"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  previewAchievementCatalog,
  publishAchievementCatalog,
} from "@/lib/achievement-catalog-actions";

type Preview = Awaited<ReturnType<typeof previewAchievementCatalog>>;

export function AchievementCatalogImport() {
  const router = useRouter();
  const [rawJson, setRawJson] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function runPreview() {
    setMessage("");
    startTransition(async () => {
      try {
        setPreview(await previewAchievementCatalog(rawJson));
      } catch (error) {
        setPreview(null);
        setMessage(error instanceof Error ? error.message : "预览失败");
      }
    });
  }

  function publish() {
    if (!preview) return;
    setMessage("");
    startTransition(async () => {
      try {
        const result = await publishAchievementCatalog(rawJson);
        setPreview(null);
        setRawJson("");
        setMessage(`目录 v${result.version} 已发布`);
        router.refresh();
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "发布失败");
      }
    });
  }

  return (
    <section className="rounded-xl border p-5" aria-labelledby="catalog-import">
      <h2 className="font-medium" id="catalog-import">
        批量发布目录
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">
        粘贴已审核的 JSON；预览只校验，确认发布才会原子替换当前目录。
      </p>
      <Textarea
        aria-label="专业标目录 JSON"
        className="mt-4 min-h-56 font-mono text-xs"
        onChange={(event) => {
          setRawJson(event.target.value);
          setPreview(null);
          setMessage("");
        }}
        placeholder='{"version":1,"sourceLabel":"handbook review","programmes":[…]}'
        value={rawJson}
      />
      {preview && (
        <div className="mt-4 rounded-lg bg-muted p-4 text-sm" role="status">
          <p className="font-medium">
            v{preview.version} · {preview.programmeCount} 个专业 ·{" "}
            {preview.ruleCount} 条等级规则
          </p>
          <p className="mt-1 text-muted-foreground">
            启用 {preview.enabledProgrammeCount} 个专业；来源：
            {preview.sourceLabel}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {Object.entries(preview.facultyCounts)
              .map(([faculty, count]) => `${faculty} ${count}`)
              .join(" · ")}
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
          {pending ? "校验中…" : "预览目录"}
        </Button>
        <Button disabled={pending || !preview} onClick={publish} type="button">
          确认发布
        </Button>
      </div>
    </section>
  );
}
