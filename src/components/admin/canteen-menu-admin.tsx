"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CanteenMenuImportPanel } from "@/components/admin/canteen-menu-import-panel";
import { CanteenMenuJsonImportPanel } from "@/components/admin/canteen-menu-json-import-panel";
import {
  CanteenShell,
  PreviewBanner,
} from "@/components/canteen/canteen-shell";
import { DishSvgIcon } from "@/components/canteen/dish-svg-icon";
import {
  MealPeriodsBadges,
  mealPeriodAssignmentLabel,
} from "@/components/canteen/meal-period-badge";
import { MenuItemPrice } from "@/components/canteen/menu-item-price";
import {
  ALLDAY_MEAL_PERIOD,
  MEAL_PERIOD_VALUES,
  MEAL_PERIODS,
  type MealPeriodAssignment,
  type Canteen,
  type CanteenMenuItem,
} from "@/lib/canteen-types";
import type { DeleteImpact } from "@/lib/canteen-types";
import * as liveActions from "@/lib/canteen-admin-actions";
import * as previewActions from "@/lib/canteen-preview-actions";
import { cn } from "@/lib/utils";

type DraftPriceOption = {
  key: string;
  label: string;
  amount: string;
};

function blankPriceOption(key = "0"): DraftPriceOption {
  return { key, label: "", amount: "" };
}

function pricingInput(options: DraftPriceOption[]) {
  const populated = options.filter(
    (option) => option.label.trim() || option.amount.trim(),
  );
  return {
    options: populated.map((option, index) => {
      const rawAmount = option.amount.trim();
      if (!/^\d+(?:\.\d{1,2})?$/.test(rawAmount)) {
        throw new Error("INVALID_PRICE_AMOUNT");
      }
      const amount = Number(rawAmount);
      const amountMinor = Math.round(amount * 100);
      if (amountMinor > 999_900) {
        throw new Error("INVALID_PRICE_AMOUNT");
      }
      return {
        label: option.label.trim() || null,
        amountMinor,
        currency: "HKD",
        sortOrder: index,
      };
    }),
  };
}

function toggleMealPeriod(
  current: MealPeriodAssignment[],
  period: MealPeriodAssignment,
): MealPeriodAssignment[] {
  if (period === ALLDAY_MEAL_PERIOD) {
    return [ALLDAY_MEAL_PERIOD];
  }
  const withoutAllDay = current.filter((p) => p !== ALLDAY_MEAL_PERIOD);
  if (withoutAllDay.includes(period)) {
    const next = withoutAllDay.filter((p) => p !== period);
    return next.length > 0 ? next : [ALLDAY_MEAL_PERIOD];
  }
  return MEAL_PERIODS.filter(
    (p) => withoutAllDay.includes(p) || p === period,
  );
}

