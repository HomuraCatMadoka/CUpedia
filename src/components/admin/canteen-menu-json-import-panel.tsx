"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { bulkImportMenuItemsFromJson } from "@/lib/canteen-admin-actions";
import { cn } from "@/lib/utils";

const SAMPLE_JSON = `[
  {
    "name": "演示饮品",
    "pricing": {
      "options": [
        { "label": "热", "amountMinor": 1100, "currency": "HKD" },
        { "label": "冻", "amountMinor": 1300, "currency": "HKD" }
      ]
    },
    "mealPeriod": "lunch",
    "sortOrder": 0
  }
]`;

function jsonImportErrorMessage(code: string): string {
  if (code === "INVALID_JSON") return "JSON 格式无效，请检查括号与引号。";
  if (code === "INVALID_MENU_JSON")
    return 'JSON 须为菜品数组，或 { "items": [...] }。';
  if (code === "EMPTY_MENU_JSON") return "JSON 不能为空。";
  if (code === "MENU_JSON_TOO_LARGE") return "单次最多导入 200 道菜品。";
  if (code === "INVALID_NAME") return "菜品名称无效。";
  if (code === "INVALID_PRICE") return "价格须为 0–9999 的整数。";
  if (code === "INVALID_PRICING") return "pricing.options 须为价格选项数组。";
  if (code === "INVALID_PRICE_OPTION") return "价格选项格式无效。";
  if (code === "INVALID_PRICE_LABEL") return "价格标签须为 1–100 个字符。";
  if (code === "INVALID_PRICE_AMOUNT") return "价格须为有效的非负金额。";
  if (code === "INVALID_CURRENCY") return "币种须为三个英文字母，例如 HKD。";
  if (code === "INVALID_MEAL_PERIOD")
    return "餐段须为 breakfast / lunch / dinner。";
  if (code === "INVALID_SORT_ORDER") return "排序值无效。";
  if (code === "CANTEEN_NOT_FOUND") return "食堂不存在。";
  return "导入失败，请重试。";
}

export function CanteenMenuJsonImportPanel({
  canteenId,
  previewMode = false,
}: {
  canteenId: string;
  previewMode?: boolean;
}) {
  const router = useRouter();
  const [json, setJson] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (previewMode) {
    return (
      <p className="text-sm text-[var(--canteen-muted)]">
        JSON 导入仅在管理后台可用。
      </p>
    );
  }

  function handleImport() {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const created = await bulkImportMenuItemsFromJson(canteenId, json);
        setJson("");
        setSuccess(`已导入 ${created.length} 道菜品`);
        router.refresh();
      } catch (err) {
        const code = err instanceof Error ? err.message : "IMPORT_FAILED";
        if (code === "NEXT_REDIRECT") {
          setError("请使用管理员账号登录。");
          return;
        }
        setError(jsonImportErrorMessage(code));
      }
    });
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-[var(--canteen-bamboo)]/30 bg-white/60 p-4"
      aria-label="JSON 菜单导入"
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--canteen-ink)]">
          JSON 一键导入
        </h3>
        <p className="mt-1 text-xs text-[var(--canteen-muted)]">
          粘贴菜品 JSON
          数组直接写入菜单。字段：name（必填）、pricing.options、mealPeriod、sortOrder、svgKey。
        </p>
      </div>

      <textarea
        value={json}
        onChange={(e) => setJson(e.target.value)}
        placeholder={SAMPLE_JSON}
        rows={8}
        className="w-full rounded-md border border-[var(--canteen-bamboo)]/30 bg-white px-3 py-2 font-mono text-xs leading-relaxed"
        spellCheck={false}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => setJson(SAMPLE_JSON)}
          disabled={pending}
        >
          填入示例
        </Button>
        <Button
          type="button"
          disabled={pending || !json.trim()}
          onClick={handleImport}
          className="rounded-full"
        >
          {pending ? "导入中…" : "一键导入"}
        </Button>
      </div>

      {success ? (
        <p className="text-sm text-[var(--canteen-noon)]" role="status">
          {success}
        </p>
      ) : null}

      {error ? (
        <p className={cn("text-sm text-red-600")} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
