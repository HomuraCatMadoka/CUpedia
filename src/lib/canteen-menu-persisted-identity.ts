import {
  normalizePublishedProviderIdentity,
  projectProviderMenuSourceNamespace,
  type MenuProvider,
} from "./canteen-provider-menu-identity";

export type PersistedMenuIdentityRow = {
  canteenId: string;
  menuSourceId: string | null;
  externalProductId: string | null;
  externalSource: string | null;
  externalKey: string | null;
};

export type PersistedMenuIdentitySource = {
  id: string;
  canteenId: string;
  provider: string;
  externalOwnerId: string | null;
  externalStoreId: string | null;
};

export type PersistedMenuIdentityInterpretation = {
  authoritativeState: "manual" | "partial" | "managed";
  sourceOwnershipMismatch: boolean;
  shadowState: "manual" | "resolved" | "unsupported";
  shadowReason:
    | "shadow-null-asymmetry"
    | "unsupported-source-namespace"
    | "unsupported-product-key"
    | null;
  identitiesAgree: boolean;
  projectedIdentity: string | null;
  provider: MenuProvider | null;
};

export type PersistedMenuIdentityInterpreter = {
  interpret(row: PersistedMenuIdentityRow): PersistedMenuIdentityInterpretation;
};

const PROVIDERS = new Set<MenuProvider>(["aigens", "ichef", "pinme", "qmai"]);

export function createPersistedMenuIdentityInterpreter(
  sources: PersistedMenuIdentitySource[],
): PersistedMenuIdentityInterpreter {
  const sourcesById = new Map(sources.map((source) => [source.id, source]));
  const sourcesByCanteen = new Map<string, PersistedMenuIdentitySource[]>();
  for (const source of sources) {
    sourcesByCanteen.set(source.canteenId, [
      ...(sourcesByCanteen.get(source.canteenId) ?? []),
      source,
    ]);
  }

  return {
    interpret(row) {
      const authoritativeState = authoritativeStateFor(row);
      const authoritativeSource =
        row.menuSourceId === null
          ? null
          : (sourcesById.get(row.menuSourceId) ?? null);
      const sourceOwnershipMismatch =
        row.menuSourceId !== null &&
        (authoritativeSource === null ||
          authoritativeSource.canteenId !== row.canteenId);
      const shadow = interpretShadow(
        row,
        authoritativeSource === null
          ? (sourcesByCanteen.get(row.canteenId) ?? [])
          : [authoritativeSource],
      );
      const identitiesAgree =
        (authoritativeState === "manual" && shadow.kind === "manual") ||
        (authoritativeState === "managed" &&
          shadow.kind === "resolved" &&
          row.menuSourceId === shadow.source.id &&
          row.externalProductId === shadow.productId);

      return {
        authoritativeState,
        sourceOwnershipMismatch,
        shadowState: shadow.kind,
        shadowReason: shadow.kind === "unsupported" ? shadow.reason : null,
        identitiesAgree,
        projectedIdentity:
          shadow.kind === "resolved"
            ? identityKey(shadow.source.id, shadow.productId)
            : null,
        provider:
          shadow.kind === "resolved"
            ? shadow.provider
            : asProvider(authoritativeSource?.provider ?? null),
      };
    },
  };
}

function authoritativeStateFor(
  row: PersistedMenuIdentityRow,
): PersistedMenuIdentityInterpretation["authoritativeState"] {
  if (row.menuSourceId === null && row.externalProductId === null) {
    return "manual";
  }
  if (row.menuSourceId !== null && row.externalProductId !== null) {
    return "managed";
  }
  return "partial";
}

function interpretShadow(
  row: PersistedMenuIdentityRow,
  sources: PersistedMenuIdentitySource[],
):
  | { kind: "manual" }
  | {
      kind: "resolved";
      source: PersistedMenuIdentitySource;
      provider: MenuProvider;
      productId: string;
    }
  | {
      kind: "unsupported";
      reason:
        | "shadow-null-asymmetry"
        | "unsupported-source-namespace"
        | "unsupported-product-key";
    } {
  if (row.externalSource === null && row.externalKey === null) {
    return { kind: "manual" };
  }
  if (row.externalSource === null || row.externalKey === null) {
    return { kind: "unsupported", reason: "shadow-null-asymmetry" };
  }
  const externalSource = row.externalSource;
  const externalKey = row.externalKey;

  const candidates = sources.flatMap((source) => {
    const provider = asProvider(source.provider);
    return provider !== null &&
      sourceNamespaceMatches(source, provider, externalSource)
      ? [{ source, provider }]
      : [];
  });
  if (candidates.length !== 1) {
    return { kind: "unsupported", reason: "unsupported-source-namespace" };
  }

  const [{ source, provider }] = candidates;
  try {
    return {
      kind: "resolved",
      source,
      provider,
      productId: normalizePublishedProviderIdentity(provider, externalKey),
    };
  } catch {
    return { kind: "unsupported", reason: "unsupported-product-key" };
  }
}

function sourceNamespaceMatches(
  source: PersistedMenuIdentitySource,
  provider: MenuProvider,
  externalSource: string,
) {
  if (
    provider === "aigens" &&
    externalSource === `order-place:${source.externalStoreId}`
  ) {
    return true;
  }
  try {
    return (
      externalSource === projectProviderMenuSourceNamespace(provider, source)
    );
  } catch {
    return false;
  }
}

function asProvider(value: string | null): MenuProvider | null {
  return value !== null && PROVIDERS.has(value as MenuProvider)
    ? (value as MenuProvider)
    : null;
}

function identityKey(sourceId: string, productId: string) {
  return `${sourceId}\u0000${productId}`;
}
