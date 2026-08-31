"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { MapPinIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { AmapPlaceContextResult } from "@/lib/campus-map/amap-place-context";
import type { CampusMapBrowseBuilding } from "@/lib/campus-map/browse-projection";
import {
  isCampusMapEditDirty,
  type CampusMapEditEvent,
  type CampusMapIndoorLocationDisplay,
  type CampusMapEditSession,
} from "@/lib/campus-map/edit-session";
import {
  CAMPUS_MAP_EDIT_ACCESS_FIELDS,
  CAMPUS_MAP_EDIT_SCHEMA,
} from "@/lib/campus-map/edit-schema";
import type { CampusMapPublishFactInput } from "@/lib/campus-map/publish-contract";
import type { CampusMapFactSchema } from "@/lib/campus-map/fact-store";

interface CampusMapEditSheetProps {
  session: CampusMapEditSession;
  centerPosition: readonly [number, number];
  placementPending?: boolean;
  placeContext?: AmapPlaceContextResult | { status: "loading" } | null;
  factSchema?: CampusMapFactSchema | null;
  buildings?: readonly CampusMapBrowseBuilding[];
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
    "fact-name-required": "请填写能辨认这处设施的名称或编号。",
    "source-required": "发布资料不完整，请重试。",
    "invalid-location": "位置资料不完整，请修改位置。",
    "base-revision-conflict": "地点资料已被其他人更新，请刷新后重试。",
    "invalid-place-id": "这个地点暂时无法发布，请返回地图后重试。",
  };
  return messages[code] ?? "服务器暂时无法接受这项资料，请稍后重试。";
}

