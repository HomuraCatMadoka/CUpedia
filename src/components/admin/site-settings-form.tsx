"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  updateCanteenShameVoteEndDate,
  updateWikiEditRole,
} from "@/lib/admin-actions";
import { toast } from "sonner";

export function SiteSettingsForm({
  wikiEditRole,
  canteenShameVoteEndDate,
}: {
  wikiEditRole: "admin" | "user";
  canteenShameVoteEndDate: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingValue, setPendingValue] = useState<"admin" | "user" | null>(
    null,
  );
  const [voteEndDate, setVoteEndDate] = useState(canteenShameVoteEndDate);

  const isUserEdit = wikiEditRole === "user";

  function handleToggle() {
    setPendingValue(isUserEdit ? "admin" : "user");
  }

  function handleConfirm() {
    if (!pendingValue) return;
    startTransition(async () => {
      try {
        await updateWikiEditRole(pendingValue);
        toast.success("已更新");
        router.refresh();
      } catch {
        toast.error("更新失败");
      } finally {
        setPendingValue(null);
      }
    });
  }

  function handleVoteEndDateSave(event: React.FormEvent) {
    event.preventDefault();
    startTransition(async () => {
      try {
        await updateCanteenShameVoteEndDate(voteEndDate);
        toast.success("已更新投票截止日期");
        router.refresh();
      } catch {
        toast.error("截止日期无效或更新失败");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <h3 className="font-medium">Wiki 编辑权限</h3>
        <div className="flex items-center gap-3">
          <Switch
            checked={isUserEdit}
            onCheckedChange={handleToggle}
            disabled={isPending}
            id="wiki-edit-role"
          />
          <Label htmlFor="wiki-edit-role" className="text-sm">
            允许普通用户编辑 Wiki
          </Label>
        </div>
        <p className="text-xs text-muted-foreground">
          {isUserEdit
            ? "当前：所有登录用户均可创建、编辑和回滚页面"
            : "当前：仅管理员可创建、编辑和回滚页面"}
        </p>
      </div>

      <form
        className="space-y-3 border-t pt-6"
        onSubmit={handleVoteEndDateSave}
      >
        <h3 className="font-medium">每日💩堂榜</h3>
        <Label htmlFor="canteen-shame-vote-end-date">
          投票截止日期（港时）
        </Label>
        <div className="flex max-w-sm gap-2">
          <Input
            id="canteen-shame-vote-end-date"
            type="date"
            required
            value={voteEndDate}
            onChange={(event) => setVoteEndDate(event.target.value)}
          />
          <Button type="submit" disabled={isPending}>
            保存
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          截止日期当天仍可投票，次日 00:00 起停止。
        </p>
      </form>

      <Dialog open={!!pendingValue} onOpenChange={() => setPendingValue(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认修改编辑权限</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {pendingValue === "user"
              ? "确定要允许所有登录用户编辑 Wiki 吗？"
              : "确定要将编辑权限收回为仅管理员吗？"}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPendingValue(null)}>
              取消
            </Button>
            <Button disabled={isPending} onClick={handleConfirm}>
              确认
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
