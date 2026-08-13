"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { publishProductUpdate } from "@/lib/product-update-actions";
import {
  PRODUCT_UPDATE_AREAS,
  PRODUCT_UPDATE_AREA_LABELS,
  PRODUCT_UPDATE_CONTENT_MAX_LENGTH,
  PRODUCT_UPDATE_SUMMARY_MAX_LENGTH,
  PRODUCT_UPDATE_TITLE_MAX_LENGTH,
  PRODUCT_UPDATE_TYPES,
  PRODUCT_UPDATE_TYPE_LABELS,
  type ProductUpdateArea,
  type ProductUpdateType,
} from "@/lib/product-update-types";

const EMPTY_FORM = {
  title: "",
  summary: "",
  content: "",
  type: "feature" as ProductUpdateType,
  areas: [] as ProductUpdateArea[],
};

export function ProductUpdatePublishForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");

  function toggleArea(area: ProductUpdateArea) {
    setForm((current) => ({
      ...current,
      areas: current.areas.includes(area)
        ? current.areas.filter((item) => item !== area)
        : [...current.areas, area],
    }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        const result = await publishProductUpdate(form);
        setForm(EMPTY_FORM);
        toast.success("产品更新已发布");
        router.push(`/updates/${result.id}`);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "产品更新发布失败");
      }
    });
  }

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-12">
      <form
        id="product-update-form"
        onSubmit={handleSubmit}
        className="space-y-6"
      >
        <div className="space-y-2">
          <label htmlFor="product-update-title" className="text-sm font-medium">
            标题
          </label>
          <Input
            id="product-update-title"
            value={form.title}
            onChange={(event) =>
              setForm((current) => ({ ...current, title: event.target.value }))
            }
            required
            maxLength={PRODUCT_UPDATE_TITLE_MAX_LENGTH}
            disabled={isPending}
          />
          <p className="text-right text-xs text-muted-foreground">
            {form.title.length} / {PRODUCT_UPDATE_TITLE_MAX_LENGTH}
          </p>
        </div>

        <div className="space-y-2">
          <label
            htmlFor="product-update-summary"
            className="text-sm font-medium"
          >
            摘要
          </label>
          <Textarea
            id="product-update-summary"
            value={form.summary}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                summary: event.target.value,
              }))
            }
            required
            maxLength={PRODUCT_UPDATE_SUMMARY_MAX_LENGTH}
            disabled={isPending}
            className="min-h-24"
          />
          <p className="text-xs text-muted-foreground">
            在更新列表中展示，说明这项变化对学生有什么帮助。
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">更新类型</legend>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_UPDATE_TYPES.map((type) => (
              <label key={type} className="relative">
                <input
                  type="radio"
                  name="product-update-type"
                  value={type}
                  checked={form.type === type}
                  onChange={() => setForm((current) => ({ ...current, type }))}
                  disabled={isPending}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm text-muted-foreground transition-colors peer-checked:border-emerald-800 peer-checked:bg-emerald-950/8 peer-checked:text-emerald-900 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 dark:peer-checked:border-emerald-300 dark:peer-checked:bg-emerald-200/12 dark:peer-checked:text-emerald-200">
                  {PRODUCT_UPDATE_TYPE_LABELS[type]}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">产品领域</legend>
          <div className="flex flex-wrap gap-2">
            {PRODUCT_UPDATE_AREAS.map((area) => (
              <label key={area} className="relative">
                <input
                  type="checkbox"
                  value={area}
                  checked={form.areas.includes(area)}
                  onChange={() => toggleArea(area)}
                  disabled={isPending}
                  className="peer sr-only"
                />
                <span className="flex min-h-11 cursor-pointer items-center rounded-full border px-4 text-sm text-muted-foreground transition-colors peer-checked:border-emerald-800 peer-checked:bg-emerald-950/8 peer-checked:text-emerald-900 peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50 dark:peer-checked:border-emerald-300 dark:peer-checked:bg-emerald-200/12 dark:peer-checked:text-emerald-200">
                  {PRODUCT_UPDATE_AREA_LABELS[area]}
                </span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            至少选择一个；这些标签由系统维护，不能自由输入。
          </p>
        </fieldset>

        <div className="space-y-2">
          <label
            htmlFor="product-update-content"
            className="text-sm font-medium"
          >
            正文
          </label>
          <Textarea
            id="product-update-content"
            value={form.content}
            onChange={(event) =>
              setForm((current) => ({
                ...current,
                content: event.target.value,
              }))
            }
            required
            maxLength={PRODUCT_UPDATE_CONTENT_MAX_LENGTH}
            disabled={isPending}
            className="min-h-64 leading-7"
          />
          <div className="flex justify-between gap-4 text-xs text-muted-foreground">
            <span>首版使用纯文本；换行会在详情页保留。</span>
            <span className="shrink-0">
              {form.content.length} / {PRODUCT_UPDATE_CONTENT_MAX_LENGTH}
            </span>
          </div>
        </div>
      </form>

      <aside className="rounded-xl border p-5 lg:sticky lg:top-20">
        <h2 className="font-semibold">发布检查</h2>
        <dl className="mt-4 divide-y text-sm">
          <div className="py-3">
            <dt className="text-xs text-muted-foreground">公开时间</dt>
            <dd className="mt-1 font-medium">确认后立即发布</dd>
          </div>
          <div className="py-3">
            <dt className="text-xs text-muted-foreground">通知</dt>
            <dd className="mt-1 font-medium">不会发送站内通知</dd>
          </div>
          <div className="py-3">
            <dt className="text-xs text-muted-foreground">公开地址</dt>
            <dd className="mt-1 font-mono text-xs">/updates/&lt;UUID&gt;</dd>
          </div>
        </dl>
        {error ? (
          <p role="alert" className="mb-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <Button
          type="submit"
          form="product-update-form"
          disabled={isPending}
          className="min-h-11 w-full"
        >
          {isPending ? "发布中…" : "确认并发布"}
        </Button>
        <p className="mt-3 text-xs leading-5 text-muted-foreground">
          当前只支持立即发布。草稿、排期和撤回将在后续生命周期功能中提供。
        </p>
      </aside>
    </div>
  );
}
