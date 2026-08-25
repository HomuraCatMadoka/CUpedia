import { createHash } from "node:crypto";
import type { CanteenMenuSourceProvider } from "@/db/schema";
import {
  parseAigensOfferingId,
  parseMenuExternalKey,
} from "./canteen-menu-external-key";
import type { ExistingSyncMenuItem } from "./canteen-menu-sync";
import {
  MEAL_PERIOD_VALUES,
  type MealPeriodAssignment,
  type MenuSyncInput,
} from "./canteen-types";

const MEAL_PERIOD_ALTERNATION = MEAL_PERIOD_VALUES.join("|");
const MEAL_PERIOD_PATTERN = `(?:${MEAL_PERIOD_ALTERNATION})`;
const MAX_DIAGNOSTIC_SAMPLES = 5;

export type MenuProvider = CanteenMenuSourceProvider;

export type ProviderMenuIdentityContract = {
  sourceLocatorFields: readonly ("externalOwnerId" | "externalStoreId")[];
  offeringIdentityFields: readonly string[];
  mutableAttributeFields: readonly string[];
};

const MUTABLE_ATTRIBUTE_FIELDS = [
  "name",
  "priceOptions",
  "isAvailable",
  "category",
  "mealPeriods",
  "sortOrder",
] as const;

export const providerMenuIdentityContracts = {
  pinme: {
    sourceLocatorFields: ["externalStoreId"],
    offeringIdentityFields: ["product_id"],
    mutableAttributeFields: MUTABLE_ATTRIBUTE_FIELDS,
  },
  ichef: {
    sourceLocatorFields: ["externalStoreId"],
    offeringIdentityFields: ["ichefUuid"],
    mutableAttributeFields: MUTABLE_ATTRIBUTE_FIELDS,
  },
  qmai: {
    sourceLocatorFields: ["externalOwnerId", "externalStoreId"],
    offeringIdentityFields: ["goodsId"],
    mutableAttributeFields: MUTABLE_ATTRIBUTE_FIELDS,
  },
  aigens: {
    sourceLocatorFields: ["externalStoreId"],
    offeringIdentityFields: ["backendId"],
    mutableAttributeFields: MUTABLE_ATTRIBUTE_FIELDS,
  },
} as const satisfies Record<MenuProvider, ProviderMenuIdentityContract>;

export function isMenuProvider(value: unknown): value is MenuProvider {
  return (
    typeof value === "string" &&
    Object.hasOwn(providerMenuIdentityContracts, value)
  );
}

export type ProviderMenuIdentityDiagnostic = {
  provider: MenuProvider;
  count: number;
  samples: string[];
};

export type ProviderMenuIdentityErrorCode =
  | "INVALID_SOURCE_LOCATOR"
  | "EMPTY_SNAPSHOT"
  | "EMPTY_IDENTITY"
  | "MALFORMED_IDENTITY"
  | "DUPLICATE_IDENTITY"
  | "COLLIDING_IDENTITY";

export class ProviderMenuIdentityError extends Error {
  constructor(
    readonly code: ProviderMenuIdentityErrorCode,
    readonly diagnostic: ProviderMenuIdentityDiagnostic,
  ) {
    super(
      `${code}: ${diagnostic.provider} menu identity contract rejected ${diagnostic.count} row(s)`,
    );
    this.name = "ProviderMenuIdentityError";
  }
}

export type ProviderMenuSourceLocator = {
  externalOwnerId?: unknown;
  externalStoreId?: unknown;
};

type IdentityItem = {
  externalProductId?: unknown;
  [attribute: string]: unknown;
};

type IdentityOccurrence = IdentityItem & {
  mealPeriods: readonly MealPeriodAssignment[];
};

