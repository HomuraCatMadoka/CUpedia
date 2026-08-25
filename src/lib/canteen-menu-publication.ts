type JsonObject = Record<string, unknown>;

const PUBLICATION_KEY_PATTERN = /^[a-f0-9]{24}$/;
const MAX_COMPATIBILITY_VALUES = 500;
const SERVICE_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function object(value: unknown): JsonObject | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function publicationKey(evidence: JsonObject): string | null {
  return typeof evidence.publicationKey === "string" &&
    PUBLICATION_KEY_PATTERN.test(evidence.publicationKey)
    ? evidence.publicationKey
    : null;
}

/**
 * Builds the part of PINME publication evidence already present in historical
 * snapshots, so the first post-deployment observation can compare safely.
 */
function legacyPinmePublicationShape(evidence: JsonObject): string | null {
  if (
    evidence.provider !== "pinme" ||
    !Array.isArray(evidence.referencedGroupIds) ||
    !Array.isArray(evidence.serviceWindows) ||
    evidence.referencedGroupIds.length > MAX_COMPATIBILITY_VALUES ||
    evidence.serviceWindows.length > MAX_COMPATIBILITY_VALUES
  ) {
    return null;
  }
  if (
    evidence.referencedGroupIds.some(
      (value) => typeof value !== "string" || value.length === 0,
    )
  ) {
    return null;
  }
  const serviceWindows = evidence.serviceWindows.map((value) => {
    const window = object(value);
    if (
      !window ||
      typeof window.startTime !== "string" ||
      typeof window.endTime !== "string" ||
      !SERVICE_TIME_PATTERN.test(window.startTime) ||
      !SERVICE_TIME_PATTERN.test(window.endTime)
    ) {
      return null;
    }
    return `${window.startTime}/${window.endTime}`;
  });
  if (serviceWindows.some((value) => value === null)) return null;
  return JSON.stringify({
    referencedGroupIds: [...new Set(evidence.referencedGroupIds)].sort(),
    serviceWindows: [...new Set(serviceWindows as string[])].sort(),
  });
}

/** True only when explicit provider evidence proves a publication changed. */
export function providerPublicationChanged(
  previousEvidence: unknown,
  currentEvidence: unknown,
): boolean {
  const previous = object(previousEvidence);
  const current = object(currentEvidence);
  if (!previous || !current || previous.provider !== current.provider) {
    return false;
  }
  const currentKey = publicationKey(current);
  if (!currentKey) return false;

  const previousKey = publicationKey(previous);
  if (previousKey) return previousKey !== currentKey;

  const previousLegacyShape = legacyPinmePublicationShape(previous);
  const currentLegacyShape = legacyPinmePublicationShape(current);
  return (
    previousLegacyShape !== null &&
    currentLegacyShape !== null &&
    previousLegacyShape !== currentLegacyShape
  );
}
