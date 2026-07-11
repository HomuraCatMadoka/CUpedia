"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { layoutCanvas } from "@/lib/course-tree/layout-canvas";
import type {
  CategoryProgress,
  CourseNode,
  MajorListItem,
  MajorTree,
} from "@/lib/course-tree/types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  required: "必修",
  "one-of": "多选一",
  basket: "选修篮子",
};

// 一句话进度短语,供类目进度摘要复用。
function progressText(p: CategoryProgress): string {
  if (p.satisfied) return "已满 ✓";
  if (p.remainingKind === "courses") return `还差 ${p.remaining} 门`;
  if (p.remainingKind === "units") return `还差 ${p.remaining} 学分`;
  return `已选 ${p.litCount} 门`;
}

// 拓扑层的中文列名:根课回退到课号首位数字,故 1..4 恰好是「N 年级级课」,更深层顺延。
function levelLabel(level: number): string {
  if (level >= 1 && level <= 4) return `${level}000 级课`;
  return `第 ${level} 层`;
}

const TERM_ZH: Record<string, string> = { T1: "秋", T2: "春" };
function termsText(terms: string[]): string {
  const zh = terms.map((t) => TERM_ZH[t] ?? t);
  return zh.length ? zh.join(" / ") : "—";
}

/** 一条已测量的先修边:几何(d/终点)与端点课号;hot 由渲染时的 lit 派生,不入测量。 */
type EdgePath = { from: string; to: string; d: string; x2: number; y2: number };

