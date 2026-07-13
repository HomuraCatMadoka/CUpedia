"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

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
  BONUS_FACTORS,
  COLLEGE_CAPTURE,
  MAJOR_GROUPS,
  SCORED_FACTORS,
  type AvoidFactor,
  type BonusFactor,
  type CollegeId,
  type MajorGroup,
  type ScoredFactor,
} from "@/lib/college-picker/data";
import {
  computeWeights,
  recommend,
  validatePriorities,
  type ScoredCollege,
  type SmallCollegeAnswers,
  type SmallCollegePreference,
} from "@/lib/college-picker/recommend";

// base-ui Select 需要 items 映射，SelectValue 才显示中文标签而非原始值。
const MAJOR_ITEMS: Record<string, string> = Object.fromEntries(
  MAJOR_GROUPS.map((m) => [m.id, m.nameZh]),
);
// 留空选项：None 代表不填。
const EMPTY_VALUE = "__none__";
const EMPTY_LABEL = "None";
const FACTOR_ITEMS: Record<string, string> = Object.fromEntries([
  [EMPTY_VALUE, EMPTY_LABEL],
  ...SCORED_FACTORS.map((f) => [f.id, f.nameZh]),
]);

const PREFERENCE_OPTIONS: {
  id: SmallCollegePreference;
  label: string;
  desc: string;
  footnote?: string;
}[] = [
  {
    id: "aim",
    label: "A. 冲！",
    desc: "第一志愿为小书院，其余两所排到 8–9 志愿",
    footnote: "*额外做小书院专属问卷获得详细结果",
  },
  { id: "avoid", label: "B. 完全不想去", desc: "三所小书院排到第 7–9 志愿" },
  { id: "indifferent", label: "C. 无所谓", desc: "按默认机制运行分院帽" },
];

/** 06 小书院精选：四题的题干与选项。 */
const SC_QUESTIONS: {
  id: keyof SmallCollegeAnswers;
  prompt: string;
  subText?: string;
  options: { id: string; label: string; footnote?: string }[];
}[] = [
  {
    id: "q1",
    prompt: "小书院保证四年宿舍，因而录取过程竞争较大。你对此更倾向于：",
    options: [
      {
        id: "A",
        label: "录取优先：录取机会大于一切",
        footnote: "*基于过往经验。过多人申请相同小书院会导致竞争加剧",
      },
      {
        id: "B",
        label: "静观沉浮：有机会录取小书院更好，但也没那么在意",
        footnote: "*进入大/中书院同样有机会争取四年保宿",
      },
    ],
  },
  {
    id: "q2",
    prompt:
      "小书院除了都需要填表格之外，录取的主要机制如下（描述基于2024/2025年申请方式，以书院公示为准）：",
    subText:
      "善衡：拍视频介绍自己\n晨兴：网上面试/线下面试，更加重视英语能力\n敬文：英语面试，部分普通话交流，casual talk",
    options: [
      {
        id: "A",
        label:
          "对于可以设计并且剪辑的视频，我更有掌控感，同时很乐意大方地展示自己的优点。",
      },
      {
        id: "B",
        label:
          "我有很好的表达能力和临场应变能力，面试时，英语口语的流畅和准确会是我的加分项。",
      },
      {
        id: "C",
        label:
          "我更喜欢在面试的问答中展示自己，我可能不是能力最出众者，但我有诚恳的态度。",
      },
      {
        id: "D",
        label:
          "我可以接受每一种形式，但是我不太希望投入过多精力在申请小书院上。",
      },
      {
        id: "E",
        label: "无论哪种形式，我都会提前做足准备，哪怕我知道这些准备可能多余。",
      },
    ],
  },
  {
    id: "q3",
    prompt: "小书院的社群关系更加紧密，关于社交，下列选项你更倾向于？",
    options: [
      {
        id: "A",
        label: "更加国际化的环境，以英语和粤语主导的交流环境可以帮助我提升。",
      },
      { id: "B", label: "我希望内地生更多，能够找到同乡和归属感" },
      {
        id: "C",
        label: "Local 较多的社群，我会说粤语或我有积极学习粤语的意愿",
      },
      { id: "D", label: "没有特别倾向" },
    ],
  },
  {
    id: "q4",
    prompt: "关于日常生活，哪一项更符合你的期望？",
    options: [
      { id: "A", label: "设施很新，住宿环境安静，位置偏僻一点可以接受" },
      { id: "B", label: "主要期望上课通勤更方便" },
      { id: "C", label: "都无所谓，只要能够保宿四年就行" },
    ],
  },
];