function MealPeriodsEditor({
  idPrefix,
  value,
  onChange,
  disabled,
}: {
  idPrefix: string;
  value: MealPeriodAssignment[];
  onChange: (next: MealPeriodAssignment[]) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="space-y-1">
      <legend className="text-xs font-medium text-[var(--canteen-muted)]">
        餐段
      </legend>
      <div className="flex flex-wrap gap-3">
        {MEAL_PERIOD_VALUES.map((period) => {
          const checked = value.includes(period);
          const inputId = `${idPrefix}-${period}`;
          return (
            <label
              key={period}
              htmlFor={inputId}
              className="inline-flex items-center gap-1.5 text-sm text-[var(--canteen-ink)]"
            >
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(toggleMealPeriod(value, period))}
                className="size-3.5 accent-[var(--canteen-purple)]"
              />
              {mealPeriodAssignmentLabel[period]}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function PriceOptionsEditor({
  idPrefix,
  options,
  onChange,
}: {
  idPrefix: string;
  options: DraftPriceOption[];
  onChange: (options: DraftPriceOption[]) => void;
}) {
  function update(key: string, field: "label" | "amount", value: string) {
    onChange(
      options.map((option) =>
        option.key === key ? { ...option, [field]: value } : option,
      ),
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-[var(--canteen-muted)]">
          价格选项
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label="添加价格选项"
          title="添加价格选项"
          onClick={() =>
            onChange([...options, blankPriceOption(String(Date.now()))])
          }
        >
          <Plus className="size-4" aria-hidden />
        </Button>
      </div>
      {options.map((option, index) => (
        <div
          key={option.key}
          className="grid grid-cols-[minmax(0,1fr)_7rem_2rem] gap-2"
        >
          <Input
            id={`${idPrefix}-label-${index}`}
            aria-label={`价格选项 ${index + 1} 标签`}
            placeholder="标签，如：凍 12oz"
            maxLength={100}
            value={option.label}
            onChange={(event) =>
              update(option.key, "label", event.target.value)
            }
          />
          <Input
            id={`${idPrefix}-amount-${index}`}
            aria-label={`价格选项 ${index + 1} 金额`}
            placeholder="HKD"
            type="number"
            min={0}
            max={9999}
            step="0.01"
            value={option.amount}
            onChange={(event) =>
              update(option.key, "amount", event.target.value)
            }
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={`删除价格选项 ${index + 1}`}
            title="删除价格选项"
            onClick={() => {
              const next = options.filter(
                (candidate) => candidate.key !== option.key,
              );
              onChange(next.length > 0 ? next : [blankPriceOption()]);
            }}
          >
            <Trash2 className="size-4" aria-hidden />
          </Button>
        </div>
      ))}
    </div>
  );
}

function formatDeleteImpact(impact: DeleteImpact) {
  const parts: string[] = [];
  if (impact.voteCount > 0) parts.push(`${impact.voteCount} 票`);
  if (impact.commentCount > 0) parts.push(`${impact.commentCount} 条评论`);
  if (parts.length === 0) return "将删除该菜品。不可恢复。";
  return `将删除 ${parts.join("、")}。不可恢复。`;
}

export function CanteenMenuAdmin({
  canteen,
  items,
  previewMode = false,
}: {
  canteen: Canteen;
  items: CanteenMenuItem[];
  previewMode?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [priceOptions, setPriceOptions] = useState<DraftPriceOption[]>([
    blankPriceOption(),
  ]);
  const [mealPeriods, setMealPeriods] = useState<MealPeriodAssignment[]>([
    ALLDAY_MEAL_PERIOD,
  ]);
  const [deleteTarget, setDeleteTarget] = useState<CanteenMenuItem | null>(
    null,
  );
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null);
  const [editTarget, setEditTarget] = useState<CanteenMenuItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editPriceOptions, setEditPriceOptions] = useState<DraftPriceOption[]>([
    blankPriceOption(),
  ]);
  const [editSvgKey, setEditSvgKey] = useState("default");

  const listPath = previewMode ? "/canteen/manage" : "/admin/canteens";
  const createMenuItem = previewMode
    ? previewActions.previewCreateMenuItem
    : liveActions.createMenuItem;
  const updateMenuItem = previewMode
    ? previewActions.previewUpdateMenuItem
    : liveActions.updateMenuItem;
  const deleteMenuItem = previewMode
    ? previewActions.previewDeleteMenuItem
    : liveActions.deleteMenuItem;
  const getMenuItemDeleteImpact = previewMode
    ? previewActions.previewGetMenuItemDeleteImpact
    : liveActions.getMenuItemDeleteImpact;

  async function openDeleteDialog(item: CanteenMenuItem) {
    setDeleteTarget(item);
    const impact = await getMenuItemDeleteImpact(item.id);
    setDeleteImpact(impact);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createMenuItem(canteen.id, {
          name,
          pricing: pricingInput(priceOptions),
          mealPeriods,
          sortOrder: "0",
        });
        setName("");
        setPriceOptions([blankPriceOption()]);
        setMealPeriods([ALLDAY_MEAL_PERIOD]);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "添加失败");
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteMenuItem(canteen.id, deleteTarget.id);
        setDeleteTarget(null);
        setDeleteImpact(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "删除失败");
      }
    });
  }

  function openEditDialog(item: CanteenMenuItem) {
    setEditTarget(item);
    setEditName(item.name);
    setEditPriceOptions(
      item.pricing?.options.map((option, index) => ({
        key: option.id || String(index),
        label: option.label ?? "",
        amount: String(option.amountMinor / 100),
      })) ?? [blankPriceOption()],
    );
    setEditSvgKey(item.svgKey);
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    startTransition(async () => {
      try {
        await updateMenuItem(canteen.id, editTarget.id, {
          name: editName,
          pricing: pricingInput(editPriceOptions),
          svgKey: editSvgKey,
        });
        setEditTarget(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "更新失败");
      }
    });
  }

  function handleMealPeriodsChange(
    item: CanteenMenuItem,
    next: MealPeriodAssignment[],
  ) {
    startTransition(async () => {
      try {
        await updateMenuItem(canteen.id, item.id, { mealPeriods: next });
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "更新失败");
      }
    });
  }

  return (
    <CanteenShell
      eyebrow={
        <Link href={listPath} className="hover:text-[var(--canteen-purple)]">
          ← 食堂列表
        </Link>
      }
      title={`${canteen.name} · 菜单`}
      subtitle={canteen.location ?? undefined}
    >
      {previewMode ? <PreviewBanner /> : null}

      <div className="mb-8 grid gap-6 lg:grid-cols-2">
        <CanteenMenuImportPanel
          canteenId={canteen.id}
          previewMode={previewMode}
        />
        <CanteenMenuJsonImportPanel
          canteenId={canteen.id}
          previewMode={previewMode}
        />
      </div>

      <form
        onSubmit={handleCreate}
        className="canteen-fade-in mb-8 rounded-2xl border border-[var(--canteen-bamboo)]/25 bg-white/70 p-5 backdrop-blur-sm"
      >
        <p className="mb-4 text-sm font-medium text-[var(--canteen-ink)]">
          添加菜品
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <label
              className="text-xs font-medium text-[var(--canteen-muted)]"
              htmlFor="item-name"
            >
              菜品名称
            </label>
            <Input
              id="item-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              className="border-[var(--canteen-bamboo)]/30 bg-white/90"
            />
          </div>
          <div className="sm:col-span-2 lg:col-span-2">
            <PriceOptionsEditor
              idPrefix="item-price"
              options={priceOptions}
              onChange={setPriceOptions}
            />
          </div>
          <div className="sm:col-span-2">
            <MealPeriodsEditor
              idPrefix="item-meal"
              value={mealPeriods}
              onChange={setMealPeriods}
              disabled={isPending}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-[var(--canteen-purple)] hover:bg-[var(--canteen-purple)]/90"
          >
            添加菜品
          </Button>
        </div>
      </form>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--canteen-bamboo)]/40 bg-white/50 px-6 py-16 text-center">
          <p className="text-[var(--canteen-muted)]">暂无菜品</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li
              key={item.id}
              className={cn(
                "canteen-fade-in flex flex-wrap items-center gap-3 rounded-xl border border-[var(--canteen-bamboo)]/20 bg-white/60 px-4 py-3 sm:flex-nowrap",
                i % 2 === 1 && "canteen-fade-in-delay-1",
              )}
            >
              <DishSvgIcon
                svgKey={item.svgKey}
                className="size-10 rounded-xl"
              />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--canteen-ink)]">
                  {item.name}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <MealPeriodsBadges periods={item.mealPeriods} />
                  <MenuItemPrice
                    pricing={item.pricing}
                    className="font-mono text-sm text-[var(--canteen-purple)]"
                  />
                </div>
                <div className="mt-2">
                  <MealPeriodsEditor
                    idPrefix={`row-${item.id}`}
                    value={item.mealPeriods}
                    onChange={(next) => handleMealPeriodsChange(item, next)}
                    disabled={isPending}
                  />
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                disabled={isPending}
                onClick={() => openEditDialog(item)}
              >
                编辑
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="rounded-full"
                disabled={isPending}
                onClick={() => openDeleteDialog(item)}
              >
                删除
              </Button>
            </li>
          ))}
        </ul>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
            setDeleteImpact(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除菜品？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteImpact
                ? formatDeleteImpact(deleteImpact)
                : "加载中…"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!editTarget}
        onOpenChange={(open) => {
          if (!open) setEditTarget(null);
        }}
      >
        <AlertDialogContent>
          <form onSubmit={handleEdit}>
            <AlertDialogHeader>
              <AlertDialogTitle>编辑菜品</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="mt-4 space-y-3">
              <div className="space-y-1">
                <label
                  className="text-xs font-medium text-[var(--canteen-muted)]"
                  htmlFor="edit-item-name"
                >
                  菜品名称
                </label>
                <Input
                  id="edit-item-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <PriceOptionsEditor
                idPrefix="edit-item-price"
                options={editPriceOptions}
                onChange={setEditPriceOptions}
              />
              <div className="space-y-1">
                <label
                  className="text-xs font-medium text-[var(--canteen-muted)]"
                  htmlFor="edit-svg-key"
                >
                  图标 key
                </label>
                <Input
                  id="edit-svg-key"
                  value={editSvgKey}
                  onChange={(e) => setEditSvgKey(e.target.value)}
                  maxLength={64}
                />
              </div>
            </div>
            <AlertDialogFooter className="mt-4">
              <AlertDialogCancel type="button">取消</AlertDialogCancel>
              <Button type="submit" disabled={isPending}>
                保存
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </CanteenShell>
  );
}
