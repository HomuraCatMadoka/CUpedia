import { createHash } from "node:crypto";

const PUBLICATION_KEY_PATTERN = /^[a-f0-9]{24}$/;
const SERVICE_TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
declare const menuPublicationKeyBrand: unique symbol;

export type MenuPublicationKey = string & {
  readonly [menuPublicationKeyBrand]: true;
};

export type MenuPublicationIdentity = {
  key?: MenuPublicationKey;
  compatibilityKey?: MenuPublicationKey;
};

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function createMenuPublicationKey(value: unknown): MenuPublicationKey {
  const serialized = JSON.stringify(value);
  if (serialized === undefined) {
    throw new Error("INVALID_MENU_PUBLICATION_DESCRIPTOR");
  }
  return createHash("sha256")
    .update(serialized)
    .digest("hex")
    .slice(0, 24) as MenuPublicationKey;
}

export function parseMenuPublicationKey(
  value: unknown,
): MenuPublicationKey | null {
  return typeof value === "string" && PUBLICATION_KEY_PATTERN.test(value)
    ? (value as MenuPublicationKey)
    : null;
}

export function isMenuServiceTime(value: unknown): value is string {
  return typeof value === "string" && SERVICE_TIME_PATTERN.test(value);
}

/** Reads provider-neutral publication fields from normalized scope evidence. */
export function menuPublicationIdentityFromEvidence(
  evidence: unknown,
): MenuPublicationIdentity | null {
  const record = object(evidence);
  if (!record) return null;
  const key = parseMenuPublicationKey(record.publicationKey);
  const compatibilityKey = parseMenuPublicationKey(
    record.publicationCompatibilityKey,
  );
  return key || compatibilityKey
    ? {
        ...(key ? { key } : {}),
        ...(compatibilityKey ? { compatibilityKey } : {}),
      }
    : null;
}

/** True only when explicit provider evidence proves a publication changed. */
export function providerPublicationChanged(
  previous: MenuPublicationIdentity | null | undefined,
  current: MenuPublicationIdentity | null | undefined,
): boolean {
  if (!previous || !current?.key) return false;
  if (previous.key) return previous.key !== current.key;
  return (
    previous.compatibilityKey !== undefined &&
    current.compatibilityKey !== undefined &&
    previous.compatibilityKey !== current.compatibilityKey
  );
}