// 沿用原版默认预选：专业默认第一个、第一看重默认通勤，其余留空。
const DEFAULT_PRIORITIES: [ScoredFactor, ScoredFactor | "", ScoredFactor | ""] =
  ["Commute_Time", "", ""];

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

function CollegeCaptureSummary({ collegeId }: { collegeId: CollegeId }) {
  const capture = COLLEGE_CAPTURE[collegeId];
  if (!capture) return null;

  return (
    <div className="space-y-1 pt-1 text-xs">
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
        {capture.pros.map((item) => (
          <li key={item} className="text-green-600">
            {item}
          </li>
        ))}
      </ul>
      <ul className="flex flex-wrap gap-x-3 gap-y-0.5">
        {capture.cons.map((item) => (
          <li key={item} className="text-red-600">
            {item}
          </li>
        ))}
      </ul>
      {capture.remark && (
        <p className="text-muted-foreground">{capture.remark}</p>
      )}
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
  const [bonusFactors, setBonusFactors] = useState<BonusFactor[]>([]);
  const [preference, setPreference] =
    useState<SmallCollegePreference>("indifferent");
  const [scAnswers, setScAnswers] = useState<Partial<SmallCollegeAnswers>>({});
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

  function handlePriorityChange(index: number, raw: string) {
    const value = fromSelectValue(raw ?? "");

    // 不允许跳位：P2 为空时 P3 只能选 None
    if (index === 2 && priorities[1] === "" && value !== "") {
      toast.error("第二看重因素不能为空！");
      return;
    }

    // 不允许重复选同一因素
    if (value !== "") {
      const otherValues = priorities.filter((p, i) => i !== index && p !== "");
      if (otherValues.includes(value as ScoredFactor)) {
        toast.error("该因素已被选择！");
        return;
      }
    }

    setPriority(index, value);
  }

  function toggleAvoid(factor: AvoidFactor, checked: boolean) {
    setAvoids((prev) =>
      checked ? [...prev, factor] : prev.filter((a) => a !== factor),
    );
    reset();
  }

  function toggleBonus(factor: BonusFactor, checked: boolean) {
    setBonusFactors((prev) =>
      checked ? [...prev, factor] : prev.filter((b) => b !== factor),
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
    // 小书院精选题校验：A 模式下四题必答
    if (preference === "aim") {
      const unanswered = SC_QUESTIONS.some((q) => !scAnswers[q.id]);
      if (unanswered) {
        setResult(null);
        toast.error("小书院精选题未做完，做完后生成结果");
        return;
      }
    }
    setError("");
    setResult(
      recommend({
        majorGroup,
        priorities,
        avoids,
        smallCollegePreference: preference,
        bonusFactors,
        smallCollegeAnswers:
          preference === "aim" ? (scAnswers as SmallCollegeAnswers) : undefined,
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
                  {opt.footnote && (
                    <span className="text-xs text-muted-foreground">
                      {opt.footnote}
                    </span>
                  )}
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
                    onValueChange={(v) => handlePriorityChange(index, v ?? "")}
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
                      {SCORED_FACTORS.map((f) => {
                        const isDuplicate = priorities.some(
                          (p, i) => i !== index && p === f.id,
                        );
                        const isSkipLocked =
                          index === 2 && priorities[1] === "";
                        const dimmed = isDuplicate || isSkipLocked;
                        return (
                          <SelectItem
                            key={f.id}
                            value={f.id}
                            className={
                              dimmed
                                ? "text-muted-foreground/40 data-highlighted:bg-transparent data-highlighted:text-muted-foreground/40"
                                : undefined
                            }
                          >
                            {f.nameZh}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <dl className="space-y-1 pt-2 text-xs text-muted-foreground">
              <div className="flex gap-1.5">
                <dt className="shrink-0 font-medium text-foreground">
                  通勤时间：
                </dt>
                <dd>距离对应专业大部分教学楼位置</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 font-medium text-foreground">
                  保宿机会：
                </dt>
                <dd>小书院全员四年保宿，其他书院竞争保宿名额的难度不同</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 font-medium text-foreground">
                  住宿环境：
                </dt>
                <dd>海景、设施新旧、有没有小冰箱或可调温空调等</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-3 border-b py-6">
            <StepHeading number="04" title="你看重的其他因素" />
            <p className="text-xs text-muted-foreground">
              可选，勾选后给推荐指数加固定分。
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {BONUS_FACTORS.map((f) => {
                const on = bonusFactors.includes(f.id);
                return (
                  <Label
                    key={f.id}
                    className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-md border px-3 py-2 font-normal transition-colors ${
                      on
                        ? "border-primary/30 bg-primary/10 text-primary"
                        : "border-transparent text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <Checkbox
                      checked={on}
                      onCheckedChange={(checked) =>
                        toggleBonus(f.id, checked === true)
                      }
                      data-testid={`bonus-${f.id}`}
                    />
                    {f.nameZh}
                  </Label>
                );
              })}
            </div>
            <p className="pt-2 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">par 房：</span>
              双方同意的情况下选定对方为舍友
            </p>
          </div>

          <div className="space-y-3 border-b py-6">
            <StepHeading number="05" title="想避开的因素" />
            <p className="text-xs text-muted-foreground">
              可选，命中的书院仍会显示，但会被排到对应志愿分区末尾。
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
            <dl className="space-y-1 pt-2 text-xs text-muted-foreground">
              <div className="flex gap-1.5">
                <dt className="shrink-0 font-medium text-foreground">fyp：</dt>
                <dd>Final year project（一门三分课）</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 font-medium text-foreground">
                  宗教因素：
                </dt>
                <dd>周会有祈祷</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 font-medium text-foreground">
                  入学面试：
                </dt>
                <dd>网上面试/线下面试/拍视频介绍自己（善衡）</dd>
              </div>
              <div className="flex gap-1.5">
                <dt className="shrink-0 font-medium text-foreground">
                  入学笔试：
                </dt>
                <dd>填表格、写作文介绍自己，阐述选择动机。不是考试！！！</dd>
              </div>
            </dl>
          </div>

          {preference === "aim" && (
            <div className="space-y-3 border-b py-6">
              <StepHeading number="06" title="小书院精选" />
              <p className="text-xs text-muted-foreground">
                其余 6
                所书院评分固定，下列问题将评估「小书院专属推荐指数」，综合决定第一志愿。
              </p>
              <div className="space-y-4">
                {SC_QUESTIONS.map((q, qi) => (
                  <div
                    key={q.id}
                    className="space-y-2"
                    data-testid={`sc-q-${qi}`}
                  >
                    <p className="text-sm font-medium">
                      ({qi + 1}) {q.prompt}
                    </p>
                    {q.subText && (
                      <pre className="whitespace-pre-wrap rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                        {q.subText}
                      </pre>
                    )}
                    <div className="grid gap-2">
                      {q.options.map((opt) => {
                        const checked = scAnswers[q.id] === opt.id;
                        return (
                          <Label
                            key={opt.id}
                            className={`flex cursor-pointer items-start gap-2 rounded-md border px-3 py-2 text-sm font-normal transition-colors ${
                              checked
                                ? "border-foreground bg-muted/50"
                                : "border-transparent hover:bg-muted/40"
                            }`}
                          >
                            <input
                              type="radio"
                              name={`sc-${q.id}`}
                              value={opt.id}
                              checked={checked}
                              onChange={() => {
                                setScAnswers((prev) => ({
                                  ...prev,
                                  [q.id]: opt.id,
                                }));
                                reset();
                              }}
                              className="mt-0.5 size-4 shrink-0 accent-primary"
                            />
                            <span className="flex flex-col">
                              <span>
                                <span className="font-medium">{opt.id}.</span>{" "}
                                {opt.label}
                              </span>
                              {opt.footnote && (
                                <span className="mt-1 text-xs text-muted-foreground">
                                  {opt.footnote}
                                </span>
                              )}
                            </span>
                          </Label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                        <CollegeCaptureSummary collegeId={college.id} />
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
                    <span
                      className="shrink-0 self-start text-sm font-medium tabular-nums text-muted-foreground"
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
