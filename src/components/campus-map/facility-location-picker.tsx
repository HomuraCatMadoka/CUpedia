"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  EMPTY_CAMPUS_MAP_BROWSE_PROJECTION,
  queryCampusMapBrowse,
  type CampusMapBrowseBuilding,
} from "@/lib/campus-map/browse-projection";
import {
  campusMapBuildingDisplayFor,
  projectCampusMapBuildingDisplay,
} from "@/lib/campus-map/building-display";
import type { CampusMapWgs84Position } from "@/lib/campus-map/amap-position";
import type { CampusMapEditEvent } from "@/lib/campus-map/edit-session";
import {
  campusMapProviderIdentityKey,
  type CampusMapProviderIdentity,
} from "@/lib/campus-map/provider-mapping-domain";

type FacilityLocationReferenceBase = {
  name: string;
  position: CampusMapWgs84Position | null;
};

export type FacilityLocationReference = FacilityLocationReferenceBase &
  (
    | { identity: CampusMapProviderIdentity }
    | { identity: null; interactionKey: string }
  );

type FacilityLocationPickerProps = {
  buildings: readonly CampusMapBrowseBuilding[];
  reference?: FacilityLocationReference | null;
  onEvent(event: CampusMapEditEvent): void;
  onFeedbackOpen?(open: boolean): void;
  onPickPosition?(): CampusMapWgs84Position | null;
  livePosition?: readonly [number, number];
  positionMoving?: boolean;
};

const buttonClass =
  "min-h-11 rounded-lg px-3 text-sm font-semibold text-[#176346] hover:bg-[#edf5f1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]";

export function FacilityLocationPicker(props: FacilityLocationPickerProps) {
  const referenceKey = props.reference
    ? props.reference.identity
      ? `provider:${campusMapProviderIdentityKey(props.reference.identity)}`
      : `interaction:${props.reference.interactionKey}`
    : "manual";
  return <FacilityLocationPickerForm key={referenceKey} {...props} />;
}

