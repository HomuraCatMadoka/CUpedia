import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  AdminCanteenMenuSourceHealth,
  AdminCanteenMenuSyncRun,
} from "@/lib/canteen-menu-sync-health";
import { CANTEEN_MENU_SUCCESS_OVERDUE_AFTER_MS } from "@/lib/canteen-menu-sync-health";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-HK", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Hong_Kong",
});

const RUN_LABELS: Record<AdminCanteenMenuSyncRun["status"], string> = {
  running: "运行中",
  applied: "已更新",
  unchanged: "无变化",
  failed: "失败",
};

function formatDate(value: Date | null): string {
  return value ? DATE_FORMATTER.format(value) : "—";
}

function SourceIdentity({ source }: { source: AdminCanteenMenuSourceHealth }) {
  return (
    <span className="font-mono text-xs">
      {source.provider}
      {source.externalOwnerId ? `:${source.externalOwnerId}` : ""}:
      {source.externalStoreId}
    </span>
  );
}

function RecentRuns({ runs }: { runs: AdminCanteenMenuSyncRun[] }) {
  if (runs.length === 0) {
    return <p className="text-sm text-muted-foreground">暂无同步记录。</p>;
  }
  return (
    <ul className="space-y-2" aria-label="最近同步记录">
      {runs.map((run) => (
        <li
          key={run.id}
          className="grid gap-1 rounded-lg border bg-muted/20 p-3 text-sm sm:grid-cols-[9rem_1fr]"
        >
          <div>
            <Badge
              variant={run.status === "failed" ? "destructive" : "outline"}
            >
              {RUN_LABELS[run.status]}
            </Badge>
            <p className="mt-1 text-xs text-muted-foreground">
              {formatDate(run.startedAt)}
            </p>
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            菜品 {run.itemCount ?? "—"} · 新增 {run.createdCount ?? "—"} · 更新{" "}
            {run.updatedCount ?? "—"} · 下架 {run.deactivatedCount ?? "—"}
            {run.errorCode ? ` · ${run.errorCode}` : ""}
          </p>
        </li>
      ))}
    </ul>
  );
}

function sourceWarnings(
  source: AdminCanteenMenuSourceHealth,
  evaluatedAt: Date,
): string[] {
  if (!source.enabled) return [];

  return [
    !source.lastAttemptAt
      ? "从未同步"
      : !source.lastSuccessAt
        ? "从未成功"
        : null,
    source.lastSuccessAt &&
    evaluatedAt.getTime() - source.lastSuccessAt.getTime() >
      CANTEEN_MENU_SUCCESS_OVERDUE_AFTER_MS
      ? "超过 48 小时未成功"
      : null,
    source.lastErrorCode ? "最近同步存在错误" : null,
    source.manualItemCount > 0 ? "存在手工菜品" : null,
    source.hasOverdueRun ? "任务运行超过 5 分钟" : null,
  ].filter((warning): warning is string => warning !== null);
}

export function CanteenMenuSyncHealth({
  sources,
  evaluatedAt,
}: {
  sources: AdminCanteenMenuSourceHealth[];
  evaluatedAt: Date;
}) {
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">菜单同步健康</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          上线前核对每个外部菜单来源。风险标记只针对已启用来源；同步不会自动接管手工菜品。
        </p>
      </header>

      {sources.length === 0 ? (
        <p className="rounded-xl border p-4 text-sm text-muted-foreground">
          尚未配置菜单来源。
        </p>
      ) : (
        <div className="grid gap-4">
          {sources.map((source) => {
            const warnings = sourceWarnings(source, evaluatedAt);
            return (
              <Card key={source.id}>
                <CardHeader className="border-b sm:grid-cols-[1fr_auto]">
                  <div>
                    <CardTitle>
                      <Link
                        href={`/admin/canteens/${source.canteenId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        {source.canteenName}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      <SourceIdentity source={source} />
                    </CardDescription>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <Badge variant={source.enabled ? "default" : "secondary"}>
                      {source.enabled ? "已启用" : "已停用"}
                    </Badge>
                    {warnings.length === 0 ? (
                      <Badge variant="outline">
                        {source.enabled ? "未发现风险" : "不参与同步"}
                      </Badge>
                    ) : (
                      warnings.map((warning) => (
                        <Badge key={warning} variant="destructive">
                          {warning}
                        </Badge>
                      ))
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <dl className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                    <div>
                      <dt className="text-muted-foreground">托管 / 手工菜品</dt>
                      <dd className="font-medium">
                        {source.managedItemCount} / {source.manualItemCount}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">遗留接管</dt>
                      <dd className="font-medium">
                        {source.legacyTakeoverAt ? "已完成" : "未执行"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">最近尝试</dt>
                      <dd className="font-medium">
                        {formatDate(source.lastAttemptAt)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">最近成功</dt>
                      <dd className="font-medium">
                        {formatDate(source.lastSuccessAt)}
                      </dd>
                    </div>
                  </dl>
                  {source.lastErrorCode ? (
                    <p className="rounded-lg bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
                      最近错误：{source.lastErrorCode}
                    </p>
                  ) : null}
                  <RecentRuns runs={source.recentRuns} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
