"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowDownRightIcon,
  DatabaseIcon,
  FlaskConicalIcon,
  ShieldCheckIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { modelExperimentDefaults } from "@/lib/campus-transport/model-experiment";

type SerializableExperiment = {
  id: string;
  authorName: string;
  runKind: string;
  createdAt: string;
  status: string;
  routeScope: string | null;
  parameters: {
    candidateWindowMinutes: number;
    label: string | null;
    likelihoodScaleMinutes: number;
    minEvents: number;
    minServiceDays: number;
    priorStrength: number;
    routeId: string | null;
    trainingWindowDays: number;
  };
  sourceObservationCount: number;
  trainingEventCount: number;
  validationEventCount: number;
  baselineMaeSeconds: number | null;
  candidateMaeSeconds: number | null;
  candidateP90Seconds: number | null;
  championMaeSeconds: number | null;
  shouldPromote: boolean;
  promotedAt: string | null;
};

type ModelLabOverview = {
  coverage: {
    firstArrivalAt: string | null;
    lastArrivalAt: string | null;
    observationCount: number;
  };
  routes: Array<{ routeId: string; observationCount: number }>;
  champion: {
    id: string;
    createdAt: string;
    promotedAt: string | null;
    sourceObservationCount: number;
  } | null;
  experiments: SerializableExperiment[];
};

function minutes(seconds: number | null) {
  return seconds === null ? "—" : `${(seconds / 60).toFixed(1)} 分鐘`;
}

function percentImprovement(experiment: SerializableExperiment) {
  if (
    experiment.baselineMaeSeconds === null ||
    experiment.candidateMaeSeconds === null ||
    experiment.baselineMaeSeconds === 0
  ) {
    return null;
  }
  return (
    ((experiment.baselineMaeSeconds - experiment.candidateMaeSeconds) /
      experiment.baselineMaeSeconds) *
    100
  );
}

function Field({
  help,
  label,
  name,
  ...props
}: React.ComponentProps<typeof Input> & { help: string; label: string }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} {...props} />
      <p className="text-xs leading-5 text-muted-foreground">{help}</p>
    </div>
  );
}

