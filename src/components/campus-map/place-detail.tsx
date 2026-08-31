import Link from "next/link";

import { PlaceLifecycleControls } from "@/components/campus-map/place-lifecycle-controls";
import { CAMPUS_MAP_EDIT_SCHEMA } from "@/lib/campus-map/edit-schema";
import type {
  CampusMapHistoricalFact,
  CampusMapPlaceHistoryHead,
} from "@/lib/campus-map/fact-store";

const weekdayLabels = {
  mon: "周一",
  tue: "周二",
  wed: "周三",
  thu: "周四",
  fri: "周五",
  sat: "周六",
  sun: "周日",
} as const;

function optionLabel(
  options: readonly { value: string; label: string }[],
  value: string,
) {
  return options.find((option) => option.value === value)?.label ?? value;
}

function pinTypeLabel(value: CampusMapHistoricalFact["pinType"]) {
  return (
    CAMPUS_MAP_EDIT_SCHEMA.presets.find((preset) => preset.pinType === value)
      ?.label ?? value
  );
}

function scheduleLabel(schedule: CampusMapHistoricalFact["accessSchedule"]) {
  if (schedule.kind !== "weekly") {
    return optionLabel(
      CAMPUS_MAP_EDIT_SCHEMA.options.accessSchedule,
      schedule.kind,
    );
  }
  return schedule.intervals
    .map(
      (interval) =>
        `${interval.days.map((day) => weekdayLabels[day]).join("、")} ${interval.opensAt}–${interval.closesAt}`,
    )
    .join("；");
}

function locationLabel(
  fact: CampusMapHistoricalFact,
  building: {
    name: string;
    floorLabel: string | null;
  } | null,
) {
  if (fact.locationKind === "outdoor-point") {
    const precision =
      fact.pointPrecision === "precise" ? "精确位置" : "大约位置";
    return fact.longitude !== null && fact.latitude !== null
      ? `室外 · ${precision} · ${fact.latitude.toFixed(6)}, ${fact.longitude.toFixed(6)}`
      : `室外 · ${precision}`;
  }
  if (!building) return "建筑资料暂不可用";
  return fact.locationKind === "floor" && building.floorLabel
    ? `${building.name} · ${building.floorLabel}`
    : `${building.name} · 楼层未知`;
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border bg-background/70 px-4 py-3">
      <dt className="text-xs font-semibold tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium leading-6">{value}</dd>
    </div>
  );
}

