"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { setUserBanned, setUserRole } from "@/lib/admin-actions";
import { authClient } from "@/lib/auth-client";

interface UserRow {
  id: string;
  email: string;
  nickname: string;
  role: string;
  banned: boolean;
  created_at: string;
  updated_at: string;
}

export function UserTable({
  users,
  page,
  totalPages,
  total,
  q,
  ownerUserId,
}: {
  users: UserRow[];
  page: number;
  totalPages: number;
  total: number;
  q: string;
  ownerUserId: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = authClient.useSession();
  const [isPending, startTransition] = useTransition();
  const [search, setSearch] = useState(q);
  const [confirmTarget, setConfirmTarget] = useState<UserRow | null>(null);
  const [roleTarget, setRoleTarget] = useState<UserRow | null>(null);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(searchParams.toString());
    if (search) params.set("q", search);
    else params.delete("q");
    params.set("page", "1");
    router.push(`/admin/users?${params}`);
  }

  function handlePageChange(newPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(newPage));
    router.push(`/admin/users?${params}`);
  }

  async function handleBan(user: UserRow, banned: boolean) {
    startTransition(async () => {
      try {
        await setUserBanned(user.id, banned, user.updated_at);
        router.refresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(msg === "STALE_USER_ROW" ? "数据已过期，请刷新页面" : msg);
      }
    });
    setConfirmTarget(null);
  }

  async function handleSetRole(user: UserRow, role: "admin" | "user") {
    startTransition(async () => {
      try {
        await setUserRole(user.id, role, user.updated_at);
        router.refresh();
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        alert(msg === "STALE_USER_ROW" ? "数据已过期，请刷新页面" : msg);
      }
    });
    setRoleTarget(null);
  }

  const isCurrentUser = (userId: string) => session?.user?.id === userId;
  // Owner identity comes fresh from the server; only the Owner sees role
  // controls. The server (requireOwner) re-checks, so this is UI gating only.
  const isOwnerViewer = !!ownerUserId && session?.user?.id === ownerUserId;

  return (
    <div className="space-y-4">
      <form onSubmit={handleSearch} className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索邮箱或昵称..."
          className="max-w-xs"
        />
        <Button type="submit" variant="outline" size="sm">
          搜索
        </Button>
      </form>

      <p className="text-sm text-muted-foreground">共 {total} 个用户</p>

      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-2 text-left font-medium">昵称</th>
              <th className="px-4 py-2 text-left font-medium">邮箱</th>
              <th className="px-4 py-2 text-left font-medium">角色</th>
              <th className="px-4 py-2 text-left font-medium">状态</th>
              <th className="px-4 py-2 text-left font-medium">注册时间</th>
              <th className="px-4 py-2 text-left font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="border-b">
                <td className="px-4 py-2">{user.nickname || "—"}</td>
                <td className="px-4 py-2">{user.email}</td>
                <td className="px-4 py-2">
                  {user.role}
                  {ownerUserId === user.id && (
                    <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                      站长
                    </span>
                  )}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={user.banned ? "text-red-600" : "text-green-600"}
                  >
                    {user.banned ? "已封禁" : "正常"}
                  </span>
                </td>
                <td className="px-4 py-2">
                  {new Date(user.created_at).toLocaleDateString("zh-CN")}
                </td>
                <td className="px-4 py-2">
                  <div className="flex gap-2">
                    {isOwnerViewer &&
                      ownerUserId !== user.id &&
                      (user.role === "admin" ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleSetRole(user, "user")}
                        >
                          取消管理员
                        </Button>
                      ) : !user.banned ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isPending}
                          onClick={() => setRoleTarget(user)}
                        >
                          设为管理员
                        </Button>
                      ) : null)}
                    {isCurrentUser(user.id) ? (
                      <span className="text-xs text-muted-foreground">
                        当前用户
                      </span>
                    ) : user.banned ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending}
                        onClick={() => handleBan(user, false)}
                      >
                        解封
                      </Button>
                    ) : user.role === "user" ? (
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={isPending}
                        onClick={() => setConfirmTarget(user)}
                      >
                        封禁
                      </Button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => handlePageChange(page - 1)}
          >
            上一页
          </Button>
          <span className="text-sm">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => handlePageChange(page + 1)}
          >
            下一页
          </Button>
        </div>
      )}

      <Dialog
        open={!!confirmTarget}
        onOpenChange={() => setConfirmTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认封禁</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            确定要封禁用户{" "}
            <strong>{confirmTarget?.nickname || confirmTarget?.email}</strong>{" "}
            吗？封禁后该用户将无法登录。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmTarget(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              disabled={isPending}
              onClick={() => confirmTarget && handleBan(confirmTarget, true)}
            >
              确认封禁
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!roleTarget} onOpenChange={() => setRoleTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认设为管理员</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            确定要将{" "}
            <strong>{roleTarget?.nickname || roleTarget?.email}</strong>{" "}
            设为管理员吗？管理员可封禁用户、删除/恢复页面、管理讨论。
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRoleTarget(null)}>
              取消
            </Button>
            <Button
              disabled={isPending}
              onClick={() => roleTarget && handleSetRole(roleTarget, "admin")}
            >
              确认设为管理员
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
