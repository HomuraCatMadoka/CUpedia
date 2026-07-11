"use client";

import { useState } from "react";

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
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label>是否至少冲一个小书院（善衡 / 敬文 / 晨兴）？</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {PREFERENCE_OPTIONS.map((opt) => (
                <Label
                  key={opt.id}
                  className="flex cursor-pointer flex-col gap-1 rounded-md border p-3 font-normal text-foreground has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  data-testid={`preference-${opt.id}`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="small-college-preference"
                      value={opt.id}
                      checked={preference === opt.id}
                      onChange={() => {
                        setPreference(opt.id);
                        reset();
                      }}
                      className="size-4 accent-primary"
                    />
                    <span className="font-medium">{opt.label}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {opt.desc}
                  </span>
                </Label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>专业大类</Label>
            <Select
              items={MAJOR_ITEMS}
              value={majorGroup}
              onValueChange={(v) => {
                if (v) setMajorGroup(v as MajorGroup);
                reset();
              }}
            >
              <SelectTrigger
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

          <div className="space-y-2">
            <Label>最看重的因素（权重按填写情况等比放大至合计 10）</Label>
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

          <div className="space-y-2">
            <Label>想避开的因素（可选，命中的书院会被压到志愿末尾）</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              {AVOID_FACTORS.map((f) => (
                <Label
                  key={f.id}
                  className="flex items-center gap-2 font-normal text-foreground"
                >
                  <Checkbox
                    checked={avoids.includes(f.id)}
                    onCheckedChange={(checked) =>
                      toggleAvoid(f.id, checked === true)
                    }
                    data-testid={`avoid-${f.id}`}
                  />
                  {f.nameZh}
                </Label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
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
        <div className="space-y-3" data-testid="picker-result">
          <h2 className="text-lg font-semibold">推荐志愿排序</h2>
          <ol className="space-y-3">
            {result.map((college, index) => (
              <li key={college.id} data-testid="picker-item">
                <Card className="gap-0 py-4">
                  <CardContent className="flex flex-col gap-2 px-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex items-start gap-3">
                      <Badge
                        variant="secondary"
                        className="mt-0.5 shrink-0 tabular-nums"
                      >
                        第 {index + 1} 志愿
                      </Badge>
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{college.nameZh}</span>
                          <span className="text-xs text-muted-foreground">
                            {college.shortCode} · {college.nameEn}
                          </span>
                          {college.avoidHits.length > 0 && (
                            <Badge variant="destructive">已避雷</Badge>
                          )}
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
                    <span
                      className="shrink-0 text-sm text-muted-foreground tabular-nums"
                      data-testid="picker-score"
                    >
                      推荐指数 {college.score.toFixed(1)}
                    </span>
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