export function CampusMapPlaceDetail({
  placeId,
  head,
  fact,
  retirementReason,
  mapHref,
  building,
  isAdmin,
}: {
  placeId: string;
  head: CampusMapPlaceHistoryHead;
  fact: CampusMapHistoricalFact | null;
  retirementReason: string | null;
  mapHref: string;
  building: { name: string; floorLabel: string | null } | null;
  isAdmin: boolean;
}) {
  const statusLabel =
    head.status === "active"
      ? "使用中"
      : head.status === "retired"
        ? "已停用"
        : "已合并";

  return (
    <main className="w-full min-w-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--color-emerald-500)_10%,transparent),transparent_42%)] px-4 py-8 sm:px-6 lg:py-12">
      <div className="mx-auto grid w-full max-w-4xl gap-6">
        <header>
          <p className="text-xs font-bold tracking-[0.16em] text-emerald-700 dark:text-emerald-300">
            校园地图 · 地点详情
          </p>
          <div className="mt-2 flex flex-col items-start justify-between gap-4 sm:flex-row">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">
                {head.name ?? "地点资料不可用"}
              </h1>
              <span
                className={
                  head.status === "active"
                    ? "mt-3 inline-flex rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"
                    : "mt-3 inline-flex rounded-full bg-amber-100 px-3 py-1 text-sm font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-200"
                }
              >
                {statusLabel}
              </span>
            </div>
            <Link
              href={mapHref}
              className="inline-flex min-h-11 items-center rounded-xl border bg-background px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              返回地图
            </Link>
          </div>
        </header>

        {head.status === "retired" ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <h2 className="font-semibold">这个地点已停用</h2>
            <p className="mt-2 text-sm leading-6">
              它不会出现在默认地图和搜索结果中，但稳定链接与公开编辑记录仍然保留。
            </p>
            {retirementReason ? (
              <p className="mt-3 text-sm leading-6">
                <span className="font-semibold">停用原因：</span>
                {retirementReason}
              </p>
            ) : null}
            <p className="mt-3 break-all text-xs text-amber-800 dark:text-amber-200">
              稳定地点编号：{placeId}
            </p>
          </section>
        ) : null}

        {head.status === "merged" && head.mergedIntoPlaceId ? (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 dark:border-amber-900 dark:bg-amber-950/30">
            <h2 className="font-semibold">这个地点已合并</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              旧链接与历史仍然保留。请继续查看
              <Link
                className="ml-1 font-semibold text-foreground underline underline-offset-4"
                href={`/campus-map/places/${head.mergedIntoPlaceId}`}
              >
                保留地点
              </Link>
              。
            </p>
          </section>
        ) : null}

        {fact ? (
          <section className="rounded-2xl border bg-card p-5 shadow-sm sm:p-6">
            <h2 className="text-lg font-semibold">地点资料</h2>
            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <FactRow label="地点类型" value={pinTypeLabel(fact.pinType)} />
              <FactRow label="位置" value={locationLabel(fact, building)} />
              <FactRow
                label="服务能力"
                value={
                  fact.capabilities.length > 0
                    ? fact.capabilities
                        .map((value) =>
                          optionLabel(
                            CAMPUS_MAP_EDIT_SCHEMA.options.capabilities,
                            value,
                          ),
                        )
                        .join("、")
                    : "未记录"
                }
              />
              <FactRow
                label="性别属性"
                value={optionLabel(
                  CAMPUS_MAP_EDIT_SCHEMA.options.gender,
                  fact.gender,
                )}
              />
              <FactRow
                label="开放对象"
                value={optionLabel(
                  CAMPUS_MAP_EDIT_SCHEMA.options.audience,
                  fact.audience,
                )}
              />
              <FactRow
                label="凭证要求"
                value={optionLabel(
                  CAMPUS_MAP_EDIT_SCHEMA.options.credentialRequirement,
                  fact.credentialRequirement,
                )}
              />
              <FactRow
                label="开放时间"
                value={scheduleLabel(fact.accessSchedule)}
              />
              <FactRow
                label="预约要求"
                value={optionLabel(
                  CAMPUS_MAP_EDIT_SCHEMA.options.reservationRequirement,
                  fact.reservationRequirement,
                )}
              />
              <FactRow
                label="临时状态"
                value={optionLabel(
                  CAMPUS_MAP_EDIT_SCHEMA.options.temporaryStatus,
                  fact.temporaryStatus,
                )}
              />
              <FactRow
                label="无障碍通行"
                value={optionLabel(
                  CAMPUS_MAP_EDIT_SCHEMA.options.wheelchairAccess,
                  fact.wheelchairAccess,
                )}
              />
            </dl>
          </section>
        ) : (
          <section className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">
            这份地点资料目前不可公开，但稳定链接和公开历史仍然保留。
          </section>
        )}

        <div>
          <Link
            href={`/campus-map/places/${placeId}/history`}
            aria-label="查看编辑记录 / History"
            className="inline-flex min-h-11 items-center rounded-xl bg-foreground px-4 text-sm font-semibold text-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            查看编辑记录
          </Link>
        </div>

        {isAdmin && (head.status === "active" || head.status === "retired") ? (
          <section className="mt-4 rounded-2xl border border-dashed p-5 sm:p-6">
            <h2 className="font-semibold">管理员操作</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
              这些操作会追加公开修订，不会删除地点编号或历史。
            </p>
            <div className="mt-4">
              <PlaceLifecycleControls
                operation={head.status === "active" ? "retire" : "restore"}
                placeId={placeId}
                baseRevisionId={head.revisionId}
              />
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
