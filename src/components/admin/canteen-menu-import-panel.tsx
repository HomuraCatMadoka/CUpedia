"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MEAL_PERIODS, type MenuImportDraft, type MenuImportDraftItem } from "@/lib/canteen-types";
import {
  deleteMenuImportDraft,
  publishMenuImportDraft,
  updateMenuImportDraft,
} from "@/lib/canteen-import-actions";
import { cn } from "@/lib/utils";

const MEAL_LABELS: Record<(typeof MEAL_PERIODS)[number], string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
};

function ocrErrorMessage(code: string | null | undefined): string {
  if (!code) return "识别失败，请改用手工录入。";
  if (code === "OCR_QUOTA_EXCEEDED") {
    return "OCR 免费额度已用尽，请改用手工录入或稍后再试。";
  }
  if (code === "OCR_NOT_CONFIGURED") {
    return "OCR 未配置，请改用手工录入。";
  }
  if (code === "OCR_EMPTY_RESULT") {
    return "未能从图片识别到文字，请换图或改用手工录入。";
  }
  return "识别失败，请改用手工录入。";
}

function importDraftErrorMessage(code: string): string {
  if (code === "INVALID_DRAFT_ITEMS") return "草稿数据格式无效。";
  if (code === "INVALID_NAME") return "菜品名称无效。";
  if (code === "INVALID_PRICE") return "价格须为 0–9999 的整数。";
  if (code === "INVALID_MEAL_PERIOD") return "餐段须为 breakfast / lunch / dinner。";
  if (code === "INVALID_SORT_ORDER") return "排序值无效。";
  if (code === "IMPORT_DRAFT_NOT_FOUND") return "导入草稿不存在或已删除。";
  if (code === "IMPORT_DRAFT_ALREADY_PUBLISHED") return "该草稿已发布，请重新上传。";
  if (code === "IMPORT_DRAFT_EMPTY") return "草稿中没有菜品，请添加后再发布。";
  if (code === "CANTEEN_NOT_FOUND") return "食堂不存在。";
  return "操作失败，请重试。";
}

