"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CircleAlertIcon,
  DropletsIcon,
  HistoryIcon,
  MapPinIcon,
  PencilIcon,
  PlusIcon,
  Redo2Icon,
  SearchIcon,
  SendIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

type Variant = "A" | "B" | "C";
type PresetId = "drinking-water" | "toilet" | "printer" | "common-space";
type Flow =
  | "browse"
  | "place"
  | "placement"
  | "preset"
  | "edit"
  | "review"
  | "authentication-required"
  | "publishing"
  | "rate-limited"
  | "transient-error"
  | "conflict"
  | "published"
  | "place-history"
  | "changeset"
  | "discussion"
  | "map-note";

type PublishOutcome =
  | "published"
  | "authentication-required"
  | "rate-limited"
  | "transient-error"
  | "conflict";

type FlowNavigation = "push" | "replace" | "reset";
type FlowSetter = (flow: Flow, navigation?: FlowNavigation) => void;

const flowValues: ReadonlyArray<Flow> = [
  "browse",
  "place",
  "placement",
  "preset",
  "edit",
  "review",
  "authentication-required",
  "publishing",
  "rate-limited",
  "transient-error",
  "conflict",
  "published",
  "place-history",
  "changeset",
  "discussion",
  "map-note",
];

function parseFlow(value: string | null): Flow | null {
  return flowValues.includes(value as Flow) ? (value as Flow) : null;
}

type Draft = {
  mode: "add" | "edit";
  placeType: PresetId;
  name: string;
  building: string;
  floor: string;
  access: string;
  source: string;
  comment: string;
  requestReview: boolean;
  warningAcknowledged: boolean;
  positionPrecision: "building" | "floor" | "point";
  mapX: number;
  mapY: number;
};

const initialDraft: Draft = {
  mode: "add",
  placeType: "drinking-water",
  name: "大学图书馆饮水点",
  building: "大学图书馆",
  floor: "G/F",
  access: "CUHK 成员",
  source: "现场观察 · 2026-08-21",
  comment: "现场确认图书馆入口旁设有饮水点",
  requestReview: false,
  warningAcknowledged: false,
  positionPrecision: "point",
  mapX: 47,
  mapY: 43,
};

const existingDraft: Draft = { ...initialDraft, mode: "edit" };

const placePresets: Array<{
  id: PresetId;
  label: string;
  detail: string;
  defaultName: string;
}> = [
  {
    id: "drinking-water",
    label: "饮水机",
    detail: "饮水、冷热水设施",
    defaultName: "大学图书馆饮水点",
  },
  {
    id: "toilet",
    label: "洗手间",
    detail: "公共或受限使用的洗手间",
    defaultName: "大学图书馆洗手间",
  },
  {
    id: "printer",
    label: "打印服务",
    detail: "打印、扫描或复印位置",
    defaultName: "大学图书馆打印服务",
  },
  {
    id: "common-space",
    label: "公共空间",
    detail: "可供停留或学习的空间",
    defaultName: "大学图书馆公共空间",
  },
];

const variants: Array<{ id: Variant; name: string; note: string }> = [
  { id: "A", name: "轻量开放编辑", note: "OSM 发布语义，地图产品交互" },
  { id: "B", name: "右侧 Inspector", note: "CUpedia 桌面改编" },
  { id: "C", name: "快速事实编辑", note: "Campus Map 轻量方案" },
];

function isDraftDirty(flow: Flow, draft: Draft) {
  if (flow === "browse" || flow === "published") return false;
  if (draft.mode === "add") {
    return (
      flow === "placement" ||
      flow === "preset" ||
      flow === "edit" ||
      flow === "review"
    );
  }
  return (
    draft.name !== existingDraft.name ||
    draft.building !== existingDraft.building ||
    draft.floor !== existingDraft.floor ||
    draft.access !== existingDraft.access ||
    draft.source !== existingDraft.source ||
    draft.placeType !== existingDraft.placeType ||
    draft.positionPrecision !== existingDraft.positionPrecision ||
    draft.mapX !== existingDraft.mapX ||
    draft.mapY !== existingDraft.mapY
  );
}

const focusRing =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#17664a] focus-visible:ring-offset-2";
const primaryButton = cn(
  "min-h-12 touch-manipulation rounded-xl bg-[#17664a] px-5 font-bold text-white shadow-sm transition-colors hover:bg-[#12553d] active:bg-[#0e4633]",
  focusRing,
);
const secondaryButton = cn(
  "min-h-11 touch-manipulation rounded-xl border border-[#cbd8d0] bg-white px-4 font-bold text-[#345348] transition-colors hover:bg-[#f1f6f2] active:bg-[#e6eee8]",
  focusRing,
);

