import { PlusIcon, XIcon } from "lucide-react";
import { useMemo, type Ref } from "react";
import {
  CampusMapFacilityResultButton,
  campusMapPlaceTypeStyle,
} from "@/components/campus-map/browse-card-presentation";
import type {
  CampusMapBrowseBuilding,
  CampusMapBrowsePlace,
} from "@/lib/campus-map/browse-projection";
import {
  CAMPUS_MAP_CATEGORY_PREVIEW_LIMIT,
  groupCampusMapClassrooms,
} from "@/lib/campus-map/category-directory";
import type { CampusMapPublicPlaceType } from "@/lib/campus-map/place-type-contract";
import type { CampusMapPlacePhotoView } from "@/lib/campus-map/place-photos-contract";
import { CAMPUS_MAP_DISPLAY_REGISTRY } from "@/lib/campus-map/display-registry";

export function CampusMapCategoryResultsPanel({
  category,
  facilities,
  featuredFacilities = [],
  buildings,
  buildingLabel,
  rowMetadata,
  covers,
  expanded,
  clusterStatus,
  titleRef,
  resultsRef,
  onSelect,
  onClose,
  onAdd,
  onExpand,
  onSwitchCategory,
}: {
  category: CampusMapPublicPlaceType;
  facilities: readonly CampusMapBrowsePlace[];
  featuredFacilities?: readonly CampusMapBrowsePlace[];
  buildings: ReadonlyMap<string, CampusMapBrowseBuilding>;
  buildingLabel: (building: CampusMapBrowseBuilding) => string;
  rowMetadata: (place: CampusMapBrowsePlace) => {
    location: string;
    summary: string;
  };
  covers: Readonly<Record<string, CampusMapPlacePhotoView>>;
  expanded: boolean;
  clusterStatus: "loading" | "ready" | "error";
  titleRef: Ref<HTMLHeadingElement>;
  resultsRef: Ref<HTMLDivElement>;
  onSelect: (place: CampusMapBrowsePlace) => void;
  onClose: () => void;
  onAdd: () => void;
  onExpand: (expanded: boolean) => void;
  onSwitchCategory: () => void;
}) {
  const style = campusMapPlaceTypeStyle(category);
  const canAdd = CAMPUS_MAP_DISPLAY_REGISTRY.browseCategories.some(
    (placeType) => placeType === category,
  );
  const classroomGroups = useMemo(
    () =>
      category === "classroom"
        ? groupCampusMapClassrooms(facilities, buildings)
        : [],
    [category, facilities, buildings],
  );
  const orderedPlaces =
    category === "classroom"
      ? classroomGroups.flatMap((group) => group.places)
      : facilities;
  const hasMore = orderedPlaces.length > CAMPUS_MAP_CATEGORY_PREVIEW_LIMIT;
  const visiblePlaces = expanded
    ? orderedPlaces
    : orderedPlaces.slice(0, CAMPUS_MAP_CATEGORY_PREVIEW_LIMIT);
  const featuredIds = new Set(featuredFacilities.map((place) => place.placeId));
  const visibleIds = new Set(
    visiblePlaces
      .filter((place) => !featuredIds.has(place.placeId))
      .map((place) => place.placeId),
  );
  const groupLabel = (
    building: CampusMapBrowseBuilding | null,
    buildingId: string | null,
  ) =>
    building
      ? buildingLabel(building)
      : buildingId
        ? "建筑资料暂缺"
        : "独立地点";
  const resultButton = (place: CampusMapBrowsePlace) => (
    <CampusMapFacilityResultButton
      key={place.placeId}
      facility={place}
      {...rowMetadata(place)}
      coverPhoto={covers[place.placeId]}
      variant="category"
      onSelect={() => onSelect(place)}
    />
  );
  return (
    <div
      id="campus-map-panel-content"
      className="flex h-full flex-col md:max-h-[calc(100dvh-32px)]"
    >
      <div className="flex shrink-0 items-center border-b border-black/10 px-5 pb-3 dark:border-white/10">
        <h2
          id="campus-map-panel-title"
          ref={titleRef}
          tabIndex={-1}
          aria-label={style.label}
          aria-describedby="campus-map-category-count"
          className="-ml-2 min-w-0 flex-1 break-words pl-2 text-[22px] font-medium focus-visible:outline-none focus-visible:shadow-[inset_3px_0_0_#176346] dark:focus-visible:shadow-[inset_3px_0_0_#34d399]"
        >
          {style.label}
          {facilities.length > 0 ? (
            <span
              aria-hidden="true"
              className="font-normal text-neutral-500 dark:text-neutral-400"
            >{` · ${facilities.length} 处`}</span>
          ) : null}
        </h2>
        <span id="campus-map-category-count" className="sr-only">
          {facilities.length} 处设施
        </span>
        <button
          type="button"
          aria-label={`关闭${style.label}列表`}
          className="grid size-11 shrink-0 place-items-center rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] dark:focus-visible:ring-emerald-400"
          onClick={onClose}
        >
          <XIcon aria-hidden="true" className="size-5" />
        </button>
      </div>
      {category === "classroom" && facilities.length > 0 ? (
        <div className="shrink-0 px-5 pt-3">
          <p className="text-[13px] leading-5 text-neutral-600 dark:text-neutral-300">
            全校园课室 · 按建筑、已知楼层与课室编号排列
          </p>
          {expanded && classroomGroups.length > 1 ? (
            <select
              aria-label="查找建筑分组"
              defaultValue=""
              className="mt-2 min-h-11 w-full min-w-0 rounded-xl border border-black/15 bg-white px-3 text-sm dark:border-white/20 dark:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] dark:focus-visible:ring-emerald-400"
              onChange={(event) => {
                const heading = document.getElementById(
                  event.currentTarget.value,
                );
                event.currentTarget.value = "";
                heading?.scrollIntoView({
                  block: "start",
                  behavior: "instant",
                });
                heading?.focus({ preventScroll: true });
              }}
            >
              <option value="">跳至建筑…</option>
              {classroomGroups.map((group) => (
                <option
                  key={group.buildingId ?? "standalone"}
                  value={`campus-map-category-building-${group.buildingId ?? "standalone"}`}
                >
                  {groupLabel(group.building, group.buildingId)} ·{" "}
                  {group.places.length} 间
                </option>
              ))}
            </select>
          ) : null}
        </div>
      ) : null}
      {clusterStatus !== "ready" ? (
        <p
          role="status"
          className="mx-5 mt-3 shrink-0 rounded-lg bg-neutral-100 px-3 py-2 text-xs text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
        >
          {clusterStatus === "error"
            ? "地图标记加载失败，列表仍可使用"
            : "地图标记正在加载"}
        </p>
      ) : null}
      <div
        ref={resultsRef}
        id="campus-map-category-results"
        data-campus-map-results="category"
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-3"
      >
        {featuredFacilities.length > 0 ? (
          <section
            data-campus-map-cluster-members
            aria-labelledby="campus-map-cluster-members-title"
            className="border-b border-black/10 pb-3 dark:border-white/10"
          >
            <h3
              id="campus-map-cluster-members-title"
              className="pt-4 pb-1 text-sm font-medium"
            >
              此地图位置的地点
              <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">
                {featuredFacilities.length} 处
              </span>
            </h3>
            {featuredFacilities.map(resultButton)}
          </section>
        ) : null}
        {category === "classroom"
          ? classroomGroups.map((group) => {
              const rooms = group.places.filter((place) =>
                visibleIds.has(place.placeId),
              );
              if (!rooms.length) return null;
              return (
                <section
                  key={group.buildingId ?? "standalone"}
                  aria-labelledby={`campus-map-category-building-${group.buildingId ?? "standalone"}`}
                >
                  <h3
                    id={`campus-map-category-building-${group.buildingId ?? "standalone"}`}
                    tabIndex={-1}
                    className="pt-4 pb-1 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] dark:focus-visible:ring-emerald-400"
                  >
                    {groupLabel(group.building, group.buildingId)}
                    <span className="ml-2 text-xs font-normal text-neutral-500 dark:text-neutral-400">
                      {group.places.length} 间
                    </span>
                  </h3>
                  {rooms.map(resultButton)}
                </section>
              );
            })
          : visiblePlaces
              .filter((place) => !featuredIds.has(place.placeId))
              .map(resultButton)}
        {!facilities.length ? (
          <div className="py-5 text-sm text-neutral-600 dark:text-neutral-300">
            <p>暂未收录{style.label}</p>
            <p className="mt-1 text-xs leading-5">
              资料仍待补充，校园中可能已有这类设施。
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="min-h-11 rounded-full border border-black/15 px-4 font-medium dark:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] dark:focus-visible:ring-emerald-400"
                onClick={onSwitchCategory}
              >
                切换分类
              </button>
              {canAdd ? (
                <button
                  type="button"
                  className="min-h-11 rounded-full bg-[#174b38] px-4 font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] dark:focus-visible:ring-emerald-400"
                  onClick={onAdd}
                >
                  新增{style.label}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
      {hasMore ? (
        <div className="shrink-0 border-t border-black/10 px-5 pt-3 dark:border-white/10">
          <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
            {expanded
              ? `已显示全部 ${facilities.length} 处`
              : `先显示 ${visiblePlaces.length} 处，共 ${facilities.length} 处`}
          </p>
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls="campus-map-category-results"
            className="min-h-11 w-full rounded-full bg-[#174b38] px-4 text-sm font-medium text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] dark:focus-visible:ring-emerald-400 focus-visible:ring-offset-2"
            onClick={() => onExpand(!expanded)}
          >
            {expanded ? "收起至预览" : `查看全部 ${facilities.length} 处设施`}
          </button>
        </div>
      ) : null}
      {facilities.length && canAdd ? (
        <button
          type="button"
          className="mx-5 mt-2 mb-[max(0.75rem,var(--campus-map-safe-area-bottom))] flex min-h-11 shrink-0 items-center justify-center gap-1 rounded-full px-3 text-sm font-medium text-[#176346] hover:bg-neutral-100 dark:text-emerald-300 dark:hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#176346] dark:focus-visible:ring-emerald-400"
          onClick={onAdd}
        >
          <PlusIcon aria-hidden="true" className="size-4" />
          新增{style.label}
        </button>
      ) : null}
    </div>
  );
}
