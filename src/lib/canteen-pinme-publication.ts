import {
  createMenuPublicationKey,
  isMenuServiceTime,
  type MenuPublicationKey,
} from "./canteen-menu-publication";

const MAX_PINME_COMPATIBILITY_VALUES = 500;

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Builds the PINME publication shape already present in historical snapshots. */
export function pinmePublicationCompatibilityKey(
  evidence: unknown,
): MenuPublicationKey | null {
  const record = object(evidence);
  if (
    record?.provider !== "pinme" ||
    !Array.isArray(record.referencedGroupIds) ||
    !Array.isArray(record.serviceWindows) ||
    record.referencedGroupIds.length > MAX_PINME_COMPATIBILITY_VALUES ||
    record.serviceWindows.length > MAX_PINME_COMPATIBILITY_VALUES
  ) {
    return null;
  }
  if (
    record.referencedGroupIds.some(
      (value) => typeof value !== "string" || value.length === 0,
    )
  ) {
    return null;
  }
  const serviceWindows = record.serviceWindows.map((value) => {
    const window = object(value);
    if (
      !window ||
      !isMenuServiceTime(window.startTime) ||
      !isMenuServiceTime(window.endTime)
    ) {
      return null;
    }
    return `${window.startTime}/${window.endTime}`;
  });
  if (serviceWindows.some((value) => value === null)) return null;
  return createMenuPublicationKey({
    referencedGroupIds: [...new Set(record.referencedGroupIds)].sort(),
    serviceWindows: [...new Set(serviceWindows as string[])].sort(),
  });
}