export function normalizePublishedProviderIdentity(
  provider: MenuProvider,
  publishedIdentity: string,
): string {
  const identity = publishedIdentity.trim();
  if (!identity) throw new Error("EMPTY_IDENTITY");
  if (identity.length > 200 || /[\u0000-\u001f\u007f]/.test(identity)) {
    throw new Error("MALFORMED_IDENTITY");
  }

  if (provider === "aigens") {
    const current = identity.match(
      new RegExp(`^(.+)#offering-period=(${MEAL_PERIOD_ALTERNATION})$`),
    );
    if (current?.[1] && !hasReservedMarker(current[1])) return current[1];
    const historical = identity.match(
      new RegExp(`^(.+?)(?::|#period=)(${MEAL_PERIOD_ALTERNATION})$`),
    );
    if (historical?.[1] && !hasReservedMarker(historical[1])) {
      return historical[1];
    }
    if (!hasReservedMarker(identity)) return identity;
    throw new Error("MALFORMED_IDENTITY");
  }

  const historicalPeriodSet = identity.match(
    new RegExp(
      `^(.+)#period=${MEAL_PERIOD_PATTERN}(?:\\+${MEAL_PERIOD_PATTERN})*$`,
    ),
  );
  if (historicalPeriodSet?.[1] && !hasReservedMarker(historicalPeriodSet[1])) {
    return historicalPeriodSet[1];
  }
  if (provider === "pinme") {
    const historicalScalar = identity.match(
      new RegExp(`^(.+):${MEAL_PERIOD_PATTERN}$`),
    );
    if (historicalScalar?.[1] && !hasReservedMarker(historicalScalar[1])) {
      return historicalScalar[1];
    }
  }
  if (!hasReservedMarker(identity)) return identity;
  throw new Error("MALFORMED_IDENTITY");
}

export function normalizePersistedMenuShadowKey(
  provider: MenuProvider,
  externalKey: string,
): string {
  try {
    return normalizePublishedProviderIdentity(provider, externalKey);
  } catch {
    if (provider !== "aigens") throw new Error("MALFORMED_IDENTITY");
    const writerEnvelope = parseMenuExternalKey(externalKey);
    const offering = writerEnvelope
      ? parseAigensOfferingId(writerEnvelope.productIdentity)
      : null;
    if (
      !writerEnvelope ||
      !offering ||
      writerEnvelope.mealPeriods.length !== 1 ||
      writerEnvelope.mealPeriods[0] !== offering.mealPeriod
    ) {
      throw new Error("MALFORMED_IDENTITY");
    }
    return normalizePublishedProviderIdentity(
      provider,
      writerEnvelope.productIdentity,
    );
  }
}

export function projectProviderMenuSourceNamespace(
  provider: MenuProvider,
  source: ProviderMenuSourceLocator,
): string {
  assertSourceLocator(provider, source);
  const storeId = String(source.externalStoreId);
  if (provider !== "qmai") return `${provider}:${storeId}`;
  return `qmai:${String(source.externalOwnerId).trim()}:${storeId}`;
}

export type PersistedProviderMenuSourceNamespace = Readonly<{
  provider: MenuProvider;
  externalOwnerId: string | null;
  externalStoreId: string;
}>;

export function parsePersistedProviderMenuSourceNamespace(
  externalSource: string,
): PersistedProviderMenuSourceNamespace | null {
  const parts = externalSource.split(":");
  if (parts.length === 2) {
    const [namespace, externalStoreId] = parts;
    if (!isSourceLocatorComponent(externalStoreId)) return null;
    if (namespace === "order-place") {
      return {
        provider: "aigens",
        externalOwnerId: null,
        externalStoreId,
      };
    }
    if (
      isMenuProvider(namespace) &&
      providerMenuIdentityContracts[namespace].sourceLocatorFields.length === 1
    ) {
      return {
        provider: namespace,
        externalOwnerId: null,
        externalStoreId,
      };
    }
    return null;
  }
  if (parts.length === 3 && parts[0] === "qmai") {
    const [, externalOwnerId, externalStoreId] = parts;
    if (
      !isSourceLocatorComponent(externalOwnerId) ||
      !isSourceLocatorComponent(externalStoreId)
    ) {
      return null;
    }
    return {
      provider: "qmai",
      externalOwnerId,
      externalStoreId,
    };
  }
  return null;
}

export function matchesPersistedProviderMenuSourceNamespace(
  provider: MenuProvider,
  source: ProviderMenuSourceLocator,
  externalSource: string,
): boolean {
  const parsed = parsePersistedProviderMenuSourceNamespace(externalSource);
  if (parsed === null || parsed.provider !== provider) return false;
  try {
    assertSourceLocator(provider, source);
  } catch {
    return false;
  }
  if (parsed.externalStoreId !== String(source.externalStoreId)) return false;
  return provider !== "qmai"
    ? parsed.externalOwnerId === null
    : parsed.externalOwnerId === String(source.externalOwnerId).trim();
}

export function assertProviderMenuIdentitySnapshot(
  provider: MenuProvider,
  source: ProviderMenuSourceLocator,
  items: readonly IdentityItem[],
): string[] {
  assertSourceLocator(provider, source);
  return assertProviderMenuIdentityItems(provider, items);
}

export function assertProviderMenuIdentityItems(
  provider: MenuProvider,
  items: readonly IdentityItem[],
): string[] {
  return assertProviderMenuIdentityItemsWithNormalizer(
    provider,
    items,
    normalizePublishedProviderIdentity,
  );
}

