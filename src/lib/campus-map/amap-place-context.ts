export interface AmapProviderPosition {
  longitude: number;
  latitude: number;
  crs: "gcj02";
}

export interface AmapProviderPoi {
  id?: string;
  name?: string;
  address?: string;
  distanceMeters?: number;
}

export type AmapReverseGeocodeResult =
  | {
      status: "complete";
      formattedAddress?: string;
      pois?: readonly AmapProviderPoi[];
    }
  | { status: "no-data" }
  | {
      status: "error";
      reason: "rate-limited" | "transient" | "permanent";
      retryAfterSeconds?: number;
    };

export interface AmapPlaceContextAdapter {
  reverseGeocode(
    position: AmapProviderPosition,
  ): Promise<AmapReverseGeocodeResult>;
}

export interface AmapGeocoderService {
  getAddress(
    position: readonly [longitude: number, latitude: number],
    callback: (status: string, result: unknown) => void,
  ): void;
}

export interface AmapResolvedPlaceContext {
  providerPosition: AmapProviderPosition;
  label: string;
  address: string | null;
  providerPoiId: string | null;
  distanceMeters: number | null;
}

export type AmapPlaceContextResult =
  | { status: "resolved"; context: AmapResolvedPlaceContext }
  | { status: "empty" }
  | { status: "rate-limited"; retryAfterSeconds: number | null }
  | { status: "transient-error" }
  | { status: "permanent-error" }
  | { status: "superseded" };

export interface AmapPlaceContextResolver {
  resolveLatest(
    position: AmapProviderPosition,
  ): Promise<AmapPlaceContextResult>;
  invalidate(): void;
}

export interface AmapPlaceContextResolverOptions {
  cacheTtlMs?: number;
  maxCacheEntries?: number;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}

