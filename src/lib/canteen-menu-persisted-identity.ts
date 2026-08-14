import {
  isMenuProvider,
  matchesPersistedProviderMenuSourceNamespace,
  normalizePersistedMenuShadowKey,
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

export type CanonicalMenuIdentity = Readonly<{
  sourceId: string;
  productId: string;
}>;

export type PersistedAuthoritativeIdentity =
  | { kind: "manual" }
  | { kind: "partial"; provider: MenuProvider | null }
  | {
      kind: "managed";
      identity: CanonicalMenuIdentity;
      provider: MenuProvider | null;
    };

export type PersistedShadowIdentity =
  | { kind: "manual" }
  | {
      kind: "resolved";
      identity: CanonicalMenuIdentity;
      provider: MenuProvider;
    }
  | {
      kind: "unsupported";
      reason:
        | "shadow-null-asymmetry"
        | "unsupported-source-namespace"
        | "unsupported-product-key";
      provider: MenuProvider | null;
    };

export type PersistedMenuIdentityInterpretation = {
  authoritative: PersistedAuthoritativeIdentity;
  sourceOwnershipMismatch: boolean;
  shadow: PersistedShadowIdentity;
  identitiesAgree: boolean;
  diagnosticProvider: MenuProvider | null;
};

export type PersistedMenuIdentityInterpreter = {
  interpret(row: PersistedMenuIdentityRow): PersistedMenuIdentityInterpretation;
};

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
      const authoritativeSource =
        row.menuSourceId === null
          ? null
          : (sourcesById.get(row.menuSourceId) ?? null);
      const authoritative = interpretAuthoritative(row, authoritativeSource);
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
        (authoritative.kind === "manual" && shadow.kind === "manual") ||
        (authoritative.kind === "managed" &&
          shadow.kind === "resolved" &&
          canonicalMenuIdentitiesEqual(
            authoritative.identity,
            shadow.identity,
          ));

      return {
        authoritative,
        sourceOwnershipMismatch,
        shadow,
        identitiesAgree,
        diagnosticProvider:
          shadow.kind === "resolved"
            ? shadow.provider
            : shadow.kind === "unsupported" && shadow.provider !== null
              ? shadow.provider
              : authoritative.kind === "manual"
                ? null
                : authoritative.provider,
      };
    },
  };
}

function interpretAuthoritative(
  row: PersistedMenuIdentityRow,
  source: PersistedMenuIdentitySource | null,
): PersistedAuthoritativeIdentity {
  if (row.menuSourceId === null && row.externalProductId === null) {
    return { kind: "manual" };
  }
  if (row.menuSourceId !== null && row.externalProductId !== null) {
    return {
      kind: "managed",
      identity: canonicalMenuIdentity(row.menuSourceId, row.externalProductId),
      provider: asProvider(source?.provider ?? null),
    };
  }
  return {
    kind: "partial",
    provider: asProvider(source?.provider ?? null),
  };
}

function interpretShadow(
  row: PersistedMenuIdentityRow,
  sources: PersistedMenuIdentitySource[],
): PersistedShadowIdentity {
  if (row.externalSource === null && row.externalKey === null) {
    return { kind: "manual" };
  }
  if (row.externalSource === null || row.externalKey === null) {
    return {
      kind: "unsupported",
      reason: "shadow-null-asymmetry",
      provider: null,
    };
  }
  const externalSource = row.externalSource;
  const externalKey = row.externalKey;

  const candidates = sources.flatMap((source) => {
    const provider = asProvider(source.provider);
    return provider !== null &&
      matchesPersistedProviderMenuSourceNamespace(
        provider,
        source,
        externalSource,
      )
      ? [{ source, provider }]
      : [];
  });
  if (candidates.length !== 1) {
    return {
      kind: "unsupported",
      reason: "unsupported-source-namespace",
      provider: null,
    };
  }

  const [{ source, provider }] = candidates;
  try {
    return {
      kind: "resolved",
      identity: canonicalMenuIdentity(
        source.id,
        normalizePersistedMenuShadowKey(provider, externalKey),
      ),
      provider,
    };
  } catch {
    return {
      kind: "unsupported",
      reason: "unsupported-product-key",
      provider,
    };
  }
}

function asProvider(value: string | null): MenuProvider | null {
  return isMenuProvider(value) ? value : null;
}

function canonicalMenuIdentity(
  sourceId: string,
  productId: string,
): CanonicalMenuIdentity {
  return { sourceId, productId };
}

function canonicalMenuIdentitiesEqual(
  left: CanonicalMenuIdentity,
  right: CanonicalMenuIdentity,
) {
  return left.sourceId === right.sourceId && left.productId === right.productId;
}

export function canonicalMenuIdentityKey(identity: CanonicalMenuIdentity) {
  return `${identity.sourceId}\u0000${identity.productId}`;
}