export function CanteenMenuImportPanel({
  canteenId,
  previewMode = false,
}: {
  canteenId: string;
  previewMode?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<MenuImportDraft | null>(null);
  const [items, setItems] = useState<MenuImportDraftItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (previewMode) {
    return (
      <p className="text-sm text-[var(--canteen-muted)]">
        OCR 导入仅在管理后台可用。
      </p>
    );
  }

  function resetDraftState() {
    setDraft(null);
    setItems([]);
    setError(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("请选择菜单图片");
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch(`/api/admin/canteens/${canteenId}/menu-import`, {
          method: "POST",
          body: form,
        });
        const data = (await res.json()) as {
          draft?: MenuImportDraft;
          error?: string;
        };
        if (!res.ok) {
          if (data.error === "OCR_RATE_LIMIT_EXCEEDED") {
            setError("OCR 调用过于频繁，请稍后再试或改用手工录入。");
            return;
          }
          if (data.error === "IMAGE_TOO_LARGE") {
            setError("图片超过 5MB 上限。");
            return;
          }
          if (data.error === "INVALID_IMAGE_TYPE") {
            setError("仅支持 JPEG、PNG、WebP 图片。");
            return;
          }
          if (data.error === "CANTEEN_NOT_FOUND") {
            setError("食堂不存在。");
            return;
          }
          setError(
            data.error ? importDraftErrorMessage(data.error) : "上传失败",
          );
          return;
        }
        const next = data.draft!;
        setDraft(next);
        setItems(next.items);
        if (next.status === "failed") {
          setError(ocrErrorMessage(next.errorMessage));
        }
      } catch {
        setError("上传失败，请重试或改用手工录入。");
      }
    });
  }

  function updateItem(
    tempId: string,
    patch: Partial<MenuImportDraftItem>,
  ) {
    setItems((prev) =>
      prev.map((row) => (row.tempId === tempId ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    setItems((prev) => [
      ...prev,
      {
        tempId: `new-${Date.now()}`,
        name: "",
        price: null,
        mealPeriod: "lunch",
        sortOrder: prev.length,
      },
    ]);
  }

  function removeRow(tempId: string) {
    setItems((prev) => prev.filter((row) => row.tempId !== tempId));
  }

  function handleSaveDraft() {
    if (!draft) return;
    startTransition(async () => {
      try {
        const updated = await updateMenuImportDraft(canteenId, draft.id, items);
        setDraft(updated);
        setItems(updated.items);
        setError(null);
      } catch (err) {
        const code = err instanceof Error ? err.message : "SAVE_FAILED";
        setError(importDraftErrorMessage(code));
      }
    });
  }

  function handlePublish() {
    if (!draft) return;
    startTransition(async () => {
      try {
        await updateMenuImportDraft(canteenId, draft.id, items);
        await publishMenuImportDraft(canteenId, draft.id);
        resetDraftState();
        window.location.reload();
      } catch (err) {
        const code = err instanceof Error ? err.message : "PUBLISH_FAILED";
        setError(importDraftErrorMessage(code));
      }
    });
  }

  function handleDiscard() {
    if (!draft) {
      resetDraftState();
      return;
    }
    startTransition(async () => {
      try {
        await deleteMenuImportDraft(canteenId, draft.id);
        resetDraftState();
      } catch {
        setError("删除草稿失败");
      }
    });
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-[var(--canteen-bamboo)]/30 bg-white/60 p-4"
      aria-label="OCR 菜单导入"
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--canteen-ink)]">
          OCR 菜单导入
        </h3>
        <p className="mt-1 text-xs text-[var(--canteen-muted)]">
          上传菜单图片自动识别菜名与价格；餐段需在校对时手动指定。识别失败可继续用手工录入。
        </p>
      </div>

      {!draft ? (
        <div className="flex flex-wrap items-center gap-3">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm"
          />
          <Button
            type="button"
            disabled={pending}
            onClick={handleUpload}
            className="rounded-full"
          >
            {pending ? "识别中…" : "上传并识别"}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {draft.status === "failed" ? (
            <p className="text-sm text-amber-700" role="alert">
              {ocrErrorMessage(draft.errorMessage)}
            </p>
          ) : null}

          {items.length > 0 ? (
            <ul className="space-y-2">
              {items.map((row) => (
                <li
                  key={row.tempId}
                  className="grid gap-2 rounded-lg border border-[var(--canteen-bamboo)]/20 bg-white/80 p-3 sm:grid-cols-[1fr_5rem_6rem_4rem_auto]"
                >
                  <Input
                    value={row.name}
                    placeholder="菜名"
                    onChange={(e) =>
                      updateItem(row.tempId, { name: e.target.value })
                    }
                  />
                  <Input
                    value={row.price ?? ""}
                    placeholder="价格"
                    inputMode="numeric"
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "") {
                        updateItem(row.tempId, { price: null });
                        return;
                      }
                      const n = Number(raw);
                      if (!Number.isNaN(n)) {
                        updateItem(row.tempId, { price: n });
                      }
                    }}
                  />
                  <select
                    value={row.mealPeriod}
                    onChange={(e) =>
                      updateItem(row.tempId, {
                        mealPeriod: e.target.value as MenuImportDraftItem["mealPeriod"],
                      })
                    }
                    className="rounded-md border border-[var(--canteen-bamboo)]/30 bg-white px-2 py-1 text-sm"
                  >
                    {MEAL_PERIODS.map((p) => (
                      <option key={p} value={p}>
                        {MEAL_LABELS[p]}
                      </option>
                    ))}
                  </select>
                  <Input
                    value={row.sortOrder}
                    inputMode="numeric"
                    onChange={(e) =>
                      updateItem(row.tempId, {
                        sortOrder: Number(e.target.value) || 0,
                      })
                    }
                  />
                  <button
                    type="button"
                    className="text-xs text-red-600 hover:underline"
                    onClick={() => removeRow(row.tempId)}
                  >
                    删除
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-[var(--canteen-muted)]">
              未识别到菜品行，可手动添加后发布。
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={addRow}>
              添加一行
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={handleSaveDraft}
            >
              保存草稿
            </Button>
            <Button
              type="button"
              disabled={pending || items.length === 0}
              onClick={handlePublish}
            >
              发布到菜单
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={handleDiscard}
            >
              放弃
            </Button>
          </div>
        </div>
      )}

      {error ? (
        <p className={cn("text-sm text-red-600")} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