export function ModelLab({
  initialOverview,
  isAdmin,
  routes,
}: {
  initialOverview: ModelLabOverview;
  isAdmin: boolean;
  routes: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [promotingId, setPromotingId] = useState<string | null>(null);

  async function runExperiment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRunning(true);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const response = await fetch("/api/campus-bus/model-experiments", {
        body: JSON.stringify({
          ...values,
          candidateWindowMinutes: Number(values.candidateWindowMinutes),
          likelihoodScaleMinutes: Number(values.likelihoodScaleMinutes),
          minEvents: Number(values.minEvents),
          minServiceDays: Number(values.minServiceDays),
          priorStrength: Number(values.priorStrength),
          trainingWindowDays: Number(values.trainingWindowDays),
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      if (response.status === 429) {
        toast.error("每兩分鐘可執行一次實驗，請稍後再試。");
        return;
      }
      if (!response.ok) {
        toast.error("參數無效或實驗未能完成。");
        return;
      }
      const result = (await response.json()) as {
        shouldPromote: boolean;
        status: string;
      };
      toast.success(
        result.status === "insufficient"
          ? "實驗已保存，但資料量不足以產生校正。"
          : result.shouldPromote
            ? "實驗已保存，驗證結果符合上線門檻。"
            : "實驗已保存，驗證結果未達上線門檻。",
      );
      router.refresh();
    } catch {
      toast.error("網絡連接失敗，請稍後再試。");
    } finally {
      setRunning(false);
    }
  }

  async function promote(experimentId: string) {
    setPromotingId(experimentId);
    try {
      const response = await fetch(
        `/api/admin/campus-bus/model-experiments/${experimentId}/promote`,
        { method: "POST" },
      );
      if (!response.ok) {
        toast.error(
          response.status === 409
            ? "這次實驗已過期或不符合上線條件。"
            : "未能提升模型。",
        );
        return;
      }
      toast.success("已提升為線上模型，乘客端快取正在更新。");
      router.refresh();
    } catch {
      toast.error("網絡連接失敗，請稍後再試。");
    } finally {
      setPromotingId(null);
    }
  }

  async function rollback(revisionId: string) {
    setPromotingId(revisionId);
    try {
      const response = await fetch(
        `/api/admin/campus-bus/model-revisions/${revisionId}/rollback`,
        { method: "POST" },
      );
      if (!response.ok) {
        toast.error("未能回退到這個模型版本。");
        return;
      }
      toast.success("已回退線上模型，乘客端快取正在更新。");
      router.refresh();
    } catch {
      toast.error("網絡連接失敗，請稍後再試。");
    } finally {
      setPromotingId(null);
    }
  }

  const routeCount = initialOverview.routes.filter(
    (route) => route.observationCount > 0,
  ).length;

  return (
    <div className="space-y-10 pt-8">
      <section aria-labelledby="data-overview-title">
        <div className="mb-4 flex items-center gap-2">
          <DatabaseIcon className="size-5 text-[#5b2a73]" aria-hidden="true" />
          <h2 id="data-overview-title" className="text-lg font-semibold">
            可用資料
          </h2>
        </div>
        <div className="grid overflow-hidden rounded-xl border bg-background sm:grid-cols-3 sm:divide-x">
          <div className="border-b p-5 sm:border-b-0">
            <p className="text-2xl font-bold tabular-nums">
              {initialOverview.coverage.observationCount.toLocaleString()}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">匿名到站回報</p>
          </div>
          <div className="border-b p-5 sm:border-b-0">
            <p className="text-2xl font-bold tabular-nums">
              {routeCount}/{routes.length}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">已有回報的路線</p>
          </div>
          <div className="p-5">
            <p className="text-2xl font-bold tabular-nums">
              {initialOverview.champion ? "1" : "0"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">線上校正模型</p>
          </div>
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-muted-foreground">
          <ShieldCheckIcon
            className="mt-0.5 size-4 shrink-0"
            aria-hidden="true"
          />
          實驗只讀取去識別化路線、站點和時間；不提供 GPS、網絡雜湊或資料庫權限。
        </p>
      </section>

      <section aria-labelledby="new-experiment-title">
        <div className="mb-5 flex items-center gap-2">
          <FlaskConicalIcon
            className="size-5 text-[#5b2a73]"
            aria-hidden="true"
          />
          <h2 id="new-experiment-title" className="text-lg font-semibold">
            建立實驗
          </h2>
        </div>
        <form
          onSubmit={runExperiment}
          className="rounded-xl border bg-background p-5 sm:p-6"
        >
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-2 sm:col-span-2 lg:col-span-2">
              <Label htmlFor="label">實驗名稱</Label>
              <Input
                id="label"
                name="label"
                maxLength={80}
                placeholder="例如：縮小配對範圍"
              />
              <p className="text-xs leading-5 text-muted-foreground">
                方便團隊辨認，不影響模型。
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="routeId">資料範圍</Label>
              <select
                id="routeId"
                name="routeId"
                defaultValue={modelExperimentDefaults.routeId}
                className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <option value="all">全部路線</option>
                {routes.map((route) => (
                  <option key={route.id} value={route.id}>
                    {route.id} · {route.name}
                  </option>
                ))}
              </select>
              <p className="text-xs leading-5 text-muted-foreground">
                單線實驗只作分析，不能直接上線。
              </p>
            </div>
            <Field
              help="使用最近多少天的回報。"
              label="訓練窗口（天）"
              name="trainingWindowDays"
              type="number"
              min={7}
              max={56}
              defaultValue={modelExperimentDefaults.trainingWindowDays}
            />
            <Field
              help="回報與候選班次最多相距多久。"
              label="班次配對範圍（分鐘）"
              name="candidateWindowMinutes"
              type="number"
              min={3}
              max={30}
              defaultValue={modelExperimentDefaults.candidateWindowMinutes}
            />
            <Field
              help="越小越偏好最接近的候選班次。"
              label="配對尺度（分鐘）"
              name="likelihoodScaleMinutes"
              type="number"
              min={1}
              max={10}
              defaultValue={modelExperimentDefaults.likelihoodScaleMinutes}
            />
            <Field
              help="站點時段至少需要多少次匹配。"
              label="最少事件數"
              name="minEvents"
              type="number"
              min={3}
              max={100}
              defaultValue={modelExperimentDefaults.minEvents}
            />
            <Field
              help="避免只用單一天的偶然延誤。"
              label="最少服務日"
              name="minServiceDays"
              type="number"
              min={2}
              max={28}
              defaultValue={modelExperimentDefaults.minServiceDays}
            />
            <Field
              help="越高越保守，越接近原始時間表。"
              label="先驗強度"
              name="priorStrength"
              type="number"
              min={1}
              max={50}
              defaultValue={modelExperimentDefaults.priorStrength}
            />
          </div>
          <div className="mt-6 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs leading-5 text-muted-foreground">
              系統按日期保留最後 20%
              作驗證；結果只保存統計量和模型校正，不複製原始回報。
            </p>
            <Button
              type="submit"
              disabled={running}
              className="h-10 bg-[#5b2a73] px-4 text-white hover:bg-[#4b2161]"
            >
              {running ? "執行中…" : "執行並保存"}
            </Button>
          </div>
        </form>
      </section>

      <section aria-labelledby="experiments-title">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 id="experiments-title" className="text-lg font-semibold">
              {isAdmin ? "最近實驗" : "我的實驗"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              比較冷啟動、目前線上模型與候選模型在同一留出資料上的誤差。
            </p>
          </div>
        </div>

        {initialOverview.experiments.length === 0 ? (
          <div className="rounded-xl border border-dashed bg-background px-5 py-10 text-center">
            <p className="font-medium">還沒有實驗</p>
            <p className="mt-1 text-sm text-muted-foreground">
              使用上面的預設參數跑第一個可重現基準。
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border bg-background">
            {initialOverview.experiments.map((experiment, index) => {
              const improvement = percentImprovement(experiment);
              const canPromote =
                isAdmin &&
                experiment.status === "candidate" &&
                experiment.routeScope === null &&
                experiment.shouldPromote;
              const canRollback = isAdmin && experiment.status === "retired";
              return (
                <article
                  key={experiment.id}
                  className={index === 0 ? "p-5 sm:p-6" : "border-t p-5 sm:p-6"}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">
                          {experiment.parameters.label || "未命名實驗"}
                        </h3>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {experiment.routeScope
                            ? `${experiment.routeScope} 號線`
                            : "全部路線"}
                        </span>
                        {experiment.runKind === "automated" && (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                            定期候選
                          </span>
                        )}
                        {experiment.status === "champion" && (
                          <span className="rounded-full bg-[#5b2a73]/10 px-2 py-0.5 text-xs font-medium text-[#5b2a73] dark:text-purple-200">
                            線上版本
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {experiment.authorName} ·{" "}
                        {new Date(experiment.createdAt).toLocaleString("zh-HK")}
                      </p>
                    </div>
                    {canPromote && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 border-[#5b2a73]/30 text-[#5b2a73]"
                        disabled={promotingId === experiment.id}
                        onClick={() => promote(experiment.id)}
                      >
                        {promotingId === experiment.id
                          ? "提升中…"
                          : "提升為線上模型"}
                      </Button>
                    )}
                    {canRollback && (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-9 border-[#5b2a73]/30 text-[#5b2a73]"
                        disabled={promotingId === experiment.id}
                        onClick={() => rollback(experiment.id)}
                      >
                        {promotingId === experiment.id
                          ? "回退中…"
                          : "回退到此版本"}
                      </Button>
                    )}
                  </div>

                  <dl className="mt-5 grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-5">
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        原始 MAE
                      </dt>
                      <dd className="mt-1 font-semibold tabular-nums">
                        {minutes(experiment.baselineMaeSeconds)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        線上 MAE
                      </dt>
                      <dd className="mt-1 font-semibold tabular-nums">
                        {minutes(experiment.championMaeSeconds)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        候選 MAE
                      </dt>
                      <dd className="mt-1 font-semibold tabular-nums">
                        {minutes(experiment.candidateMaeSeconds)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">改善</dt>
                      <dd className="mt-1 flex items-center gap-1 font-semibold tabular-nums">
                        {improvement === null ? (
                          "—"
                        ) : (
                          <>
                            {improvement > 0 && (
                              <ArrowDownRightIcon
                                className="size-4 text-emerald-700"
                                aria-hidden="true"
                              />
                            )}
                            {improvement.toFixed(1)}%
                          </>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">
                        驗證事件
                      </dt>
                      <dd className="mt-1 font-semibold tabular-nums">
                        {experiment.validationEventCount}
                      </dd>
                    </div>
                  </dl>
                  <p className="mt-4 border-t pt-4 text-xs leading-5 text-muted-foreground">
                    {experiment.sourceObservationCount.toLocaleString()} 條回報
                    · {experiment.trainingEventCount.toLocaleString()}{" "}
                    個訓練事件 · P90 {minutes(experiment.candidateP90Seconds)}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