function assertProviderMenuIdentityItemsWithNormalizer(
  provider: MenuProvider,
  items: readonly IdentityItem[],
  normalizeIdentity: (provider: MenuProvider, identity: string) => string,
): string[] {
  if (items.length === 0) fail(provider, "EMPTY_SNAPSHOT", []);

  const invalid: Array<{ index: number; identity: unknown; empty: boolean }> =
    [];
  const normalized: string[] = [];
  for (const [index, item] of items.entries()) {
    const raw = item.externalProductId;
    if (typeof raw !== "string" || !raw.trim()) {
      invalid.push({ index, identity: raw, empty: true });
      continue;
    }
    try {
      normalized.push(normalizeIdentity(provider, raw));
    } catch {
      invalid.push({ index, identity: raw, empty: false });
    }
  }
  if (invalid.length > 0) {
    const code = invalid.every((entry) => entry.empty)
      ? "EMPTY_IDENTITY"
      : "MALFORMED_IDENTITY";
    fail(
      provider,
      code,
      invalid.map((entry) => `${entry.index}:${String(entry.identity ?? "")}`),
    );
  }

  const rowsByIdentity = new Map<
    string,
    Array<{ index: number; raw: string; fingerprint: string }>
  >();
  items.forEach((item, index) => {
    const canonical = normalized[index];
    rowsByIdentity.set(canonical, [
      ...(rowsByIdentity.get(canonical) ?? []),
      {
        index,
        raw: String(item.externalProductId).trim(),
        fingerprint: stableFingerprint(item),
      },
    ]);
  });
  const collisions = [...rowsByIdentity.entries()].filter(
    ([, rows]) => rows.length > 1,
  );
  if (collisions.length > 0) {
    const isExactDuplicate = collisions.every(([, rows]) =>
      rows.every(
        (row) =>
          row.raw === rows[0].raw && row.fingerprint === rows[0].fingerprint,
      ),
    );
    fail(
      provider,
      isExactDuplicate ? "DUPLICATE_IDENTITY" : "COLLIDING_IDENTITY",
      collisions.flatMap(([identity, rows]) =>
        rows.map((row) => `${row.index}:${identity}`),
      ),
    );
  }
  return normalized;
}

export function assertCompatibleProviderIdentityOccurrence(
  provider: MenuProvider,
  existing: IdentityOccurrence,
  incoming: IdentityOccurrence,
): void {
  const existingIdentity = String(existing.externalProductId ?? "");
  const incomingIdentity = String(incoming.externalProductId ?? "");
  let canonicalExisting: string;
  let canonicalIncoming: string;
  try {
    canonicalExisting = normalizePublishedProviderIdentity(
      provider,
      existingIdentity,
    );
    canonicalIncoming = normalizePublishedProviderIdentity(
      provider,
      incomingIdentity,
    );
  } catch {
    fail(provider, "MALFORMED_IDENTITY", [existingIdentity, incomingIdentity]);
  }
  if (
    canonicalExisting !== canonicalIncoming ||
    occurrenceFingerprint(existing) !== occurrenceFingerprint(incoming)
  ) {
    fail(provider, "COLLIDING_IDENTITY", [existingIdentity, incomingIdentity]);
  }
  if (occurrencePeriodsOverlap(existing.mealPeriods, incoming.mealPeriods)) {
    fail(provider, "DUPLICATE_IDENTITY", [existingIdentity, incomingIdentity]);
  }
}

export function canonicalizeProviderMenuState(
  provider: MenuProvider,
  input: MenuSyncInput,
  existingItems: ExistingSyncMenuItem[],
  options?: { allowEmptySnapshot?: boolean },
): { input: MenuSyncInput; existingItems: ExistingSyncMenuItem[] };
export function canonicalizeProviderMenuState<
  TInput extends Pick<MenuSyncInput, "items">,
>(
  provider: MenuProvider,
  input: TInput,
  existingItems: ExistingSyncMenuItem[],
  options?: { allowEmptySnapshot?: boolean },
): { input: TInput; existingItems: ExistingSyncMenuItem[] };
export function canonicalizeProviderMenuState<
  TInput extends Pick<MenuSyncInput, "items">,
