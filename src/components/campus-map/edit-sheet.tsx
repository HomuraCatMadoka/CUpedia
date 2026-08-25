"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { ChevronDownIcon, MapPinIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { AMAP_PROTOTYPE_BUILDINGS } from "@/lib/campus-map/amap-prototype-catalog";
import {
  isCampusMapEditDirty,
  type CampusMapEditEvent,
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
  factSchema?: CampusMapFactSchema | null;
  onEvent(event: CampusMapEditEvent): void;
}

const fieldClass =
  "mt-1 min-h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-base outline-none focus-visible:border-[#176346] focus-visible:ring-2 focus-visible:ring-[#176346]/25";
const primaryClass =
  "min-h-11 w-full rounded-xl bg-[#174b38] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2";
const secondaryClass =
  "min-h-11 rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]";

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

function describeLocation(fact: CampusMapEditSession["draft"]["fact"]): string {
  if (!fact.location) return "尚未定位";
  if (fact.location.kind === "outdoor-point") {
    return `${fact.location.longitude.toFixed(6)}, ${fact.location.latitude.toFixed(6)} · WGS84 · ${
      fact.location.precision === "precise" ? "精确" : "约略"
    }`;
  }
  if (fact.location.kind === "floor") {
    return `建筑 ${fact.buildingId ?? "未知"} · 楼层 ${fact.floorId ?? "未知"}`;
  }
  return `建筑 ${fact.buildingId ?? "未知"}`;
}

function nearbyLocationLabel(position: readonly [number, number]): string {
  const [longitude, latitude] = position;
  const nearest = AMAP_PROTOTYPE_BUILDINGS.map((building) => {
    const latitudeDistance = (building.position[1] - latitude) * 111_320;
    const longitudeDistance =
      (building.position[0] - longitude) *
      111_320 *
      Math.cos((latitude * Math.PI) / 180);
    return {
      building,
      distance: Math.hypot(latitudeDistance, longitudeDistance),
    };
  }).sort((left, right) => left.distance - right.distance)[0];

  return nearest && nearest.distance <= 350
    ? `${nearest.building.name}附近`
    : "中大校园内的选定位置";
}

function friendlyLocationLabel(
  fact: CampusMapEditSession["draft"]["fact"],
): string {
  if (fact.location?.kind === "outdoor-point") {
    return nearbyLocationLabel([
      fact.location.longitude,
      fact.location.latitude,
    ]);
  }
  if (fact.buildingId) {
    return (
      AMAP_PROTOTYPE_BUILDINGS.find(
        (building) => building.id === fact.buildingId,
      )?.name ?? "建筑内位置"
    );
  }
  return "尚未定位";
}

