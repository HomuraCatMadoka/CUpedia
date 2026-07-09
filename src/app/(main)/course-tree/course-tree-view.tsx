"use client";

import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getMajorTree } from "@/lib/course-actions";
import { evaluateBuild } from "@/lib/course-tree/evaluate-build";
import type {
  CategoryProgress,
  MajorListItem,
  MajorTree,
} from "@/lib/course-tree/types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  required: "必修",
  "one-of": "多选一",
  basket: "选修篮子",
};

// 一句话进度短语,供类目头与顶部复用。
function progressText(p: CategoryProgress): string {
  if (p.satisfied) return "已满 ✓";
  if (p.remainingKind === "courses") return `还差 ${p.remaining} 门`;
  if (p.remainingKind === "units") return `还差 ${p.remaining} 学分`;
  return `已选 ${p.litCount} 门`;
}

export function CourseTreeView({ majors }: { majors: MajorListItem[] }) {
  const [majorId, setMajorId] = useState<string>(majors[0]?.id ?? "");
  // 最近一次已解析的拉取结果(连同其对应的 majorId);tree=null 表示该主修加载失败。
  const [result, setResult] = useState<{
    id: string;
    tree: MajorTree | null;
  } | null>(null);
  // 已点亮的课号(自由模式本地状态,不落库;切换主修即清空)。
  const [lit, setLit] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!majorId) return;
    let active = true;
    getMajorTree(majorId).then((t) => {
      if (!active) return;
      // 全部 setState 落在异步 .then 内,避免在 effect 里同步 setState 触发级联渲染。
      setResult({ id: majorId, tree: t });
      setLit(new Set());
    });
    return () => {
      active = false;
    };
  }, [majorId]);

  // loading / tree / error 三态从「已解析结果是否对应当前 majorId」派生,无需同步 setState。
  const loading = result?.id !== majorId;
  const tree = loading ? null : result!.tree;

  const progress = useMemo(
    () => (tree ? evaluateBuild(tree, lit) : null),
    [tree, lit],
  );
  const progressById = useMemo(
    () => new Map((progress?.categories ?? []).map((c) => [c.id, c])),
    [progress],
  );

  function toggle(code: string) {
    setLit((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  const majorItems: Record<string, string> = Object.fromEntries(
    majors.map((m) => [m.id, m.name]),
  );

  if (majors.length === 0) {
    return (
      <p className="text-muted-foreground" data-testid="course-tree-empty">
        暂无可选主修数据。
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Label>主修</Label>
        <Select
          items={majorItems}
          value={majorId}
          onValueChange={(v) => v && setMajorId(v)}
        >
          <SelectTrigger className="w-full sm:w-80" data-testid="major-select">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {majors.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.name}
                {m.handbookYear ? ` · ${m.handbookYear}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {loading && (
        <p className="text-muted-foreground" data-testid="course-tree-loading">
          加载中…
        </p>
      )}

      {!loading && tree && progress && (
        <>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-2 py-4">
              <span className="font-medium">总学分</span>
              <span
                className="text-lg font-semibold tabular-nums"
                data-testid="total-units"
              >
                {progress.totalLitUnits}
                {progress.totalUnits != null ? ` / ${progress.totalUnits}` : ""}
              </span>
            </CardContent>
          </Card>

          {tree.groups.map((group) => {
            const gp = progressById.get(group.id);
            return (
              <Card key={group.id} data-testid="category-group">
                <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    {group.name}
                    <Badge variant="secondary">
                      {KIND_LABEL[group.kind] ?? group.kind}
                    </Badge>
                  </CardTitle>
                  {gp && (
                    <Badge
                      variant={gp.satisfied ? "default" : "outline"}
                      data-testid="category-progress"
                    >
                      {progressText(gp)}
                    </Badge>
                  )}
                </CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  {group.nodes.map((node) => {
                    const isLit = lit.has(node.code);
                    return (
                      <button
                        key={node.code}
                        type="button"
                        data-testid="course-node"
                        data-code={node.code}
                        data-lit={isLit}
                        aria-pressed={isLit}
                        disabled={node.missing}
                        title={
                          node.missing
                            ? "课程详情缺失(骨架占位)"
                            : node.description ||
                              `${node.title} · ${node.units} 学分`
                        }
                        onClick={() => toggle(node.code)}
                        className={cn(
                          "flex max-w-[16rem] flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left transition-colors",
                          isLit
                            ? "border-primary bg-primary/10"
                            : "hover:border-foreground/40",
                          node.missing &&
                            "cursor-not-allowed border-dashed opacity-50",
                        )}
                      >
                        <span className="flex w-full items-center justify-between gap-2">
                          <span className="font-mono text-xs text-muted-foreground">
                            {node.code}
                          </span>
                          <Badge variant="secondary" className="tabular-nums">
                            {node.units}
                          </Badge>
                        </span>
                        <span className="line-clamp-2 text-sm">
                          {node.missing ? "(暂无课程详情)" : node.title}
                        </span>
                      </button>
                    );
                  })}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}

      {!loading && tree === null && (
        <p className="text-muted-foreground" data-testid="course-tree-error">
          无法加载该主修的课程树,请稍后再试。
        </p>
      )}
    </div>
  );
}