function MapCanvas({
  selected = false,
  picking = false,
  precision = "point",
  pointX = 47,
  pointY = 43,
  onPick,
}: {
  selected?: boolean;
  picking?: boolean;
  precision?: Draft["positionPrecision"];
  pointX?: number;
  pointY?: number;
  onPick?: (x: number, y: number) => void;
}) {
  return (
    <div
      className="absolute inset-0 overflow-hidden bg-[#e7eee6]"
      aria-label="校园地图示意"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0 opacity-80 [background-image:linear-gradient(112deg,transparent_0_36%,#c4d0c3_37%_40%,transparent_41%_100%),linear-gradient(25deg,transparent_0_53%,#d4ddd2_54%_57%,transparent_58%_100%)]"
      />
      <div
        aria-hidden="true"
        className="absolute left-[9%] top-[20%] h-28 w-40 -rotate-6 rounded-xl border-2 border-[#b5c3b6] bg-[#d4ddd0]"
      />
      <div
        aria-hidden="true"
        className="absolute right-[8%] top-[17%] h-36 w-32 rotate-6 rounded-xl border-2 border-[#b5c3b6] bg-[#d2dccf]"
      />
      <div
        aria-hidden="true"
        className="absolute bottom-[15%] left-[24%] h-24 w-52 rotate-3 rounded-xl border-2 border-[#b5c3b6] bg-[#d4ddd0]"
      />
      {picking ? (
        <button
          type="button"
          aria-label="移动地图中心针；方向键可微调位置"
          onClick={(event) => {
            if (!onPick) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            onPick(
              ((event.clientX - bounds.left) / bounds.width) * 100,
              ((event.clientY - bounds.top) / bounds.height) * 100,
            );
          }}
          onKeyDown={(event) => {
            if (!onPick) return;
            const delta = event.shiftKey ? 5 : 1;
            if (event.key === "ArrowLeft")
              onPick(Math.max(0, pointX - delta), pointY);
            else if (event.key === "ArrowRight")
              onPick(Math.min(100, pointX + delta), pointY);
            else if (event.key === "ArrowUp")
              onPick(pointX, Math.max(0, pointY - delta));
            else if (event.key === "ArrowDown")
              onPick(pointX, Math.min(100, pointY + delta));
            else return;
            event.preventDefault();
            event.stopPropagation();
          }}
          className="absolute inset-0 cursor-crosshair"
        >
          <span
            aria-hidden="true"
            className="absolute -translate-x-1/2 -translate-y-full"
            style={{ left: `${pointX}%`, top: `${pointY}%` }}
          >
            <MapPinIcon className="size-11 fill-[#17664a] text-white drop-shadow-lg" />
          </span>
        </button>
      ) : precision === "point" ? (
        <div
          aria-hidden="true"
          className={cn(
            "absolute grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-4 border-white bg-[#1d7fa3] text-white shadow-lg",
            selected && "ring-4 ring-[#1d7fa3]/25",
          )}
          style={{ left: `${pointX}%`, top: `${pointY}%` }}
        >
          <DropletsIcon className="size-5" />
        </div>
      ) : (
        <div
          className="absolute left-[9%] top-[20%] grid h-28 w-40 -rotate-6 place-items-center rounded-xl border-4 border-[#1d7fa3]/50 bg-[#d9e9e8]/80 shadow-lg"
          aria-label={
            precision === "floor"
              ? "地点只确认到大学图书馆 G/F，具体位置尚未测绘"
              : "地点只确认在大学图书馆内，楼层和具体位置未知"
          }
        >
          <span className="rotate-6 rounded-full bg-white px-3 py-2 text-center text-xs font-bold text-[#17664a] shadow">
            {precision === "floor"
              ? "G/F · 具体位置未测绘"
              : "建筑内 · 位置未测绘"}
          </span>
        </div>
      )}
      <span className="absolute bottom-3 left-3 rounded-md bg-white/90 px-2 py-1 text-[10px] font-bold text-[#66766d]">
        高德底图 · CUpedia overlay
      </span>
    </div>
  );
}

function SearchBar({
  value,
  onChange,
  placeholder = "搜索建筑或设施…",
}: {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">{placeholder}</span>
      <SearchIcon
        aria-hidden="true"
        className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-[#66766d]"
      />
      <input
        type="search"
        name="map-search"
        value={value}
        defaultValue={value === undefined ? "" : undefined}
        onChange={
          onChange ? (event) => onChange(event.target.value) : undefined
        }
        autoComplete="off"
        placeholder={placeholder}
        className={cn(
          "h-12 w-full rounded-2xl border border-black/10 bg-white pl-12 pr-4 text-sm text-[#17382d] shadow-lg placeholder:text-[#66766d] hover:bg-[#fbfdfb]",
          focusRing,
        )}
      />
    </label>
  );
}

function Field({
  label,
  value,
  onChange,
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  multiline?: boolean;
}) {
  const id = `open-edit-${label}`;
  const className = cn(
    "w-full rounded-xl border border-[#cbd8d0] bg-white px-3 py-3 text-sm text-[#17382d] placeholder:text-[#8c9b92]",
    focusRing,
  );
  return (
    <label
      htmlFor={id}
      className="grid gap-1.5 text-xs font-bold text-[#5d7066]"
    >
      {label}
      {multiline ? (
        <textarea
          id={id}
          name={id}
          value={value}
          rows={3}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          className={cn(className, "resize-none")}
        />
      ) : (
        <input
          id={id}
          name={id}
          value={value}
          autoComplete="off"
          onChange={(event) => onChange(event.target.value)}
          className={className}
        />
      )}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  const id = `open-edit-${label}`;
  return (
    <label
      htmlFor={id}
      className="grid gap-1.5 text-xs font-bold text-[#5d7066]"
    >
      {label}
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "min-h-12 w-full rounded-xl border border-[#cbd8d0] bg-white px-3 text-sm text-[#17382d]",
          focusRing,
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function StateStrip({
  variant,
  flow,
  draft,
}: {
  variant: Variant;
  flow: Flow;
  draft: Draft;
}) {
  return (
    <div className="flex min-w-0 flex-wrap gap-x-3 gap-y-1 rounded-xl bg-[#172d25] px-3 py-2 font-mono text-[10px] text-[#cbe6d8]">
      <span>variant={variant}</span>
      <span>scene={flow}</span>
      <span>mode={draft.mode}</span>
      <span>baseRevision=r17</span>
      <span>dirty={isDraftDirty(flow, draft) ? "true" : "false"}</span>
    </div>
  );
}

function ReviewCard({
  draft,
  onToggleReview,
}: {
  draft: Draft;
  onToggleReview: () => void;
}) {
  const isEdit = draft.mode === "edit";
  return (
    <div className="grid gap-3">
      <div className="rounded-2xl border border-[#d8e2da] bg-white p-4">
        <p className="text-xs font-bold text-[#6b7c72]">
          {isEdit ? "你将公开发布 1 项修改" : "你将公开新增 1 个地点"}
        </p>
        <div className="mt-3 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e5f2f6] text-[#1d7fa3]">
            <DropletsIcon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="font-black">{draft.name}</p>
            <p className="mt-1 text-sm text-[#66766d]">
              {draft.building} · {draft.floor} · 饮水机
            </p>
          </div>
        </div>
      </div>
      {isEdit ? (
        <div className="rounded-2xl border border-[#d8e2da] bg-white p-4 text-sm">
          <p className="text-xs font-bold text-[#6b7c72]">楼层</p>
          <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <span className="rounded-lg bg-[#f2f4f2] px-3 py-2 line-through">
              G/F
            </span>
            <ArrowRightIcon
              aria-hidden="true"
              className="size-4 text-[#7b8b82]"
            />
            <span className="rounded-lg bg-[#e7f3ec] px-3 py-2 font-bold text-[#17664a]">
              {draft.floor}
            </span>
          </div>
        </div>
      ) : null}
      <div className="rounded-2xl bg-[#fff5d8] p-4 text-sm leading-6 text-[#725819]">
        发布后立即对所有人可见，并保留公开历史。发生错误时通过新的修订纠正。
      </div>
      <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-[#d8e2da] bg-white px-4 text-sm font-bold">
        <input
          type="checkbox"
          checked={draft.requestReview}
          onChange={onToggleReview}
          className="size-4 accent-[#17664a]"
        />
        希望其他人检查这次编辑
      </label>
    </div>
  );
}

function PublishedCard({
  onDone,
  onOpenPlace,
  onOpenChangeset,
}: {
  onDone: () => void;
  onOpenPlace: () => void;
  onOpenChangeset: () => void;
}) {
  const [reviewRequested, setReviewRequested] = useState(false);
  return (
    <div
      role="status"
      aria-live="polite"
      className="grid place-items-center px-6 py-10 text-center"
    >
      <CheckCircle2Icon aria-hidden="true" className="size-14 text-[#17664a]" />
      <h2 className="mt-4 text-2xl font-black text-pretty">编辑已发布</h2>
      <p className="mt-2 text-sm leading-6 text-[#66766d]">
        公共地图已经更新。任何后续纠正都会保留为新的修订。
      </p>
      <div className="mt-5 w-full rounded-2xl bg-[#eef4ef] p-4 text-left">
        <p className="text-xs font-bold text-[#6b7c72]">CHANGESET</p>
        <p className="mt-1 font-black">CM-2048 · 1 项修改</p>
        <p className="mt-1 text-sm text-[#66766d]">作者：CUHK User · 刚刚</p>
      </div>
      <div className="mt-5 grid w-full gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={onOpenChangeset}
          className={secondaryButton}
        >
          查看此次编辑
        </button>
        <button type="button" onClick={onOpenPlace} className={primaryButton}>
          查看公开地点
        </button>
      </div>
      <button
        type="button"
        disabled={reviewRequested}
        onClick={() => setReviewRequested(true)}
        className={cn(
          "mt-3 min-h-11 text-sm font-bold text-[#17664a] disabled:text-[#66766d]",
          focusRing,
        )}
      >
        {reviewRequested ? "已请求其他贡献者检查" : "请求其他贡献者检查"}
      </button>
      <button
        type="button"
        onClick={onDone}
        className={cn(
          "mt-3 min-h-11 text-sm font-bold text-[#17664a]",
          focusRing,
        )}
      >
        返回地图
      </button>
    </div>
  );
}

function TraceabilityPanel({
  flow,
  setFlow,
  onDone,
  onEditFromNote,
}: {
  flow: Extract<
    Flow,
    "place-history" | "changeset" | "discussion" | "map-note"
  >;
  setFlow: (flow: Flow) => void;
  onDone: () => void;
  onEditFromNote: () => void;
}) {
  const [discussionText, setDiscussionText] = useState("");
  const [noteText, setNoteText] = useState("饮水机位置可能在入口另一侧");
  const [discussionSent, setDiscussionSent] = useState(false);
  const title =
    flow === "place-history"
      ? "地点历史"
      : flow === "changeset"
        ? "Changeset CM-2048"
        : flow === "discussion"
          ? "公开讨论"
          : "地图备注";
  return (
    <div className="grid gap-4">
      <button
        type="button"
        onClick={onDone}
        className={cn(
          "flex min-h-11 items-center gap-2 text-sm font-bold",
          focusRing,
        )}
      >
        <ArrowLeftIcon aria-hidden="true" className="size-4" /> 返回地点
      </button>
      <div>
        <p className="text-xs font-bold tracking-[0.12em] text-[#66766d]">
          PUBLIC · SAFE PROJECTION
        </p>
        <h2 className="mt-1 text-xl font-black">{title}</h2>
      </div>
      {flow === "place-history" ? (
        <div className="grid gap-3">
          {["r18 · 新增现场来源", "r17 · 修正开放对象", "r16 · 建立地点"].map(
            (item) => (
              <article
                key={item}
                className="rounded-xl border bg-white p-4 text-sm"
              >
                <strong>{item}</strong>
                <p className="mt-1 text-[#66766d]">
                  稳定 deep link · typed field/position diff
                </p>
              </article>
            ),
          )}
          <button
            type="button"
            onClick={() => setFlow("changeset")}
            className={secondaryButton}
          >
            查看最新 Changeset
          </button>
        </div>
      ) : null}
      {flow === "changeset" ? (
        <div className="grid gap-3">
          <div className="rounded-xl border bg-white p-4 text-sm">
            <p className="font-bold">1 个地点 · point update · r17 → r18</p>
            <p className="mt-2 text-[#66766d]">
              楼层 G/F · 精度 point · 来源已更新
            </p>
          </div>
          <button
            type="button"
            onClick={() => setFlow("discussion")}
            className={secondaryButton}
          >
            查看公开讨论 · 0
          </button>
          <button
            type="button"
            onClick={() => setFlow("map-note")}
            className={secondaryButton}
          >
            留下地图备注
          </button>
        </div>
      ) : null}
      {flow === "discussion" ? (
        <div className="grid gap-3">
          <div className="rounded-xl border bg-white p-4 text-sm leading-6">
            Changeset discussion 只讨论此次编辑；修正事实会创建新的 Changeset。
          </div>
          <Field
            label="公开评论"
            value={discussionText}
            onChange={setDiscussionText}
            multiline
          />
          <button
            type="button"
            onClick={() => {
              setDiscussionSent(true);
              setDiscussionText("");
            }}
            className={primaryButton}
          >
            发布评论并订阅
          </button>
          {discussionSent ? (
            <p
              role="status"
              aria-live="polite"
              className="text-sm font-bold text-[#17664a]"
            >
              评论已加入公开讨论，你已订阅后续回复。
            </p>
          ) : null}
        </div>
      ) : null}
      {flow === "map-note" ? (
        <div className="grid gap-3">
          <div className="rounded-xl border bg-white p-4 text-sm leading-6">
            Note #N-318 · open · 绑定大学图书馆饮水点与当前位置
          </div>
          <Field
            label="地图问题"
            value={noteText}
            onChange={setNoteText}
            multiline
          />
          <button
            type="button"
            onClick={onEditFromNote}
            className={primaryButton}
          >
            从 Note 修正地点
          </button>
          <p className="text-xs leading-5 text-[#66766d]">
            发布成功后回到 Note，再显式解决；发布失败不会自动关闭。
          </p>
        </div>
      ) : null}
    </div>
  );
}

function VariantA({ flow, setFlow, draft, setDraft }: VariantProps) {
  const [publishOutcome, setPublishOutcome] =
    useState<PublishOutcome>("published");
  const [mapQuery, setMapQuery] = useState("");
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmDuplicate, setConfirmDuplicate] = useState(false);
  const [showAbuseReport, setShowAbuseReport] = useState(false);
  const preset =
    placePresets.find((item) => item.id === draft.placeType) ?? placePresets[0];
  const isDirty = isDraftDirty(flow, draft);
  const errors = [
    !draft.name.trim()
      ? { fieldId: "open-edit-名称", message: "请填写地点名称" }
      : null,
    !draft.building.trim()
      ? { fieldId: "open-edit-建筑", message: "请填写所属建筑" }
      : null,
    draft.positionPrecision !== "building" && !draft.floor.trim()
      ? { fieldId: "open-edit-楼层", message: "请填写楼层" }
      : null,
  ].filter(
    (error): error is { fieldId: string; message: string } => error !== null,
  );
  const selected = flow !== "browse" && flow !== "placement";
  const commitDraft = (next: Draft) => setDraft(next);
  const cancelOperation = () => {
    if (isDirty) {
      setConfirmDiscard(true);
      return;
    }
    setFlow("browse", "reset");
  };
  const discardOperation = () => {
    setConfirmDiscard(false);
    setDraft(initialDraft);
    window.sessionStorage.removeItem("campus-map-open-edit-draft");
    setFlow("browse", "reset");
  };
  const startAddingPoint = () => {
    setDraft({ ...initialDraft, mode: "add" });
    setFlow("placement");
  };
  const publish = () => {
    if (publishOutcome === "published") {
      setFlow("publishing");
      window.setTimeout(() => {
        window.sessionStorage.removeItem("campus-map-open-edit-draft");
        setFlow("published", "reset");
      }, 650);
      return;
    }
    setFlow(publishOutcome);
  };

  const attemptPublish = () => {
    if (errors.length > 0) {
      document.getElementById(errors[0].fieldId)?.focus();
      return;
    }
    if (!isDirty) return;
    if (draft.mode === "add" && !draft.warningAcknowledged) {
      setConfirmDuplicate(true);
      return;
    }
    publish();
  };

  useEffect(() => {
    if (flow === "preset" || flow === "review") {
      setFlow("edit", "replace");
    }
  }, [flow, setFlow]);

  useEffect(() => {
    if (!isDirty) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [isDirty]);

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || flow === "browse" || confirmDiscard) {
        return;
      }
      event.preventDefault();
      cancelOperation();
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  });

  useEffect(() => {
    const area = scrollAreaRef.current;
    if (!area) return;
    const resetScroll = window.setTimeout(() => {
      area.scrollTop = 0;
      const heading = area.querySelector<HTMLElement>("h2");
      if (!heading) return;
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }, 0);
    return () => window.clearTimeout(resetScroll);
  }, [flow]);

  return (
    <div className="relative h-full min-h-0 overflow-hidden bg-[#f7f9f6] md:rounded-lg md:border md:border-black/15 md:shadow-2xl">
      <div className="relative h-full min-h-0 md:grid md:grid-cols-[360px_1fr]">
        <aside className="absolute inset-x-0 bottom-0 z-30 h-[48dvh] min-h-0 overflow-hidden rounded-t-[24px] border-t bg-white shadow-[0_-12px_32px_rgba(23,56,45,0.16)] md:relative md:order-1 md:h-auto md:rounded-none md:border-r md:border-t-0 md:shadow-none">
          <div className="flex h-14 items-center justify-between border-b bg-[#f6f7f6] px-4">
            <div>
              <p className="text-[10px] font-extrabold tracking-[0.16em] text-[#738078]">
                CUPEDIA MAP EDITOR
              </p>
              <p className="text-sm font-black">大学图书馆一带</p>
            </div>
            {flow !== "browse" ? (
              <button
                type="button"
                aria-label="取消当前操作"
                onClick={cancelOperation}
                className={cn("grid size-11 place-items-center", focusRing)}
              >
                <XIcon aria-hidden="true" className="size-5" />
              </button>
            ) : null}
          </div>

          <div
            ref={scrollAreaRef}
            className="h-[calc(48dvh-3.5rem)] overflow-y-auto overscroll-contain p-4 pb-24 [&_h2:focus]:outline-none md:h-[calc(100%-3.5rem)] md:pb-24"
          >
            {flow === "browse" || flow === "placement" ? (
              <div>
                {flow === "browse" ? (
                  <SearchBar value={mapQuery} onChange={setMapQuery} />
                ) : null}
                <h2 className="mt-6 text-xl font-black">
                  {flow === "placement" ? "在地图上放置一个点" : "浏览地图数据"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[#66766d]">
                  {flow === "placement"
                    ? "移动地图或点击目标位置，让中心针对准设施。确认后直接填写地点资料。"
                    : "选择地图中的地点进行编辑，或从地图工具栏添加新地点。"}
                </p>
                {flow === "placement" ? (
                  <div className="mt-5 grid gap-3">
                    <div className="rounded-lg border bg-[#f7f9f6] p-3 text-sm">
                      <p className="font-bold">中心针 · point evidence</p>
                      <p className="mt-1 font-mono text-xs text-[#66766d]">
                        x {draft.mapX.toFixed(1)} · y {draft.mapY.toFixed(1)}
                      </p>
                      <p className="mt-2 text-xs leading-5 text-[#66766d]">
                        点击地图移动中心针；聚焦地图后用方向键微调，Shift 加速。
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setFlow("edit")}
                      className={cn(primaryButton, "hidden md:block")}
                    >
                      确认位置并填写资料
                    </button>
                    <button
                      type="button"
                      onClick={cancelOperation}
                      className={secondaryButton}
                    >
                      取消添加
                    </button>
                  </div>
                ) : (
                  <div className="mt-6 grid gap-3">
                    {mapQuery.trim() ? (
                      <button
                        type="button"
                        onClick={() => {
                          setDraft(existingDraft);
                          setFlow("place");
                        }}
                        className={cn(
                          "rounded-lg border bg-white p-4 text-left text-sm",
                          focusRing,
                        )}
                      >
                        <strong>大学图书馆饮水点</strong>
                        <p className="mt-1 text-[#66766d]">
                          大学图书馆 · G/F · point
                        </p>
                      </button>
                    ) : null}
                    <div className="rounded-lg border bg-[#f7f9f6] p-4 text-sm">
                      <p className="font-bold">当前图层：Campus Map facts</p>
                      <p className="mt-2 text-[#66766d]">
                        17 个要素 · 0 个未保存修改
                      </p>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {flow === "place" ? (
              <div>
                <span className="rounded-full bg-[#e5f2f6] px-2.5 py-1 text-xs font-bold text-[#1d7fa3]">
                  {preset.label} · {draft.positionPrecision}
                </span>
                <h2 className="mt-3 text-2xl font-black text-pretty">
                  {draft.name}
                </h2>
                <p className="mt-1 text-sm text-[#66766d]">
                  {draft.building}
                  {draft.positionPrecision === "building"
                    ? " · 建筑内"
                    : ` · ${draft.floor}`}
                  {" · Current revision r18"}
                </p>
                <div className="mt-5 divide-y rounded-xl border bg-white text-sm">
                  {[
                    ["开放对象", draft.access],
                    ["来源", draft.source],
                    [
                      "位置精度",
                      draft.positionPrecision === "point"
                        ? "精确服务点"
                        : draft.positionPrecision === "floor"
                          ? `${draft.floor} · 具体位置未测绘`
                          : "建筑内 · 楼层和具体位置未知",
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-start justify-between gap-4 px-4 py-3"
                    >
                      <span className="text-[#66766d]">{label}</span>
                      <strong className="text-right">{value}</strong>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDraft({ ...draft, mode: "edit" });
                    setFlow("edit");
                  }}
                  className={cn(primaryButton, "mt-5 w-full")}
                >
                  编辑地点
                </button>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFlow("place-history")}
                    className={secondaryButton}
                  >
                    查看历史
                  </button>
                  <button
                    type="button"
                    onClick={() => setFlow("map-note")}
                    className={secondaryButton}
                  >
                    地图备注
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowAbuseReport(true)}
                  className={cn(
                    "mt-3 min-h-11 w-full text-sm font-bold text-[#8a2e25]",
                    focusRing,
                  )}
                >
                  举报垃圾内容或滥用
                </button>
              </div>
            ) : null}

            {flow === "edit" ? (
              <div>
                <div className="flex items-center gap-3">
                  <span className="grid size-11 place-items-center rounded bg-[#e5f2f6] text-[#1d7fa3]">
                    <DropletsIcon aria-hidden="true" className="size-5" />
                  </span>
                  <div>
                    <p className="text-xs font-bold text-[#66766d]">
                      {draft.mode === "add" ? "新增地点" : "建议修改"}
                    </p>
                    <h2 className="font-black">
                      {draft.mode === "add" ? "填写地点资料" : draft.name}
                    </h2>
                  </div>
                </div>
                <div className="mt-5 grid gap-4">
                  <label
                    htmlFor="open-edit-地点类型"
                    className="grid gap-1.5 text-xs font-bold text-[#5d7066]"
                  >
                    地点类型
                    <select
                      id="open-edit-地点类型"
                      value={draft.placeType}
                      onChange={(event) => {
                        const nextPreset = placePresets.find(
                          (item) => item.id === event.target.value,
                        );
                        if (!nextPreset) return;
                        commitDraft({
                          ...draft,
                          placeType: nextPreset.id,
                          name:
                            draft.mode === "add"
                              ? nextPreset.defaultName
                              : draft.name,
                          warningAcknowledged: false,
                        });
                      }}
                      className={cn(
                        "min-h-12 w-full rounded-xl border border-[#cbd8d0] bg-white px-3 text-sm text-[#17382d]",
                        focusRing,
                      )}
                    >
                      {placePresets.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <SelectField
                    label="位置证据"
                    value={draft.positionPrecision}
                    options={[
                      { value: "point", label: "精确服务点" },
                      { value: "floor", label: "只确认到楼层" },
                      { value: "building", label: "只确认在建筑内" },
                    ]}
                    onChange={(positionPrecision) =>
                      commitDraft({
                        ...draft,
                        positionPrecision:
                          positionPrecision as Draft["positionPrecision"],
                        warningAcknowledged: false,
                      })
                    }
                  />
                  <Field
                    label="名称"
                    value={draft.name}
                    onChange={(name) =>
                      commitDraft({
                        ...draft,
                        name,
                        warningAcknowledged: false,
                      })
                    }
                  />
                  <Field
                    label="建筑"
                    value={draft.building}
                    onChange={(building) =>
                      commitDraft({
                        ...draft,
                        building,
                        warningAcknowledged: false,
                      })
                    }
                  />
                  {draft.positionPrecision !== "building" ? (
                    <SelectField
                      label="楼层"
                      value={draft.floor}
                      options={[
                        { value: "LG/F", label: "LG/F" },
                        { value: "G/F", label: "G/F" },
                        { value: "1/F", label: "1/F" },
                        { value: "2/F", label: "2/F" },
                      ]}
                      onChange={(floor) =>
                        commitDraft({
                          ...draft,
                          floor,
                          warningAcknowledged: false,
                        })
                      }
                    />
                  ) : null}
                  <SelectField
                    label="开放对象"
                    value={draft.access}
                    onChange={(access) => commitDraft({ ...draft, access })}
                    options={[
                      { value: "公众", label: "公众" },
                      { value: "CUHK 成员", label: "CUHK 成员" },
                      { value: "图书馆成员", label: "图书馆成员" },
                      { value: "未知", label: "未知" },
                    ]}
                  />
                  <SelectField
                    label="来源与核对日期"
                    value={draft.source}
                    onChange={(source) => commitDraft({ ...draft, source })}
                    options={[
                      {
                        value: "现场观察 · 2026-08-21",
                        label: "现场观察 · 2026-08-21",
                      },
                      {
                        value: "校方网页 · 2026-08-20",
                        label: "校方网页 · 2026-08-20",
                      },
                      { value: "未知", label: "未知来源" },
                    ]}
                  />
                </div>
                {errors.length > 0 ? (
                  <div
                    role="alert"
                    className="mt-4 rounded-xl bg-[#fff0ee] p-3 text-sm text-[#8a2e25]"
                  >
                    {errors[0].message}
                  </div>
                ) : null}
                <p className="mt-5 text-xs leading-5 text-[#66766d]">
                  发布后会立即更新公共地图，并自动生成可追溯的编辑历史。
                </p>
              </div>
            ) : null}

            {flow === "authentication-required" ? (
              <div className="grid gap-4">
                <h2 className="text-xl font-black">登录后继续发布</h2>
                <p className="text-sm leading-6 text-[#66766d]">
                  你的修改已经保留。登录后会回到编辑页，不会自动发布。
                </p>
                <button
                  type="button"
                  onClick={() => setFlow("edit")}
                  className={primaryButton}
                >
                  模拟登录并继续
                </button>
              </div>
            ) : null}

            {flow === "publishing" ? (
              <div
                role="status"
                aria-live="polite"
                className="grid place-items-center gap-3 py-12 text-center"
              >
                <span className="size-10 animate-spin rounded-full border-4 border-[#cbd8d0] border-t-[#17664a] motion-reduce:animate-none" />
                <h2 className="text-xl font-black">正在发布修改</h2>
                <p className="text-sm text-[#66766d]">请勿重复提交。</p>
              </div>
            ) : null}

            {flow === "rate-limited" ? (
              <div role="alert" className="grid gap-4">
                <h2 className="text-xl font-black">请在 28 秒后重试</h2>
                <p className="text-sm leading-6 text-[#66766d]">
                  修改已保留，稍后可以安全重试。
                </p>
                <button
                  type="button"
                  onClick={() => setFlow("edit")}
                  className={secondaryButton}
                >
                  返回编辑
                </button>
              </div>
            ) : null}

            {flow === "transient-error" ? (
              <div role="alert" className="grid gap-4">
                <h2 className="text-xl font-black">暂时无法完成发布</h2>
                <p className="text-sm leading-6 text-[#66766d]">
                  修改仍在本机，没有重复发布。请返回后重试。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPublishOutcome("published");
                    setFlow("edit");
                  }}
                  className={primaryButton}
                >
                  返回编辑
                </button>
              </div>
            ) : null}

            {flow === "conflict" ? (
              <div role="alert" className="grid gap-4">
                <h2 className="text-xl font-black">地点在你编辑期间已更新</h2>
                <p className="text-sm leading-6 text-[#66766d]">
                  最新资料显示楼层为 1/F，你填写的是 {draft.floor}
                  。其他内容已经保留。
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDraft({
                      ...draft,
                      floor: "1/F",
                      warningAcknowledged: false,
                    });
                    setPublishOutcome("published");
                    setFlow("edit");
                  }}
                  className={primaryButton}
                >
                  采用最新楼层并继续
                </button>
                <button
                  type="button"
                  onClick={() => setFlow("edit")}
                  className={secondaryButton}
                >
                  返回编辑
                </button>
              </div>
            ) : null}

            {flow === "published" ? (
              <PublishedCard
                onDone={() => setFlow("browse", "reset")}
                onOpenPlace={() => setFlow("place")}
                onOpenChangeset={() => setFlow("changeset")}
              />
            ) : null}

            {flow === "place-history" ||
            flow === "changeset" ||
            flow === "discussion" ||
            flow === "map-note" ? (
              <TraceabilityPanel
                flow={flow}
                setFlow={setFlow}
                onDone={() => setFlow("place")}
                onEditFromNote={() => {
                  setDraft({
                    ...draft,
                    mode: "edit",
                    warningAcknowledged: false,
                  });
                  setFlow("edit");
                }}
              />
            ) : null}
          </div>
          {flow === "placement" ? (
            <div className="absolute inset-x-0 bottom-0 border-t bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:hidden">
              <button
                type="button"
                onClick={() => setFlow("edit")}
                className={cn(primaryButton, "w-full")}
              >
                确认位置并填写资料
              </button>
            </div>
          ) : null}
          {flow === "edit" ? (
            <div className="absolute inset-x-0 bottom-0 border-t bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
              <button
                type="button"
                disabled={!isDirty}
                onClick={attemptPublish}
                className={cn(
                  primaryButton,
                  "flex w-full items-center justify-center gap-2 disabled:cursor-not-allowed disabled:bg-[#9aa79f]",
                )}
              >
                <SendIcon aria-hidden="true" className="size-4" />
                {draft.mode === "add" ? "发布新地点" : "发布修改"}
              </button>
            </div>
          ) : null}
          <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
            <AlertDialogContent className="z-[150] before:fixed before:inset-0 before:-z-10 before:bg-black/25">
              <AlertDialogHeader>
                <AlertDialogTitle>放弃未发布的修改？</AlertDialogTitle>
                <AlertDialogDescription>
                  位置和填写的地点资料都会从此原型 session 清除。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>继续编辑</AlertDialogCancel>
                <AlertDialogAction
                  onClick={discardOperation}
                  className="bg-[#9f2f25] text-white hover:bg-[#86271f]"
                >
                  放弃修改
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog
            open={confirmDuplicate}
            onOpenChange={setConfirmDuplicate}
          >
            <AlertDialogContent className="z-[150] before:fixed before:inset-0 before:-z-10 before:bg-black/25">
              <AlertDialogHeader>
                <AlertDialogTitle>附近可能已有相同地点</AlertDialogTitle>
                <AlertDialogDescription>
                  大学图书馆 G/F 已有一个{preset.label}
                  。请先确认这不是同一个服务位置。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>返回检查</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    setConfirmDuplicate(false);
                    setDraft({ ...draft, warningAcknowledged: true });
                    publish();
                  }}
                  className="bg-[#17664a] text-white hover:bg-[#12553d]"
                >
                  不是同一个，继续发布
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <AlertDialog open={showAbuseReport} onOpenChange={setShowAbuseReport}>
            <AlertDialogContent className="z-[150] before:fixed before:inset-0 before:-z-10 before:bg-black/25">
              <AlertDialogHeader>
                <AlertDialogTitle>这是地图问题还是内容滥用？</AlertDialogTitle>
                <AlertDialogDescription>
                  地点资料或位置有误，请使用“地图备注”；垃圾内容、骚扰或恶意编辑才使用滥用举报。
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>取消</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => setShowAbuseReport(false)}
                  className="bg-[#9f2f25] text-white hover:bg-[#86271f]"
                >
                  继续举报滥用
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </aside>

        <div className="absolute inset-0 min-h-0 md:relative md:order-2">
          <MapCanvas
            selected={selected}
            picking={flow === "placement"}
            precision={draft.positionPrecision}
            pointX={draft.mapX}
            pointY={draft.mapY}
            onPick={(mapX, mapY) => {
              setDraft({
                ...draft,
                mapX,
                mapY,
                warningAcknowledged: false,
              });
            }}
          />
          <div className="absolute inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] flex flex-wrap items-start justify-between gap-2">
            <div className="flex overflow-hidden rounded-md border bg-white shadow-lg">
              <button
                type="button"
                onClick={startAddingPoint}
                className={cn(
                  "flex min-h-11 items-center gap-2 border-r px-3 text-sm font-bold",
                  flow === "placement" && "bg-[#dbece2] text-[#17664a]",
                  focusRing,
                )}
              >
                <PlusIcon aria-hidden="true" className="size-4" /> 点
              </button>
              <span className="flex min-h-11 items-center px-3 text-xs font-bold text-[#66766d]">
                Campus Map 仅编辑地点
              </span>
            </div>
          </div>

          {flow === "browse" ? (
            <button
              type="button"
              aria-label="选择大学图书馆饮水点"
              onClick={() => {
                setDraft(existingDraft);
                setFlow("place");
              }}
              className={cn(
                "absolute left-[44%] top-[39%] size-14 rounded-full",
                focusRing,
              )}
            />
          ) : null}

          {flow === "edit" ? (
            <details className="absolute bottom-[calc(48dvh+0.75rem)] right-3 z-40 rounded-lg border bg-[#172d25] text-xs text-white shadow-lg md:bottom-16">
              <summary
                className={cn(
                  "min-h-11 cursor-pointer list-none px-3 py-3 font-bold",
                  focusRing,
                )}
              >
                Prototype：发布结果
              </summary>
              <label className="grid gap-1 border-t border-white/15 p-3">
                模拟服务器响应
                <select
                  aria-label="模拟服务器响应"
                  value={publishOutcome}
                  onChange={(event) =>
                    setPublishOutcome(event.target.value as PublishOutcome)
                  }
                  className="min-h-11 rounded-md bg-white px-2 text-[#17382d]"
                >
                  <option value="published">成功发布</option>
                  <option value="authentication-required">需要登录</option>
                  <option value="rate-limited">触发限流</option>
                  <option value="transient-error">暂时失败</option>
                  <option value="conflict">版本冲突</option>
                </select>
              </label>
            </details>
          ) : null}

          <div className="absolute bottom-3 right-3 rounded-md border bg-white/95 px-3 py-2 text-[10px] font-bold text-[#66766d] shadow">
            数据 © CUpedia contributors · 底图 高德
          </div>
        </div>
      </div>
    </div>
  );
}

function StepHeader({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        aria-label="返回上一步"
        onClick={onBack}
        className={cn(
          "grid size-11 place-items-center rounded-full border bg-white",
          focusRing,
        )}
      >
        <ArrowLeftIcon aria-hidden="true" className="size-5" />
      </button>
      <h2 className="text-xl font-black text-pretty">{title}</h2>
    </div>
  );
}

type VariantProps = {
  flow: Flow;
  setFlow: FlowSetter;
  draft: Draft;
  setDraft: (draft: Draft) => void;
};

function VariantB({ flow, setFlow, draft, setDraft }: VariantProps) {
  const editing = flow === "edit" || flow === "review";
  return (
    <div className="grid min-h-[700px] overflow-hidden rounded-[24px] border border-black/10 bg-white shadow-2xl md:grid-cols-[1fr_360px]">
      <div className="relative min-h-[360px] border-b md:border-b-0 md:border-r">
        <MapCanvas
          selected={flow !== "browse"}
          picking={flow === "placement"}
        />
        <div className="absolute inset-x-4 top-4">
          <SearchBar />
        </div>
        <div className="absolute left-4 top-20 flex gap-2 rounded-xl bg-[#172d25] p-1.5 text-white shadow-lg">
          <button
            type="button"
            onClick={() => setFlow("placement")}
            className={cn(
              "flex min-h-10 items-center gap-2 rounded-lg px-3 text-xs font-bold hover:bg-white/10",
              focusRing,
            )}
          >
            <PlusIcon aria-hidden="true" className="size-4" /> Add
          </button>
          <button
            type="button"
            disabled={!editing}
            className="grid size-10 place-items-center rounded-lg disabled:opacity-35"
            aria-label="撤销"
          >
            <Undo2Icon aria-hidden="true" className="size-4" />
          </button>
          <button
            type="button"
            disabled={!editing}
            className="grid size-10 place-items-center rounded-lg disabled:opacity-35"
            aria-label="重做"
          >
            <Redo2Icon aria-hidden="true" className="size-4" />
          </button>
        </div>
        <button
          type="button"
          aria-label="选择大学图书馆饮水点"
          onClick={() => setFlow("place")}
          className={cn(
            "absolute left-[46%] top-[44%] size-12 rounded-full",
            focusRing,
          )}
        />
      </div>

      <aside
        className="min-h-0 overflow-y-auto bg-[#f7f9f6] p-5"
        aria-label="地图资料 Inspector"
      >
        {flow === "browse" ? (
          <div className="grid h-full content-between gap-6">
            <div>
              <p className="text-xs font-extrabold tracking-[0.16em] text-[#7a6331]">
                INSPECTOR
              </p>
              <h2 className="mt-2 text-2xl font-black">选择地图对象</h2>
              <p className="mt-2 text-sm leading-6 text-[#66766d]">
                选择地点查看产品资料；进入编辑后，地图始终保留在旁边。
              </p>
            </div>
            <div className="rounded-2xl border bg-white p-4 text-sm">
              <p className="font-bold">最近编辑</p>
              <p className="mt-1 text-[#66766d]">
                CM-2044 · 修正图书馆开放对象
              </p>
            </div>
          </div>
        ) : null}
        {flow === "place" ? (
          <div>
            <span className="rounded-full bg-[#e5f2f6] px-2.5 py-1 text-xs font-bold text-[#1d7fa3]">
              饮水机
            </span>
            <h2 className="mt-3 text-2xl font-black">大学图书馆饮水点</h2>
            <p className="mt-1 text-sm text-[#66766d]">
              大学图书馆 · G/F · r17
            </p>
            <div className="mt-5 divide-y rounded-2xl border bg-white">
              {[
                ["楼层", "G/F"],
                ["开放对象", "CUHK 成员"],
                ["刷卡要求", "未知"],
              ].map(([key, value]) => (
                <div
                  key={key}
                  className="flex justify-between px-4 py-3 text-sm"
                >
                  <span className="text-[#66766d]">{key}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() => {
                setDraft({ ...initialDraft, mode: "edit", floor: "1/F" });
                setFlow("edit");
              }}
              className={cn(primaryButton, "mt-5 w-full")}
            >
              编辑选中地点
            </button>
            <button
              type="button"
              className={cn(secondaryButton, "mt-3 w-full")}
            >
              查看历史与讨论
            </button>
          </div>
        ) : null}
        {flow === "placement" ? (
          <div>
            <p className="text-xs font-bold text-[#6b7c72]">ADD PLACE</p>
            <h2 className="mt-2 text-2xl font-black">确认中心位置</h2>
            <p className="mt-2 text-sm leading-6 text-[#66766d]">
              大学图书馆 · 楼层级
            </p>
            <button
              type="button"
              onClick={() => {
                setDraft({ ...initialDraft, mode: "add" });
                setFlow("edit");
              }}
              className={cn(primaryButton, "mt-5 w-full")}
            >
              锁定位置并选择饮水机
            </button>
          </div>
        ) : null}
        {flow === "edit" ? (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-[#6b7c72]">
                  DRINKING WATER
                </p>
                <h2 className="mt-1 text-2xl font-black">字段 Inspector</h2>
              </div>
              <button
                type="button"
                aria-label="取消编辑"
                onClick={() => setFlow("place")}
                className={cn(
                  "grid size-10 place-items-center rounded-full border",
                  focusRing,
                )}
              >
                <XIcon aria-hidden="true" className="size-4" />
              </button>
            </div>
            <div className="mt-5 grid gap-4">
              <Field
                label="名称"
                value={draft.name}
                onChange={(name) => setDraft({ ...draft, name })}
              />
              <Field
                label="楼层"
                value={draft.floor}
                onChange={(floor) => setDraft({ ...draft, floor })}
              />
              <Field
                label="开放对象"
                value={draft.access}
                onChange={(access) => setDraft({ ...draft, access })}
              />
              <Field
                label="Changeset 说明"
                value={draft.comment}
                onChange={(comment) => setDraft({ ...draft, comment })}
                multiline
              />
            </div>
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#fff5d8] p-3 text-xs font-bold text-[#725819]">
              <CircleAlertIcon aria-hidden="true" className="size-4" />{" "}
              Warning：附近有同类地点
            </div>
            <button
              type="button"
              onClick={() => setFlow("review")}
              className={cn(primaryButton, "mt-5 w-full")}
            >
              查看 1 项修改
            </button>
          </div>
        ) : null}
        {flow === "review" ? (
          <div>
            <h2 className="text-2xl font-black">发布修改</h2>
            <div className="mt-5">
              <ReviewCard
                draft={draft}
                onToggleReview={() =>
                  setDraft({ ...draft, requestReview: !draft.requestReview })
                }
              />
            </div>
            <button
              type="button"
              onClick={() => setFlow("published")}
              className={cn(primaryButton, "mt-5 w-full")}
            >
              发布 Changeset
            </button>
          </div>
        ) : null}
        {flow === "published" ? (
          <PublishedCard
            onDone={() => setFlow("browse", "reset")}
            onOpenPlace={() => setFlow("place")}
            onOpenChangeset={() => setFlow("changeset")}
          />
        ) : null}
      </aside>
    </div>
  );
}

function VariantC({ flow, setFlow, draft, setDraft }: VariantProps) {
  const facts = [
    {
      key: "楼层",
      value: "G/F",
      action: () => {
        setDraft({ ...initialDraft, mode: "edit", floor: "1/F" });
        setFlow("edit");
      },
    },
    {
      key: "开放对象",
      value: "CUHK 成员",
      action: () => {
        setDraft({ ...initialDraft, mode: "edit" });
        setFlow("edit");
      },
    },
    {
      key: "刷卡要求",
      value: "未知",
      action: () => {
        setDraft({ ...initialDraft, mode: "edit" });
        setFlow("edit");
      },
    },
  ];
  return (
    <div className="grid min-h-[700px] overflow-hidden rounded-[28px] border border-black/10 bg-[#eef2ed] shadow-2xl lg:grid-cols-[1fr_330px]">
      <div className="relative min-h-[530px]">
        <MapCanvas selected />
        <div className="absolute inset-x-4 top-4">
          <SearchBar />
        </div>
        <div className="absolute inset-x-3 bottom-3 rounded-[24px] bg-white p-5 shadow-2xl">
          {flow === "published" ? (
            <PublishedCard
              onDone={() => setFlow("place")}
              onOpenPlace={() => setFlow("place")}
              onOpenChangeset={() => setFlow("changeset")}
            />
          ) : flow === "review" ? (
            <>
              <StepHeader title="确认并公开" onBack={() => setFlow("edit")} />
              <div className="mt-4">
                <ReviewCard
                  draft={draft}
                  onToggleReview={() =>
                    setDraft({ ...draft, requestReview: !draft.requestReview })
                  }
                />
              </div>
              <button
                type="button"
                onClick={() => setFlow("published")}
                className={cn(primaryButton, "mt-4 w-full")}
              >
                发布编辑
              </button>
            </>
          ) : flow === "edit" ? (
            <>
              <StepHeader
                title={draft.mode === "add" ? "快速添加饮水点" : "快速修改楼层"}
                onBack={() => setFlow("place")}
              />
              {draft.mode === "edit" ? (
                <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-sm">
                  <span className="rounded-xl bg-[#f1f3f1] px-3 py-3 text-center line-through">
                    G/F
                  </span>
                  <ArrowRightIcon aria-hidden="true" className="size-4" />
                  <input
                    aria-label="建议楼层"
                    value={draft.floor}
                    onChange={(event) =>
                      setDraft({ ...draft, floor: event.target.value })
                    }
                    className={cn(
                      "min-w-0 rounded-xl border px-3 py-3 text-center font-bold",
                      focusRing,
                    )}
                  />
                </div>
              ) : (
                <Field
                  label="所在楼层"
                  value={draft.floor}
                  onChange={(floor) => setDraft({ ...draft, floor })}
                />
              )}
              <Field
                label="修改说明"
                value={draft.comment}
                onChange={(comment) => setDraft({ ...draft, comment })}
                multiline
              />
              <button
                type="button"
                onClick={() => setFlow("review")}
                className={cn(primaryButton, "mt-4 w-full")}
              >
                {draft.mode === "add" ? "复核新增地点" : "复核这 1 项修改"}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="rounded-full bg-[#e5f2f6] px-2.5 py-1 text-xs font-bold text-[#1d7fa3]">
                    饮水机
                  </span>
                  <h2 className="mt-3 text-xl font-black">大学图书馆饮水点</h2>
                  <p className="mt-1 text-sm text-[#66766d]">
                    大学图书馆 · G/F
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDraft({ ...initialDraft, mode: "add" });
                    setFlow("edit");
                  }}
                  className={cn(
                    "grid size-11 place-items-center rounded-full bg-[#17664a] text-white",
                    focusRing,
                  )}
                  aria-label="添加地点"
                >
                  <PlusIcon aria-hidden="true" className="size-5" />
                </button>
              </div>
              <div className="mt-4 divide-y rounded-2xl border">
                {facts.map((fact) => (
                  <button
                    key={fact.key}
                    type="button"
                    onClick={fact.action}
                    className={cn(
                      "flex min-h-12 w-full items-center justify-between px-4 text-sm hover:bg-[#f5f8f5]",
                      focusRing,
                    )}
                  >
                    <span className="text-[#66766d]">{fact.key}</span>
                    <span className="flex items-center gap-2 font-bold">
                      {fact.value}
                      <PencilIcon aria-hidden="true" className="size-3.5" />
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 flex justify-between text-xs font-bold text-[#5d7066]">
                <button type="button" className="min-h-11 px-2">
                  查看 17 个版本
                </button>
                <button type="button" className="min-h-11 px-2">
                  留下地图备注
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      <aside
        className="hidden border-l bg-white p-5 lg:block"
        aria-label="最近编辑"
      >
        <div className="flex items-center gap-2">
          <HistoryIcon aria-hidden="true" className="size-5 text-[#17664a]" />
          <h2 className="font-black">附近最近编辑</h2>
        </div>
        <div className="mt-5 grid gap-3">
          {[
            ["修正图书馆开放对象", "CM-2044 · 12 天前"],
            ["新增伍何曼原楼饮水点", "CM-2039 · 18 天前"],
            ["恢复崇基书院打印点", "CM-2028 · 1 个月前"],
          ].map(([title, meta]) => (
            <article key={title} className="rounded-2xl border p-4">
              <h3 className="text-sm font-bold">{title}</h3>
              <p className="mt-2 text-xs text-[#66766d]">{meta}</p>
              <div className="mt-3 flex gap-2 text-[10px] font-bold text-[#17664a]">
                <span>1 项修改</span>
                <span>0 条讨论</span>
              </div>
            </article>
          ))}
        </div>
        <button type="button" className={cn(secondaryButton, "mt-4 w-full")}>
          查看全部 Changesets
        </button>
      </aside>
    </div>
  );
}

function PrototypeSwitcher({
  variant,
  onChange,
}: {
  variant: Variant;
  onChange: (variant: Variant) => void;
}) {
  const index = variants.findIndex((item) => item.id === variant);
  const current = variants[index];
  const cycle = (direction: -1 | 1) =>
    onChange(
      variants[(index + direction + variants.length) % variants.length].id,
    );
  return (
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[120] hidden -translate-x-1/2 items-center gap-2 rounded-full border border-white/15 bg-[#172d25] p-1.5 text-white shadow-2xl md:flex">
      <button
        type="button"
        aria-label="上一个方案"
        onClick={() => cycle(-1)}
        className={cn(
          "grid size-10 place-items-center rounded-full hover:bg-white/10",
          focusRing,
        )}
      >
        <ChevronLeftIcon aria-hidden="true" className="size-5" />
      </button>
      <div className="min-w-[172px] px-2 text-center">
        <p className="text-xs font-black">
          {current.id} — {current.name}
        </p>
        <p className="mt-0.5 text-[10px] text-white/65">{current.note}</p>
      </div>
      <button
        type="button"
        aria-label="下一个方案"
        onClick={() => cycle(1)}
        className={cn(
          "grid size-10 place-items-center rounded-full hover:bg-white/10",
          focusRing,
        )}
      >
        <ChevronRightIcon aria-hidden="true" className="size-5" />
      </button>
    </div>
  );
}

export function OpenEditUiPrototype() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requested = searchParams.get("variant")?.toUpperCase();
  const variant: Variant =
    requested === "B" || requested === "C" ? requested : "A";
  const requestedFlow = parseFlow(searchParams.get("screen"));
  const [flow, setFlowState] = useState<Flow>(
    requestedFlow ?? (variant === "C" ? "place" : "browse"),
  );
  const [draft, setDraft] = useState<Draft>(initialDraft);
  const [draftStorageReady, setDraftStorageReady] = useState(false);
  const flowDepthRef = useRef(0);
  const resetAfterPopRef = useRef<Flow | null>(null);

  useEffect(() => {
    const restoreDraft = window.setTimeout(() => {
      const storedDraft = window.sessionStorage.getItem(
        "campus-map-open-edit-draft",
      );
      if (storedDraft) {
        try {
          setDraft({ ...initialDraft, ...(JSON.parse(storedDraft) as Draft) });
        } catch {
          window.sessionStorage.removeItem("campus-map-open-edit-draft");
        }
      }
      setDraftStorageReady(true);
    }, 0);
    return () => window.clearTimeout(restoreDraft);
  }, []);

  useEffect(() => {
    if (!draftStorageReady) return;
    if (isDraftDirty(flow, draft)) {
      window.sessionStorage.setItem(
        "campus-map-open-edit-draft",
        JSON.stringify(draft),
      );
    } else if (flow === "browse" || flow === "published") {
      window.sessionStorage.removeItem("campus-map-open-edit-draft");
    }
  }, [draft, draftStorageReady, flow]);

  const setFlow = useCallback<FlowSetter>((next, navigation = "push") => {
    setFlowState(next);
    const url = new URL(window.location.href);
    if (next === "browse") url.searchParams.delete("screen");
    else url.searchParams.set("screen", next);
    if (navigation === "reset") {
      const depth = flowDepthRef.current;
      flowDepthRef.current = 0;
      if (depth > 0) {
        resetAfterPopRef.current = next;
        window.history.go(-depth);
      } else {
        window.history.replaceState(
          { campusMapPrototypeFlow: next, campusMapPrototypeDepth: 0 },
          "",
          url,
        );
      }
      return;
    }
    if (navigation === "push") flowDepthRef.current += 1;
    const method = navigation === "replace" ? "replaceState" : "pushState";
    window.history[method](
      {
        campusMapPrototypeFlow: next,
        campusMapPrototypeDepth: flowDepthRef.current,
      },
      "",
      url,
    );
  }, []);

  const stateLabel = useMemo(
    () => `${variant}:${flow}:${draft.mode}:${draft.floor}`,
    [variant, flow, draft.mode, draft.floor],
  );

  const changeVariant = useCallback(
    (next: Variant) => {
      if (
        isDraftDirty(flow, draft) &&
        !window.confirm("切换方案会放弃未保存的地图修改，是否继续？")
      ) {
        return;
      }
      setFlowState(next === "C" ? "place" : "browse");
      setDraft(initialDraft);
      router.replace(`${pathname}?variant=${next}`, { scroll: false });
    },
    [draft, flow, pathname, router],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (
        event.altKey &&
        (event.key === "ArrowLeft" || event.key === "ArrowRight")
      ) {
        const index = variants.findIndex((item) => item.id === variant);
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        changeVariant(
          variants[(index + direction + variants.length) % variants.length].id,
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [changeVariant, variant]);

  useEffect(() => {
    if (window.history.state?.campusMapPrototypeDepth === undefined) {
      window.history.replaceState(
        {
          ...window.history.state,
          campusMapPrototypeFlow: flow,
          campusMapPrototypeDepth: 0,
        },
        "",
        window.location.href,
      );
    }
  }, [flow]);

  useEffect(() => {
    const restoreFlowFromHistory = (event: PopStateEvent) => {
      const url = new URL(window.location.href);
      if (resetAfterPopRef.current) {
        const resetTarget = resetAfterPopRef.current;
        resetAfterPopRef.current = null;
        if (resetTarget === "browse") url.searchParams.delete("screen");
        else url.searchParams.set("screen", resetTarget);
        flowDepthRef.current = 0;
        setFlowState(resetTarget);
        window.history.pushState(
          { campusMapPrototypeFlow: resetTarget, campusMapPrototypeDepth: 0 },
          "",
          url,
        );
        return;
      }
      flowDepthRef.current = event.state?.campusMapPrototypeDepth ?? 0;
      setFlowState(
        parseFlow(url.searchParams.get("screen")) ??
          (variant === "C" ? "place" : "browse"),
      );
    };
    window.addEventListener("popstate", restoreFlowFromHistory);
    return () => window.removeEventListener("popstate", restoreFlowFromHistory);
  }, [variant]);

  return (
    <div className="fixed inset-0 z-[100] h-dvh w-full min-w-0 overflow-hidden bg-[#e9eee9] text-[#17382d] md:px-4 md:pb-24 md:pt-5">
      <style>{`nextjs-portal { display: none !important; }`}</style>
      <header className="pointer-events-none absolute right-4 top-4 z-[110] hidden max-w-[440px] lg:block">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-extrabold tracking-[0.16em] text-[#95681f]">
              PROTOTYPE · 不进入生产
            </p>
            <h1 className="mt-2 text-2xl font-black text-pretty">
              Campus Map 开放编辑
            </h1>
            <p className="mt-2 text-sm text-[#66766d]">
              单页发布 · 公开历史 · 事后讨论与回滚
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-[#cbd8d0] bg-white px-3 py-2 text-xs font-bold">
            <span className="size-2 rounded-full bg-[#25a26d]" /> 直接发布模式
          </div>
        </div>
        <div className="mt-4">
          <StateStrip
            variant={variant}
            flow={flow}
            draft={draft}
            key={stateLabel}
          />
        </div>
      </header>
      <main className="mx-auto h-full max-w-[1120px]" id="prototype-main">
        {variant === "A" ? (
          <div className="h-full">
            <VariantA
              flow={flow}
              setFlow={setFlow}
              draft={draft}
              setDraft={setDraft}
            />
          </div>
        ) : null}
        {variant === "B" ? (
          <VariantB
            flow={flow}
            setFlow={setFlow}
            draft={draft}
            setDraft={setDraft}
          />
        ) : null}
        {variant === "C" ? (
          <VariantC
            flow={flow}
            setFlow={setFlow}
            draft={draft}
            setDraft={setDraft}
          />
        ) : null}
      </main>
      <p className="sr-only">
        Alt + ← / → 切换方案。所有发布和 Changeset
        都是本地演示，不会修改真实地图。
      </p>
      <PrototypeSwitcher variant={variant} onChange={changeVariant} />
    </div>
  );
}