>(
  provider: MenuProvider,
  input: TInput,
  existingItems: ExistingSyncMenuItem[],
  options: { allowEmptySnapshot?: boolean } = {},
): { input: TInput; existingItems: ExistingSyncMenuItem[] } {
  const canonicalInput = {
    ...input,
    items: input.items.map((item) => ({
      ...item,
      externalProductId: normalizeCurrentProviderIdentity(
        provider,
        item.externalProductId,
      ),
    })),
  };
  if (!options.allowEmptySnapshot || canonicalInput.items.length > 0) {
    assertProviderMenuIdentityItems(provider, canonicalInput.items);
  }
  const canonicalExistingItems = existingItems.map((item) => ({
    ...item,
    externalProductId:
      item.externalProductId === null
        ? null
        : normalizeCurrentProviderIdentity(provider, item.externalProductId),
  }));
  const managedIdentities = canonicalExistingItems
    .filter((item) => item.externalProductId !== null)
    .map((item) => ({
      externalProductId: item.externalProductId,
      id: item.id,
    }));
  if (managedIdentities.length > 0) {
    assertProviderMenuIdentityItems(provider, managedIdentities);
  }
  return {
    input: canonicalInput as TInput,
    existingItems: canonicalExistingItems,
  };
}

/**
 * Canonicalize an audited transition while preserving historical aliases as
 * fingerprinted evidence. Only the reviewed transition may converge them.
 */
export function canonicalizeProviderMenuIdentityTransitionState(
  provider: MenuProvider,
  input: MenuSyncInput,
  existingItems: ExistingSyncMenuItem[],
): { input: MenuSyncInput; existingItems: ExistingSyncMenuItem[] } {
  const canonicalInput = canonicalizeProviderMenuState(provider, input, []);
  const canonicalExistingItems = existingItems.map((item) => ({
    ...item,
    externalProductId:
      item.externalProductId === null
        ? null
        : normalizeAuditedPersistedProviderIdentity(
            provider,
            item.externalProductId,
          ),
  }));
  const managedIdentities = canonicalExistingItems
    .filter((item) => item.externalProductId !== null)
    .map((item) => ({
      externalProductId: item.externalProductId,
      id: item.id,
    }));
  if (managedIdentities.length > 0) {
    assertProviderMenuIdentityItemsWithNormalizer(
      provider,
      managedIdentities,
      normalizeAuditedPersistedProviderIdentity,
    );
  }
  return {
    input: canonicalInput.input,
    existingItems: canonicalExistingItems,
  };
}

function normalizeAuditedPersistedProviderIdentity(
  provider: MenuProvider,
  publishedIdentity: string,
): string {
  const identity = publishedIdentity.trim();
  normalizePublishedProviderIdentity(provider, identity);
  return identity;
}

function normalizeCurrentProviderIdentity(
  provider: MenuProvider,
  publishedIdentity: string,
): string {
  const identity = publishedIdentity.trim();
  const normalized = normalizePublishedProviderIdentity(provider, identity);
  if (provider === "aigens" && normalized !== identity) {
    throw new Error("MALFORMED_IDENTITY");
  }
  return normalized;
}

function assertSourceLocator(
  provider: MenuProvider,
  source: ProviderMenuSourceLocator,
): void {
  const fields = providerMenuIdentityContracts[provider].sourceLocatorFields;
  const invalid = fields.filter((field) => {
    const value = source[field];
    return !isSourceLocatorComponent(value);
  });
  if (invalid.length > 0) fail(provider, "INVALID_SOURCE_LOCATOR", invalid);
}

function isSourceLocatorComponent(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Boolean(value.trim()) &&
    value.length <= 200 &&
    !value.includes(":")
  );
}

function hasReservedMarker(identity: string): boolean {
  return /[:#]/.test(identity);
}

function stableFingerprint(item: IdentityItem): string {
  return JSON.stringify(
    Object.entries(item)
      .filter(([key]) => key !== "externalProductId")
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function occurrenceFingerprint(item: IdentityItem): string {
  return JSON.stringify({
    name: item.name,
    priceOptions: item.priceOptions,
    svgKey: item.svgKey,
  });
}

function occurrencePeriodsOverlap(
  left: readonly MealPeriodAssignment[],
  right: readonly MealPeriodAssignment[],
): boolean {
  if (left.includes("allday") || right.includes("allday")) return true;
  const leftPeriods = new Set(left);
  return right.some((period) => leftPeriods.has(period));
}

function fail(
  provider: MenuProvider,
  code: ProviderMenuIdentityErrorCode,
  unsafeSamples: readonly string[],
): never {
  throw new ProviderMenuIdentityError(code, {
    provider,
    count: Math.max(unsafeSamples.length, code === "EMPTY_SNAPSHOT" ? 0 : 1),
    samples: unsafeSamples.slice(0, MAX_DIAGNOSTIC_SAMPLES).map(redact),
  });
}

function redact(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 12);
}
