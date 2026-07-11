"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AVOID_FACTORS,
  MAJOR_GROUPS,
  SCORED_FACTORS,
  type AvoidFactor,
  type MajorGroup,
  type ScoredFactor,
} from "@/lib/college-picker/data";
import {
  computeWeights,
  recommend,
  validatePriorities,
  type ScoredCollege,
  type SmallCollegePreference,
} from "@/lib/college-picker/recommend";

// base-ui Select 需要 items 映射，SelectValue 才显示中文标签而非原始值。
const MAJOR_ITEMS: Record<string, string> = Object.fromEntries(
  MAJOR_GROUPS.map((m) => [m.id, m.nameZh]),
);
// 留空选项：「-」代表不填。
const EMPTY_VALUE = "__none__";
const EMPTY_LABEL = "—（不填）";
const FACTOR_ITEMS: Record<string, string> = Object.fromEntries([
  [EMPTY_VALUE, EMPTY_LABEL],
  ...SCORED_FACTORS.map((f) => [f.id, f.nameZh]),
]);

const PREFERENCE_OPTIONS: {
  id: SmallCollegePreference;
  label: string;
  desc: string;
}[] = [
  { id: "aim", label: "A. 冲！", desc: "第一志愿强制为小书院" },
  { id: "avoid", label: "B. 完全不想去", desc: "三所小书院排到第 7–9 志愿" },
  { id: "indifferent", label: "C. 无所谓", desc: "按默认机制运行分院帽" },
];

// 沿用原版默认预选：专业默认第一个、三个因素预选 通勤 / 住宿 / 保宿。
const DEFAULT_PRIORITIES: [ScoredFactor, ScoredFactor | "", ScoredFactor | ""] =
  ["Commute_Time", "Accommodation_Environment", "Hostel_Guarantee"];

/** Select 内部用 EMPTY_VALUE 表示空位，外部统一转成 ""。 */
function fromSelectValue(v: string): ScoredFactor | "" {
  return v === EMPTY_VALUE ? "" : (v as ScoredFactor);
}
function toSelectValue(v: ScoredFactor | ""): string {
  return v === "" ? EMPTY_VALUE : v;
}

function StepHeading({ number, title }: { number: string; title: string }) {
  return (
    <div className="flex items-baseline gap-2 text-sm font-medium">
      <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
        {number}
      </span>
      <span>{title}</span>
    </div>
  );
}

