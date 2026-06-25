"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
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
import { CanteenCard, CanteenShell, PreviewBanner } from "@/components/canteen/canteen-shell";
import type { Canteen, DeleteImpact } from "@/lib/canteen-types";
import * as liveActions from "@/lib/canteen-admin-actions";
import * as previewActions from "@/lib/canteen-preview-actions";
import { cn } from "@/lib/utils";

function formatDeleteImpact(impact: DeleteImpact, kind: "canteen" | "item") {
  const parts: string[] = [];
  if (kind === "canteen" && impact.menuItemCount > 0) {
    parts.push(`${impact.menuItemCount} 道菜品`);
  }
  if (impact.voteCount > 0) parts.push(`${impact.voteCount} 票`);
  if (impact.commentCount > 0) parts.push(`${impact.commentCount} 条评论`);
  if (parts.length === 0) {
    return kind === "canteen"
      ? "将删除该食堂（暂无关联菜品、投票或评论）。不可恢复。"
      : "将删除该菜品。不可恢复。";
  }
  return `将删除 ${parts.join("、")}。不可恢复。`;
}

export function CanteenAdminPanel({
  canteens,
  previewMode = false,
}: {
  canteens: Canteen[];
  previewMode?: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Canteen | null>(null);
  const [deleteImpact, setDeleteImpact] = useState<DeleteImpact | null>(null);
  const [editTarget, setEditTarget] = useState<Canteen | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocation, setEditLocation] = useState("");

  const basePath = previewMode ? "/canteen/manage" : "/admin/canteens";
  const createCanteen = previewMode
    ? previewActions.previewCreateCanteen
    : liveActions.createCanteen;
  const updateCanteen = previewMode
    ? previewActions.previewUpdateCanteen
    : liveActions.updateCanteen;
  const deleteCanteen = previewMode
    ? previewActions.previewDeleteCanteen
    : liveActions.deleteCanteen;
  const getCanteenDeleteImpact = previewMode
    ? previewActions.previewGetCanteenDeleteImpact
    : liveActions.getCanteenDeleteImpact;

  async function openDeleteDialog(canteen: Canteen) {
    setDeleteTarget(canteen);
    const impact = await getCanteenDeleteImpact(canteen.id);
    setDeleteImpact(impact);
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      try {
        await createCanteen({ name, location: location || null });
        setName("");
        setLocation("");
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "创建失败");
      }
    });
  }

  function openEditDialog(canteen: Canteen) {
    setEditTarget(canteen);
    setEditName(canteen.name);
    setEditLocation(canteen.location ?? "");
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editTarget) return;
    startTransition(async () => {
      try {
        await updateCanteen(editTarget.id, {
          name: editName,
          location: editLocation || null,
        });
        setEditTarget(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "更新失败");
      }
    });
  }

  function handleDelete() {
    if (!deleteTarget) return;
    startTransition(async () => {
      try {
        await deleteCanteen(deleteTarget.id);
        setDeleteTarget(null);
        setDeleteImpact(null);
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "删除失败");
      }
    });
  }

  return (
    <CanteenShell
      eyebrow="管理"
      title="食堂管理"
      subtitle="添加食堂、维护各食堂菜单。删除前会显示关联数据数量。"
    >
      {previewMode ? <PreviewBanner /> : null}

      <form
        onSubmit={handleCreate}
        className="canteen-fade-in mb-8 rounded-2xl border border-[var(--canteen-bamboo)]/25 bg-white/70 p-5 backdrop-blur-sm"
      >
        <p className="mb-4 text-sm font-medium text-[var(--canteen-ink)]">添加食堂</p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[12rem] flex-1 space-y-1">
            <label className="text-xs font-medium text-[var(--canteen-muted)]" htmlFor="canteen-name">
              食堂名称
            </label>
            <Input
              id="canteen-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
              className="border-[var(--canteen-bamboo)]/30 bg-white/90"
            />
          </div>
          <div className="min-w-[12rem] flex-1 space-y-1">
            <label
              className="text-xs font-medium text-[var(--canteen-muted)]"
              htmlFor="canteen-location"
            >
              位置（可选）
            </label>
            <Input
              id="canteen-location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              maxLength={500}
              className="border-[var(--canteen-bamboo)]/30 bg-white/90"
            />
          </div>
          <Button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-[var(--canteen-purple)] hover:bg-[var(--canteen-purple)]/90"
          >
            添加食堂
          </Button>
        </div>
      </form>

      {canteens.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--canteen-bamboo)]/40 bg-white/50 px-6 py-16 text-center">
          <p className="text-[var(--canteen-muted)]">暂无食堂，请在上方添加</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {canteens.map((canteen, i) => (
            <div key={canteen.id} className={`canteen-fade-in ${i % 2 === 1 ? "canteen-fade-in-delay-1" : ""}`}>
              <CanteenCard canteen={canteen} href={`${basePath}/${canteen.id}`} />
              <div className="mt-2 flex justify-end gap-2 px-1">
                <Link
                  href={`${basePath}/${canteen.id}`}
                  className={cn(buttonVariants({ variant: "outline", size: "sm" }), "rounded-full")}
                >
                  管理菜单
                </Link>
                <Button
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  disabled={isPending}
                  onClick={() => openEditDialog(canteen)}
                >
                  编辑
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  className="rounded-full"
                  disabled={isPending}
                  onClick={() => openDeleteDialog(canteen)}
                >
                  删除
                </Button>
              </div>
            </div>
          ))}
        </div>
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
              {deleteTarget && deleteImpact
                ? formatDeleteImpact(deleteImpact, "canteen")
                : "加载中…"}
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
              <AlertDialogTitle>编辑食堂</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="grid gap-3 py-4">
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="edit-canteen-name">
                  名称
                </label>
                <Input
                  id="edit-canteen-name"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium" htmlFor="edit-canteen-location">
                  位置
                </label>
                <Input
                  id="edit-canteen-location"
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  maxLength={500}
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
