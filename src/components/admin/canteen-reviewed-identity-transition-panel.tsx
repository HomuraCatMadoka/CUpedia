"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { executeReviewedIdentityTransitionAction } from "@/lib/canteen-reviewed-identity-transition-actions";
import type { ReviewedIdentityTransitionOption } from "@/lib/canteen-reviewed-identity-transition";

function TransitionCard({
  option,
}: {
  option: ReviewedIdentityTransitionOption;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const confirmed = confirmation.trim() === option.externalStoreId;

  function execute() {
    setResult(null);
    startTransition(async () => {
      try {
        const response = await executeReviewedIdentityTransitionAction({
          key: option.key,
          confirmation,
        });
        if (!response.ok) {
          if (!response.diagnostic) {
            setResult(`未执行：${response.code}`);
            return;
          }
          const { currentSummary, currentScope } = response.diagnostic;
          const scope =
            currentScope?.provider === "aigens"
              ? `；目录 ${currentScope.categoryCount} 类 / ${currentScope.groupCount} 组；供应商时段 ${currentScope.providerPeriodCount} / 分类时段 ${currentScope.categoryPeriodCount}`
              : currentScope?.provider === "pinme"
                ? `；供应商服务时段 ${currentScope.serviceWindowCount}`
                : "";
          setResult(
            `未执行：${response.code}。现有投影 ${response.diagnostic.existingMatches ? "匹配" : "不匹配"}；供应商快照 ${response.diagnostic.incomingMatches ? "匹配" : "不匹配"}。当前现有 ${currentSummary.existingCount} / 传入 ${currentSummary.incomingCount}${scope}。`,
          );
          return;
        }
        const { transition, retry } = response.execution;
        setResult(
          `转换${transition.status === "applied" ? "已应用" : "无变化"}：菜品 ${transition.itemCount}，新增 ${transition.createdCount}，更新 ${transition.updatedCount}，下架 ${transition.deactivatedCount}。普通重试：${retry.status}（${retry.code}）。`,
        );
      } catch {
        setResult("未执行：REQUEST_FAILED");
      }
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-mono text-base">
          {option.provider}:{option.externalStoreId}
        </CardTitle>
        <CardDescription>
          已审计：现有 {option.existingCount}，传入 {option.incomingCount}
          ；规范化 {option.canonicalizationCount}，合并 {option.mergeCount}
          ，新增 {option.additionCount}，未观察到 {option.removalCount}。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <label
          htmlFor={`transition-confirm-${option.key}`}
          className="block text-sm font-medium"
        >
          输入来源编号 {option.externalStoreId} 确认
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id={`transition-confirm-${option.key}`}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            disabled={isPending}
            autoComplete="off"
          />
          <Button
            type="button"
            variant="destructive"
            disabled={!confirmed || isPending}
            onClick={execute}
          >
            {isPending ? "执行中…" : "应用并普通重试"}
          </Button>
        </div>
        {result ? (
          <p className="rounded-lg border bg-muted/30 px-3 py-2 font-mono text-xs leading-5">
            {result}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export function CanteenReviewedIdentityTransitionPanel({
  options,
}: {
  options: ReviewedIdentityTransitionOption[];
}) {
  return (
    <section className="space-y-4" aria-labelledby="reviewed-transition-title">
      <header>
        <h2 id="reviewed-transition-title" className="text-xl font-semibold">
          已审计身份转换（临时）
        </h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          仅执行仓库内已审核的
          artifact。执行时会再次核对来源配置、当前数据库投影和最新供应商快照；任何不一致都会在写入前停止。
        </p>
      </header>
      <div className="grid gap-4 lg:grid-cols-2">
        {options.map((option) => (
          <TransitionCard key={option.key} option={option} />
        ))}
      </div>
    </section>
  );
}
