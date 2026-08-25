import { MEAL_PERIODS, type MealPeriod } from "@/db/schema";
import { snapshotAbsenceIsEvidence } from "./canteen-menu-snapshot-completeness";
import { providerPublicationChanged } from "./canteen-menu-publication";
import type { ExistingSyncMenuItem } from "./canteen-menu-sync";
import { menuObservationCanProjectActivity } from "./canteen-menu-sync-window";
import type {
  CurrentMenuProjection,
  MenuObservationContext,
  MenuSyncItemInput,
  ProviderMenuObservation,
} from "./canteen-types";

/**
 * Projects one observation without inventing cross-scope absence evidence.
 * A complete catalog may own catalog absence; recurring meal-period activity
 * authority is added only by projectScopedMenuObservation.
 */
export function projectSingleMenuObservation(
  observation: ProviderMenuObservation,
): CurrentMenuProjection {
  const providerCatalogIsAuthoritative =
    observation.observationScope?.kind !== "meal-period" &&
    snapshotAbsenceIsEvidence(observation.snapshotCompleteness);
  return {
    items: observation.items,
    absenceAuthority: providerCatalogIsAuthoritative
      ? { kind: "provider-catalog" }
      : { kind: "none" },
  };
}

type ScopedProjectionSource = {
  syncMealPeriods: readonly MealPeriod[];
};

type ScopedProjectionHistory = {
  previousScopeEvidence?: Record<string, unknown> | null;
};

/** Project a raw scoped observation as one reversible meal-period patch. */
export function projectScopedMenuObservation(
  source: ScopedProjectionSource,
  context: MenuObservationContext,
  observation: ProviderMenuObservation,
  history: ScopedProjectionHistory = {},
): CurrentMenuProjection {
  if (observation.observationScope?.kind !== "meal-period") {
    return projectSingleMenuObservation(observation);
  }
  if (observation.observationScope.mealPeriod !== context.mealPeriod) {
    throw new Error("MENU_OBSERVATION_SCOPE_MISMATCH");
  }
  if (!new Set(source.syncMealPeriods).has(context.mealPeriod)) {
    throw new Error("MENU_OBSERVATION_SCOPE_NOT_CONFIGURED");
  }
  if (!menuObservationCanProjectActivity(context)) {
    return { items: [], absenceAuthority: { kind: "none" } };
  }
  const publicationChanged = providerPublicationChanged(
    history.previousScopeEvidence,
    observation.scopeEvidence,
  );
  return {
    items: observation.items.map((item) => ({
      ...structuredClone(item),
      mealPeriods: [context.mealPeriod],
    })),
    absenceAuthority: {
      kind: "current-activity",
      coveredMealPeriods: [context.mealPeriod],
      configuredMealPeriods: [...new Set(source.syncMealPeriods)],
      ...(publicationChanged
        ? { publicationTransition: "changed" as const }
        : {}),
    },
  };
}

function specificPeriods(
  periods: readonly string[],
  configuredPeriods: ReadonlySet<MealPeriod>,
): MealPeriod[] {
  if (periods.includes("allday")) {
    return MEAL_PERIODS.filter((period) => configuredPeriods.has(period));
  }
  return MEAL_PERIODS.filter((period) => periods.includes(period));
}

function existingProjectionItem(
  item: ExistingSyncMenuItem,
  mealPeriods: MealPeriod[],
): MenuSyncItemInput {
  if (item.externalProductId === null) {
    throw new Error("MENU_ACTIVITY_IDENTITY_MISSING");
  }
  return {
    externalProductId: item.externalProductId,
    name: item.name,
    priceOptions: structuredClone(item.priceOptions),
    mealPeriods,
    sortOrder: item.sortOrder,
    svgKey: item.svgKey,
  };
}

/**
 * Applies current-activity evidence only to the meal periods it actually
 * observed. Missing identities lose those periods, while every other period
 * and the stable item identity stay untouched.
 */
export function materializeMealPeriodActivityProjection(
  sourceId: string,
  projection: CurrentMenuProjection,
  existingItems: readonly ExistingSyncMenuItem[],
): CurrentMenuProjection {
  if (projection.absenceAuthority.kind !== "current-activity") {
    return projection;
  }
  const covered = new Set(projection.absenceAuthority.coveredMealPeriods);
  const configured = new Set(projection.absenceAuthority.configuredMealPeriods);
  if (
    covered.size === 0 ||
    configured.size === 0 ||
    [...covered].some((period) => !configured.has(period))
  ) {
    throw new Error("MENU_ACTIVITY_SCOPE_INVALID");
  }
  const managedByProduct = new Map(
    existingItems.flatMap((item) =>
      item.menuSourceId === sourceId && item.externalProductId !== null
        ? [[item.externalProductId, item] as const]
        : [],
    ),
  );
  const observedIds = new Set<string>();
  const items: MenuSyncItemInput[] = projection.items.map((observed) => {
    observedIds.add(observed.externalProductId);
    const existing = managedByProduct.get(observed.externalProductId);
    const retained = existing?.isAvailable
      ? specificPeriods(existing.mealPeriods, configured).filter(
          (period) => !covered.has(period),
        )
      : [];
    const observedPeriods = observed.mealPeriods.includes("allday")
      ? [...covered]
      : observed.mealPeriods.filter(
          (period): period is MealPeriod =>
            period !== "allday" && covered.has(period),
        );
    if (observedPeriods.length === 0) {
      throw new Error("MENU_ACTIVITY_SCOPE_ITEM_MISMATCH");
    }
    const nextPeriods = new Set([...retained, ...observedPeriods]);
    return {
      ...observed,
      mealPeriods: MEAL_PERIODS.filter((period) => nextPeriods.has(period)),
    };
  });

  for (const existing of managedByProduct.values()) {
    if (!existing.isAvailable || observedIds.has(existing.externalProductId!)) {
      continue;
    }
    const remaining = specificPeriods(existing.mealPeriods, configured).filter(
      (period) => !covered.has(period),
    );
    if (remaining.length > 0) {
      items.push(existingProjectionItem(existing, remaining));
    }
  }

  return { ...projection, items };
}
