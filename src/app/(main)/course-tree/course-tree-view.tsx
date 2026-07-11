"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

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
import {
  listMyBuilds,
  loadBuild,
  saveBuild,
  type BuildSummary,
  type SavedBuild,
} from "@/lib/build-actions";
import { evaluateBuild } from "@/lib/course-tree/evaluate-build";
import { layoutCanvas } from "@/lib/course-tree/layout-canvas";
import type {
  BuildEvaluation,
  BuildItem,
  CategoryProgress,
  CourseNode,
  EquivalenceGroup,
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

function violationText(violation: BuildEvaluation["violations"][number]) {
  if (violation.type === "season") return "该课程不在当前季节开课";
  if (violation.type === "term-cap")
    return `本学期将达到 ${violation.units} 学分，超过上限 ${violation.cap}`;
  if (violation.type === "prerequisite")
    return `请先在更早学期修读 ${violation.required.join(" 或 ")}`;
  return `等价课程只能选择一门：${violation.codes.join(" / ")}`;
}

const TERM_COLORS = [
  "border-blue-500 bg-blue-100 dark:bg-blue-950/40",
  "border-emerald-500 bg-emerald-100 dark:bg-emerald-950/40",
  "border-violet-500 bg-violet-100 dark:bg-violet-950/40",
  "border-orange-500 bg-orange-100 dark:bg-orange-950/40",
  "border-cyan-500 bg-cyan-100 dark:bg-cyan-950/40",
  "border-rose-500 bg-rose-100 dark:bg-rose-950/40",
  "border-lime-500 bg-lime-100 dark:bg-lime-950/40",
  "border-fuchsia-500 bg-fuchsia-100 dark:bg-fuchsia-950/40",
];

function termColor(term?: number) {
  return term
    ? TERM_COLORS[(term - 1) % TERM_COLORS.length]
    : "border-primary bg-primary/10";
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

export function CourseTreeView({
  majors,
  isAuthenticated,
}: {
  majors: MajorListItem[];
  isAuthenticated: boolean;
}) {
  const years = useMemo(
    () =>
      [...new Set(majors.map((major) => major.handbookYear))].sort().reverse(),
    [majors],
  );
  const [selectedYear, setSelectedYear] = useState(years[0] ?? "");
  const visibleMajors = useMemo(
    () => majors.filter((major) => major.handbookYear === selectedYear),
    [majors, selectedYear],
  );
  const [majorId, setMajorId] = useState<string>(
    majors.find((major) => major.handbookYear === years[0])?.id ?? "",
  );
  // 最近一次已解析的拉取结果(连同其对应的 majorId);tree=null 表示该主修加载失败。
  const [result, setResult] = useState<{
    id: string;
    tree: MajorTree | null;
  } | null>(null);
  // 已点亮的课号(自由模式本地状态,不落库;切换主修即清空)。
  const [lit, setLit] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"free" | "strict">("free");
  const [activeTerm, setActiveTerm] = useState(1);
  const [termUnitCap, setTermUnitCap] = useState(18);
  const [strictItems, setStrictItems] = useState<BuildItem[]>([]);
  const [feedback, setFeedback] = useState("");
  const [buildName, setBuildName] = useState("我的构筑");
  const [savedBuilds, setSavedBuilds] = useState<BuildSummary[]>([]);
  const [saveStatus, setSaveStatus] = useState("");
  const pendingBuild = useRef<SavedBuild | null>(null);

  const applySavedBuild = useCallback((build: SavedBuild) => {
    setMode(build.mode);
    setBuildName(build.name);
    setLit(new Set(build.items.map((item) => item.code)));
    setStrictItems(
      build.mode === "strict"
        ? build.items.map((item) => ({
            code: item.code,
            term: item.term!,
          }))
        : [],
    );
    setFeedback("");
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return;
    listMyBuilds().then(setSavedBuilds);
  }, [isAuthenticated]);

  useEffect(() => {
    if (!majorId) return;
    let active = true;
    getMajorTree(majorId).then((t) => {
      if (!active) return;
      setResult({ id: majorId, tree: t });
      const pending = pendingBuild.current;
      if (pending?.majorId === majorId) {
        applySavedBuild(pending);
        pendingBuild.current = null;
      } else {
        setLit(new Set());
        setStrictItems([]);
        setFeedback("");
      }
    });
    return () => {
      active = false;
    };
  }, [applySavedBuild, majorId]);

  const loading = result?.id !== majorId;
  const tree = loading ? null : result!.tree;

  const progress = useMemo(
    () =>
      tree
        ? evaluateBuild(tree, mode === "strict" ? strictItems : lit, mode, {
            termUnitCap,
          })
        : null,
    [tree, lit, mode, strictItems, termUnitCap],
  );
  const currentLit = useMemo(
    () =>
      mode === "strict" ? new Set(strictItems.map((item) => item.code)) : lit,
    [lit, mode, strictItems],
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
  // 课号 → 所属等价组(#165:多选一互斥簇);一门课至多归一组。
  const codeToGroup = useMemo(() => {
    const m = new Map<string, EquivalenceGroup>();
    for (const g of tree?.equivalenceGroups ?? []) {
      for (const c of g.codes) if (!m.has(c)) m.set(c, g);
    }
    return m;
  }, [tree]);

  function toggle(code: string) {
    if (mode === "strict" && tree) {
      const exists = strictItems.some((item) => item.code === code);
      if (exists) {
        setStrictItems((items) => items.filter((item) => item.code !== code));
        setFeedback("");
        return;
      }
      const candidate = [...strictItems, { code, term: activeTerm }];
      const checked = evaluateBuild(tree, candidate, "strict", { termUnitCap });
      if (checked.violations.length) {
        setFeedback(violationText(checked.violations[0]));
        return;
      }
      setStrictItems(candidate);
      setFeedback(checked.warnings[0]?.message ?? "");
      return;
    }
    setLit((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  async function handleSave() {
    if (!tree) return;
    setSaveStatus("保存中…");
    try {
      await saveBuild({
        majorId: tree.majorId,
        name: buildName,
        mode,
        items:
          mode === "strict"
            ? strictItems
            : [...lit].map((code) => ({ code, term: null })),
      });
      setSavedBuilds(await listMyBuilds());
      setSaveStatus("已保存");
    } catch {
      setSaveStatus("保存失败，请稍后再试");
    }
  }

  async function handleLoad(id: string) {
    if (!id) return;
    const build = await loadBuild(id);
    if (!build) {
      setSaveStatus("无法加载该构筑");
      return;
    }
    if (build.majorId === majorId) applySavedBuild(build);
    else {
      pendingBuild.current = build;
      const target = majors.find((major) => major.id === build.majorId);
      if (target) setSelectedYear(target.handbookYear);
      setMajorId(build.majorId);
    }
    setSaveStatus("已载入");
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
        <div className="flex flex-wrap gap-3">
          <div className="space-y-2">
            <Label>入学年份</Label>
            <select
              data-testid="handbook-year-select"
              value={selectedYear}
              onChange={(event) => {
                const year = event.target.value;
                setSelectedYear(year);
                setMajorId(
                  majors.find((major) => major.handbookYear === year)?.id ?? "",
                );
              }}
              className="h-9 rounded-md border bg-background px-3 text-sm"
            >
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>主修</Label>
            <Select
              items={majorItems}
              value={majorId}
              onValueChange={(v) => v && setMajorId(v)}
            >
              <SelectTrigger
                className="w-full sm:w-80"
                data-testid="major-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {visibleMajors.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-2">
          <Label>模式</Label>
          <div className="flex rounded-md border p-1" data-testid="mode-switch">
            {(["free", "strict"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setFeedback("");
                }}
                className={cn(
                  "rounded px-3 py-1.5 text-sm",
                  mode === value && "bg-primary text-primary-foreground",
                )}
              >
                {value === "free" ? "自由模式" : "严格模式"}
              </button>
            ))}
          </div>
        </div>
        {mode === "strict" && tree && (
          <>
            <div className="space-y-2">
              <Label htmlFor="active-term">当前学期</Label>
              <select
                id="active-term"
                data-testid="active-term"
                value={activeTerm}
                onChange={(event) => setActiveTerm(Number(event.target.value))}
                className="h-9 rounded-md border bg-background px-3 text-sm"
              >
                {Array.from(
                  { length: (tree.normativeYears ?? 4) * 2 },
                  (_, index) => {
                    const term = index + 1;
                    return (
                      <option key={term} value={term}>
                        大{Math.ceil(term / 2)}
                        {term % 2 ? "上" : "下"}
                      </option>
                    );
                  },
                )}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="term-cap">每学期学分上限</Label>
              <input
                id="term-cap"
                data-testid="term-cap"
                type="number"
                min={1}
                value={termUnitCap}
                onChange={(event) => setTermUnitCap(Number(event.target.value))}
                className="h-9 w-24 rounded-md border bg-background px-3 text-sm"
              />
            </div>
          </>
        )}
      </div>

      {feedback && (
        <p
          className="text-sm text-amber-700"
          role="alert"
          data-testid="strict-feedback"
        >
          {feedback}
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3 rounded-md border p-3">
        {isAuthenticated ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="build-name">构筑名称</Label>
              <input
                id="build-name"
                data-testid="build-name"
                value={buildName}
                maxLength={80}
                onChange={(event) => setBuildName(event.target.value)}
                className="h-9 w-56 rounded-md border bg-background px-3 text-sm"
              />
            </div>
            <button
              type="button"
              data-testid="save-build"
              onClick={handleSave}
              className="h-9 rounded-md bg-primary px-4 text-sm text-primary-foreground"
            >
              保存构筑
            </button>
            {savedBuilds.length > 0 && (
              <div className="space-y-2">
                <Label htmlFor="saved-builds">我的构筑</Label>
                <select
                  id="saved-builds"
                  data-testid="saved-builds"
                  defaultValue=""
                  onChange={(event) => handleLoad(event.target.value)}
                  className="h-9 w-56 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="" disabled>
                    选择要载入的构筑
                  </option>
                  {savedBuilds.map((build) => (
                    <option key={build.id} value={build.id}>
                      {build.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </>
        ) : (
          <a
            href="/login"
            data-testid="login-to-save"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            登录后保存构筑
          </a>
        )}
        {saveStatus && (
          <span className="text-sm text-muted-foreground" role="status">
            {saveStatus}
          </span>
        )}
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
              {progress.complete && (
                <Badge data-testid="tree-complete">整棵树已点亮 ✓</Badge>
              )}
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
            lit={currentLit}
            termByCode={
              new Map(strictItems.map((item) => [item.code, item.term]))
            }
            codeToCat={codeToCat}
            codeToGroup={codeToGroup}
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

/** 一列里的一格:单节点,或一整个等价组「多选一」簇(同列成员聚在一起)。 */
type CanvasCell = { group: EquivalenceGroup | null; nodes: CourseNode[] };

/** 把一列节点摊成格子:等价组同列成员并进一格,其余各自成格(保持首次出现顺序)。 */
function columnCells(
  nodes: CourseNode[],
  codeToGroup: Map<string, EquivalenceGroup>,
): CanvasCell[] {
  const cells: CanvasCell[] = [];
  const groupCell = new Map<string, number>();
  for (const node of nodes) {
    const g = codeToGroup.get(node.code);
    if (g) {
      const key = g.categoryId + ":" + g.codes.join(",");
      const at = groupCell.get(key);
      if (at != null) cells[at].nodes.push(node);
      else {
        groupCell.set(key, cells.length);
        cells.push({ group: g, nodes: [node] });
      }
    } else {
      cells.push({ group: null, nodes: [node] });
    }
  }
  return cells;
}

function CourseCanvas({
  layout,
  lit,
  termByCode,
  codeToCat,
  codeToGroup,
  onToggle,
}: {
  layout: ReturnType<typeof layoutCanvas>;
  lit: Set<string>;
  termByCode: Map<string, number>;
  codeToCat: Map<string, string>;
  codeToGroup: Map<string, EquivalenceGroup>;
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

  function renderNode(node: CourseNode) {
    const isLit = lit.has(node.code);
    const group = codeToGroup.get(node.code);
    // 多选一硬锁:同组已有别的成员点亮 → 本节点置灰不可选(取消那门才恢复)。
    const blocked =
      !isLit &&
      !!group &&
      group.codes.some((c) => c !== node.code && lit.has(c));
    const disabled = node.missing || blocked;
    const term = termByCode.get(node.code);
    return (
      <button
        key={node.code}
        ref={(el) => bindNode(node.code, el)}
        type="button"
        data-testid="course-node"
        data-code={node.code}
        data-lit={isLit}
        data-blocked={blocked}
        data-term={term}
        aria-pressed={isLit}
        disabled={disabled}
        title={
          node.missing
            ? "课程详情缺失(骨架占位)"
            : blocked
              ? "与同组已选课程互斥(多选一);取消那门后可选"
              : node.description || `${node.title} · ${node.units} 学分`
        }
        onClick={() => onToggle(node.code)}
        onMouseEnter={(e) => !node.missing && openTip(node, e.currentTarget)}
        onMouseLeave={() => setHover(null)}
        onFocus={(e) => !node.missing && openTip(node, e.currentTarget)}
        onBlur={() => setHover(null)}
        className={cn(
          "flex w-52 flex-col gap-1 rounded-md border px-3 py-2 text-left transition-colors",
          isLit ? termColor(term) : "bg-card hover:border-foreground/40",
          node.missing && "cursor-not-allowed border-dashed opacity-50",
          blocked && "cursor-not-allowed opacity-40",
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
            // 先修满足:源课点亮,或其等价组内任一成员点亮(#165「点组内任一即满足」)。
            const g = codeToGroup.get(p.from);
            const hot = g ? g.codes.some((c) => lit.has(c)) : lit.has(p.from);
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
            {columnCells(col.nodes, codeToGroup).map((cell, i) =>
              cell.group ? (
                <div
                  key={`g:${cell.group.categoryId}:${cell.group.codes.join(",")}:${i}`}
                  data-testid="equiv-group"
                  data-codes={cell.group.codes.join(",")}
                  data-oversized={cell.group.oversized}
                  className="flex flex-col gap-2 rounded-lg border border-dashed border-amber-400/60 bg-amber-50/40 p-2 dark:border-amber-500/40 dark:bg-amber-950/20"
                >
                  <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">
                    多选一 · {cell.group.codes.length} 选 1
                    {cell.group.oversized && " · 待复核"}
                  </span>
                  {cell.nodes.map(renderNode)}
                </div>
              ) : (
                renderNode(cell.nodes[0])
              ),
            )}
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
