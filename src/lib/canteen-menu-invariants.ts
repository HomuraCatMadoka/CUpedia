import type { MealPeriod } from "@/db/schema";
import { normalizeCanonicalDishName } from "./canteen-menu-canonicalization";

export type MenuInvariantSource = {
  id: string;
  canteenId: string;
  canteenName: string;
  provider: string;
  externalStoreId: string;
  syncMealPeriods: MealPeriod[];
  lastErrorCode: string | null;
  hasLiveClaim: boolean;
};

export type MenuInvariantItem = {
  id: string;
  canteenId: string;
  menuSourceId: string | null;
  name: string;
  normalizedName: string | null;
  mealPeriods: string[];
  isAvailable: boolean;
};

export type MenuInvariantOffering = {
  menuSourceId: string;
  menuItemId: string;
  externalProductId: string;
};

export type MenuInvariantPeriodObservation = {
  menuSourceId: string;
  mealPeriod: MealPeriod;
  runId: string;
  observedAt: Date;
  externalProductIds: string[];
};

export type MenuInvariantHistoryTotals = {
  menuItems: number;
  comments: number;
  votes: number;
  identityTransitions: number;
};

export type BuildMenuInvariantReportInput = {
  evaluatedAt: Date;
  sources: readonly MenuInvariantSource[];
  items: readonly MenuInvariantItem[];
  offerings: readonly MenuInvariantOffering[];
  observations: readonly MenuInvariantPeriodObservation[];
  historyTotals: MenuInvariantHistoryTotals;
};

function hktDay(value: Date): number {
  return Math.floor((value.getTime() + 8 * 60 * 60 * 1_000) / 86_400_000);
}

function sorted(values: Iterable<string>): string[] {
  return [...new Set(values)].sort();
}

export function buildMenuInvariantReport(input: BuildMenuInvariantReportInput) {
  const sourceReports = input.sources
    .filter((source) => source.syncMealPeriods.length > 0)
    .map((source) => {
      const sourceItems = input.items.filter(
        (item) => item.menuSourceId === source.id,
      );
      const activeItems = sourceItems.filter((item) => item.isAvailable);
      const sourceOfferings = input.offerings.filter(
        (offering) => offering.menuSourceId === source.id,
      );
      const offeringTargets = new Map<string, Set<string>>();
      for (const offering of sourceOfferings) {
        const targets =
          offeringTargets.get(offering.externalProductId) ?? new Set();
        targets.add(offering.menuItemId);
        offeringTargets.set(offering.externalProductId, targets);
      }

      const configured = new Set<string>(source.syncMealPeriods);
      const latestObservations = source.syncMealPeriods.map((mealPeriod) =>
        input.observations.find(
          (observation) =>
            observation.menuSourceId === source.id &&
            observation.mealPeriod === mealPeriod,
        ),
      );
      const snapshotProductIds = sorted(
        latestObservations.flatMap((observation) =>
          observation ? observation.externalProductIds : [],
        ),
      );
      const unmappedExternalProductIds = snapshotProductIds.filter(
        (externalProductId) =>
          (offeringTargets.get(externalProductId)?.size ?? 0) !== 1,
      );
      const expectedActiveItemIds = sorted(
        snapshotProductIds.flatMap((externalProductId) => {
          const targets = offeringTargets.get(externalProductId);
          return targets?.size === 1 ? [...targets] : [];
        }),
      );
      const activeItemIds = sorted(activeItems.map((item) => item.id));
      const expected = new Set(expectedActiveItemIds);
      const active = new Set(activeItemIds);

      const names = new Map<string, string[]>();
      for (const item of activeItems) {
        const name =
          item.normalizedName ?? normalizeCanonicalDishName(item.name);
        names.set(name, [...(names.get(name) ?? []), item.id]);
      }

      const duplicateExternalProductIds = [...offeringTargets]
        .filter(([, targets]) => targets.size !== 1)
        .map(([externalProductId, targets]) => ({
          externalProductId,
          menuItemIds: sorted(targets),
        }));
      const duplicateCanonicalNames = [...names]
        .filter(([, itemIds]) => itemIds.length > 1)
        .map(([normalizedName, itemIds]) => ({
          normalizedName,
          menuItemIds: sorted(itemIds),
        }));
      const configuredOutActiveItems = activeItems
        .filter((item) =>
          item.mealPeriods.some(
            (period) => period === "allday" || !configured.has(period),
          ),
        )
        .map((item) => ({ id: item.id, mealPeriods: [...item.mealPeriods] }));
      const missingActiveItemIds = expectedActiveItemIds.filter(
        (id) => !active.has(id),
      );
      const unexpectedActiveItemIds = activeItemIds.filter(
        (id) => !expected.has(id),
      );
      const periods = source.syncMealPeriods.map((mealPeriod, index) => {
        const observation = latestObservations[index];
        return {
          mealPeriod,
          runId: observation?.runId ?? null,
          observedAt: observation?.observedAt.toISOString() ?? null,
          freshness: observation
            ? hktDay(observation.observedAt) < hktDay(input.evaluatedAt)
              ? ("stale" as const)
              : ("current" as const)
            : ("missing" as const),
          externalProductIdCount: observation?.externalProductIds.length ?? 0,
        };
      });
      const problems = [
        ...(source.lastErrorCode ? [`last-error:${source.lastErrorCode}`] : []),
        ...(source.hasLiveClaim ? ["live-claim"] : []),
        ...periods
          .filter((period) => period.freshness !== "current")
          .map((period) => `${period.freshness}-period:${period.mealPeriod}`),
        ...(duplicateExternalProductIds.length
          ? ["duplicate-offering-mapping"]
          : []),
        ...(unmappedExternalProductIds.length
          ? ["unmapped-snapshot-offering"]
          : []),
        ...(duplicateCanonicalNames.length ? ["duplicate-canonical-name"] : []),
        ...(configuredOutActiveItems.length
          ? ["configured-out-active-period"]
          : []),
        ...(missingActiveItemIds.length || unexpectedActiveItemIds.length
          ? ["projection-drift"]
          : []),
      ];

      return {
        sourceId: source.id,
        canteenId: source.canteenId,
        canteenName: source.canteenName,
        provider: source.provider,
        externalStoreId: source.externalStoreId,
        periods,
        counts: {
          snapshotUnion: expectedActiveItemIds.length,
          active: activeItemIds.length,
          inactive: sourceItems.length - activeItems.length,
        },
        duplicateExternalProductIds,
        unmappedExternalProductIds,
        duplicateCanonicalNames,
        configuredOutActiveItems,
        missingActiveItemIds,
        unexpectedActiveItemIds,
        problems,
        ok: problems.length === 0,
      };
    })
    .sort((left, right) => left.canteenName.localeCompare(right.canteenName));

  return {
    evaluatedAt: input.evaluatedAt.toISOString(),
    mode: "read-only" as const,
    ok: sourceReports.every((source) => source.ok),
    historyTotals: input.historyTotals,
    sources: sourceReports,
  };
}
