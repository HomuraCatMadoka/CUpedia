import { snapshotAbsenceIsEvidence } from "./canteen-menu-snapshot-completeness";
import type {
  CurrentMenuProjection,
  ProviderMenuObservation,
} from "./canteen-types";

/**
 * Projects one observation without inventing cross-scope absence evidence.
 * A complete catalog may own catalog absence; a meal-period observation cannot
 * own global activity until the recurring materializer covers every scope.
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