/** 悬浮详情面板锚点:节点视口坐标(position:fixed)。 */
type Hover = {
  node: CourseNode;
  cat: string | null;
  left: number;
  top: number;
};

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
      setResult({ id: majorId, tree: t });
      setLit(new Set());
    });
    return () => {
      active = false;
    };
  }, [majorId]);

  const loading = result?.id !== majorId;
  const tree = loading ? null : result!.tree;

  const progress = useMemo(
    () => (tree ? evaluateBuild(tree, lit) : null),
    [tree, lit],
  );
  const layout = useMemo(() => (tree ? layoutCanvas(tree) : null), [tree]);
  // 课号 → 所属类目名(画布分列不按类目,详情面板补回类目上下文)。
  const codeToCat = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of tree?.groups ?? []) {
      for (const n of g.nodes) if (!m.has(n.code)) m.set(n.code, g.name);
    }
    return m;
  }, [tree]);

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

      {!loading && tree && progress && layout && (
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

          {/* 类目进度摘要:画布按拓扑层分列,类目在此汇成软进度(非硬校验)。 */}
          <div className="flex flex-wrap gap-2">
            {progress.categories.map((gp) => (
              <div
                key={gp.id}
                data-testid="category-group"
                className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
              >
                <span className="font-medium">{gp.name}</span>
                <Badge variant="secondary" className="text-[11px]">
                  {KIND_LABEL[gp.kind] ?? gp.kind}
                </Badge>
                <Badge
                  variant={gp.satisfied ? "default" : "outline"}
                  data-testid="category-progress"
                >
                  {progressText(gp)}
                </Badge>
              </div>
            ))}
          </div>

          <CourseCanvas
            layout={layout}
            lit={lit}
            codeToCat={codeToCat}
            onToggle={toggle}
          />
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

function CourseCanvas({
  layout,
  lit,
  codeToCat,
  onToggle,
}: {
  layout: ReturnType<typeof layoutCanvas>;
  lit: Set<string>;
  codeToCat: Map<string, string>;
  onToggle: (code: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [paths, setPaths] = useState<EdgePath[]>([]);
  const [size, setSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [hover, setHover] = useState<Hover | null>(null);

  // 测量先修边:节点右缘中点 → 目标左缘中点,贝塞尔;坐标相对 stage(与列同滚动,
  // 故 rect 之差 = 内容坐标,横向滚动不影响)。仅在布局变化 / 容器尺寸变化时重测,
  // 点亮只切 hot 样式不改几何,无需重测。
  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const sr = stage.getBoundingClientRect();
      const next: EdgePath[] = [];
      for (const e of layout.edges) {
        const a = nodeRefs.current.get(e.from);
        const b = nodeRefs.current.get(e.to);
        if (!a || !b) continue;
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        const x1 = ar.right - sr.left;
        const y1 = ar.top + ar.height / 2 - sr.top;
        const x2 = br.left - sr.left;
        const y2 = br.top + br.height / 2 - sr.top;
        const dx = Math.max(40, x2 - x1);
        const c1 = x1 + dx * 0.5;
        const c2 = x2 - dx * 0.5;
        next.push({
          from: e.from,
          to: e.to,
          d: `M${x1} ${y1} C ${c1} ${y1} ${c2} ${y2} ${x2} ${y2}`,
          x2,
          y2,
        });
      }
      setPaths(next);
      setSize({ w: stage.scrollWidth, h: stage.scrollHeight });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(stage);
    return () => ro.disconnect();
  }, [layout]);

  function bindNode(code: string, el: HTMLButtonElement | null) {
    if (el) nodeRefs.current.set(code, el);
    else nodeRefs.current.delete(code);
  }

  function openTip(node: CourseNode, el: HTMLElement) {
    const r = el.getBoundingClientRect();
    setHover({
      node,
      cat: codeToCat.get(node.code) ?? null,
      left: r.left + r.width / 2,
      top: r.top,
    });
  }

  return (
    <div className="relative overflow-x-auto rounded-lg border bg-muted/20 p-1">
      <div
        ref={stageRef}
        className="relative inline-flex min-w-full gap-10 p-4"
      >
        <svg
          data-testid="prereq-edges"
          className="pointer-events-none absolute left-0 top-0 overflow-visible"
          width={size.w}
          height={size.h}
          aria-hidden="true"
        >
          {paths.map((p) => {
            const hot = lit.has(p.from);
            return (
              <g key={`${p.from}->${p.to}`}>
                <path
                  data-testid="prereq-edge"
                  data-from={p.from}
                  data-to={p.to}
                  data-hot={hot}
                  d={p.d}
                  fill="none"
                  className={cn(
                    "transition-colors",
                    hot ? "stroke-primary" : "stroke-border",
                  )}
                  strokeWidth={hot ? 2 : 1.5}
                />
                <circle
                  cx={p.x2}
                  cy={p.y2}
                  r={hot ? 3 : 2.2}
                  className={cn(hot ? "fill-primary" : "fill-border")}
                />
              </g>
            );
          })}
        </svg>

        {layout.columns.map((col) => (
          <div
            key={col.level}
            data-testid="tree-column"
            data-level={col.level}
            className="relative z-10 flex flex-col gap-3"
          >
            <div className="text-xs font-medium text-muted-foreground">
              {levelLabel(col.level)}
            </div>
            {col.nodes.map((node) => {
              const isLit = lit.has(node.code);
              return (
                <button
                  key={node.code}
                  ref={(el) => bindNode(node.code, el)}
                  type="button"
                  data-testid="course-node"
                  data-code={node.code}
                  data-lit={isLit}
                  aria-pressed={isLit}
                  disabled={node.missing}
                  title={
                    node.missing
                      ? "课程详情缺失(骨架占位)"
                      : node.description || `${node.title} · ${node.units} 学分`
                  }
                  onClick={() => onToggle(node.code)}
                  onMouseEnter={(e) =>
                    !node.missing && openTip(node, e.currentTarget)
                  }
                  onMouseLeave={() => setHover(null)}
                  onFocus={(e) =>
                    !node.missing && openTip(node, e.currentTarget)
                  }
                  onBlur={() => setHover(null)}
                  className={cn(
                    "flex w-52 flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors",
                    isLit
                      ? "border-primary bg-primary/10"
                      : "bg-card hover:border-foreground/40",
                    node.missing &&
                      "cursor-not-allowed border-dashed opacity-50",
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {node.code}
                    </span>
                    <span className="flex items-center gap-1">
                      <Badge variant="secondary" className="tabular-nums">
                        {node.units}
                      </Badge>
                      {/* 常驻勾:仅透明度切换,不改布局(免边重测)。 */}
                      <svg
                        viewBox="0 0 24 24"
                        className={cn(
                          "size-3.5 text-primary transition-opacity",
                          isLit ? "opacity-100" : "opacity-0",
                        )}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </span>
                  </span>
                  <span className="line-clamp-2 text-sm">
                    {node.missing ? "(暂无课程详情)" : node.title}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {hover && (
        <div
          role="tooltip"
          data-testid="course-tip"
          className="pointer-events-none fixed z-50 w-64 -translate-x-1/2 -translate-y-full rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
          style={{ left: hover.left, top: hover.top - 8 }}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono">{hover.node.code}</span>
            <span className="tabular-nums text-muted-foreground">
              {hover.node.units} 学分
            </span>
          </div>
          <div className="mt-0.5 font-medium">{hover.node.title}</div>
          <div className="mt-1 text-muted-foreground">
            {hover.cat ? `${hover.cat} · ` : ""}开课{" "}
            {termsText(hover.node.terms)}
          </div>
          {hover.node.prereqCodes.length > 0 && (
            <div className="mt-1">
              先修:{hover.node.prereqCodes.join(" / ")}
            </div>
          )}
          {hover.node.prereqNote && (
            <div className="mt-1 text-muted-foreground">
              {hover.node.prereqNote}
            </div>
          )}
          {hover.node.description && (
            <div className="mt-1 line-clamp-3 text-muted-foreground">
              {hover.node.description}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