export function CollegePickerForm() {
  const [majorGroup, setMajorGroup] = useState<MajorGroup>(MAJOR_GROUPS[0].id);
  const [priorities, setPriorities] =
    useState<[ScoredFactor, ScoredFactor | "", ScoredFactor | ""]>(
      DEFAULT_PRIORITIES,
    );
  const [avoids, setAvoids] = useState<AvoidFactor[]>([]);
  const [preference, setPreference] =
    useState<SmallCollegePreference>("indifferent");
  const [result, setResult] = useState<ScoredCollege[] | null>(null);
  const [error, setError] = useState<string>("");
  const resultRef = useRef<HTMLDivElement>(null);

  // 出结果后跳到结果区并聚焦：长表单下结果在折叠线以下，焦点跟随也让屏幕阅读器读到。
  useEffect(() => {
    if (!result) return;
    const el = resultRef.current;
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    el?.focus({ preventScroll: true });
  }, [result]);

  // 当前填写的权重（等比放大到合计 10），供 UI 提示。
  const weights = computeWeights(priorities);
  const weightLabels = [
    `第一看重（×${weights[0]}）`,
    `第二看重（×${weights[1]}${priorities[1] === "" ? "·可留空" : ""}）`,
    `第三看重（×${weights[2]}${priorities[2] === "" ? "·可留空" : ""}）`,
  ];

  function reset() {
    setResult(null);
    setError("");
  }

  function setPriority(index: number, value: ScoredFactor | "") {
    setPriorities((prev) => {
      const next = [...prev] as [
        ScoredFactor,
        ScoredFactor | "",
        ScoredFactor | "",
      ];
      next[index] = value;
      // 选空时维持「不跳位」不变量：第 2 留空则强制第 3 也留空。
      if (index === 1 && value === "") next[2] = "";
      return next;
    });
    reset();
  }

  function toggleAvoid(factor: AvoidFactor, checked: boolean) {
    setAvoids((prev) =>
      checked ? [...prev, factor] : prev.filter((a) => a !== factor),
    );
    reset();
  }

  function handleRecommend() {
    const check = validatePriorities(priorities);
    if (!check.ok) {
      setResult(null);
      setError(check.message);
      return;
    }
    setError("");
    setResult(
      recommend({
        majorGroup,
        priorities,
        avoids,
        smallCollegePreference: preference,
      }),
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>选择你的情况</CardTitle>
        </CardHeader>
        <CardContent className="space-y-0">
          <div className="space-y-3 border-b pb-6">
            <StepHeading number="01" title="是否至少冲一个小书院" />
            <p className="text-xs text-muted-foreground">
              善衡、敬文、晨兴三所小书院的志愿偏好。
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {PREFERENCE_OPTIONS.map((opt) => (
                <Label
                  key={opt.id}
                  className="flex cursor-pointer flex-col items-start gap-1 rounded-md border p-3 font-normal text-foreground has-[:checked]:border-foreground has-[:checked]:bg-muted/50"
                  data-testid={`preference-${opt.id}`}
                >
                  <input
                    type="radio"
                    name="small-college-preference"
                    value={opt.id}
                    checked={preference === opt.id}
                    onChange={() => {
                      setPreference(opt.id);
                      reset();
                    }}
                    className="sr-only"
                  />
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">
                    {opt.desc}
                  </span>
                </Label>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-b py-6">
            <StepHeading number="02" title="专业大类" />
            <Select
              items={MAJOR_ITEMS}
              value={majorGroup}
              onValueChange={(v) => {
                if (v) setMajorGroup(v as MajorGroup);
                reset();
              }}
            >
              <SelectTrigger
                id="major-group"
                aria-label="专业大类"
                className="w-full sm:w-64"
                data-testid="major-select"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MAJOR_GROUPS.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nameZh}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3 border-b py-6">
            <StepHeading number="03" title="最看重的三个因素" />
            <p className="text-xs text-muted-foreground">
              权重按填写情况等比放大至合计 10，三个选项不可重复。
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {priorities.map((factor, index) => (
                <div key={index} className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">
                    {weightLabels[index]}
                  </span>
                  <Select
                    items={FACTOR_ITEMS}
                    value={toSelectValue(factor)}
                    onValueChange={(v) =>
                      setPriority(index, fromSelectValue(v ?? ""))
                    }
                  >
                    <SelectTrigger data-testid={`priority-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {/* 第 1 看重点必填，不放留空选项 */}
                      {index > 0 && (
                        <SelectItem value={EMPTY_VALUE}>
                          {EMPTY_LABEL}
                        </SelectItem>
                      )}
                      {SCORED_FACTORS.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nameZh}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-b py-6">
            <StepHeading number="04" title="想避开的因素" />
            <p className="text-xs text-muted-foreground">
              可选，命中的书院仍会显示，但会被压到志愿末尾。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {AVOID_FACTORS.map((f) => {
                const hit = avoids.includes(f.id);
                return (
                  <Label
                    key={f.id}
                    className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 font-normal transition-colors ${
                      hit
                        ? "border-destructive/30 bg-destructive/10 text-destructive"
                        : "border-transparent text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <Checkbox
                      checked={hit}
                      onCheckedChange={(checked) =>
                        toggleAvoid(f.id, checked === true)
                      }
                      data-testid={`avoid-${f.id}`}
                    />
                    {f.nameZh}
                  </Label>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col items-stretch justify-between gap-3 pt-6 sm:flex-row sm:items-center">
            <p className="text-xs text-muted-foreground">
              结果由学生整理的相对经验数据驱动
            </p>
            <Button onClick={handleRecommend} data-testid="recommend-button">
              推荐志愿
            </Button>
            {error && (
              <p
                className="text-sm text-destructive"
                data-testid="picker-error"
              >
                {error}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <div
          ref={resultRef}
          tabIndex={-1}
          aria-live="polite"
          className="space-y-3 outline-none"
          data-testid="picker-result"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">推荐志愿排序</h2>
            <p className="text-xs text-muted-foreground">前三项建议优先了解</p>
          </div>
          <ol className="space-y-3">
            {result.map((college, index) => (
              <li key={college.id} data-testid="picker-item">
                <Card
                  className={`gap-0 py-4 ${
                    index === 0 ? "border-foreground/20 bg-muted/40" : ""
                  }`}
                >
                  <CardContent className="flex flex-col gap-2 px-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <Badge
                        variant={index === 0 ? "default" : "secondary"}
                        className="mt-0.5 shrink-0 tabular-nums"
                      >
                        第 {index + 1} 志愿
                      </Badge>
                      <Image
                        src={`/college-crests/${college.id}.svg`}
                        alt=""
                        width={32}
                        height={32}
                        className="size-8 shrink-0 object-contain"
                      />
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{college.nameZh}</span>
                          <span className="text-xs text-muted-foreground">
                            {college.shortCode} · {college.nameEn}
                          </span>
                        </div>
                        {college.reasons.length > 0 && (
                          <ul className="space-y-0.5 text-xs text-muted-foreground">
                            {college.reasons.map((reason, i) => (
                              <li key={i}>· {reason}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                    {college.avoidHits.length > 0 && (
                      <Badge
                        variant="destructive"
                        className="mt-0.5 shrink-0 self-start"
                      >
                        已避雷
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
