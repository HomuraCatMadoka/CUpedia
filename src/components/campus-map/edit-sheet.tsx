"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { Building2Icon, ChevronDownIcon, MapPinIcon } from "lucide-react";

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
  CAMPUS_MAP_EDIT_SCHEMA,
  campusMapFactNameError,
} from "@/lib/campus-map/edit-schema";
import {
  campusMapFactFieldLabel,
  campusMapPlaceTypeLabel,
  CAMPUS_MAP_DISPLAY_REGISTRY,
} from "@/lib/campus-map/display-registry";
import {
  campusMapBuildingDisplayFor,
  projectCampusMapBuildingDisplay,
  type CampusMapBuildingDisplayProjection,
} from "@/lib/campus-map/building-display";
import type { CampusMapPublishFactInput } from "@/lib/campus-map/publish-contract";
import type { CampusMapFactSchema } from "@/lib/campus-map/fact-store";
import { CAMPUS_MAP_PIN_TYPES_V1 } from "@/lib/campus-map/controlled-values";
import { PlacePhotoEditor } from "@/components/campus-map/place-photo-editor";

interface CampusMapEditSheetProps {
  session: CampusMapEditSession;
  centerPosition: readonly [number, number];
  placementPending?: boolean;
  placeContext?: AmapPlaceContextResult | { status: "loading" } | null;
  factSchema?: CampusMapFactSchema | null;
  buildings?: readonly CampusMapBrowseBuilding[];
  buildingDirectoryStatus?: "ready" | "refreshing" | "error";
  locationBuildingCandidateId?: string | null;
  onRetryBuildings?(): void;
  onEvent(event: CampusMapEditEvent): void;
}

const fieldClass =
  "mt-1 min-h-11 w-full rounded-xl border border-black/15 bg-white px-3 text-base outline-none disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-500 focus-visible:border-[#176346] focus-visible:ring-2 focus-visible:ring-[#176346]/25";
const primaryClass =
  "min-h-11 w-full touch-manipulation rounded-xl bg-[#174b38] px-4 text-sm font-semibold text-white hover:bg-[#123d2e] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2 motion-reduce:transform-none";
const secondaryClass =
  "min-h-11 touch-manipulation rounded-xl border border-black/15 bg-white px-4 text-sm font-semibold hover:bg-neutral-50 active:translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] motion-reduce:transform-none";
const displayOptions = CAMPUS_MAP_DISPLAY_REGISTRY.options;
const visibleEditorPlaceTypes = new Set<string>(CAMPUS_MAP_PIN_TYPES_V1);
const visibleEditorDetailFields = new Set([
  "regularHours",
  "capabilities",
  "gender",
  "wheelchairAccess",
]);