function FacilityLocationPickerForm({
  buildings,
  reference,
  onEvent,
  onFeedbackOpen,
  onPickPosition,
  livePosition,
  positionMoving = false,
}: FacilityLocationPickerProps) {
  const [query, setQuery] = useState(reference?.name ?? "");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [name, setName] = useState(reference?.name ?? "");
  const [description, setDescription] = useState("");
  const [position, setPosition] = useState<CampusMapWgs84Position | null>(
    livePosition ? null : (reference?.position ?? null),
  );
  const [pickedAt, setPickedAt] = useState<readonly [number, number] | null>(
    null,
  );
  const positionMoved = Boolean(
    pickedAt &&
    livePosition &&
    (Math.abs(pickedAt[0] - livePosition[0]) > 0.00001 ||
      Math.abs(pickedAt[1] - livePosition[1]) > 0.00001),
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [noteId, setNoteId] = useState<string | null>(null);
  const requestKey = useRef<{ payload: string; id: string } | null>(null);
  useEffect(() => {
    onFeedbackOpen?.(feedbackOpen);
    return () => onFeedbackOpen?.(false);
  }, [feedbackOpen, onFeedbackOpen]);
  const nameInput = useRef<HTMLInputElement>(null);
  const feedbackButton = useRef<HTMLButtonElement>(null);
  const display = projectCampusMapBuildingDisplay(buildings);
  const normalized = query.trim().toLocaleLowerCase();
  const searchResults = queryCampusMapBrowse(
    { ...EMPTY_CAMPUS_MAP_BROWSE_PROJECTION, buildings },
    { query, placeMatch: "name" },
  ).buildings;
  // A provider label may concatenate its English and Chinese names. These
  // suggestions never establish identity: the user still selects a Building.
  const compactReference = reference?.name
    .replace(/\s+/g, "")
    .toLocaleLowerCase();
  const results =
    searchResults.length || query !== reference?.name
      ? searchResults
      : buildings.filter((building) =>
          [building.name, building.englishName, ...building.aliases].some(
            (name) => {
              const compactName = name?.replace(/\s+/g, "").toLocaleLowerCase();
              return (
                compactName &&
                compactName.length >= 2 &&
                compactReference?.includes(compactName)
              );
            },
          ),
        );
  const visibleResults = normalized ? results.slice(0, 30) : [];

  if (feedbackOpen)
    return (
      <form
        className="grid gap-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (pending || noteId) return;
          if (!name.trim()) {
            nameInput.current?.focus();
            return;
          }
          if (!position || positionMoved || positionMoving) {
            setMessage("请先选择建筑位置。");
            return;
          }
          setPending(true);
          setMessage("");
          const payload = JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            position,
          });
          if (requestKey.current?.payload !== payload)
            requestKey.current = { payload, id: crypto.randomUUID() };
          const requestId = requestKey.current.id;
          try {
            const { commandCampusMapNoteAction } =
              await import("@/lib/campus-map/map-note-actions");
            const result = await commandCampusMapNoteAction({
              kind: "create",
              idempotencyKey: requestId,
              placeId: null,
              position: {
                longitude: position[0],
                latitude: position[1],
                crs: "wgs84",
              },
              openingComment: `缺失建筑：${name.trim()}${description.trim() ? `\n${description.trim()}` : ""}`,
            });
            if (result.status === "created") {
              setNoteId(result.noteId);
              setMessage("已提交建筑反馈");
            } else {
              setMessage(
                result.status === "authentication-required"
                  ? "请先登录后再提交。"
                  : result.status === "forbidden"
                    ? "当前账号无法提交反馈。"
                    : result.status === "rate-limited"
                      ? `请在 ${result.retryAfter} 秒后重试。`
                      : "提交失败，请稍后重试。",
              );
            }
          } catch {
            setMessage("网络连接失败，请重试。");
          } finally {
            setPending(false);
          }
        }}
      >
        <label className="text-sm">
          建筑名称
          <input
            ref={nameInput}
            required
            name="building-name"
            autoComplete="off"
            maxLength={200}
            value={name}
            disabled={pending || !!noteId}
            onChange={(event) => {
              setName(event.target.value);
            }}
            className="mt-1 min-h-11 w-full rounded-lg border px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
          />
        </label>
        <label className="text-sm">
          补充说明（选填）
          <textarea
            name="building-description"
            autoComplete="off"
            maxLength={1500}
            value={description}
            disabled={pending || !!noteId}
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            className="mt-1 w-full rounded-lg border p-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
            rows={2}
          />
        </label>
        {onPickPosition && !noteId ? (
          <button
            type="button"
            disabled={pending || positionMoving}
            className={buttonClass}
            onClick={() => {
              const next = onPickPosition();
              if (next) {
                setPosition(next);
                setPickedAt(livePosition ?? next);
                setMessage("已选定建筑位置");
              } else setMessage("地图暂时不可用，请稍后重试。");
            }}
          >
            使用图钉位置
          </button>
        ) : null}
        <p className="text-xs text-neutral-500">
          {positionMoving
            ? "正在确定位置…"
            : positionMoved
              ? "位置已移动，请重新使用图钉位置。"
              : position
                ? "反馈将作为公开地图备注。"
                : "拖动地图选择位置，反馈会公开显示。"}
        </p>
        {message && !positionMoved ? (
          <p role="status" className="text-sm">
            {message}
            {noteId ? (
              <>
                {" "}
                ·{" "}
                <Link
                  href={`/campus-map/notes/${noteId}`}
                  className="underline"
                >
                  查看反馈
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
        <div className="sticky bottom-0 flex gap-2 bg-white py-2">
          <button
            type="button"
            disabled={pending}
            className={buttonClass}
            onClick={() => {
              setFeedbackOpen(false);
              requestAnimationFrame(() => feedbackButton.current?.focus());
            }}
          >
            返回选建筑
          </button>
          {!noteId ? (
            <button
              type="submit"
              disabled={pending}
              className="min-h-11 flex-1 rounded-lg bg-[#174b38] px-3 text-sm font-semibold text-white disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-[#176346] focus-visible:ring-offset-2"
            >
              {pending ? "正在提交…" : "提交反馈"}
            </button>
          ) : null}
        </div>
      </form>
    );
  return (
    <div className="grid gap-2">
      {reference ? (
        <p role="status" className="text-sm">
          {reference.name} · 请选择所属建筑
        </p>
      ) : null}
      <label className="sr-only" htmlFor="facility-building-search">
        搜索建筑
      </label>
      <input
        id="facility-building-search"
        type="search"
        name="building-search"
        autoComplete="off"
        placeholder="搜索建筑名称"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        className="min-h-11 w-full rounded-xl border px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346]"
      />
      <div aria-label="建筑搜索结果">
        {visibleResults.map((building) => (
          <button
            key={building.buildingId}
            data-search-result={building.buildingId}
            type="button"
            className={`${buttonClass} block w-full text-left`}
            onClick={() =>
              onEvent({
                type: "SELECT_BUILDING_LOCATION",
                locationDisplay: {
                  buildingId: building.buildingId,
                  buildingName: building.name,
                  floorId: null,
                  floorLabel: null,
                },
              })
            }
          >
            {campusMapBuildingDisplayFor(display, building.buildingId)?.label ??
              building.name}
          </button>
        ))}
        {normalized && !results.length ? (
          <p className="py-2 text-sm text-neutral-500">没有找到这栋建筑</p>
        ) : null}
      </div>
      <button
        ref={feedbackButton}
        type="button"
        className={`${buttonClass} justify-self-start underline underline-offset-4`}
        onClick={() => {
          if (!name) setName(query.trim());
          setFeedbackOpen(true);
          requestAnimationFrame(() => nameInput.current?.focus());
        }}
      >
        找不到这栋建筑
      </button>
    </div>
  );
}