function conflictFields(
  session: CampusMapEditSession,
): Array<[keyof CampusMapPublishFactInput, string]> {
  const current = session.conflict?.currentFact;
  if (!current) return [];
  const labels: Array<[keyof CampusMapPublishFactInput, string]> = [
    ["name", "名称"],
    ["pinType", "类型"],
    ["capabilities", "服务能力"],
    ["gender", "性别属性"],
    ["wheelchairAccess", "无障碍通行"],
    ["audience", "开放对象"],
    ["credentialRequirement", "凭证要求"],
    ["accessSchedule", "开放时间"],
    ["reservationRequirement", "预约要求"],
    ["temporaryStatus", "临时状态"],
    ["location", "位置"],
  ];
  return labels.filter(
    ([field]) =>
      JSON.stringify(session.draft.fact[field]) !==
      JSON.stringify(current[field]),
  );
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
  const [conflictSelection, setConflictSelection] = useState<{
    key: string;
    fields: Array<keyof CampusMapPublishFactInput>;
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
  const updateFact = (next: CampusMapPublishFactInput) =>
    onEvent({ type: "CHANGE_FACT", fact: next });
  const fullFact = fact as CampusMapPublishFactInput;
  const weeklySchedule =
    fact.accessSchedule.kind === "weekly" ? fact.accessSchedule : null;
  const fieldLabel = (field: string, fallback: string) =>
    factSchema?.displayMetadata[field]?.label ?? fallback;
  const conflictKey =
    session.status === "conflict" && session.conflict
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
  const optionalDetailsVisible = showMoreDetails || hasOptionalServerError;

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
          className="text-xl font-semibold outline-none"
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

  if (session.status === "placing") {
    const longitude = Number(keyboardLongitude);
    const latitude = Number(keyboardLatitude);
    const keyboardValid =
      Number.isFinite(longitude) &&
      longitude >= -180 &&
      longitude <= 180 &&
      Number.isFinite(latitude) &&
      latitude >= -90 &&
      latitude <= 90;
    return (
      <div className="grid gap-4 px-5 pt-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div className="pr-10">
          <h2
            id="campus-map-panel-title"
            tabIndex={-1}
            className="text-xl font-semibold outline-none"
          >
            把图钉放在地点上
          </h2>
          <p className="mt-2 text-sm leading-6 text-neutral-600">
            移动地图，让图钉对准要添加的地点。
          </p>
        </div>
        <div
          className="flex items-center gap-3 rounded-xl bg-[#edf5f1] px-3 py-2.5"
          aria-live="polite"
        >
          <MapPinIcon
            aria-hidden="true"
            className="size-5 shrink-0 text-[#176346]"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">
              {nearbyLocationLabel(centerPosition)}
            </p>
            <p className="text-xs text-neutral-600">约略位置</p>
          </div>
        </div>
        <button
          type="button"
          className={primaryClass}
          onClick={() =>
            onEvent({
              type: "CONFIRM_POSITION",
              position: {
                longitude: centerPosition[0],
                latitude: centerPosition[1],
                crs: "wgs84",
                precision: "approximate",
                method: "pointer",
              },
            })
          }
        >
          位置放好了
        </button>
        <div className="rounded-xl border border-black/10 bg-white px-3 py-2">
          <button
            type="button"
            aria-expanded={showCoordinateEntry}
            aria-controls={`${fieldPrefix}-coordinate-entry`}
            className="flex min-h-10 w-full items-center text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
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
              <label
                className="block text-sm"
                htmlFor={`${fieldPrefix}-longitude`}
              >
                经度（WGS84）
                <input
                  id={`${fieldPrefix}-longitude`}
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
                      longitude,
                      latitude,
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
      </div>
    );
  }

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
      const changedFields = conflictFields(session);
      return (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
          role="alert"
        >
          <p className="font-semibold">这处地点刚刚被其他人更新</p>
          <p className="mt-1">
            你的输入仍保留。最新版名称：
            {session.conflict?.currentFact.name ?? "不可用"}
          </p>
          {changedFields.length ? (
            <fieldset className="mt-3 rounded-lg border border-amber-300 p-2">
              <legend className="px-1 font-medium">
                明确选择要保留的草稿字段
              </legend>
              {changedFields.map(([field, label]) => (
                <label key={field} className="flex min-h-11 items-center gap-2">
                  <input
                    type="checkbox"
                    checked={conflictKeepFields.includes(field)}
                    onChange={(event) =>
                      setConflictSelection((current) => {
                        const fields =
                          current.key === conflictKey ? current.fields : [];
                        return {
                          key: conflictKey,
                          fields: event.target.checked
                            ? [...fields, field]
                            : fields.filter((item) => item !== field),
                        };
                      })
                    }
                  />
                  保留我的{label}
                </label>
              ))}
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
              onClick={() =>
                onEvent({
                  type: "CONTINUE_FROM_CONFLICT",
                  idempotencyKey: crypto.randomUUID(),
                  fact: Object.fromEntries(
                    Object.entries(session.conflict!.currentFact).map(
                      ([field, value]) => [
                        field,
                        conflictKeepFields.includes(
                          field as keyof CampusMapPublishFactInput,
                        )
                          ? session.draft.fact[
                              field as keyof CampusMapPublishFactInput
                            ]
                          : value,
                      ],
                    ),
                  ) as unknown as CampusMapPublishFactInput,
                })
              }
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
          className="pr-10 text-xl font-semibold outline-none"
        >
          {draft.mode === "add" ? "添加地点" : "建议修改"}
        </h2>
        <p className="mt-1 text-sm text-neutral-600">
          {draft.mode === "add"
            ? "补充这个位置的资料。"
            : "更新地点资料，未修改的内容会保持不变。"}
        </p>
      </div>
      <div
        className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 pb-28"
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
            className="rounded-xl bg-[#edf5f1] p-3 text-sm"
          >
            <div className="flex items-start gap-3">
              <MapPinIcon
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-[#176346]"
              />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{friendlyLocationLabel(fact)}</p>
                <p className="mt-0.5 text-xs text-neutral-600">
                  {fact.location?.kind === "outdoor-point"
                    ? "约略位置"
                    : describeLocation(fact)}
                </p>
              </div>
              <button
                type="button"
                className="min-h-10 shrink-0 rounded-lg px-2 text-sm font-semibold text-[#176346] hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                onClick={() => onEvent({ type: "START_REPOSITION" })}
              >
                重新定位
              </button>
            </div>
          </div>
        ) : null}
        <label
          className="block text-sm font-medium"
          htmlFor={`${fieldPrefix}-name`}
        >
          {fieldLabel("name", "地点名称")}
          <input
            id={`${fieldPrefix}-name`}
            data-edit-field="name"
            className={fieldClass}
            value={fact.name}
            aria-invalid={session.localError === "name"}
            onChange={(event) =>
              updateFact({ ...fullFact, name: event.target.value })
            }
          />
        </label>
        <fieldset data-edit-field="pinType">
          <legend className="mb-2 text-sm font-medium">
            {fieldLabel("pinType", "地点类型")}
          </legend>
          <div className="flex flex-wrap gap-2">
            {CAMPUS_MAP_EDIT_SCHEMA.presets.map((item) => (
              <label
                key={item.pinType}
                className={cn(
                  "flex min-h-11 cursor-pointer items-center rounded-xl border px-3 text-sm font-semibold transition-colors",
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
          hidden={!optionalDetailsVisible}
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
            <fieldset className="rounded-xl border p-3">
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
        <fieldset
          data-edit-field="sources"
          className="rounded-xl border p-3"
          aria-invalid={session.localError === "sources"}
        >
          <legend className="px-1 text-sm font-medium">资料来源</legend>
          <label
            className="block text-sm"
            htmlFor={`${fieldPrefix}-source-date`}
          >
            现场观察时间（香港时间）
            <input
              id={`${fieldPrefix}-source-date`}
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
              onEvent({
                type: "CHANGE_SOURCES",
                sources: [
                  observationSource(sourceObservedAt, observationTimestamp),
                ],
              });
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
        <p className="rounded-xl bg-neutral-50 p-3 text-xs leading-5 text-neutral-600">
          Changeset 说明和来源摘要会由这些结构化修改自动生成；不会请求复核。
        </p>
      </div>
      <div className="absolute inset-x-0 bottom-0 border-t bg-white p-4 md:rounded-b-2xl">
        <button
          type="button"
          className={primaryClass}
          disabled={
            !isCampusMapEditDirty(session) || session.status === "publishing"
          }
          onClick={() => onEvent({ type: "REQUEST_PUBLISH" })}
        >
          {session.status === "publishing"
            ? "正在发布…"
            : draft.mode === "add"
              ? "发布新地点"
              : "发布修改"}
        </button>
      </div>
    </div>
  );
}
