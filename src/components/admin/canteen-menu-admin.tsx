"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { CanteenShell, PreviewBanner } from "@/components/canteen/canteen-shell";
import { DishSvgIcon } from "@/components/canteen/dish-svg-icon";
import { MealPeriodBadge } from "@/components/canteen/meal-period-badge";
import { MEAL_PERIODS, type Canteen, type CanteenMenuItem } from "@/lib/canteen-types";
import type { DeleteImpact } from "@/lib/canteen-types";
import * as liveActions from "@/lib/canteen-admin-actions";
import * as previewActions from "@/lib/canteen-preview-actions";
import { cn } from "@/lib/utils";

const MEAL_LABELS: Record<(typeof MEAL_PERIODS)[number], string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
};

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
  const [price, setPrice] = useState("");
  const [mealPeriod, setMealPeriod] =
    useState<(typeof MEAL_PERIODS)[number]>("lunch");
  const [deleteTarget, setDeleteTarget] = useState<CanteenMenuItem | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null);
  const [editTarget, setEditTarget] = useState<CanteenMenuItem | null>(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
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
          price: price === "" ? null : price,
          mealPeriod,
          sortOrder: "0",
        });
        setName("");
        setPrice("");
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
    setEditPrice(item.price != null ? String(item.price) : "");
    setEditSvgKey(item.svgKey);
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    startTransition(async () => {
      try {
        await updateMenuItem(canteen.id, editTarget.id, {
          name: editName,
          price: editPrice === "" ? null : editPrice,
          svgKey: editSvgKey,
        });
        setEditTarget(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "更新失败");
      }
    });
  }

  function handleMealPeriodChange(item: CanteenMenuItem, next: string) {
    startTransition(async () => {
      try {
        await updateMenuItem(canteen.id, item.id, { mealPeriod: next });
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
        <p className="mb-4 text-sm font-medium text-[var(--canteen-ink)]">添加菜品</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs font-medium text-[var(--canteen-muted)]" htmlFor="item-name">
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
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--canteen-muted)]" htmlFor="item-price">
              价格（HKD）
            </label>
            <Input
              id="item-price"
              type="number"
              min={0}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="border-[var(--canteen-bamboo)]/30 bg-white/90"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-[var(--canteen-muted)]" htmlFor="item-meal">
              餐段
            </label>
            <select
              id="item-meal"
              value={mealPeriod}
              onChange={(e) =>
                setMealPeriod(e.target.value as (typeof MEAL_PERIODS)[number])
              }
              className="flex h-9 w-full rounded-md border border-[var(--canteen-bamboo)]/30 bg-white/90 px-3 py-1 text-sm"
            >
              {MEAL_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {MEAL_LABELS[p]}
                </option>
              ))}
            </select>
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
              <DishSvgIcon svgKey={item.svgKey} className="size-10 rounded-xl" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[var(--canteen-ink)]">{item.name}</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <MealPeriodBadge period={item.mealPeriod} />
                  <span className="font-mono text-sm text-[var(--canteen-purple)]">
                    {item.price != null ? `$${item.price}` : "—"}
                  </span>
                </div>
              </div>
              <select
                value={item.mealPeriod}
                disabled={isPending}
                onChange={(e) => handleMealPeriodChange(item, e.target.value)}
                className="rounded-full border border-[var(--canteen-bamboo)]/30 bg-white/90 px-3 py-1.5 text-xs"
                aria-label={`${item.name} 餐段`}
              >
                {MEAL_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {MEAL_LABELS[p]}
                  </option>
                ))}
              </select>
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
            <AlertDialogTitle>确认删除「{deleteTarget?.name}」？</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteImpact ? formatDeleteImpact(deleteImpact) : "加载中…"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isPending}>
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
            <div className="grid gap-3 py-4">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="edit-item-name">
                  名称
                </label>
                <Input
                  id="edit-item-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="edit-item-price">
                  价格（HKD）
                </label>
                <Input
                  id="edit-item-price"
                  type="number"
                  min={0}
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="edit-item-svg">
                  图标 key
                </label>
                <Input
                  id="edit-item-svg"
                  value={editSvgKey}
                  onChange={(e) => setEditSvgKey(e.target.value)}
                  maxLength={64}
                />
              </div>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel type="button">取消</AlertDialogCancel>
              <AlertDialogAction type="submit" disabled={isPending}>
                保存
              </AlertDialogAction>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </CanteenShell>
  );
}
