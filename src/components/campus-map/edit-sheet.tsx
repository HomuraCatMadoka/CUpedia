"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDownIcon, MapPinIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { AMAP_PROTOTYPE_BUILDINGS } from "@/lib/campus-map/amap-prototype-catalog";
import type { AmapPlaceContextResult } from "@/lib/campus-map/amap-place-context";
import {
  isCampusMapEditDirty,
  type CampusMapEditEvent,
  type CampusMapIndoorLocationDisplay,
  type CampusMapEditSession,
} from "@/lib/campus-map/edit-session";
import { CAMPUS_MAP_EDIT_SCHEMA } from "@/lib/campus-map/edit-schema";
import type {
  CampusMapPublishFactInput,
  CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish-contract";
import type { CampusMapFactSchema } from "@/lib/campus-map/fact-store";

interface CampusMapEditSheetProps {
  session: CampusMapEditSession;
  centerPosition: readonly [number, number];
  placementPending?: boolean;
  placeContext?: AmapPlaceContextResult | { status: "loading" } | null;
  factSchema?: CampusMapFactSchema | null;
  onEvent(event: CampusMapEditEvent): void;
}

const fieldClass =
  "mt-1 min-h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-base outline-none focus-visible:border-[#176346] focus-visible:ring-2 focus-visible:ring-[#176346]/25";
const primaryClass =
  "min-h-11 w-full touch-manipulation rounded-xl bg-[#174b38] px-4 text-sm font-semibold text-white hover:bg-[#123d2e] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2 motion-reduce:transform-none";
const secondaryClass =
  "min-h-11 touch-manipulation rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold hover:bg-neutral-50 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] motion-reduce:transform-none";

function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function nowLocal(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function observationSource(
  localTime: string,
  timestamp: number,
): CampusMapPublishSourceInput {
  return {
    kind: "field-observation",
    ref: `现场观察 ${localTime.replace("T", " ")}`,
    url: null,
    owner: null,
    version: null,
    snapshotHash: null,
    accessedOn: today(),
    observedAt: new Date(timestamp).toISOString(),
    rightsStatus: "original-observation",
    limitations: null,
    note: null,
    sourceCoordinate: null,
  };
}

const WEEKDAYS = [
  ["mon", "一"],
  ["tue", "二"],
  ["wed", "三"],
  ["thu", "四"],
  ["fri", "五"],
  ["sat", "六"],
  ["sun", "日"],
] as const;

function messageForError(code: string): string {
  const messages: Record<string, string> = {
    "fact-name-required": "请填写地点名称。",
    "source-required": "请提供资料来源。",
    "invalid-location": "位置资料不完整，请重新定位。",
    "base-revision-conflict": "地点资料已被其他人更新。",
    "invalid-place-id": "这个过渡地点尚未连接到正式 Place。",
  };
  return messages[code] ?? `服务器未接受这项资料（${code}）。`;
}

function matchingDisplay(
  fact: CampusMapEditSession["draft"]["fact"],
  display: CampusMapIndoorLocationDisplay | null | undefined,
): CampusMapIndoorLocationDisplay | null {
  if (
    !display ||
    (fact.location?.kind !== "building" && fact.location?.kind !== "floor") ||
    display.buildingId !== fact.buildingId ||
    display.floorId !== fact.floorId
  ) {
    return null;
  }
  return display;
}

function describeLocation(
  fact: CampusMapEditSession["draft"]["fact"],
  display?: CampusMapIndoorLocationDisplay | null,
): string {
  if (!fact.location) return "尚未定位";
  if (fact.location.kind === "outdoor-point") {
    return `${fact.location.longitude.toFixed(6)}, ${fact.location.latitude.toFixed(6)} · WGS84 · ${
      fact.location.precision === "precise" ? "精确" : "约略"
    }`;
  }
  const canonicalDisplay = matchingDisplay(fact, display);
  const prototypeBuilding = AMAP_PROTOTYPE_BUILDINGS.find(
    (building) => building.id === fact.buildingId,
  );
  const buildingName =
    canonicalDisplay?.buildingName ?? prototypeBuilding?.name;
  if (fact.location.kind === "floor") {
    if (buildingName && canonicalDisplay?.floorLabel) {
      return `${buildingName} · ${canonicalDisplay.floorLabel}`;
    }
    if (buildingName && prototypeBuilding) {
      return `${buildingName} · 楼层 ${fact.floorId ?? "未知"}`;
    }
    return "建筑内楼层";
  }
  return buildingName ?? "建筑位置";
}

function friendlyLocationLabel(
  fact: CampusMapEditSession["draft"]["fact"],
  display?: CampusMapIndoorLocationDisplay | null,
): string {
  if (fact.location?.kind === "outdoor-point") {
    return "地图上的地点";
  }
  if (fact.buildingId) {
    return (
      matchingDisplay(fact, display)?.buildingName ??
      AMAP_PROTOTYPE_BUILDINGS.find(
        (building) => building.id === fact.buildingId,
      )?.name ??
      "建筑内位置"
    );
  }
  return "尚未定位";
}

const observationTimeFormatter = new Intl.DateTimeFormat("zh-HK", {
  timeZone: "Asia/Hong_Kong",
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function formatObservationTime(value: string | null): string {
  if (!value) return "未记录";
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return "未记录";
  return `${observationTimeFormatter.format(parsed)}（香港时间）`;
}

type ConflictChoiceKey =
  | Exclude<
      keyof CampusMapPublishFactInput,
      "buildingId" | "floorId" | "location"
    >
  | "preset"
  | "placement";

interface ConflictChoice {
  key: ConflictChoiceKey;
  label: string;
  fields: Array<keyof CampusMapPublishFactInput>;
}

function conflictFields(session: CampusMapEditSession): ConflictChoice[] {
  if (session.conflict?.kind !== "current") return [];
  const current = session.conflict.currentFact;
  const presetChoices: ConflictChoice[] =
    session.draft.fact.pinType === current.pinType
      ? [
          {
            key: "capabilities",
            label: "服务能力",
            fields: ["capabilities"],
          },
          { key: "gender", label: "性别属性", fields: ["gender"] },
        ]
      : [
          {
            key: "preset",
            label: "地点类型及相关资料",
            fields: ["pinType", "capabilities", "gender"],
          },
        ];
  const choices: ConflictChoice[] = [
    { key: "name", label: "名称", fields: ["name"] },
    ...presetChoices,
    {
      key: "wheelchairAccess",
      label: "无障碍通行",
      fields: ["wheelchairAccess"],
    },
    { key: "audience", label: "开放对象", fields: ["audience"] },
    {
      key: "credentialRequirement",
      label: "凭证要求",
      fields: ["credentialRequirement"],
    },
    {
      key: "accessSchedule",
      label: "开放时间",
      fields: ["accessSchedule"],
    },
    {
      key: "reservationRequirement",
      label: "预约要求",
      fields: ["reservationRequirement"],
    },
    {
      key: "temporaryStatus",
      label: "临时状态",
      fields: ["temporaryStatus"],
    },
    {
      key: "placement",
      label: "位置",
      fields: ["buildingId", "floorId", "location"],
    },
    { key: "observedAt", label: "观察时间", fields: ["observedAt"] },
  ];
  return choices.filter((choice) =>
    choice.fields.some(
      (field) =>
        JSON.stringify(session.draft.fact[field]) !==
        JSON.stringify(current[field]),
    ),
  );
}

function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

function presetConflictValue(
  fact: CampusMapEditSession["draft"]["fact"],
): string {
  const label =
    CAMPUS_MAP_EDIT_SCHEMA.presets.find(
      (preset) => preset.pinType === fact.pinType,
    )?.label ?? fact.pinType;
  if (fact.pinType === "printer") {
    const capabilities = fact.capabilities.map((capability) =>
      optionLabel(CAMPUS_MAP_EDIT_SCHEMA.options.capabilities, capability),
    );
    return `${label} · 服务：${capabilities.join("、") || "未填写"}`;
  }
  if (fact.pinType === "toilet") {
    return `${label} · 性别：${optionLabel(
      CAMPUS_MAP_EDIT_SCHEMA.options.gender,
      fact.gender,
    )}`;
  }
  return label;
}

function scheduleConflictValue(
  fact: CampusMapEditSession["draft"]["fact"],
): string {
  if (fact.accessSchedule.kind !== "weekly") {
    return optionLabel(
      CAMPUS_MAP_EDIT_SCHEMA.options.accessSchedule,
      fact.accessSchedule.kind,
    );
  }
  if (!fact.accessSchedule.intervals.length) return "每周时段（未填写）";
  return fact.accessSchedule.intervals
    .map((interval) => {
      const days = interval.days
        .map(
          (day) => `周${WEEKDAYS.find(([value]) => value === day)?.[1] ?? day}`,
        )
        .join("、");
      return `${days} ${interval.opensAt}–${interval.closesAt}`;
    })
    .join("；");
}

function conflictValue(
  choice: ConflictChoice,
  fact: CampusMapEditSession["draft"]["fact"],
  display?: CampusMapIndoorLocationDisplay | null,
): string {
  switch (choice.key) {
    case "name":
      return fact.name.trim() || "未填写";
    case "pinType":
    case "preset":
      return presetConflictValue(fact);
    case "capabilities":
      return (
        fact.capabilities
          .map((capability) =>
            optionLabel(
              CAMPUS_MAP_EDIT_SCHEMA.options.capabilities,
              capability,
            ),
          )
          .join("、") || "未填写"
      );
    case "gender":
      return optionLabel(CAMPUS_MAP_EDIT_SCHEMA.options.gender, fact.gender);
    case "wheelchairAccess":
      return optionLabel(
        CAMPUS_MAP_EDIT_SCHEMA.options.wheelchairAccess,
        fact.wheelchairAccess,
      );
    case "audience":
      return optionLabel(
        CAMPUS_MAP_EDIT_SCHEMA.options.audience,
        fact.audience,
      );
    case "credentialRequirement":
      return optionLabel(
        CAMPUS_MAP_EDIT_SCHEMA.options.credentialRequirement,
        fact.credentialRequirement,
      );
    case "accessSchedule":
      return scheduleConflictValue(fact);
    case "reservationRequirement":
      return optionLabel(
        CAMPUS_MAP_EDIT_SCHEMA.options.reservationRequirement,
        fact.reservationRequirement,
      );
    case "temporaryStatus":
      return optionLabel(
        CAMPUS_MAP_EDIT_SCHEMA.options.temporaryStatus,
        fact.temporaryStatus,
      );
    case "placement":
      return describeLocation(fact, display);
    case "observedAt":
      return formatObservationTime(fact.observedAt);
  }
}

function SelectField<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  field,
}: {
  id: string;
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange(value: T): void;
  field: string;
}) {
  return (
    <label className="block text-sm font-medium" htmlFor={id}>
      {label}
      <select
        id={id}
        name={field}
        autoComplete="off"
        data-edit-field={field}
        className={fieldClass}
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
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

export function CampusMapEditSheet({
  session,
  centerPosition,
  placementPending = false,
  placeContext = null,
  factSchema,
  onEvent,
}: CampusMapEditSheetProps) {
  const fieldPrefix = useId();
  const [keyboardLongitude, setKeyboardLongitude] = useState(
    String(centerPosition[0]),
  );
  const [keyboardLatitude, setKeyboardLatitude] = useState(
    String(centerPosition[1]),
  );
  const [sourceObservedAt, setSourceObservedAt] = useState(nowLocal);
  const [showCoordinateEntry, setShowCoordinateEntry] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);
  const [showSourceEntry, setShowSourceEntry] = useState(false);
  const [conflictSelection, setConflictSelection] = useState<{
    key: string;
    fields: ConflictChoiceKey[];
  }>({ key: "", fields: [] });
  const draft = session.draft;
  const fact = draft.fact;
  const preset =
    CAMPUS_MAP_EDIT_SCHEMA.presets.find(
      (item) => item.pinType === fact.pinType,
    ) ?? CAMPUS_MAP_EDIT_SCHEMA.presets[0];
  const serverApplicableFields =
    factSchema?.definition.pinTypes[fact.pinType].applicableFields;
  const visible = new Set(
    serverApplicableFields
      ? preset.fields.filter(
          (field) =>
            field === "sources" || serverApplicableFields.includes(field),
        )
      : preset.fields,
  );
  const freshAttempt = () =>
    session.status === "temporarily-unavailable"
      ? { idempotencyKey: crypto.randomUUID() }
      : {};
  const updateFact = (next: CampusMapEditSession["draft"]["fact"]) =>
    onEvent({ type: "CHANGE_FACT", fact: next, ...freshAttempt() });
  const updateSources = (sources: CampusMapPublishSourceInput[]) =>
    onEvent({ type: "CHANGE_SOURCES", sources, ...freshAttempt() });
  const fullFact = fact;
  const weeklySchedule =
    fact.accessSchedule.kind === "weekly" ? fact.accessSchedule : null;
  const fieldLabel = (field: string, fallback: string) =>
    factSchema?.displayMetadata[field]?.label ?? fallback;
  const conflictKey =
    session.status === "conflict" && session.conflict?.kind === "current"
      ? `${session.draft.idempotencyKey}:${session.conflict.currentRevisionId}`
      : "";
  const conflictKeepFields =
    conflictSelection.key === conflictKey ? conflictSelection.fields : [];
  const optionalFieldNames = new Set([
    "gender",
    "capabilities",
    "wheelchairAccess",
    "audience",
    "credentialRequirement",
    "accessSchedule",
    "reservationRequirement",
    "temporaryStatus",
  ]);
  const hasOptionalServerError = Boolean(
    session.serverErrors?.some(
      (error) =>
        error.anchor.field !== undefined &&
        optionalFieldNames.has(error.anchor.field),
    ),
  );
  const hasOptionalLocalError =
    session.localError !== undefined &&
    optionalFieldNames.has(session.localError);
  const optionalDetailsVisible =
    showMoreDetails || hasOptionalServerError || hasOptionalLocalError;
  const sourceEntryExpanded =
    showSourceEntry ||
    session.localError === "sources" ||
    session.localError === "sourceObservedAt";

  if (session.status === "published" && session.receipt) {
    const receipt = session.receipt;
    return (
      <div className="grid gap-3 p-5" aria-live="polite">
        <p className="text-xs font-bold tracking-[0.14em] text-[#567166]">
          PUBLISHED
        </p>
        <h2
          id="campus-map-panel-title"
          tabIndex={-1}
          className="rounded-sm text-xl font-semibold text-balance focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
        >
          地点资料已公开
        </h2>
        <p className="text-sm text-neutral-600">
          此次发布已生成不可改写的公开记录。
        </p>
        <Link
          className={secondaryClass}
          href={`/campus-map/places/${receipt.placeId}`}
        >
          查看 Place
        </Link>
        <Link
          className={secondaryClass}
          href={`/campus-map/changesets/${receipt.changesetId}`}
        >
          查看此次 Changeset
        </Link>
        <Link
          className={secondaryClass}
          href={`/campus-map/places/${receipt.placeId}/history`}
        >
          查看 History
        </Link>
      </div>
    );
  }

  const isPlacing = session.status === "placing";
  const placementPosition =
    draft.placementCandidate ??
    ({
      longitude: centerPosition[0],
      latitude: centerPosition[1],
      crs: "wgs84",
      precision: "approximate",
      method: "pointer",
    } as const);
  const keyboardLongitudeNumber = Number(keyboardLongitude);
  const keyboardLatitudeNumber = Number(keyboardLatitude);
  const keyboardValid =
    keyboardLongitude.trim() !== "" &&
    keyboardLatitude.trim() !== "" &&
    Number.isFinite(keyboardLongitudeNumber) &&
    keyboardLongitudeNumber >= -180 &&
    keyboardLongitudeNumber <= 180 &&
    Number.isFinite(keyboardLatitudeNumber) &&
    keyboardLatitudeNumber >= -90 &&
    keyboardLatitudeNumber <= 90;
  const resolvedContext =
    placeContext?.status === "resolved" ? placeContext.context : null;
  const placementLabel = resolvedContext
    ? `高德识别 · ${resolvedContext.label}`
    : "地图中心位置";
  const placementDescription = resolvedContext?.address
    ? resolvedContext.address
    : placeContext?.status === "loading"
      ? "正在确定位置…"
      : placeContext?.status === "rate-limited"
        ? "地址查询较频繁，可继续填写"
        : placeContext?.status === "transient-error"
          ? "暂时无法识别地址，可继续填写"
          : placeContext?.status === "permanent-error"
            ? "地址服务不可用，可继续填写"
            : placeContext?.status === "empty"
              ? "高德未识别到附近地点，可继续填写"
              : "移动地图，让图钉对准地点";
  const coordinateEntry = isPlacing ? (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
      <button
        type="button"
        aria-expanded={showCoordinateEntry}
        aria-controls={`${fieldPrefix}-coordinate-entry`}
        className="flex min-h-10 w-full touch-manipulation items-center text-left text-sm font-semibold hover:text-[#176346] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
        onClick={() => setShowCoordinateEntry((current) => !current)}
      >
        其他定位方式
      </button>
      {showCoordinateEntry ? (
        <fieldset id={`${fieldPrefix}-coordinate-entry`} className="pb-2">
          <legend className="sr-only">输入坐标定位</legend>
          <p className="mb-3 text-xs leading-5 text-neutral-600">
            无法操作地图时，可以直接输入 WGS84 坐标。
          </p>
          <label className="block text-sm" htmlFor={`${fieldPrefix}-longitude`}>
            经度（WGS84）
            <input
              id={`${fieldPrefix}-longitude`}
              name="campus-map-longitude"
              autoComplete="off"
              className={fieldClass}
              inputMode="decimal"
              value={keyboardLongitude}
              onChange={(event) => setKeyboardLongitude(event.target.value)}
            />
          </label>
          <label
            className="mt-3 block text-sm"
            htmlFor={`${fieldPrefix}-latitude`}
          >
            纬度（WGS84）
            <input
              id={`${fieldPrefix}-latitude`}
              name="campus-map-latitude"
              autoComplete="off"
              className={fieldClass}
              inputMode="decimal"
              value={keyboardLatitude}
              onChange={(event) => setKeyboardLatitude(event.target.value)}
            />
          </label>
          <button
            type="button"
            disabled={!keyboardValid}
            className={cn(primaryClass, "mt-3")}
            onClick={() =>
              onEvent({
                type: "CONFIRM_POSITION",
                position: {
                  longitude: keyboardLongitudeNumber,
                  latitude: keyboardLatitudeNumber,
                  crs: "wgs84",
                  precision: "approximate",
                  method: "keyboard",
                },
              })
            }
          >
            使用输入坐标
          </button>
        </fieldset>
      ) : null}
    </div>
  ) : null;

  if (session.status === "confirm-discard") {
    return (
      <div
        className="grid gap-4 p-5"
        role="alertdialog"
        aria-labelledby="campus-map-panel-title"
      >
        <h2 id="campus-map-panel-title" className="text-xl font-semibold">
          放弃未发布的修改？
        </h2>
        <p className="text-sm text-neutral-600">
          草稿只保存在这个浏览器。放弃后无法恢复。
        </p>
        <button
          type="button"
          data-edit-field="continue-editing"
          autoFocus
          className={primaryClass}
          onClick={() => onEvent({ type: "CONTINUE_EDITING" })}
        >
          继续编辑
        </button>
        <button
          type="button"
          className={secondaryClass}
          onClick={() => onEvent({ type: "DISCARD" })}
        >
          放弃草稿
        </button>
      </div>
    );
  }

  const statusPanel = (() => {
    if (session.status === "warning") {
      return (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
          role="alert"
        >
          <p className="font-semibold">服务器发现需要确认的情况</p>
          {session.warnings?.map((warning) => (
            <p
              key={`${warning.code}:${warning.fingerprint}`}
              className="mt-1 break-all"
            >
              {warning.code} · {warning.fingerprint}
            </p>
          ))}
          <button
            type="button"
            className={cn(primaryClass, "mt-3")}
            onClick={() =>
              onEvent({
                type: "ACKNOWLEDGE_WARNINGS",
                idempotencyKey: crypto.randomUUID(),
              })
            }
          >
            我已确认，重新发布
          </button>
        </div>
      );
    }
    if (session.status === "authentication-required") {
      const callbackUrl =
        typeof window === "undefined"
          ? "/prototype/campus-map"
          : `${window.location.pathname}${window.location.search}`;
      return (
        <div
          className="rounded-xl border bg-neutral-50 p-3 text-sm"
          role="status"
        >
          <p>登录后会回到这份草稿，但不会自动发布。</p>
          <Link
            className={cn(
              primaryClass,
              "mt-3 inline-flex items-center justify-center",
            )}
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          >
            前往登录
          </Link>
        </div>
      );
    }
    if (session.status === "forbidden") {
      const messages = {
        "actor-banned": "账号已被封禁，暂时不能发布地点资料。",
        "profile-incomplete": "账号资料尚未完成，完成后才能发布地点资料。",
        "actor-not-eligible": "这个账号目前没有发布地点资料的资格。",
        "role-not-eligible": "当前账号角色没有发布地点资料的权限。",
        "admin-required": "这项操作只允许管理员发布。",
      } as const;
      return (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-950"
          role="alert"
        >
          <p className="font-semibold">无法发布</p>
          <p className="mt-1">
            {session.forbiddenCode
              ? messages[session.forbiddenCode]
              : "当前账号没有发布这项修改的权限。"}
          </p>
          <p className="mt-1 text-xs">草稿仍保存在这个浏览器中。</p>
        </div>
      );
    }
    if (session.status === "rate-limited") {
      return (
        <div
          className="rounded-xl border bg-neutral-50 p-3 text-sm"
          role="status"
        >
          发布太频繁，请在 {Math.ceil(session.retryAfter ?? 0)} 秒后重试。
          <button
            type="button"
            disabled={(session.retryAfter ?? 0) > 0}
            className={cn(primaryClass, "mt-3")}
            onClick={() => onEvent({ type: "RETRY_PUBLISH" })}
          >
            再次发布
          </button>
        </div>
      );
    }
    if (session.status === "temporarily-unavailable") {
      return (
        <div
          className="rounded-xl border bg-neutral-50 p-3 text-sm"
          role="status"
        >
          服务暂时不可用。重试会沿用同一个发布识别码，不会复制地点。
          <button
            type="button"
            className={cn(primaryClass, "mt-3")}
            onClick={() => onEvent({ type: "RETRY_PUBLISH" })}
          >
            安全重试
          </button>
        </div>
      );
    }
    if (session.status === "conflict") {
      const conflict = session.conflict;
      if (!conflict || conflict.kind === "unavailable") {
        return (
          <div
            className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
            role="alert"
          >
            <p className="font-semibold">无法读取地点的最新版本</p>
            <p className="mt-1">
              你的输入仍已保留，但在重新读取正式地点前不能再次发布。请关闭编辑后重新打开这个地点。
            </p>
          </div>
        );
      }
      const changedFields = conflictFields(session);
      return (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
          role="alert"
        >
          <p className="font-semibold">这处地点刚刚被其他人更新</p>
          <p className="mt-1">你的输入仍保留。请逐项比较后选择要保留的内容。</p>
          {changedFields.length ? (
            <fieldset className="mt-3 rounded-lg border border-amber-300 p-2">
              <legend className="px-1 font-medium">
                明确选择要保留的草稿字段
              </legend>
              {changedFields.map((choice) => {
                const controlId = `${fieldPrefix}-conflict-${String(choice.key)}`;
                const labelId = `${controlId}-label`;
                const descriptionId = `${controlId}-description`;
                return (
                  <label
                    key={choice.key}
                    className="grid min-h-11 grid-cols-[auto_1fr] items-start gap-2 py-1"
                  >
                    <input
                      id={controlId}
                      type="checkbox"
                      name={`conflict-${String(choice.key)}`}
                      aria-labelledby={labelId}
                      aria-describedby={descriptionId}
                      className="mt-1"
                      checked={conflictKeepFields.includes(choice.key)}
                      onChange={(event) =>
                        setConflictSelection((current) => {
                          const fields =
                            current.key === conflictKey ? current.fields : [];
                          return {
                            key: conflictKey,
                            fields: event.target.checked
                              ? [...fields, choice.key]
                              : fields.filter((item) => item !== choice.key),
                          };
                        })
                      }
                    />
                    <span className="min-w-0">
                      <span id={labelId} className="block font-medium">
                        保留我的{choice.label}
                      </span>
                      <span id={descriptionId}>
                        <span className="mt-0.5 block break-words text-xs">
                          我的：
                          {conflictValue(
                            choice,
                            session.draft.fact,
                            session.draft.locationDisplay,
                          )}
                        </span>
                        <span className="block break-words text-xs text-amber-900">
                          最新：
                          {conflictValue(
                            choice,
                            conflict.currentFact,
                            conflict.currentLocationDisplay,
                          )}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className={secondaryClass}
              onClick={() =>
                onEvent({
                  type: "USE_CURRENT_FACT",
                  idempotencyKey: crypto.randomUUID(),
                })
              }
            >
              采用最新资料
            </button>
            <button
              type="button"
              className={primaryClass}
              onClick={() => {
                const keptFactFields = new Set(
                  changedFields
                    .filter(({ key }) => conflictKeepFields.includes(key))
                    .flatMap(({ fields }) => fields),
                );
                onEvent({
                  type: "CONTINUE_FROM_CONFLICT",
                  idempotencyKey: crypto.randomUUID(),
                  fact: Object.fromEntries(
                    Object.entries(conflict.currentFact).map(
                      ([field, value]) => [
                        field,
                        keptFactFields.has(
                          field as keyof CampusMapPublishFactInput,
                        )
                          ? session.draft.fact[
                              field as keyof CampusMapPublishFactInput
                            ]
                          : value,
                      ],
                    ),
                  ) as unknown as CampusMapPublishFactInput,
                });
              }}
            >
              按以上选择继续
            </button>
          </div>
        </div>
      );
    }
    return null;
  })();

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-5 py-4">
        <h2
          id="campus-map-panel-title"
          tabIndex={-1}
          className="rounded-sm pr-10 text-xl font-semibold text-balance focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
        >
          {draft.mode === "add" ? "添加地点" : "建议修改"}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          {isPlacing
            ? draft.mode === "add"
              ? "移动地图，让图钉对准要添加的地点；也可以先填写资料。"
              : "移动地图，让图钉对准地点的新位置。"
            : draft.mode === "add"
              ? "补充这个位置的资料。"
              : "更新地点资料，未修改的内容会保持不变。"}
        </p>
      </div>
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4 pb-28"
        aria-busy={session.status === "publishing"}
        inert={session.status === "publishing" ? true : undefined}
      >
        {statusPanel}
        {session.serverErrors?.length ? (
          <div
            className="rounded-xl bg-red-50 p-3 text-sm text-red-900"
            role="alert"
          >
            {session.serverErrors.map((error) => (
              <p key={`${error.code}:${error.anchor.field}`}>
                {messageForError(error.code)}
              </p>
            ))}
          </div>
        ) : null}
        {visible.has("location") ? (
          <div
            data-edit-field="location"
            tabIndex={-1}
            className="rounded-xl bg-[#edf5f1] p-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
          >
            <div className="flex items-start gap-3">
              <MapPinIcon
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-[#176346]"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold" aria-live="polite">
                  {isPlacing || resolvedContext
                    ? placementLabel
                    : friendlyLocationLabel(fact, draft.locationDisplay)}
                </p>
                <p
                  className="mt-0.5 text-xs text-neutral-600"
                  aria-live="polite"
                >
                  {isPlacing || resolvedContext
                    ? placementDescription
                    : fact.location?.kind === "outdoor-point"
                      ? fact.location.precision === "precise"
                        ? "精确位置"
                        : "约略位置"
                      : describeLocation(fact, draft.locationDisplay)}
                </p>
              </div>
              {!isPlacing ? (
                <button
                  type="button"
                  className="min-h-10 shrink-0 rounded-lg px-2 text-sm font-semibold text-[#176346] hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                  onClick={() =>
                    onEvent({ type: "START_REPOSITION", ...freshAttempt() })
                  }
                >
                  重新定位
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
        {coordinateEntry}
        <label
          className="block text-sm font-medium"
          htmlFor={`${fieldPrefix}-name`}
        >
          {fieldLabel("name", "地点名称")}
          <input
            id={`${fieldPrefix}-name`}
            name="campus-map-place-name"
            autoComplete="off"
            data-edit-field="name"
            className={fieldClass}
            value={fact.name}
            aria-invalid={session.localError === "name"}
            onChange={(event) =>
              updateFact({ ...fullFact, name: event.target.value })
            }
          />
        </label>
        <fieldset
          data-edit-field="pinType"
          tabIndex={-1}
          className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2"
        >
          <legend className="mb-2 text-sm font-medium">
            {fieldLabel("pinType", "地点类型")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {CAMPUS_MAP_EDIT_SCHEMA.presets.map((item) => (
              <label
                key={item.pinType}
                className={cn(
                  "flex min-h-11 shrink-0 cursor-pointer touch-manipulation items-center rounded-xl border px-3 text-sm font-semibold transition-colors active:translate-y-px focus-within:outline-none focus-within:ring-2 focus-within:ring-[#176346] focus-within:ring-offset-2 motion-reduce:transform-none",
                  fact.pinType === item.pinType
                    ? "border-[#176346] bg-[#e4f1eb] text-[#174b38]"
                    : "border-black/15 bg-white text-neutral-700 hover:bg-neutral-50",
                )}
              >
                <input
                  type="radio"
                  name={`${fieldPrefix}-pin-type`}
                  value={item.pinType}
                  checked={fact.pinType === item.pinType}
                  className="sr-only"
                  data-edit-field={
                    fact.pinType === item.pinType ? "pinType" : undefined
                  }
                  onChange={() => {
                    const pinType = item.pinType;
                    updateFact({
                      ...fullFact,
                      pinType,
                      name: fact.name.trim() ? fact.name : item.defaultName,
                      capabilities:
                        pinType === "printer" ? fact.capabilities : [],
                      gender: pinType === "toilet" ? fact.gender : "unknown",
                    });
                  }}
                />
                {item.label}
              </label>
            ))}
          </div>
        </fieldset>
        <button
          type="button"
          hidden={isPlacing}
          aria-expanded={optionalDetailsVisible}
          aria-controls={`${fieldPrefix}-optional-details`}
          className="flex min-h-11 w-full items-center justify-between rounded-xl border border-black/15 bg-white px-3 text-left text-sm font-semibold hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
          onClick={() => setShowMoreDetails((current) => !current)}
        >
          <span>更多资料</span>
          <ChevronDownIcon
            aria-hidden="true"
            className={cn(
              "size-4 transition-transform motion-reduce:transition-none",
              optionalDetailsVisible && "rotate-180",
            )}
          />
        </button>
        <div
          id={`${fieldPrefix}-optional-details`}
          className="space-y-4"
          hidden={isPlacing || !optionalDetailsVisible}
        >
          {visible.has("gender") ? (
            <SelectField
              id={`${fieldPrefix}-gender`}
              field="gender"
              label={fieldLabel("gender", "性别属性")}
              value={fact.gender}
              options={CAMPUS_MAP_EDIT_SCHEMA.options.gender}
              onChange={(gender) => updateFact({ ...fullFact, gender })}
            />
          ) : null}
          {visible.has("capabilities") ? (
            <fieldset
              data-edit-field="capabilities"
              tabIndex={-1}
              className="rounded-xl border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
            >
              <legend className="px-1 text-sm font-medium">
                {fieldLabel("capabilities", "服务能力")}
              </legend>
              {CAMPUS_MAP_EDIT_SCHEMA.options.capabilities.map((option) => (
                <label
                  key={option.value}
                  className="mr-4 inline-flex min-h-11 items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    name={`${fieldPrefix}-capabilities`}
                    checked={fact.capabilities.includes(option.value)}
                    onChange={(event) =>
                      updateFact({
                        ...fullFact,
                        capabilities: event.target.checked
                          ? [...fact.capabilities, option.value]
                          : fact.capabilities.filter(
                              (item) => item !== option.value,
                            ),
                      })
                    }
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
          ) : null}
          {visible.has("wheelchairAccess") ? (
            <SelectField
              id={`${fieldPrefix}-wheelchair`}
              field="wheelchairAccess"
              label={fieldLabel("wheelchairAccess", "无障碍通行")}
              value={fact.wheelchairAccess}
              options={CAMPUS_MAP_EDIT_SCHEMA.options.wheelchairAccess}
              onChange={(wheelchairAccess) =>
                updateFact({ ...fullFact, wheelchairAccess })
              }
            />
          ) : null}
          {visible.has("audience") ? (
            <SelectField
              id={`${fieldPrefix}-audience`}
              field="audience"
              label={fieldLabel("audience", "开放对象")}
              value={fact.audience}
              options={CAMPUS_MAP_EDIT_SCHEMA.options.audience}
              onChange={(audience) => updateFact({ ...fullFact, audience })}
            />
          ) : null}
          {visible.has("credentialRequirement") ? (
            <SelectField
              id={`${fieldPrefix}-credential`}
              field="credentialRequirement"
              label={fieldLabel("credentialRequirement", "凭证要求")}
              value={fact.credentialRequirement}
              options={CAMPUS_MAP_EDIT_SCHEMA.options.credentialRequirement}
              onChange={(credentialRequirement) =>
                updateFact({ ...fullFact, credentialRequirement })
              }
            />
          ) : null}
          {visible.has("accessSchedule") ? (
            <div className="space-y-3">
              <SelectField
                id={`${fieldPrefix}-schedule`}
                field="accessSchedule"
                label={fieldLabel("accessSchedule", "开放时间")}
                value={fact.accessSchedule.kind}
                options={CAMPUS_MAP_EDIT_SCHEMA.options.accessSchedule}
                onChange={(kind) =>
                  updateFact({
                    ...fullFact,
                    accessSchedule:
                      kind === "weekly"
                        ? {
                            kind: "weekly",
                            timezone: "Asia/Hong_Kong",
                            intervals: [
                              {
                                days: ["mon", "tue", "wed", "thu", "fri"],
                                opensAt: "09:00",
                                closesAt: "17:00",
                              },
                            ],
                          }
                        : { kind },
                  })
                }
              />
              {weeklySchedule ? (
                <fieldset className="rounded-xl border p-3">
                  <legend className="px-1 text-sm font-medium">
                    每周开放时段（香港时间）
                  </legend>
                  {weeklySchedule.intervals.map((interval, index) => (
                    <div
                      key={index}
                      className="mt-2 rounded-lg bg-neutral-50 p-2"
                    >
                      <div className="flex flex-wrap gap-2">
                        {WEEKDAYS.map(([day, label]) => (
                          <label
                            key={day}
                            className="flex min-h-11 items-center gap-1"
                          >
                            <input
                              type="checkbox"
                              name={`${fieldPrefix}-schedule-days-${index}`}
                              checked={interval.days.includes(day)}
                              onChange={(event) => {
                                const intervals = weeklySchedule.intervals.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? {
                                          ...item,
                                          days: event.target.checked
                                            ? [...item.days, day]
                                            : item.days.filter(
                                                (value) => value !== day,
                                              ),
                                        }
                                      : item,
                                );
                                updateFact({
                                  ...fullFact,
                                  accessSchedule: {
                                    ...weeklySchedule,
                                    intervals,
                                  },
                                });
                              }}
                            />
                            周{label}
                          </label>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {(["opensAt", "closesAt"] as const).map((field) => (
                          <label key={field} className="text-xs">
                            {field === "opensAt" ? "开始" : "结束"}
                            <input
                              type="time"
                              name={`${fieldPrefix}-${field}-${index}`}
                              autoComplete="off"
                              className={fieldClass}
                              value={interval[field]}
                              onChange={(event) => {
                                const intervals = weeklySchedule.intervals.map(
                                  (item, itemIndex) =>
                                    itemIndex === index
                                      ? { ...item, [field]: event.target.value }
                                      : item,
                                );
                                updateFact({
                                  ...fullFact,
                                  accessSchedule: {
                                    ...weeklySchedule,
                                    intervals,
                                  },
                                });
                              }}
                            />
                          </label>
                        ))}
                      </div>
                      {weeklySchedule.intervals.length > 1 ? (
                        <button
                          type="button"
                          className={cn(secondaryClass, "mt-2 w-full")}
                          onClick={() =>
                            updateFact({
                              ...fullFact,
                              accessSchedule: {
                                ...weeklySchedule,
                                intervals: weeklySchedule.intervals.filter(
                                  (_, itemIndex) => itemIndex !== index,
                                ),
                              },
                            })
                          }
                        >
                          删除此时段
                        </button>
                      ) : null}
                    </div>
                  ))}
                  <button
                    type="button"
                    className={cn(secondaryClass, "mt-2 w-full")}
                    onClick={() =>
                      updateFact({
                        ...fullFact,
                        accessSchedule: {
                          ...weeklySchedule,
                          intervals: [
                            ...weeklySchedule.intervals,
                            {
                              days: ["mon"],
                              opensAt: "09:00",
                              closesAt: "17:00",
                            },
                          ],
                        },
                      })
                    }
                  >
                    添加时段
                  </button>
                </fieldset>
              ) : null}
            </div>
          ) : null}
          {visible.has("reservationRequirement") ? (
            <SelectField
              id={`${fieldPrefix}-reservation`}
              field="reservationRequirement"
              label={fieldLabel("reservationRequirement", "预约要求")}
              value={fact.reservationRequirement}
              options={CAMPUS_MAP_EDIT_SCHEMA.options.reservationRequirement}
              onChange={(reservationRequirement) =>
                updateFact({ ...fullFact, reservationRequirement })
              }
            />
          ) : null}
          {visible.has("temporaryStatus") ? (
            <SelectField
              id={`${fieldPrefix}-temporary-status`}
              field="temporaryStatus"
              label={fieldLabel("temporaryStatus", "临时状态")}
              value={fact.temporaryStatus}
              options={CAMPUS_MAP_EDIT_SCHEMA.options.temporaryStatus}
              onChange={(temporaryStatus) =>
                updateFact({ ...fullFact, temporaryStatus })
              }
            />
          ) : null}
        </div>
        <div hidden={isPlacing} className="rounded-xl border p-3">
          <button
            type="button"
            data-edit-field="sources"
            aria-expanded={sourceEntryExpanded}
            aria-controls={`${fieldPrefix}-source-entry`}
            aria-describedby={
              session.localError === "sources"
                ? `${fieldPrefix}-source-error`
                : undefined
            }
            aria-label={
              sourceEntryExpanded
                ? "收起资料来源"
                : draft.sources.length
                  ? "修改资料来源"
                  : "添加资料来源"
            }
            className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-1 text-left text-sm font-semibold hover:text-[#176346] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
            onClick={() => setShowSourceEntry((current) => !current)}
          >
            <span>
              {draft.sources.length ? "修改资料来源" : "添加资料来源"}
            </span>
            <ChevronDownIcon
              aria-hidden="true"
              className={cn(
                "size-4 transition-transform motion-reduce:transition-none",
                sourceEntryExpanded && "rotate-180",
              )}
            />
          </button>
          {session.localError === "sources" ? (
            <p
              id={`${fieldPrefix}-source-error`}
              className="px-1 text-xs text-red-700"
              role="alert"
            >
              请添加资料来源。
            </p>
          ) : null}
          {draft.sources.length && !sourceEntryExpanded ? (
            <p className="px-1 text-xs text-[#176346]">
              已记录：{draft.sources[0]?.ref}
            </p>
          ) : null}
          {sourceEntryExpanded ? (
            <fieldset id={`${fieldPrefix}-source-entry`} className="mt-3">
              <legend className="sr-only">资料来源</legend>
              <label
                className="block text-sm"
                htmlFor={`${fieldPrefix}-source-date`}
              >
                现场观察时间（香港时间）
                <input
                  id={`${fieldPrefix}-source-date`}
                  name="campus-map-source-observed-at"
                  autoComplete="off"
                  data-edit-field="sourceObservedAt"
                  className={fieldClass}
                  type="datetime-local"
                  value={sourceObservedAt}
                  required
                  aria-invalid={session.localError === "sourceObservedAt"}
                  onChange={(event) => setSourceObservedAt(event.target.value)}
                />
              </label>
              <button
                type="button"
                className={cn(secondaryClass, "mt-3 w-full")}
                onClick={() => {
                  const observationTimestamp = Date.parse(
                    `${sourceObservedAt}:00+08:00`,
                  );
                  const observationValid =
                    sourceObservedAt !== "" &&
                    Number.isFinite(observationTimestamp) &&
                    observationTimestamp <= Date.now();
                  if (!observationValid) {
                    onEvent({
                      type: "REPORT_LOCAL_ERROR",
                      field: "sourceObservedAt",
                    });
                    return;
                  }
                  updateSources([
                    observationSource(sourceObservedAt, observationTimestamp),
                  ]);
                }}
              >
                {draft.sources.length ? "更新现场观察来源" : "使用现场观察来源"}
              </button>
              {draft.sources.length ? (
                <p className="mt-2 text-xs text-[#176346]">
                  已记录：{draft.sources[0]?.ref}
                </p>
              ) : null}
            </fieldset>
          ) : null}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t bg-white px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] md:rounded-b-2xl md:pb-4">
        <button
          type="button"
          className={primaryClass}
          disabled={
            isPlacing
              ? placementPending
              : session.status !== "editing" || !isCampusMapEditDirty(session)
          }
          onClick={() =>
            onEvent(
              isPlacing
                ? { type: "CONFIRM_POSITION", position: placementPosition }
                : { type: "REQUEST_PUBLISH" },
            )
          }
        >
          {isPlacing
            ? placementPending
              ? "正在确定位置…"
              : draft.mode === "add"
                ? "继续填写"
                : "确认新位置"
            : session.status === "publishing"
              ? "正在发布…"
              : draft.mode === "add"
                ? "发布新地点"
                : "发布修改"}
        </button>
      </div>
    </div>
  );
}