function messageForWarning(code: string): string {
  return code === "possible-duplicate"
    ? "附近可能已有相似设施，请确认这是另一个独立地点。"
    : "发布前需要确认这项修改。";
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

function placementIsReadable(
  fact: CampusMapEditSession["draft"]["fact"],
  display?: CampusMapIndoorLocationDisplay | null,
): boolean {
  if (fact.location?.kind === "outdoor-point") return true;
  if (fact.location?.kind !== "building" && fact.location?.kind !== "floor") {
    return false;
  }
  if (matchingDisplay(fact, display)) return true;
  return false;
}

function hasUnreadablePlacementConflict(
  session: CampusMapEditSession,
): boolean {
  if (session.conflict?.kind !== "current") return false;
  const mine = session.draft.fact;
  const latest = session.conflict.currentFact;
  const placementChanged =
    mine.buildingId !== latest.buildingId ||
    mine.floorId !== latest.floorId ||
    JSON.stringify(mine.location) !== JSON.stringify(latest.location);
  return (
    placementChanged &&
    (!placementIsReadable(mine, session.draft.locationDisplay) ||
      !placementIsReadable(latest, session.conflict.currentLocationDisplay))
  );
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
  const buildingName = canonicalDisplay?.buildingName;
  if (fact.location.kind === "floor") {
    if (buildingName && canonicalDisplay?.floorLabel) {
      return `${buildingName} · ${canonicalDisplay.floorLabel}`;
    }
    return "建筑内楼层";
  }
  return buildingName ?? "建筑位置";
}

const NEARBY_BUILDING_DISTANCE_METERS = 50;

function distanceBetweenPositions(
  left: readonly [number, number],
  right: readonly [number, number],
): number {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(right[1] - left[1]);
  const longitudeDelta = radians(right[0] - left[0]);
  const leftLatitude = radians(left[1]);
  const rightLatitude = radians(right[1]);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(leftLatitude) *
      Math.cos(rightLatitude) *
      Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function nearbyBuildingLabel(
  position: readonly [number, number],
  buildings: readonly CampusMapBrowseBuilding[],
): string | null {
  const nearest = buildings.reduce<
    { name: string; distance: number } | undefined
  >((current, building) => {
    if (!building.anchor) return current;
    const distance = distanceBetweenPositions(position, [
      building.anchor.longitude,
      building.anchor.latitude,
    ]);
    return !current || distance < current.distance
      ? { name: building.name, distance }
      : current;
  }, undefined);
  return nearest && nearest.distance <= NEARBY_BUILDING_DISTANCE_METERS
    ? `${nearest.name}附近`
    : null;
}

function describeOutdoorPosition(position: {
  longitude: number;
  latitude: number;
  precision: "precise" | "approximate";
}): string {
  return `${position.longitude.toFixed(6)}, ${position.latitude.toFixed(6)} · WGS84 · ${
    position.precision === "precise" ? "精确" : "约略"
  }`;
}

function friendlyLocationLabel(
  fact: CampusMapEditSession["draft"]["fact"],
  display?: CampusMapIndoorLocationDisplay | null,
  buildings: readonly CampusMapBrowseBuilding[] = [],
): string {
  if (fact.location?.kind === "outdoor-point") {
    return (
      nearbyBuildingLabel(
        [fact.location.longitude, fact.location.latitude],
        buildings,
      ) ?? "地图坐标"
    );
  }
  if (fact.buildingId) {
    return matchingDisplay(fact, display)?.buildingName ?? "建筑内位置";
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

export function CampusMapEditSheet({
  session,
  centerPosition,
  placementPending = false,
  placeContext = null,
  factSchema,
  buildings = [],
  onEvent,
}: CampusMapEditSheetProps) {
  const fieldPrefix = useId();
  const [keyboardLongitude, setKeyboardLongitude] = useState(
    String(centerPosition[0]),
  );
  const [keyboardLatitude, setKeyboardLatitude] = useState(
    String(centerPosition[1]),
  );
  const [showCoordinateEntry, setShowCoordinateEntry] = useState(false);
  const [conflictSelection, setConflictSelection] = useState<{
    key: string;
    fields: ConflictChoiceKey[];
  }>({ key: "", fields: [] });
  const draft = session.draft;
  const fact = draft.fact;
  const [isChoosingIndoorLocation, setIsChoosingIndoorLocation] =
    useState(false);
  const serverRequiredFields =
    factSchema?.definition.pinTypes[fact.pinType].requiredFields;
  const freshAttempt = () =>
    session.status === "temporarily-unavailable"
      ? { idempotencyKey: crypto.randomUUID() }
      : {};
  const changeFact = (
    patch: Partial<CampusMapEditSession["draft"]["fact"]>,
    locationDisplay?: CampusMapIndoorLocationDisplay | null,
  ) => {
    if (patch.location !== undefined) setIsChoosingIndoorLocation(false);
    onEvent({
      type: "CHANGE_FACT",
      fact: { ...fact, ...patch },
      ...freshAttempt(),
      ...(locationDisplay !== undefined ? { locationDisplay } : {}),
    });
  };
  const activePreset =
    CAMPUS_MAP_EDIT_SCHEMA.presets.find(
      (preset) => preset.pinType === fact.pinType,
    ) ?? CAMPUS_MAP_EDIT_SCHEMA.presets[0];
  const applicableFields = new Set(
    factSchema?.definition.pinTypes[fact.pinType].applicableFields ??
      activePreset.fields,
  );
  const showsAccessFields = CAMPUS_MAP_EDIT_ACCESS_FIELDS.some((field) =>
    applicableFields.has(field),
  );
  const indoorSelected =
    isChoosingIndoorLocation ||
    fact.location?.kind === "building" ||
    fact.location?.kind === "floor";
  const selectedBuilding = buildings.find(
    (building) => building.buildingId === fact.buildingId,
  );
  const selectedFloors = [...(selectedBuilding?.floors ?? [])].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const weeklySchedule =
    fact.accessSchedule.kind === "weekly" ? fact.accessSchedule : null;
  const conflictKey =
    session.status === "conflict" && session.conflict?.kind === "current"
      ? `${session.draft.idempotencyKey}:${session.conflict.currentRevisionId}`
      : "";
  const conflictKeepFields =
    conflictSelection.key === conflictKey ? conflictSelection.fields : [];

  if (session.status === "published" && session.receipt) {
    return null;
  }

  if (
    session.status === "publish-unknown" ||
    session.status === "publish-identity" ||
    session.status === "publish-recovery-unavailable" ||
    session.status === "authentication-required"
  ) {
    const identityMismatch =
      session.status === "publish-identity" &&
      session.publishFeedbackReason === "identity-mismatch";
    const identityUnavailable =
      session.status === "publish-identity" &&
      session.publishFeedbackReason === "identity-unavailable";
    const lockUnavailable =
      session.status === "publish-recovery-unavailable" &&
      session.publishFeedbackReason === "receipt-lock-unavailable";
    const callbackUrl =
      typeof window === "undefined"
        ? "/campus-map"
        : `${window.location.pathname}${window.location.search}`;
    const title =
      session.status === "publish-unknown"
        ? "正在确认发布结果"
        : session.status === "authentication-required"
          ? "请先登录"
          : identityMismatch
            ? "无法恢复这次编辑"
            : identityUnavailable
              ? "正在等待身份确认"
              : "当前无法恢复发布";
    const description =
      session.status === "publish-unknown"
        ? "你的修改已经保留。我们会先确认刚才的发布结果，不会重复添加地点。"
        : session.status === "authentication-required"
          ? "登录后会回到这份草稿，但不会自动发布。"
          : identityMismatch
            ? "当前账号与原发布账号不同。为保护隐私，这里不会显示原草稿。"
            : identityUnavailable
              ? "暂时无法确认当前登录状态。为保护隐私，这里不会显示草稿。"
              : lockUnavailable
                ? "当前浏览器无法安全恢复这次发布。你的修改已经保留，你可以继续编辑。"
                : "当前浏览器无法保存恢复状态。你的修改已经保留，请稍后再回来。";
    return (
      <div
        className="grid gap-3 p-5"
        role="status"
        data-edit-field="publish-feedback"
        tabIndex={-1}
      >
        <h2 id="campus-map-panel-title" className="text-xl font-semibold">
          {title}
        </h2>
        <p className="text-sm leading-6 text-neutral-600">{description}</p>
        {session.status === "authentication-required" ? (
          <Link
            className={cn(
              primaryClass,
              "inline-flex items-center justify-center",
            )}
            href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
          >
            前往登录
          </Link>
        ) : session.status === "publish-unknown" || identityUnavailable ? (
          <button
            type="button"
            className={primaryClass}
            onClick={() => onEvent({ type: "CHECK_PUBLISH_RESULT" })}
          >
            {identityUnavailable ? "检查登录状态" : "检查发布结果"}
          </button>
        ) : (
          <button
            type="button"
            className={primaryClass}
            onClick={() =>
              onEvent({
                type: identityMismatch ? "RETURN_LATER" : "CONTINUE_EDITING",
              })
            }
          >
            {identityMismatch ? "返回地图" : "继续编辑"}
          </button>
        )}
      </div>
    );
  }

  const isPlacing = session.status === "placing";
  const showFixedFooter =
    isPlacing ||
    session.status === "editing" ||
    session.status === "publishing";
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
  const nearbyPlacementLabel = nearbyBuildingLabel(
    [placementPosition.longitude, placementPosition.latitude],
    buildings,
  );
  const placementLabel =
    resolvedContext?.label && resolvedContext.label !== "地图中心位置"
      ? `高德地图地点：${resolvedContext.label}`
      : nearbyPlacementLabel
        ? `附近建筑：${nearbyPlacementLabel.replace(/附近$/u, "")}`
        : null;
  const placementDescription = describeOutdoorPosition(placementPosition);
  const placementReference = resolvedContext
    ? resolvedContext.address
      ? `高德地图参考：${resolvedContext.address}`
      : null
    : placeContext?.status === "loading"
      ? "正在查询高德地图参考…"
      : placeContext?.status === "rate-limited"
        ? "高德地图查询较频繁，仍可使用此位置"
        : placeContext?.status === "transient-error"
          ? "暂时无法查询高德地图参考，仍可使用此位置"
          : placeContext?.status === "permanent-error"
            ? "高德地图参考不可用，仍可使用此位置"
            : placeContext?.status === "empty"
              ? "高德地图未找到附近地点，仍可使用此位置"
              : null;
  const lockedProviderCandidate =
    !isPlacing &&
    fact.location?.kind === "outdoor-point" &&
    resolvedContext?.label &&
    resolvedContext.label !== "地图中心位置"
      ? resolvedContext.label
      : null;
  const coordinateEntry = isPlacing ? (
    <div
      className={cn(
        showCoordinateEntry
          ? "rounded-xl border border-black/10 bg-white px-3 py-2"
          : "-mt-2",
      )}
    >
      <button
        type="button"
        aria-expanded={showCoordinateEntry}
        aria-controls={`${fieldPrefix}-coordinate-entry`}
        className={cn(
          "flex min-h-11 touch-manipulation items-center rounded-lg text-left text-sm font-semibold text-[#176346] hover:bg-[#edf5f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]",
          showCoordinateEntry ? "w-full" : "w-auto px-2",
        )}
        onClick={() => setShowCoordinateEntry((current) => !current)}
      >
        {showCoordinateEntry ? "收起坐标输入" : "输入坐标"}
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
          <p className="font-semibold">发布前请确认</p>
          {session.warnings?.map((warning) => (
            <p key={`${warning.code}:${warning.fingerprint}`} className="mt-1">
              {messageForWarning(warning.code)}
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
            确认并发布
          </button>
        </div>
      );
    }
    if (session.status === "forbidden") {
      const messages = {
        "actor-banned": "账号已被封禁，暂时不能发布地点资料。",
        "contributor-blocked": "账号当前被限制参与校园地图贡献。",
        "profile-incomplete": "账号资料尚未完成，完成后才能发布地点资料。",
        "actor-not-eligible": "这个账号目前没有发布地点资料的资格。",
        "role-not-eligible": "当前账号角色没有发布地点资料的权限。",
        "admin-required": "这项操作只允许管理员发布。",
      } as const;
      return (
        <div
          className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-950"
          role="alert"
          data-edit-field="publish-feedback"
          tabIndex={-1}
        >
          <p className="font-semibold">无法发布</p>
          <p className="mt-1">
            {session.forbiddenCode
              ? messages[session.forbiddenCode]
              : "当前账号没有发布这项修改的权限。"}
          </p>
          <p className="mt-1 text-xs">草稿仍保存在这个浏览器中。</p>
          {session.forbiddenCode === "profile-incomplete" && (
            <button
              type="button"
              className={cn(primaryClass, "mt-3")}
              onClick={() => onEvent({ type: "CONTRIBUTOR_SETUP_COMPLETED" })}
            >
              完善账户后继续
            </button>
          )}
          {session.forbiddenCode !== "profile-incomplete" && (
            <button
              type="button"
              className={cn(primaryClass, "mt-3")}
              onClick={() => onEvent({ type: "CONTINUE_EDITING" })}
            >
              继续编辑
            </button>
          )}
        </div>
      );
    }
    if (session.status === "rate-limited") {
      return (
        <div
          className="rounded-xl border bg-neutral-50 p-3 text-sm"
          role="status"
          data-edit-field="publish-feedback"
          tabIndex={-1}
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
          data-edit-field="publish-feedback"
          tabIndex={-1}
        >
          <p className="font-semibold">暂时无法发布</p>
          <p className="mt-1">你的修改已保存在这个浏览器中，可以稍后重试。</p>
          <button
            type="button"
            className={cn(primaryClass, "mt-3")}
            onClick={() => onEvent({ type: "RETRY_PUBLISH" })}
          >
            重试发布
          </button>
        </div>
      );
    }
    if (session.status === "conflict") {
      const conflict = session.conflict;
      const locationLabelsUnavailable =
        conflict?.kind === "unavailable"
          ? conflict.reason === "location-labels"
          : hasUnreadablePlacementConflict(session);
      if (
        !conflict ||
        conflict.kind === "unavailable" ||
        locationLabelsUnavailable
      ) {
        return (
          <div
            className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
            role="alert"
          >
            <p className="font-semibold">
              {locationLabelsUnavailable
                ? "无法安全比较最新位置"
                : "无法读取地点的最新版本"}
            </p>
            <p className="mt-1">
              {locationLabelsUnavailable
                ? "你的输入仍已保留，但建筑或楼层名称暂时无法读取。请关闭编辑并重新打开这个地点，再比较后发布。"
                : "你的输入仍已保留，但在重新读取正式地点前不能再次发布。请关闭编辑后重新打开这个地点。"}
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
              onClick={() => {
                setIsChoosingIndoorLocation(false);
                onEvent({
                  type: "USE_CURRENT_FACT",
                  idempotencyKey: crypto.randomUUID(),
                });
              }}
            >
              采用最新资料
            </button>
            <button
              type="button"
              className={primaryClass}
              onClick={() => {
                setIsChoosingIndoorLocation(false);
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
      <div className="border-b px-4 py-3 md:px-5 md:py-4">
        <h2
          id="campus-map-panel-title"
          tabIndex={-1}
          className="-ml-2 pr-10 pl-2 text-lg font-semibold text-balance focus-visible:outline-none focus-visible:shadow-[inset_3px_0_0_#176346] md:text-xl"
        >
          {isPlacing
            ? draft.mode === "add"
              ? "选择设施位置"
              : "修改设施位置"
            : draft.mode === "add"
              ? "新增设施"
              : "修改设施"}
        </h2>
        {isPlacing ? (
          <p className="mt-0.5 text-xs leading-5 text-neutral-600 md:mt-1 md:text-sm">
            {draft.mode === "add"
              ? "拖动地图或轻点地点名称，选择设施位置。"
              : "拖动地图或轻点地点名称，选择新的设施位置。"}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3 md:space-y-4 md:px-5 md:py-4",
          showFixedFooter ? "pb-28" : "pb-5",
        )}
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
        <div
          data-edit-field="location"
          tabIndex={-1}
          className="rounded-xl bg-[#edf5f1] px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
        >
          <div className="flex items-start gap-3">
            <MapPinIcon
              aria-hidden="true"
              className="mt-0.5 size-5 shrink-0 text-[#176346]"
            />
            <div className="min-w-0 flex-1">
              {isPlacing ? (
                <>
                  <p className="font-semibold" aria-live="polite">
                    {placementDescription}
                  </p>
                  {placementLabel ? (
                    <p
                      className="mt-0.5 text-xs text-neutral-600"
                      aria-live="polite"
                    >
                      {placementLabel}
                    </p>
                  ) : null}
                  {placementReference ? (
                    <p
                      className="mt-0.5 text-xs text-neutral-500"
                      aria-live="polite"
                    >
                      {placementReference}
                    </p>
                  ) : null}
                </>
              ) : (
                <>
                  <p className="font-semibold" aria-live="polite">
                    {friendlyLocationLabel(
                      fact,
                      draft.locationDisplay,
                      buildings,
                    )}
                  </p>
                  <p
                    className="mt-0.5 truncate text-xs text-neutral-600"
                    aria-live="polite"
                  >
                    {describeLocation(fact, draft.locationDisplay)}
                  </p>
                  {lockedProviderCandidate ? (
                    <p className="mt-0.5 flex gap-1 text-xs text-neutral-500">
                      <span>高德候选：</span>
                      <span>{lockedProviderCandidate}</span>
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {!isPlacing ? (
              <button
                type="button"
                className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-[#176346] hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                onClick={() => {
                  setIsChoosingIndoorLocation(false);
                  onEvent({ type: "START_REPOSITION", ...freshAttempt() });
                }}
              >
                修改位置
              </button>
            ) : null}
          </div>
        </div>
        {coordinateEntry}
        <div hidden={isPlacing} className="space-y-3 md:space-y-4">
          <label
            className="block text-sm font-medium"
            htmlFor={`${fieldPrefix}-name`}
          >
            设施名称或编号
            <input
              id={`${fieldPrefix}-name`}
              name="campus-map-place-name"
              type="text"
              autoComplete="off"
              required
              data-edit-field="name"
              aria-invalid={session.localError === "name" || undefined}
              aria-describedby={
                session.localError === "name"
                  ? `${fieldPrefix}-name-error`
                  : undefined
              }
              className={fieldClass}
              value={fact.name}
              onChange={(event) => changeFact({ name: event.target.value })}
            />
            {session.localError === "name" ? (
              <span
                id={`${fieldPrefix}-name-error`}
                className="mt-1 block text-xs text-red-700"
              >
                请填写能辨认这处设施的名称或编号。
              </span>
            ) : null}
          </label>

          <fieldset
            data-edit-field="pinType"
            tabIndex={-1}
            className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2"
          >
            <legend className="mb-1.5 text-sm font-medium">设施类型</legend>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 md:gap-2">
              {CAMPUS_MAP_EDIT_SCHEMA.presets.map((item) => (
                <label
                  key={item.pinType}
                  className={cn(
                    "flex min-h-11 w-full cursor-pointer touch-manipulation items-center justify-center rounded-xl border px-1 text-center text-xs font-semibold transition-colors active:translate-y-px focus-within:outline-none focus-within:ring-2 focus-within:ring-[#176346] focus-within:ring-offset-2 motion-reduce:transform-none sm:text-sm md:px-2",
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
                    onChange={() =>
                      onEvent({
                        type: "CHANGE_PIN_TYPE",
                        pinType: item.pinType,
                        ...freshAttempt(),
                      })
                    }
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset
            data-edit-field="location"
            tabIndex={-1}
            className="rounded-xl border border-black/10 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
          >
            <legend className="px-1 text-sm font-medium">位置类型</legend>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-black/10 px-3 text-sm">
                <input
                  type="radio"
                  name={`${fieldPrefix}-location-kind`}
                  value="outdoor"
                  checked={!indoorSelected}
                  onChange={() => {
                    setIsChoosingIndoorLocation(false);
                    if (fact.location?.kind !== "outdoor-point") {
                      onEvent({ type: "START_REPOSITION", ...freshAttempt() });
                    }
                  }}
                />
                室外
              </label>
              <label className="flex min-h-11 items-center gap-2 rounded-lg border border-black/10 px-3 text-sm">
                <input
                  type="radio"
                  name={`${fieldPrefix}-location-kind`}
                  value="indoor"
                  checked={indoorSelected}
                  onChange={() => setIsChoosingIndoorLocation(true)}
                />
                建筑内
              </label>
            </div>
            {indoorSelected ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm" htmlFor={`${fieldPrefix}-building`}>
                  建筑
                  <select
                    id={`${fieldPrefix}-building`}
                    name="campus-map-building"
                    className={fieldClass}
                    value={fact.buildingId ?? ""}
                    onChange={(event) => {
                      const building = buildings.find(
                        (candidate) =>
                          candidate.buildingId === event.target.value,
                      );
                      if (!building) return;
                      changeFact(
                        {
                          buildingId: building.buildingId,
                          floorId: null,
                          location: { kind: "building" },
                        },
                        {
                          buildingId: building.buildingId,
                          buildingName: building.name,
                          floorId: null,
                          floorLabel: null,
                        },
                      );
                    }}
                  >
                    <option value="">请选择建筑</option>
                    {buildings.map((building) => (
                      <option
                        key={building.buildingId}
                        value={building.buildingId}
                      >
                        {building.name}
                        {building.code ? `（${building.code}）` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm" htmlFor={`${fieldPrefix}-floor`}>
                  楼层
                  <select
                    id={`${fieldPrefix}-floor`}
                    name="campus-map-floor"
                    className={fieldClass}
                    disabled={!selectedBuilding}
                    value={fact.floorId ?? ""}
                    onChange={(event) => {
                      if (!selectedBuilding) return;
                      const floor = selectedFloors.find(
                        (candidate) => candidate.floorId === event.target.value,
                      );
                      changeFact(
                        {
                          buildingId: selectedBuilding.buildingId,
                          floorId: floor?.floorId ?? null,
                          location: floor
                            ? { kind: "floor" }
                            : { kind: "building" },
                        },
                        {
                          buildingId: selectedBuilding.buildingId,
                          buildingName: selectedBuilding.name,
                          floorId: floor?.floorId ?? null,
                          floorLabel: floor?.displayLabel ?? null,
                        },
                      );
                    }}
                  >
                    <option value="">楼层未知（只确认建筑）</option>
                    {selectedFloors.map((floor) => (
                      <option key={floor.floorId} value={floor.floorId}>
                        {floor.displayLabel}
                      </option>
                    ))}
                  </select>
                </label>
                {!buildings.length ? (
                  <p className="text-xs text-neutral-600 sm:col-span-2">
                    暂时无法读取建筑目录，请稍后重试。
                  </p>
                ) : !selectedBuilding ? (
                  <p className="text-xs text-red-700 sm:col-span-2">
                    请选择建筑；楼层不确定时可以只保存建筑。
                  </p>
                ) : null}
              </div>
            ) : null}
          </fieldset>

          {showsAccessFields ? (
            <fieldset className="rounded-xl border border-black/10 p-3">
              <legend className="px-1 text-sm font-medium">
                开放与使用条件
              </legend>
              <p className="mb-3 text-xs leading-5 text-neutral-600">
                不确定时请选择“未知”；未知不会被当成无限制开放。
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {applicableFields.has("audience") ? (
                  <label
                    className="text-sm"
                    htmlFor={`${fieldPrefix}-audience`}
                  >
                    开放对象
                    <select
                      id={`${fieldPrefix}-audience`}
                      name="campus-map-audience"
                      data-edit-field="audience"
                      className={fieldClass}
                      value={fact.audience}
                      onChange={(event) =>
                        changeFact({
                          audience: event.target
                            .value as CampusMapPublishFactInput["audience"],
                        })
                      }
                    >
                      {CAMPUS_MAP_EDIT_SCHEMA.options.audience.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {applicableFields.has("credentialRequirement") ? (
                  <label
                    className="text-sm"
                    htmlFor={`${fieldPrefix}-credential`}
                  >
                    凭证要求
                    <select
                      id={`${fieldPrefix}-credential`}
                      name="campus-map-credential-requirement"
                      data-edit-field="credentialRequirement"
                      className={fieldClass}
                      value={fact.credentialRequirement}
                      onChange={(event) =>
                        changeFact({
                          credentialRequirement: event.target
                            .value as CampusMapPublishFactInput["credentialRequirement"],
                        })
                      }
                    >
                      {CAMPUS_MAP_EDIT_SCHEMA.options.credentialRequirement.map(
                        (option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ) : null}
                {applicableFields.has("reservationRequirement") ? (
                  <label
                    className="text-sm"
                    htmlFor={`${fieldPrefix}-reservation`}
                  >
                    预约要求
                    <select
                      id={`${fieldPrefix}-reservation`}
                      name="campus-map-reservation-requirement"
                      data-edit-field="reservationRequirement"
                      className={fieldClass}
                      value={fact.reservationRequirement}
                      onChange={(event) =>
                        changeFact({
                          reservationRequirement: event.target
                            .value as CampusMapPublishFactInput["reservationRequirement"],
                        })
                      }
                    >
                      {CAMPUS_MAP_EDIT_SCHEMA.options.reservationRequirement.map(
                        (option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ) : null}
                {applicableFields.has("temporaryStatus") ? (
                  <label
                    className="text-sm"
                    htmlFor={`${fieldPrefix}-temporary-status`}
                  >
                    临时状态
                    <select
                      id={`${fieldPrefix}-temporary-status`}
                      name="campus-map-temporary-status"
                      data-edit-field="temporaryStatus"
                      className={fieldClass}
                      value={fact.temporaryStatus}
                      onChange={(event) =>
                        changeFact({
                          temporaryStatus: event.target
                            .value as CampusMapPublishFactInput["temporaryStatus"],
                        })
                      }
                    >
                      {CAMPUS_MAP_EDIT_SCHEMA.options.temporaryStatus.map(
                        (option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                ) : null}
              </div>
              {applicableFields.has("accessSchedule") ? (
                <div
                  className="mt-3"
                  data-edit-field="accessSchedule"
                  tabIndex={-1}
                >
                  <label
                    className="text-sm"
                    htmlFor={`${fieldPrefix}-access-schedule`}
                  >
                    开放时间
                    <select
                      id={`${fieldPrefix}-access-schedule`}
                      name="campus-map-access-schedule"
                      className={fieldClass}
                      aria-invalid={
                        session.localError === "accessSchedule" || undefined
                      }
                      value={fact.accessSchedule.kind}
                      onChange={(event) => {
                        const kind = event.target.value;
                        changeFact({
                          accessSchedule:
                            kind === "weekly"
                              ? {
                                  kind: "weekly",
                                  timezone: "Asia/Hong_Kong",
                                  intervals: [
                                    { days: [], opensAt: "", closesAt: "" },
                                  ],
                                }
                              : kind === "always"
                                ? { kind: "always" }
                                : { kind: "unknown" },
                        });
                      }}
                    >
                      {CAMPUS_MAP_EDIT_SCHEMA.options.accessSchedule.map(
                        (option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  {weeklySchedule ? (
                    <div className="mt-3 space-y-3">
                      {weeklySchedule.intervals.map((interval, index) => (
                        <fieldset
                          key={index}
                          className="rounded-lg bg-neutral-50 p-3"
                        >
                          <legend className="px-1 text-xs font-medium">
                            时段 {index + 1}
                          </legend>
                          <div className="flex flex-wrap gap-x-3 gap-y-2">
                            {WEEKDAYS.map(([day, label]) => (
                              <label
                                key={day}
                                className="flex min-h-11 items-center gap-1.5 text-sm"
                              >
                                <input
                                  type="checkbox"
                                  name={`${fieldPrefix}-schedule-${index}-days`}
                                  value={day}
                                  checked={interval.days.includes(day)}
                                  onChange={(event) => {
                                    const intervals =
                                      weeklySchedule.intervals.map(
                                        (item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                days: event.target.checked
                                                  ? [...item.days, day]
                                                  : item.days.filter(
                                                      (candidate) =>
                                                        candidate !== day,
                                                    ),
                                              }
                                            : item,
                                      );
                                    changeFact({
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
                          <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs">
                              开始
                              <input
                                type="time"
                                name={`${fieldPrefix}-schedule-${index}-opens`}
                                autoComplete="off"
                                className={fieldClass}
                                value={interval.opensAt}
                                onChange={(event) =>
                                  changeFact({
                                    accessSchedule: {
                                      ...weeklySchedule,
                                      intervals: weeklySchedule.intervals.map(
                                        (item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                opensAt: event.target.value,
                                              }
                                            : item,
                                      ),
                                    },
                                  })
                                }
                              />
                            </label>
                            <label className="text-xs">
                              结束
                              <input
                                type="time"
                                name={`${fieldPrefix}-schedule-${index}-closes`}
                                autoComplete="off"
                                className={fieldClass}
                                value={interval.closesAt}
                                onChange={(event) =>
                                  changeFact({
                                    accessSchedule: {
                                      ...weeklySchedule,
                                      intervals: weeklySchedule.intervals.map(
                                        (item, itemIndex) =>
                                          itemIndex === index
                                            ? {
                                                ...item,
                                                closesAt: event.target.value,
                                              }
                                            : item,
                                      ),
                                    },
                                  })
                                }
                              />
                            </label>
                          </div>
                          {weeklySchedule.intervals.length > 1 ? (
                            <button
                              type="button"
                              className={cn(secondaryClass, "mt-3")}
                              aria-label={`移除时段 ${index + 1}`}
                              onClick={() =>
                                changeFact({
                                  accessSchedule: {
                                    ...weeklySchedule,
                                    intervals: weeklySchedule.intervals.filter(
                                      (_, itemIndex) => itemIndex !== index,
                                    ),
                                  },
                                })
                              }
                            >
                              移除时段
                            </button>
                          ) : null}
                        </fieldset>
                      ))}
                      <button
                        type="button"
                        className={secondaryClass}
                        onClick={() =>
                          changeFact({
                            accessSchedule: {
                              ...weeklySchedule,
                              intervals: [
                                ...weeklySchedule.intervals,
                                { days: [], opensAt: "", closesAt: "" },
                              ],
                            },
                          })
                        }
                      >
                        添加时段
                      </button>
                    </div>
                  ) : null}
                  {session.localError === "accessSchedule" ? (
                    <p className="mt-1 text-xs text-red-700">
                      每个时段都要选择日期，并填写不同的开始和结束时间。
                    </p>
                  ) : null}
                </div>
              ) : null}
            </fieldset>
          ) : null}
        </div>
      </div>
      {showFixedFooter ? (
        <div className="absolute inset-x-0 bottom-0 border-t bg-white px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] md:rounded-b-2xl md:pb-4">
          <button
            type="button"
            className={primaryClass}
            disabled={
              isPlacing
                ? placementPending
                : session.status !== "editing" ||
                  !isCampusMapEditDirty(session) ||
                  (indoorSelected &&
                    fact.location?.kind !== "building" &&
                    fact.location?.kind !== "floor")
            }
            onClick={() =>
              onEvent(
                isPlacing
                  ? { type: "CONFIRM_POSITION", position: placementPosition }
                  : {
                      type: "REQUEST_PUBLISH",
                      accessedOn: today(),
                      ...(serverRequiredFields
                        ? { requiredFields: serverRequiredFields }
                        : {}),
                    },
              )
            }
          >
            {isPlacing
              ? placementPending
                ? "正在确定位置…"
                : "使用此位置"
              : session.status === "publishing"
                ? "正在发布…"
                : draft.mode === "add"
                  ? "发布设施"
                  : "发布修改"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