function today(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

function messageForError(code: string): string {
  const messages: Record<string, string> = {
    "fact-name-required": "请填写能辨认这处设施的名称或编号。",
    "fact-name-invalid": "名称含有无法保存的字符，请删除后重试。",
    "fact-name-too-long": "名称过长，请缩短后重试。",
    "source-required": "发布资料不完整，请重试。",
    "invalid-location": "位置资料不完整，请修改位置。",
    "base-revision-conflict": "地点资料已被其他人更新，请刷新后重试。",
    "invalid-place-id": "这个地点暂时无法发布，请返回地图后重试。",
    "photo-limit-exceeded": "一个地点最多保留 3 张照片。",
    "photo-invalid": "照片资料不完整，请移除后重新上传。",
    "photo-invalid-id": "照片资料已失效，请移除后重新上传。",
    "photo-duplicate": "同一张照片不能重复加入。",
    "photo-role-invalid": "请选择照片展示的内容。",
    "photo-not-ready": "照片已过期或仍在处理，请移除后重新上传。",
    "photo-not-owned": "这张照片不能用于当前修改，请移除后重新上传。",
    "photo-place-mismatch": "这张照片已属于另一个地点，请重新上传。",
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
  buildingDisplay?: CampusMapBuildingDisplayProjection,
): string {
  if (!fact.location) return "尚未定位";
  if (fact.location.kind === "outdoor-point") {
    return `${fact.location.longitude.toFixed(6)}, ${fact.location.latitude.toFixed(6)} · WGS84 · ${
      fact.location.precision === "precise" ? "精确" : "约略"
    }`;
  }
  const canonicalDisplay = matchingDisplay(fact, display);
  const buildingName = fact.buildingId
    ? ((buildingDisplay
        ? campusMapBuildingDisplayFor(buildingDisplay, fact.buildingId)?.label
        : null) ?? canonicalDisplay?.buildingName)
    : canonicalDisplay?.buildingName;
  if (fact.location.kind === "floor") {
    if (buildingName && canonicalDisplay?.floorLabel) {
      return `${buildingName} · ${canonicalDisplay.floorLabel}`;
    }
    return "建筑内楼层";
  }
  return buildingName ?? "建筑位置";
}

function describeLocationSummary(
  fact: CampusMapEditSession["draft"]["fact"],
  display?: CampusMapIndoorLocationDisplay | null,
  buildingDisplay?: CampusMapBuildingDisplayProjection,
): string {
  if (fact.location?.kind === "outdoor-point") {
    return `WGS84 · ${
      fact.location.precision === "precise" ? "精确位置" : "约略位置"
    }`;
  }
  return describeLocation(fact, display, buildingDisplay);
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
  buildingDisplay?: CampusMapBuildingDisplayProjection,
): string | null {
  const nearest = buildings.reduce<
    { id: string; name: string; distance: number } | undefined
  >((current, building) => {
    if (!building.anchor) return current;
    const distance = distanceBetweenPositions(position, [
      building.anchor.longitude,
      building.anchor.latitude,
    ]);
    return !current || distance < current.distance
      ? { id: building.buildingId, name: building.name, distance }
      : current;
  }, undefined);
  return nearest && nearest.distance <= NEARBY_BUILDING_DISTANCE_METERS
    ? `${
        (buildingDisplay
          ? campusMapBuildingDisplayFor(buildingDisplay, nearest.id)?.label
          : null) ?? nearest.name
      }附近`
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
  buildingDisplay?: CampusMapBuildingDisplayProjection,
): string {
  if (fact.location?.kind === "outdoor-point") {
    return (
      nearbyBuildingLabel(
        [fact.location.longitude, fact.location.latitude],
        buildings,
        buildingDisplay,
      ) ?? "地图选点"
    );
  }
  if (fact.buildingId) {
    return (
      (buildingDisplay
        ? campusMapBuildingDisplayFor(buildingDisplay, fact.buildingId)?.label
        : null) ??
      matchingDisplay(fact, display)?.buildingName ??
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
  | "placement"
  | "photos";

interface ConflictChoice {
  key: ConflictChoiceKey;
  label: string;
  fields: Array<keyof CampusMapPublishFactInput>;
}

function conflictFields(session: CampusMapEditSession): ConflictChoice[] {
  if (session.conflict?.kind !== "current") return [];
  const current = session.conflict.currentFact;
  const presetChoices: ConflictChoice[] =
    session.draft.fact.placeType === current.placeType
      ? [
          {
            key: "capabilities",
            label: campusMapFactFieldLabel("capabilities"),
            fields: ["capabilities"],
          },
          {
            key: "gender",
            label: campusMapFactFieldLabel("gender"),
            fields: ["gender"],
          },
        ]
      : [
          {
            key: "preset",
            label: "地点类型及相关资料",
            fields: ["placeType", "capabilities", "gender"],
          },
        ];
  const choices: ConflictChoice[] = [
    {
      key: "name",
      label: campusMapFactFieldLabel("name"),
      fields: ["name"],
    },
    ...presetChoices,
    {
      key: "wheelchairAccess",
      label: campusMapFactFieldLabel("wheelchairAccess"),
      fields: ["wheelchairAccess"],
    },
    {
      key: "regularHours",
      label: campusMapFactFieldLabel("regularHours"),
      fields: ["regularHours"],
    },
    {
      key: "officialActions",
      label: campusMapFactFieldLabel("officialActions"),
      fields: ["officialActions"],
    },
    {
      key: "visitNote",
      label: campusMapFactFieldLabel("visitNote"),
      fields: ["visitNote"],
    },
    {
      key: "placement",
      label: campusMapFactFieldLabel("location"),
      fields: ["buildingId", "floorId", "location"],
    },
    {
      key: "observedAt",
      label: campusMapFactFieldLabel("observedAt"),
      fields: ["observedAt"],
    },
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
  value: string | null,
): string {
  if (value === null) return "未填写";
  return options.find((option) => option.value === value)?.label ?? value;
}

function presetConflictValue(
  fact: CampusMapEditSession["draft"]["fact"],
): string {
  const label = campusMapPlaceTypeLabel(fact.placeType);
  if (fact.placeType === "printer") {
    const capabilities = fact.capabilities.map((capability) =>
      optionLabel(displayOptions.capabilities, capability),
    );
    return `${label} · 服务：${capabilities.join("、") || "未填写"}`;
  }
  if (fact.placeType === "toilet") {
    return `${label} · 性别：${optionLabel(
      displayOptions.gender,
      fact.gender,
    )}`;
  }
  return label;
}

function regularHoursConflictValue(
  fact: CampusMapEditSession["draft"]["fact"],
): string {
  if (!fact.regularHours) return "未填写";
  return fact.regularHours.intervals
    .map((interval) => {
      const days = interval.days
        .map((day) => CAMPUS_MAP_DISPLAY_REGISTRY.weekdays[day] ?? day)
        .join("、");
      return `${days} ${interval.opensAt}–${interval.closesAt}`;
    })
    .join("；");
}

function conflictValue(
  choice: ConflictChoice,
  fact: CampusMapEditSession["draft"]["fact"],
  display?: CampusMapIndoorLocationDisplay | null,
  buildingDisplay?: CampusMapBuildingDisplayProjection,
): string {
  switch (choice.key) {
    case "name":
      return fact.name.trim() || "未填写";
    case "placeType":
    case "preset":
      return presetConflictValue(fact);
    case "capabilities":
      return (
        fact.capabilities
          .map((capability) =>
            optionLabel(displayOptions.capabilities, capability),
          )
          .join("、") || "未填写"
      );
    case "gender":
      return optionLabel(displayOptions.gender, fact.gender);
    case "wheelchairAccess":
      return optionLabel(
        displayOptions.wheelchairAccess,
        fact.wheelchairAccess,
      );
    case "regularHours":
      return regularHoursConflictValue(fact);
    case "officialActions":
      return (
        (fact.officialActions ?? []).map((action) => action.label).join("、") ||
        "未填写"
      );
    case "visitNote":
      return fact.visitNote?.trim() || "未填写";
    case "placement":
      return describeLocation(fact, display, buildingDisplay);
    case "observedAt":
      return formatObservationTime(fact.observedAt);
    case "photos":
      return "地点照片";
  }
}

export function CampusMapEditSheet({
  session,
  centerPosition,
  placementPending = false,
  placeContext = null,
  factSchema,
  buildings = [],
  buildingDirectoryStatus = "ready",
  locationBuildingCandidateId = null,
  onRetryBuildings,
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
  const [photoUploadPending, setPhotoUploadPending] = useState(false);
  const [conflictSelection, setConflictSelection] = useState<{
    key: string;
    fields: ConflictChoiceKey[];
  }>({ key: "", fields: [] });
  const draft = session.draft;
  const fact = draft.fact;
  const detailsHaveContent =
    fact.regularHours != null ||
    fact.capabilities.length > 0 ||
    fact.gender != null ||
    fact.wheelchairAccess != null;
  const detailsDisclosureKey = draft.idempotencyKey;
  const [detailsDisclosure, setDetailsDisclosure] = useState({
    key: detailsDisclosureKey,
    expanded: detailsHaveContent,
  });
  const detailsExpanded =
    detailsDisclosure.key === detailsDisclosureKey
      ? detailsDisclosure.expanded
      : detailsHaveContent;
  const setDetailsDisclosureExpanded = (expanded: boolean) =>
    setDetailsDisclosure({ key: detailsDisclosureKey, expanded });
  const schemaPlaceDefinition =
    factSchema?.version === 2
      ? factSchema.definition.placeTypes[fact.placeType]
      : null;
  const schemaUnavailable = schemaPlaceDefinition == null;
  const serverRequiredFields = schemaPlaceDefinition?.requiredFields;
  const freshAttempt = () =>
    session.status === "temporarily-unavailable"
      ? { idempotencyKey: crypto.randomUUID() }
      : {};
  const changeFact = (
    patch: Partial<CampusMapEditSession["draft"]["fact"]>,
    locationDisplay?: CampusMapIndoorLocationDisplay | null,
  ) => {
    onEvent({
      type: "CHANGE_FACT",
      fact: { ...fact, ...patch },
      ...freshAttempt(),
      ...(locationDisplay !== undefined ? { locationDisplay } : {}),
    });
  };
  const applicableFields = new Set(
    schemaPlaceDefinition?.applicableFields ?? [],
  );
  const showsDetailFields =
    draft.mode === "edit" &&
    (schemaPlaceDefinition?.applicableFields ?? []).some((field) =>
      visibleEditorDetailFields.has(field),
    );
  const detailValidationTarget =
    typeof session.localError === "string" &&
    visibleEditorDetailFields.has(session.localError) &&
    schemaPlaceDefinition?.applicableFields.some(
      (field) => field === session.localError,
    );
  const detailsPanelExpanded = detailsExpanded || detailValidationTarget;
  const buildingLocationRequired =
    draft.mode === "add" && draft.entrySource === "building";
  const indoorSelected =
    buildingLocationRequired ||
    draft.locationIntent === "indoor" ||
    fact.location?.kind === "building" ||
    fact.location?.kind === "floor";
  const isPendingIndoorLocation =
    !buildingLocationRequired && draft.locationIntent === "indoor";
  const selectedBuilding = buildings.find(
    (building) => building.buildingId === fact.buildingId,
  );
  const selectedFloors = [...(selectedBuilding?.floors ?? [])].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const buildingDisplay = useMemo(
    () => projectCampusMapBuildingDisplay(buildings),
    [buildings],
  );
  const locationBuildingCandidate = locationBuildingCandidateId
    ? buildings.find(
        (building) => building.buildingId === locationBuildingCandidateId,
      )
    : null;
  const locationBuildingCandidateLabel = locationBuildingCandidate
    ? (campusMapBuildingDisplayFor(
        buildingDisplay,
        locationBuildingCandidate.buildingId,
      )?.label ?? locationBuildingCandidate.name)
    : null;
  const selectedBuildingQualifier = selectedBuilding
    ? (campusMapBuildingDisplayFor(buildingDisplay, selectedBuilding.buildingId)
        ?.qualifier ?? null)
    : null;
  const buildingDirectoryBlocked =
    (buildingLocationRequired || isPendingIndoorLocation) &&
    buildings.length === 0;
  const requiredBuildingMissing =
    buildingLocationRequired && selectedBuilding === undefined;
  const restoredBuildingIsUnavailable =
    buildingLocationRequired && Boolean(fact.buildingId) && !selectedBuilding;
  const addIndoorLocation = draft.mode === "add" && indoorSelected;
  const formTitle = draft.mode === "add" ? "新增设施" : "修改设施";
  const weeklySchedule = fact.regularHours;
  const conflictKey =
    session.status === "conflict" && session.conflict?.kind === "current"
      ? `${session.draft.idempotencyKey}:${session.conflict.currentRevisionId}`
      : "";
  const conflictKeepFields =
    conflictSelection.key === conflictKey ? conflictSelection.fields : [];
  const serverNameError = session.serverErrors?.find((error) =>
    (error.anchor.field ?? "").includes("name"),
  );
  const nameErrorMessage =
    session.localError === "name"
      ? messageForError(
          serverNameError?.code ??
            campusMapFactNameError(fact.name) ??
            "fact-name-required",
        )
      : null;

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

  const isSelectingLocation = session.status === "selecting-location";
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
    buildingDisplay,
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

  const floorField = (
    <label className="text-sm" htmlFor={`${fieldPrefix}-floor`}>
      {campusMapFactFieldLabel("floorId")}
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
              location: floor ? { kind: "floor" } : { kind: "building" },
            },
            {
              buildingId: selectedBuilding.buildingId,
              buildingName:
                campusMapBuildingDisplayFor(
                  buildingDisplay,
                  selectedBuilding.buildingId,
                )?.label ?? selectedBuilding.name,
              floorId: floor?.floorId ?? null,
              floorLabel: floor?.displayLabel ?? null,
            },
          );
        }}
      >
        <option value="">未指定楼层</option>
        {selectedFloors.map((floor) => (
          <option key={floor.floorId} value={floor.floorId}>
            {floor.displayLabel}
          </option>
        ))}
      </select>
    </label>
  );

  const buildingFields = (
    <div className="grid gap-3">
      {restoredBuildingIsUnavailable ? (
        <p
          className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950"
          role="alert"
        >
          原建筑不可用，请重新选择。
        </p>
      ) : null}
      <label className="text-sm" htmlFor={`${fieldPrefix}-building`}>
        建筑
        <select
          id={`${fieldPrefix}-building`}
          name="campus-map-building"
          aria-label={campusMapFactFieldLabel("buildingId")}
          aria-required={buildingLocationRequired || undefined}
          required={buildingLocationRequired}
          data-edit-field="building"
          className={fieldClass}
          disabled={buildings.length === 0}
          aria-invalid={session.localError === "buildingId" || undefined}
          aria-describedby={
            session.localError === "buildingId"
              ? `${fieldPrefix}-building-error`
              : undefined
          }
          value={selectedBuilding?.buildingId ?? ""}
          onChange={(event) => {
            const building = buildings.find(
              (candidate) => candidate.buildingId === event.target.value,
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
                buildingName:
                  campusMapBuildingDisplayFor(
                    buildingDisplay,
                    building.buildingId,
                  )?.label ?? building.name,
                floorId: null,
                floorLabel: null,
              },
            );
          }}
        >
          <option value="">请选择建筑</option>
          {buildings.map((building) => (
            <option key={building.buildingId} value={building.buildingId}>
              {campusMapBuildingDisplayFor(buildingDisplay, building.buildingId)
                ?.label ?? building.name}
            </option>
          ))}
        </select>
        {session.localError === "buildingId" ? (
          <span
            id={`${fieldPrefix}-building-error`}
            className="mt-1 block text-xs text-red-700"
          >
            请选择建筑。
          </span>
        ) : null}
      </label>
      {floorField}
      {buildingDirectoryStatus === "refreshing" ? (
        <p className="text-xs text-neutral-600" role="status">
          正在读取建筑目录…
        </p>
      ) : buildingDirectoryStatus === "error" ? (
        <div
          className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950"
          role="alert"
        >
          <span>
            建筑目录载入失败。
            {buildings.length ? "可继续使用已载入的建筑。" : null}
          </span>
          {onRetryBuildings ? (
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-lg px-2 font-semibold text-[#176346] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
              onClick={onRetryBuildings}
            >
              重新加载建筑
            </button>
          ) : null}
        </div>
      ) : buildingDirectoryStatus === "ready" && !buildings.length ? (
        <p className="text-xs text-neutral-600" role="status">
          目前没有可选建筑，暂时无法新增设施。
        </p>
      ) : !selectedBuilding ? (
        <p className="text-xs text-neutral-600">
          请选择设施所在的建筑。楼层不确定时可以不选。
        </p>
      ) : null}
    </div>
  );

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
      const currentPhotos = conflict.currentPhotos ?? [];
      const photosChanged =
        JSON.stringify(session.draft.photos) !== JSON.stringify(currentPhotos);
      return (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm"
          role="alert"
        >
          <p className="font-semibold">这处地点刚刚被其他人更新</p>
          <p className="mt-1">你的输入仍保留。请逐项比较后选择要保留的内容。</p>
          {changedFields.length || photosChanged ? (
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
                            buildingDisplay,
                          )}
                        </span>
                        <span className="block break-words text-xs text-amber-900">
                          最新：
                          {conflictValue(
                            choice,
                            conflict.currentFact,
                            conflict.currentLocationDisplay,
                            buildingDisplay,
                          )}
                        </span>
                      </span>
                    </span>
                  </label>
                );
              })}
              {photosChanged ? (
                <label className="grid min-h-11 grid-cols-[auto_1fr] items-start gap-2 py-1">
                  <input
                    type="checkbox"
                    name="conflict-photos"
                    className="mt-1"
                    checked={conflictKeepFields.includes("photos")}
                    onChange={(event) =>
                      setConflictSelection((current) => {
                        const fields =
                          current.key === conflictKey ? current.fields : [];
                        return {
                          key: conflictKey,
                          fields: event.target.checked
                            ? [...fields, "photos"]
                            : fields.filter((item) => item !== "photos"),
                        };
                      })
                    }
                  />
                  <span>
                    <span className="block font-medium">保留我的地点照片</span>
                    <span className="mt-0.5 block text-xs">
                      我的：{session.draft.photos.length} 张
                    </span>
                    <span className="block text-xs text-amber-900">
                      最新：{currentPhotos.length} 张
                    </span>
                  </span>
                </label>
              ) : null}
            </fieldset>
          ) : null}
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              className={secondaryClass}
              onClick={() => {
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
                const keptFactFields = new Set(
                  changedFields
                    .filter(({ key }) => conflictKeepFields.includes(key))
                    .flatMap(({ fields }) => fields),
                );
                onEvent({
                  type: "CONTINUE_FROM_CONFLICT",
                  idempotencyKey: crypto.randomUUID(),
                  photos: conflictKeepFields.includes("photos")
                    ? session.draft.photos
                    : currentPhotos,
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

  if (schemaUnavailable) {
    return (
      <div
        className="grid gap-3 p-5"
        role="alert"
        data-edit-field="schema-unavailable"
      >
        <h2 id="campus-map-panel-title" className="text-xl font-semibold">
          暂时无法编辑设施
        </h2>
        <p className="text-sm leading-6 text-neutral-600">
          地图资料格式尚未准备好。请稍后重试；现有地图仍可继续浏览。
        </p>
      </div>
    );
  }

  const facilityTypeField = (
    <fieldset
      data-edit-field="placeType"
      tabIndex={-1}
      className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2"
    >
      <legend className="mb-1.5 text-sm font-medium">设施类型</legend>
      <div className="grid grid-cols-3 gap-1.5 md:gap-2">
        {CAMPUS_MAP_EDIT_SCHEMA.presets
          .filter((item) => visibleEditorPlaceTypes.has(item.placeType))
          .map((item) => (
            <label
              key={item.placeType}
              className={cn(
                "flex min-h-11 w-full cursor-pointer touch-manipulation items-center justify-center rounded-xl border px-1 text-center text-xs font-semibold transition-colors active:translate-y-px focus-within:outline-none focus-within:ring-2 focus-within:ring-[#176346] focus-within:ring-offset-2 motion-reduce:transform-none sm:text-sm md:px-2",
                fact.placeType === item.placeType
                  ? "border-[#176346] bg-[#e4f1eb] text-[#174b38]"
                  : "border-black/15 bg-white text-neutral-700 hover:bg-neutral-50",
              )}
            >
              <input
                type="radio"
                name={`${fieldPrefix}-pin-type`}
                value={item.placeType}
                checked={fact.placeType === item.placeType}
                className="sr-only"
                data-edit-field={
                  fact.placeType === item.placeType ? "placeType" : undefined
                }
                onChange={() =>
                  onEvent({
                    type: "CHANGE_PLACE_TYPE",
                    placeType: item.placeType,
                    ...freshAttempt(),
                  })
                }
              />
              {campusMapPlaceTypeLabel(item.placeType)}
            </label>
          ))}
      </div>
    </fieldset>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 pt-[max(14px,env(safe-area-inset-top))] pb-3 md:px-5 md:py-4">
        <h2
          id="campus-map-panel-title"
          tabIndex={-1}
          className="mr-10 max-w-[calc(100%-2.5rem)] text-lg font-semibold text-balance focus-visible:border-l-2 focus-visible:border-[#176346] focus-visible:pl-2 focus-visible:outline-none md:text-xl"
        >
          {isSelectingLocation
            ? "设施在哪里？"
            : isPlacing
              ? draft.mode === "add"
                ? "选择设施位置"
                : "修改设施位置"
              : formTitle}
        </h2>
        {isSelectingLocation ? (
          <p className="mt-0.5 text-xs leading-5 text-neutral-600 md:mt-1 md:text-sm">
            {buildingDirectoryStatus === "ready" && buildings.length === 0
              ? "当前没有已收录建筑。"
              : "点选地图上的建筑，或在上方搜索建筑。"}
          </p>
        ) : isPlacing ? (
          <p className="mt-0.5 text-xs leading-5 text-neutral-600 md:mt-1 md:text-sm">
            {draft.mode === "add"
              ? "拖动地图或轻点地点名称，选择设施位置。"
              : "拖动地图或轻点地点名称，选择新的设施位置。"}
          </p>
        ) : null}
      </div>
      <div
        className={cn(
          "min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 md:px-5",
          isSelectingLocation
            ? "space-y-2 py-2 pb-3 md:py-3"
            : "space-y-4 py-4 pb-8 md:py-4",
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
        {!session.serverErrors?.length && nameErrorMessage ? (
          <div
            className="rounded-xl bg-red-50 p-3 text-sm text-red-900"
            role="alert"
          >
            {nameErrorMessage}
          </div>
        ) : null}
        {isSelectingLocation ? (
          <div className="grid gap-2">
            {buildingDirectoryStatus === "refreshing" ? (
              <p className="text-xs text-neutral-600" role="status">
                正在载入建筑…
              </p>
            ) : buildingDirectoryStatus === "error" ? (
              <div
                className="flex w-full items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-950"
                role="alert"
              >
                <span>建筑目录载入失败。</span>
                {onRetryBuildings ? (
                  <button
                    type="button"
                    className="min-h-11 shrink-0 rounded-lg px-2 font-semibold text-[#176346] hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                    onClick={onRetryBuildings}
                  >
                    重新加载建筑
                  </button>
                ) : null}
              </div>
            ) : null}
            {locationBuildingCandidate && locationBuildingCandidateLabel ? (
              <div
                role="group"
                aria-label="已选建筑"
                aria-live="polite"
                className="flex min-h-11 items-center gap-3"
              >
                <strong className="min-w-0 flex-1 text-sm leading-5 text-neutral-900">
                  {locationBuildingCandidateLabel}
                </strong>
                <button
                  key={locationBuildingCandidate.buildingId}
                  autoFocus
                  type="button"
                  aria-label={`确认${locationBuildingCandidateLabel}作为所属建筑`}
                  className="min-h-11 shrink-0 rounded-lg bg-[#174b38] px-3 text-sm font-semibold whitespace-nowrap text-white hover:bg-[#123d2e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2"
                  onClick={() =>
                    onEvent({
                      type: "SELECT_BUILDING_LOCATION",
                      locationDisplay: {
                        buildingId: locationBuildingCandidate.buildingId,
                        buildingName: locationBuildingCandidateLabel,
                        floorId: null,
                        floorLabel: null,
                      },
                    })
                  }
                >
                  确认
                </button>
              </div>
            ) : null}
            <button
              type="button"
              className="inline-flex min-h-11 items-center justify-self-start rounded-lg text-sm font-semibold text-[#176346] underline decoration-[#176346]/35 underline-offset-4 hover:decoration-[#176346] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2"
              onClick={() => onEvent({ type: "START_OUTDOOR_PLACEMENT" })}
            >
              选择室外位置
            </button>
          </div>
        ) : isPlacing ? (
          <div className="rounded-xl bg-[#edf5f1] px-3 py-2.5 text-sm">
            <div className="flex items-start gap-3">
              <MapPinIcon
                aria-hidden="true"
                className="mt-0.5 size-5 shrink-0 text-[#176346]"
              />
              <div className="min-w-0 flex-1">
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
              </div>
            </div>
          </div>
        ) : null}
        {coordinateEntry}
        <div
          hidden={isPlacing || isSelectingLocation}
          className="space-y-3 md:space-y-4"
        >
          {draft.mode === "edit" ? (
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
                aria-invalid={nameErrorMessage ? true : undefined}
                aria-describedby={
                  nameErrorMessage ? `${fieldPrefix}-name-error` : undefined
                }
                className={fieldClass}
                value={fact.name}
                onChange={(event) => changeFact({ name: event.target.value })}
              />
              {nameErrorMessage ? (
                <span
                  id={`${fieldPrefix}-name-error`}
                  className="mt-1 block text-xs text-red-700"
                >
                  {nameErrorMessage}
                </span>
              ) : null}
            </label>
          ) : null}

          {draft.mode === "edit" ? facilityTypeField : null}

          {draft.mode === "edit" ? (
            <PlacePhotoEditor
              placeType={fact.placeType}
              photos={draft.photos}
              disabled={
                session.status !== "editing" &&
                session.status !== "temporarily-unavailable"
              }
              onPendingChange={setPhotoUploadPending}
              onChange={(photos) =>
                onEvent({ type: "CHANGE_PHOTOS", photos, ...freshAttempt() })
              }
            />
          ) : null}

          {addIndoorLocation ? (
            <fieldset
              data-edit-field="location"
              tabIndex={-1}
              className="rounded-xl border border-[#176346]/10 bg-[#edf5f1] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
            >
              <legend className="px-1 text-sm font-semibold">所属建筑</legend>
              <div className="flex min-h-11 items-center gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white/80 text-[#176346] ring-1 ring-[#176346]/10">
                  <Building2Icon aria-hidden="true" className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold leading-5">
                    <span className="truncate">
                      {selectedBuilding?.name ??
                        draft.locationDisplay?.buildingName ??
                        "建筑资料不可用"}
                    </span>
                    {selectedBuildingQualifier ? (
                      <span
                        title={selectedBuildingQualifier}
                        className="max-w-[42%] shrink-0 truncate rounded bg-white/80 px-1.5 py-0.5 text-[11px] font-medium text-neutral-600 ring-1 ring-black/5"
                      >
                        {selectedBuildingQualifier}
                      </span>
                    ) : null}
                  </span>
                </span>
                {draft.entrySource === "global" ? (
                  <button
                    type="button"
                    className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-[#176346] hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                    onClick={() =>
                      onEvent({
                        type: "START_LOCATION_SELECTION",
                        ...freshAttempt(),
                      })
                    }
                  >
                    更改位置
                  </button>
                ) : null}
              </div>
              <div className="mt-3">{floorField}</div>
            </fieldset>
          ) : (
            <fieldset
              data-edit-field="location"
              tabIndex={-1}
              className="rounded-xl bg-[#edf5f1] p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
            >
              <legend className="sr-only">位置</legend>
              <div className="flex items-start gap-3">
                <MapPinIcon
                  aria-hidden="true"
                  className="mt-0.5 size-5 shrink-0 text-[#176346]"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold" aria-live="polite">
                    {isPendingIndoorLocation
                      ? "建筑内位置"
                      : friendlyLocationLabel(
                          fact,
                          draft.locationDisplay,
                          buildings,
                          buildingDisplay,
                        )}
                  </p>
                  <p className="mt-0.5 break-words text-xs text-neutral-600">
                    {isPendingIndoorLocation
                      ? "请选择建筑，楼层不确定时可以只确认建筑。"
                      : describeLocationSummary(
                          fact,
                          draft.locationDisplay,
                          buildingDisplay,
                        )}
                  </p>
                  {!isPendingIndoorLocation && lockedProviderCandidate ? (
                    <p className="mt-0.5 flex min-w-0 gap-1 text-xs text-neutral-500">
                      <span className="shrink-0">高德候选：</span>
                      <span className="min-w-0 break-words">
                        {lockedProviderCandidate}
                      </span>
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-[#176346] hover:bg-white/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                  onClick={() => {
                    onEvent(
                      draft.mode === "add"
                        ? {
                            type: "START_LOCATION_SELECTION",
                            ...freshAttempt(),
                          }
                        : { type: "START_REPOSITION", ...freshAttempt() },
                    );
                  }}
                >
                  {draft.mode === "add" ? "更改位置" : "修改位置"}
                </button>
              </div>
              {draft.mode === "edit" ? (
                <div className="mt-3 border-t border-[#176346]/15 pt-3">
                  <p className="mb-2 text-sm font-medium">位置类型</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label
                      className={cn(
                        "flex min-h-11 cursor-pointer touch-manipulation items-center gap-2 rounded-lg border bg-white px-3 text-sm",
                        !indoorSelected
                          ? "border-[#176346] text-[#174b38]"
                          : "border-black/10 hover:bg-neutral-50",
                      )}
                    >
                      <input
                        type="radio"
                        name={`${fieldPrefix}-location-kind`}
                        value="outdoor"
                        checked={!indoorSelected}
                        onChange={() =>
                          onEvent({
                            type: "CHOOSE_LOCATION_KIND",
                            kind: "outdoor",
                            ...freshAttempt(),
                          })
                        }
                      />
                      室外
                    </label>
                    <label
                      className={cn(
                        "flex min-h-11 cursor-pointer touch-manipulation items-center gap-2 rounded-lg border bg-white px-3 text-sm",
                        indoorSelected
                          ? "border-[#176346] text-[#174b38]"
                          : "border-black/10 hover:bg-neutral-50",
                      )}
                    >
                      <input
                        type="radio"
                        name={`${fieldPrefix}-location-kind`}
                        value="indoor"
                        checked={indoorSelected}
                        onChange={() =>
                          onEvent({
                            type: "CHOOSE_LOCATION_KIND",
                            kind: "indoor",
                            ...freshAttempt(),
                          })
                        }
                      />
                      建筑内
                    </label>
                  </div>
                </div>
              ) : null}
              {draft.mode === "edit" && indoorSelected ? (
                <div className="mt-3">{buildingFields}</div>
              ) : null}
            </fieldset>
          )}

          {draft.mode === "add" ? facilityTypeField : null}

          {showsDetailFields ? (
            <div>
              <button
                type="button"
                aria-label="更多信息"
                aria-expanded={detailsPanelExpanded}
                aria-controls={`${fieldPrefix}-place-details`}
                className="flex min-h-14 w-full touch-manipulation items-center justify-between gap-3 border-t border-black/10 py-3 text-left hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
                onClick={() =>
                  setDetailsDisclosureExpanded(!detailsPanelExpanded)
                }
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium">更多信息</span>
                  <span className="mt-0.5 block text-xs text-neutral-500">
                    开放时间及类型资料
                  </span>
                </span>
                <ChevronDownIcon
                  aria-hidden="true"
                  className={cn(
                    "size-4 shrink-0 transition-transform motion-reduce:transition-none",
                    detailsPanelExpanded && "rotate-180",
                  )}
                />
              </button>
              {detailsPanelExpanded ? (
                <fieldset
                  id={`${fieldPrefix}-place-details`}
                  className="mt-1 pt-2"
                  onFocusCapture={() => setDetailsDisclosureExpanded(true)}
                >
                  <legend className="text-sm font-medium">补充资料</legend>
                  <p className="mb-3 text-xs leading-5 text-neutral-600">
                    只填写已经确认的资料。
                  </p>
                  <div className="grid gap-3">
                    {applicableFields.has("gender") ? (
                      <label
                        className="text-sm"
                        htmlFor={`${fieldPrefix}-gender`}
                      >
                        {campusMapFactFieldLabel("gender")}
                        <select
                          id={`${fieldPrefix}-gender`}
                          name="campus-map-gender"
                          data-edit-field="gender"
                          className={fieldClass}
                          value={fact.gender ?? ""}
                          onChange={(event) =>
                            changeFact({
                              gender:
                                (event.target
                                  .value as CampusMapPublishFactInput["gender"]) ||
                                null,
                            })
                          }
                        >
                          <option value="">未填写</option>
                          {displayOptions.gender.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    {applicableFields.has("capabilities") ? (
                      <fieldset data-edit-field="capabilities">
                        <legend className="text-sm">
                          {campusMapFactFieldLabel("capabilities")}
                        </legend>
                        <div className="mt-1 grid grid-cols-3 gap-2">
                          {displayOptions.capabilities.map((option) => (
                            <label
                              key={option.value}
                              className="flex min-h-11 items-center gap-2 rounded-xl border border-black/10 px-3 text-sm"
                            >
                              <input
                                type="checkbox"
                                checked={fact.capabilities.includes(
                                  option.value,
                                )}
                                onChange={(event) =>
                                  changeFact({
                                    capabilities: event.target.checked
                                      ? [...fact.capabilities, option.value]
                                      : fact.capabilities.filter(
                                          (value) => value !== option.value,
                                        ),
                                  })
                                }
                              />
                              {option.label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ) : null}
                    {applicableFields.has("wheelchairAccess") ? (
                      <label
                        className="text-sm"
                        htmlFor={`${fieldPrefix}-wheelchair-access`}
                      >
                        {campusMapFactFieldLabel("wheelchairAccess")}
                        <select
                          id={`${fieldPrefix}-wheelchair-access`}
                          name="campus-map-wheelchair-access"
                          data-edit-field="wheelchairAccess"
                          className={fieldClass}
                          value={fact.wheelchairAccess ?? ""}
                          onChange={(event) =>
                            changeFact({
                              wheelchairAccess:
                                (event.target
                                  .value as CampusMapPublishFactInput["wheelchairAccess"]) ||
                                null,
                            })
                          }
                        >
                          <option value="">未填写</option>
                          {displayOptions.wheelchairAccess.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                  </div>
                  {applicableFields.has("regularHours") ? (
                    <div
                      className="mt-3"
                      data-edit-field="regularHours"
                      tabIndex={-1}
                    >
                      <label
                        className="text-sm"
                        htmlFor={`${fieldPrefix}-regular-hours`}
                      >
                        {campusMapFactFieldLabel("regularHours")}
                        <select
                          id={`${fieldPrefix}-regular-hours`}
                          name="campus-map-regular-hours"
                          className={fieldClass}
                          aria-invalid={
                            session.localError === "regularHours" || undefined
                          }
                          value={weeklySchedule ? "weekly" : ""}
                          onChange={(event) => {
                            changeFact({
                              regularHours:
                                event.target.value === "weekly"
                                  ? {
                                      timezone: "Asia/Hong_Kong",
                                      intervals: [
                                        { days: [], opensAt: "", closesAt: "" },
                                      ],
                                    }
                                  : null,
                            });
                          }}
                        >
                          <option value="">未填写</option>
                          <option value="weekly">每周时段</option>
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
                                {WEEKDAYS.map((day) => (
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
                                          regularHours: {
                                            ...weeklySchedule,
                                            intervals,
                                          },
                                        });
                                      }}
                                    />
                                    {CAMPUS_MAP_DISPLAY_REGISTRY.weekdays[day]}
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
                                        regularHours: {
                                          ...weeklySchedule,
                                          intervals:
                                            weeklySchedule.intervals.map(
                                              (item, itemIndex) =>
                                                itemIndex === index
                                                  ? {
                                                      ...item,
                                                      opensAt:
                                                        event.target.value,
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
                                        regularHours: {
                                          ...weeklySchedule,
                                          intervals:
                                            weeklySchedule.intervals.map(
                                              (item, itemIndex) =>
                                                itemIndex === index
                                                  ? {
                                                      ...item,
                                                      closesAt:
                                                        event.target.value,
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
                                      regularHours: {
                                        ...weeklySchedule,
                                        intervals:
                                          weeklySchedule.intervals.filter(
                                            (_, itemIndex) =>
                                              itemIndex !== index,
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
                                regularHours: {
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
                      {session.localError === "regularHours" ? (
                        <p className="mt-1 text-xs text-red-700">
                          每个时段都要选择日期，并填写不同的开始和结束时间。
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </fieldset>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      {showFixedFooter ? (
        <div className="shrink-0 border-t bg-white px-4 pt-4 pb-[max(16px,env(safe-area-inset-bottom))] md:rounded-b-2xl md:pb-4">
          <button
            type="button"
            className={primaryClass}
            disabled={
              isPlacing
                ? placementPending
                : session.status !== "editing" ||
                  (draft.mode === "edit" && !isCampusMapEditDirty(session)) ||
                  schemaUnavailable ||
                  buildingDirectoryBlocked ||
                  photoUploadPending
            }
            onClick={() => {
              if (!isPlacing && requiredBuildingMissing) {
                onEvent({ type: "REPORT_LOCAL_ERROR", field: "buildingId" });
                return;
              }
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
              );
            }}
          >
            {isPlacing
              ? placementPending
                ? "正在确定位置…"
                : "使用此位置"
              : session.status === "publishing"
                ? "正在发布…"
                : photoUploadPending
                  ? "正在处理图片…"
                  : draft.mode === "add"
                    ? "发布设施"
                    : "发布修改"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
