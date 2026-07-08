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
  recommend,
  validatePriorities,
  type ScoredCollege,
} from "@/lib/college-picker/recommend";

const PRIORITY_LABELS = ["第一看重（×5）", "第二看重（×3）", "第三看重（×2）"];

// base-ui Select 需要 items 映射，SelectValue 才显示中文标签而非原始值。
const MAJOR_ITEMS: Record<string, string> = Object.fromEntries(
  MAJOR_GROUPS.map((m) => [m.id, m.nameZh]),
);
const FACTOR_ITEMS: Record<string, string> = Object.fromEntries(
  SCORED_FACTORS.map((f) => [f.id, f.nameZh]),
);

// 沿用原版默认预选：专业默认第一个、三个因素预选 通勤 / 住宿 / 保宿。
const DEFAULT_PRIORITIES: [ScoredFactor, ScoredFactor, ScoredFactor] = [
  "Commute_Time",
  "Accommodation_Environment",
  "Hostel_Guarantee",
];

export function CollegePickerForm() {
  const [majorGroup, setMajorGroup] = useState<MajorGroup>(MAJOR_GROUPS[0].id);
  const [priorities, setPriorities] =
    useState<[ScoredFactor, ScoredFactor, ScoredFactor]>(DEFAULT_PRIORITIES);
  const [avoids, setAvoids] = useState<AvoidFactor[]>([]);
  const [result, setResult] = useState<ScoredCollege[] | null>(null);
  const [error, setError] = useState<string>("");

  function reset() {
    setResult(null);
    setError("");
  }

  function setPriority(index: number, value: ScoredFactor) {
    setPriorities((prev) => {
      const next = [...prev] as [ScoredFactor, ScoredFactor, ScoredFactor];
      next[index] = value;
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
    setResult(recommend({ majorGroup, priorities, avoids }));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>选择你的情况</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
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
            <Label>最看重的三个因素（依次加权 5 / 3 / 2）</Label>
            <div className="grid gap-3 sm:grid-cols-3">
              {priorities.map((factor, index) => (
                <div key={index} className="space-y-1.5">
                  <span className="text-xs text-muted-foreground">
                    {PRIORITY_LABELS[index]}
                  </span>
                  <Select
                    items={FACTOR_ITEMS}
                    value={factor}
                    onValueChange={(v) =>
                      v && setPriority(index, v as ScoredFactor)
                    }
                  >
                    <SelectTrigger data-testid={`priority-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                    <span className="shrink-0 text-sm text-muted-foreground tabular-nums">
                      评分 {college.score}
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
