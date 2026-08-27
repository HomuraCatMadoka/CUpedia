import { MEAL_PERIODS, type MealPeriod } from "@/db/schema";
import { snapshotAbsenceIsEvidence } from "./canteen-menu-snapshot-completeness";
import {
  menuPublicationIdentityFromEvidence,
  providerPublicationChanged,
  type MenuPublicationIdentity,
} from "./canteen-menu-publication";
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
    ...(observation.items.length === 0 && observation.emptyMenuEvidence
      ? { confirmedEmpty: true }
      : {}),
    absenceAuthority: providerCatalogIsAuthoritative
      ? { kind: "provider-catalog" }
      : { kind: "none" },
  };
}

type ScopedProjectionSource = {
  syncMealPeriods: readonly MealPeriod[];
};

type ScopedProjectionHistory = {
  previousPublicationIdentity?: MenuPublicationIdentity | null;
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
    history.previousPublicationIdentity,
    menuPublicationIdentityFromEvidence(observation.scopeEvidence),
  );
  return {
    items: observation.items.map((item) => ({
      ...structuredClone(item),
      mealPeriods: [context.mealPeriod],
    })),
    ...(observation.items.length === 0 && observation.emptyMenuEvidence
      ? { confirmedEmpty: true }
      : {}),
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

function expandConfiguredMealPeriods(
  periods: readonly string[],
  configuredPeriods: ReadonlySet<MealPeriod>,
): MealPeriod[] {
  if (periods.includes("allday")) {
    return MEAL_PERIODS.filter((period) => configuredPeriods.has(period));
  }
  return MEAL_PERIODS.filter(
    (period) => configuredPeriods.has(period) && periods.includes(period),
  );
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
  acceptedPeriodItems: Partial<
    Record<MealPeriod, readonly MenuSyncItemInput[]>
  > = {},
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
  const managed = existingItems.filter(
    (item) =>
      item.menuSourceId === sourceId &&
      item.externalProductId !== null &&
      item.isAvailable,
  );
  const projected = new Map<
    string,
    { item: MenuSyncItemInput; mealPeriods: Set<MealPeriod> }
  >();
  const addPeriod = (item: MenuSyncItemInput, mealPeriod: MealPeriod) => {
    const current = projected.get(item.externalProductId);
    if (current) {
      current.mealPeriods.add(mealPeriod);
      return;
    }
    projected.set(item.externalProductId, {
      item,
      mealPeriods: new Set([mealPeriod]),
    });
  };

  for (const observed of projection.items) {
    const observedPeriods = observed.mealPeriods.includes("allday")
      ? [...covered]
      : observed.mealPeriods.filter(
          (period): period is MealPeriod =>
            period !== "allday" && covered.has(period),
        );
    if (observedPeriods.length === 0) {
      throw new Error("MENU_ACTIVITY_SCOPE_ITEM_MISMATCH");
    }
    for (const mealPeriod of observedPeriods) addPeriod(observed, mealPeriod);
  }

  for (const mealPeriod of MEAL_PERIODS) {
    if (!configured.has(mealPeriod) || covered.has(mealPeriod)) continue;
    const accepted = acceptedPeriodItems[mealPeriod];
    const periodAlreadyProjected = managed.some((item) =>
      expandConfiguredMealPeriods(item.mealPeriods, configured).includes(
        mealPeriod,
      ),
    );
    if (accepted !== undefined && periodAlreadyProjected) {
      for (const item of accepted) addPeriod(item, mealPeriod);
      continue;
    }
    for (const existing of managed) {
      if (
        expandConfiguredMealPeriods(existing.mealPeriods, configured).includes(
          mealPeriod,
        )
      ) {
        addPeriod(existingProjectionItem(existing, [mealPeriod]), mealPeriod);
      }
    }
  }

  return {
    ...projection,
    items: [...projected.values()].map(({ item, mealPeriods }) => ({
      ...item,
      mealPeriods: MEAL_PERIODS.filter((period) => mealPeriods.has(period)),
    })),
  };
}
