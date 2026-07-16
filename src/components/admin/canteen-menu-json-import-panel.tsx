"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  applyMenuSyncFromJson,
  previewMenuSyncFromJson,
} from "@/lib/canteen-admin-actions";
import type { MenuSyncPlan } from "@/lib/canteen-menu-sync";
import { cn } from "@/lib/utils";

const SAMPLE_JSON = `{
  "source": "aigens:102830",
  "takeOverLegacyItems": false,
  "items": [
    {
      "externalKey": "product-42:lunch",
      "name": "演示饮品",
      "pricing": {
        "options": [
          { "label": "热", "amountMinor": 1100, "currency": "HKD" },
          { "label": "冻", "amountMinor": 1300, "currency": "HKD" }
        ]
      },
      "mealPeriod": "lunch",
      "sortOrder": 0,
      "svgKey": "drink"
    }
  ]
}`;

function jsonImportErrorMessage(code: string): string {
  if (code === "INVALID_JSON") return "JSON 格式无效，请检查括号与引号。";
  if (code === "INVALID_MENU_JSON")
    return 'JSON 须为菜品数组，或 { "items": [...] }。';
  if (code === "INVALID_MENU_SYNC") return "同步 JSON 须为对象。";
  if (code === "INVALID_SYNC_SOURCE") return "source 须为有效的来源标识。";
  if (code === "INVALID_EXTERNAL_KEY") return "每道菜须有有效的 externalKey。";
  if (code === "DUPLICATE_EXTERNAL_KEY")
    return "同一份菜单中 externalKey 不可重复。";
  if (code === "INVALID_TAKEOVER_FLAG")
    return "takeOverLegacyItems 须为 true 或 false。";
  if (code === "MENU_SYNC_CONFLICT")
    return "同步存在匹配冲突，请先处理冲突后再应用。";
  if (code === "MENU_SYNC_STALE") return "菜单已发生变化，请重新预览后再应用。";
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
  const [plan, setPlan] = useState<MenuSyncPlan | null>(null);
  const [previewedJson, setPreviewedJson] = useState<string | null>(null);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (previewMode) {
    return (
      <p className="text-sm text-[var(--canteen-muted)]">
        JSON 导入仅在管理后台可用。
      </p>
    );
  }

  function handlePreview() {
    setError(null);
    setSuccess(null);
    setPlan(null);
    setPreviewedJson(null);
    setPreviewToken(null);
    startTransition(async () => {
      try {
        const preview = await previewMenuSyncFromJson(canteenId, json);
        setPlan(preview.plan);
        setPreviewedJson(json);
        setPreviewToken(preview.previewToken);
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

  function handleApply() {
    if (
      !plan ||
      !previewToken ||
      previewedJson !== json ||
      plan.conflicts.length > 0
    )
      return;
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const applied = await applyMenuSyncFromJson(
          canteenId,
          json,
          previewToken,
        );
        setPlan(applied);
        setPreviewedJson(null);
        setPreviewToken(null);
        setSuccess("菜单同步已应用，历史投票与评论保持不变。");
        router.refresh();
      } catch (err) {
        const code = err instanceof Error ? err.message : "IMPORT_FAILED";
        if (code === "MENU_SYNC_STALE") {
          setPlan(null);
          setPreviewedJson(null);
          setPreviewToken(null);
        }
        setError(jsonImportErrorMessage(code));
      }
    });
  }

  return (
    <section
      className="space-y-4 rounded-xl border border-[var(--canteen-bamboo)]/30 bg-white/60 p-4"
      aria-label="外部菜单同步"
    >
      <div>
        <h3 className="text-sm font-semibold text-[var(--canteen-ink)]">
          外部菜单同步
        </h3>
        <p className="mt-1 text-xs text-[var(--canteen-muted)]">
          粘贴完整来源快照，先预览差异，再应用同步。缺失菜品会停止供应，但不会删除历史。
        </p>
      </div>

      <textarea
        value={json}
        onChange={(e) => {
          setJson(e.target.value);
          setPlan(null);
          setPreviewedJson(null);
          setPreviewToken(null);
          setSuccess(null);
        }}
        placeholder={SAMPLE_JSON}
        rows={8}
        className="w-full rounded-md border border-[var(--canteen-bamboo)]/30 bg-white px-3 py-2 font-mono text-xs leading-relaxed"
        spellCheck={false}
      />

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setJson(SAMPLE_JSON);
            setPlan(null);
            setPreviewedJson(null);
            setPreviewToken(null);
            setError(null);
            setSuccess(null);
          }}
          disabled={pending}
        >
          填入示例
        </Button>
        <Button
          type="button"
          disabled={pending || !json.trim()}
          onClick={handlePreview}
          className="rounded-full"
        >
          {pending ? "检查中…" : "预览同步"}
        </Button>
        <Button
          type="button"
          disabled={
            pending ||
            !plan ||
            !previewToken ||
            previewedJson !== json ||
            plan.conflicts.length > 0
          }
          onClick={handleApply}
          className="rounded-full"
        >
          应用同步
        </Button>
      </div>

      {plan ? <MenuSyncPlanSummary plan={plan} /> : null}

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

function MenuSyncPlanSummary({ plan }: { plan: MenuSyncPlan }) {
  const counts = plan.actions.reduce<Record<string, number>>(
    (result, action) => {
      result[action.action] = (result[action.action] ?? 0) + 1;
      return result;
    },
    {},
  );
  const labels: Record<string, string> = {
    create: "新增",
    update: "更新",
    claim: "接管旧菜",
    reactivate: "恢复供应",
    deactivate: "停止供应",
  };
  return (
    <div className="space-y-2 border-t border-[var(--canteen-bamboo)]/20 pt-3 text-xs">
      <p className="font-medium text-[var(--canteen-ink)]">同步预览</p>
      <p className="text-[var(--canteen-muted)]">
        {Object.entries(labels)
          .map(([key, label]) => `${label} ${counts[key] ?? 0}`)
          .join(" · ")}{" "}
        · 无变化 {plan.unchanged} · 冲突 {plan.conflicts.length}
      </p>
      {plan.conflicts.length > 0 ? (
        <ul className="space-y-1 text-red-600" aria-label="同步冲突">
          {plan.conflicts.map((conflict) => (
            <li key={conflict.externalKey}>
              {conflict.name}：旧菜匹配不唯一或已被其他商品占用
            </li>
          ))}
        </ul>
      ) : null}
      {plan.actions.length > 0 ? (
        <ul
          className="max-h-36 space-y-1 overflow-y-auto text-[var(--canteen-muted)]"
          aria-label="同步变更"
        >
          {plan.actions.map((action) => (
            <li key={`${action.action}-${action.externalKey}`}>
              {labels[action.action]}：{action.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
