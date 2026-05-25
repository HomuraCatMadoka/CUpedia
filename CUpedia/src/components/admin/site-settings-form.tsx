"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { updateWikiEditRole } from "@/lib/admin-actions";
import { toast } from "sonner";

export function SiteSettingsForm({
  wikiEditRole,
}: {
  wikiEditRole: "admin" | "user";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingValue, setPendingValue] = useState<"admin" | "user" | null>(
    null,
  );

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

  return (
    <div className="space-y-6">
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