function clean(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

const AMAP_CAMPUS_CONTAINER_NAMES = new Set([
  "cuhk",
  "thechineseuniversityofhongkong",
  "香港中文大学",
  "香港中文大學",
]);
const MAX_TRUSTED_CONTEXT_POI_DISTANCE_METERS = 30;

function isCampusContainerPoi(poi: AmapProviderPoi): boolean {
  const name = clean(poi.name)?.toLocaleLowerCase().replace(/\s+/g, "");
  return name ? AMAP_CAMPUS_CONTAINER_NAMES.has(name) : false;
}

function selectContextPoi(
  pois: readonly AmapProviderPoi[] | undefined,
): AmapProviderPoi | undefined {
  const namedPois = pois?.filter((poi) => clean(poi.name)) ?? [];
  const trustedSpecificPois = namedPois.filter(
    (poi) =>
      !isCampusContainerPoi(poi) &&
      typeof poi.distanceMeters === "number" &&
      Number.isFinite(poi.distanceMeters) &&
      poi.distanceMeters >= 0 &&
      poi.distanceMeters <= MAX_TRUSTED_CONTEXT_POI_DISTANCE_METERS,
  );
  return trustedSpecificPois.reduce<AmapProviderPoi | undefined>(
    (nearest, candidate) => {
      if (!nearest) return candidate;
      return (candidate.distanceMeters as number) <
        (nearest.distanceMeters as number)
        ? candidate
        : nearest;
    },
    undefined,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function optionalString(value: unknown): string | undefined {
  if (typeof value === "string") return clean(value) ?? undefined;
  if (Array.isArray(value)) {
    const joined = value
      .filter((item): item is string => typeof item === "string")
      .join("");
    return clean(joined) ?? undefined;
  }
  return undefined;
}

function classifyAmapError(
  rawResult: unknown,
): "rate-limited" | "transient" | "permanent" {
  if (!isRecord(rawResult)) return "transient";
  const info = optionalString(rawResult.info)?.toUpperCase() ?? "";
  const infocode = optionalString(rawResult.infocode) ?? "";
  if (
    /(QPS|QUOTA|DAILY|LIMIT)/.test(info) ||
    ["10003", "10004", "10015", "10019", "10020", "10021", "10044"].includes(
      infocode,
    )
  ) {
    return "rate-limited";
  }
  if (
    /(NETWORK|TIMEOUT|SERVER_IS_BUSY|SERVICE_NOT_AVAILABLE|UNKNOWN_ERROR)/.test(
      info,
    ) ||
    infocode === "10016"
  ) {
    return "transient";
  }
  return "permanent";
}

export function createAmapGeocoderAdapter(
  geocoder: AmapGeocoderService,
): AmapPlaceContextAdapter {
  return {
    reverseGeocode(position) {
      return new Promise((resolve) => {
        geocoder.getAddress(
          [position.longitude, position.latitude],
          (status, rawResult) => {
            if (status === "no_data") {
              resolve({ status: "no-data" });
              return;
            }
            if (
              status !== "complete" ||
              !isRecord(rawResult) ||
              optionalString(rawResult.info)?.toUpperCase() !== "OK"
            ) {
              resolve({
                status: "error",
                reason: classifyAmapError(rawResult),
              });
              return;
            }
            const regeocode = isRecord(rawResult.regeocode)
              ? rawResult.regeocode
              : null;
            if (!regeocode) {
              resolve({ status: "no-data" });
              return;
            }
            const pois = Array.isArray(regeocode.pois)
              ? regeocode.pois.flatMap((rawPoi): AmapProviderPoi[] => {
                  if (!isRecord(rawPoi)) return [];
                  const rawDistance = rawPoi.distance;
                  const distance =
                    typeof rawDistance === "number"
                      ? rawDistance
                      : typeof rawDistance === "string"
                        ? Number(rawDistance)
                        : Number.NaN;
                  return [
                    {
                      id: optionalString(rawPoi.id),
                      name: optionalString(rawPoi.name),
                      address: optionalString(rawPoi.address),
                      distanceMeters: Number.isFinite(distance)
                        ? distance
                        : undefined,
                    },
                  ];
                })
              : undefined;
            resolve({
              status: "complete",
              formattedAddress: optionalString(regeocode.formattedAddress),
              pois,
            });
          },
        );
      });
    },
  };
}

export function createAmapPlaceContextResolver(
  adapter: AmapPlaceContextAdapter,
  options: AmapPlaceContextResolverOptions = {},
): AmapPlaceContextResolver {
  let generation = 0;
  const cacheTtlMs = options.cacheTtlMs ?? 30_000;
  const maxCacheEntries = Math.max(1, options.maxCacheEntries ?? 32);
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((milliseconds: number) =>
      new Promise<void>((resolve) =>
        globalThis.setTimeout(resolve, milliseconds),
      ));
  const cache = new Map<
    string,
    {
      expiresAt: number;
      promise: Promise<AmapReverseGeocodeResult>;
    }
  >();

  function cacheKey(position: AmapProviderPosition): string {
    return `${position.longitude.toFixed(4)},${position.latitude.toFixed(4)}`;
  }

  function reverseGeocode(
    position: AmapProviderPosition,
  ): Promise<AmapReverseGeocodeResult> {
    const key = cacheKey(position);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now()) return cached.promise;
    cache.delete(key);
    while (cache.size >= maxCacheEntries) {
      const oldestKey = cache.keys().next().value;
      if (typeof oldestKey !== "string") break;
      cache.delete(oldestKey);
    }
    const entry = {
      expiresAt: Number.POSITIVE_INFINITY,
      promise: reverseGeocodeWithRetry(position),
    };
    cache.set(key, entry);
    void entry.promise.then(
      (result) => {
        if (cache.get(key) !== entry) return;
        if (result.status === "complete" || result.status === "no-data") {
          entry.expiresAt = now() + cacheTtlMs;
        } else {
          cache.delete(key);
        }
      },
      () => {
        if (cache.get(key) === entry) cache.delete(key);
      },
    );
    return entry.promise;
  }

  async function reverseGeocodeWithRetry(
    position: AmapProviderPosition,
  ): Promise<AmapReverseGeocodeResult> {
    let result: AmapReverseGeocodeResult;
    try {
      result = await adapter.reverseGeocode(position);
    } catch {
      result = { status: "error", reason: "transient" };
    }
    if (result.status !== "error" || result.reason !== "transient") {
      return result;
    }
    await sleep(200);
    try {
      return await adapter.reverseGeocode(position);
    } catch {
      return { status: "error", reason: "transient" };
    }
  }

  return {
    async resolveLatest(position) {
      const token = ++generation;
      const result = await reverseGeocode(position);
      if (token !== generation) return { status: "superseded" };
      if (result.status === "no-data") return { status: "empty" };
      if (result.status === "error") {
        if (result.reason === "rate-limited") {
          return {
            status: "rate-limited",
            retryAfterSeconds: result.retryAfterSeconds ?? null,
          };
        }
        return {
          status:
            result.reason === "transient"
              ? "transient-error"
              : "permanent-error",
        };
      }

      const nearestPoi = selectContextPoi(result.pois);
      const address = clean(result.formattedAddress);
      const label = clean(nearestPoi?.name) ?? (address && "地图中心位置");
      if (!label) return { status: "empty" };
      return {
        status: "resolved",
        context: {
          providerPosition: { ...position },
          label,
          address,
          providerPoiId: clean(nearestPoi?.id),
          distanceMeters:
            typeof nearestPoi?.distanceMeters === "number" &&
            Number.isFinite(nearestPoi.distanceMeters)
              ? nearestPoi.distanceMeters
              : null,
        },
      };
    },
    invalidate() {
      generation += 1;
      cache.clear();
    },
  };
}
