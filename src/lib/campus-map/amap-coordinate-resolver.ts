import {
  asAmapPosition,
  asWgs84Position,
  type CampusMapAmapPosition,
  type CampusMapWgs84Position,
} from "@/lib/campus-map/amap-position";

const AMAP_CONVERSION_BATCH_SIZE = 40;
const AMAP_CONVERSION_TIMEOUT_MS = 8_000;

export interface CampusMapAmapCoordinateConverter {
  convertFrom(
    positions: ReadonlyArray<CampusMapWgs84Position>,
    source: "gps",
    callback: (
      status: "complete" | "error",
      result: {
        info?: string;
        locations?: ReadonlyArray<{ lng: number; lat: number }>;
      },
    ) => void,
  ): void;
}

export interface CampusMapAmapCoordinateRequest {
  key: string;
  position: CampusMapWgs84Position;
}

interface CampusMapAmapCoordinateResolveOptions {
  signal?: AbortSignal;
  retryFailed?: boolean;
}

type CoordinateCompletion =
  | { status: "resolved"; position: CampusMapAmapPosition }
  | { status: "failed" }
  | { status: "cancelled" };

interface CoordinateWork {
  cacheKey: string;
  position: CampusMapWgs84Position;
  activeConsumers: number;
  state: "queued" | "running" | "finished";
  promise: Promise<void>;
  settle(): void;
}

function coordinateCacheKey(position: CampusMapWgs84Position) {
  return `${position[0]},${position[1]}`;
}

/**
 * Resolves only coordinates that cannot use the measured campus projection.
 * One map session owns one resolver, one provider worker, and its result cache.
 */
export class CampusMapAmapCoordinateResolver {
  /** A null value remembers a failed conversion for this map session. */
  private readonly cache = new Map<string, CampusMapAmapPosition | null>();
  private readonly workByCoordinate = new Map<string, CoordinateWork>();
  private queue: CoordinateWork[] = [];
  private workerActive = false;

  constructor(private readonly converter: CampusMapAmapCoordinateConverter) {}

  readCached(requests: readonly CampusMapAmapCoordinateRequest[]) {
    const positions: Record<string, CampusMapAmapPosition> = {};
    for (const request of requests) {
      const cached = this.cache.get(coordinateCacheKey(request.position));
      if (cached) positions[request.key] = cached;
    }
    return positions;
  }

  async resolve(
    requests: readonly CampusMapAmapCoordinateRequest[],
    options: CampusMapAmapCoordinateResolveOptions = {},
  ) {
    if (requests.length === 0 || options.signal?.aborted) {
      return this.readCached(requests);
    }

    const uniqueCoordinates = new Map<string, CampusMapWgs84Position>();
    for (const request of requests) {
      uniqueCoordinates.set(
        coordinateCacheKey(request.position),
        request.position,
      );
    }
    if (options.retryFailed) {
      for (const cacheKey of uniqueCoordinates.keys()) {
        if (this.cache.get(cacheKey) === null) this.cache.delete(cacheKey);
      }
    }

    const work: CoordinateWork[] = [];
    for (const [cacheKey, position] of uniqueCoordinates) {
      if (this.cache.has(cacheKey)) continue;
      const item =
        this.workByCoordinate.get(cacheKey) ?? this.enqueue(cacheKey, position);
      item.activeConsumers += 1;
      work.push(item);
    }
    if (work.length === 0) return this.readCached(requests);
    this.scheduleWorker();

    let removeAbortListener: (() => void) | undefined;
    let released = false;
    const releaseDemand = () => {
      if (released) return;
      released = true;
      for (const item of work) this.releaseConsumer(item);
    };
    const abort = options.signal
      ? new Promise<void>((resolve) => {
          if (options.signal!.aborted) {
            releaseDemand();
            resolve();
            return;
          }
          const handleAbort = () => {
            releaseDemand();
            resolve();
          };
          options.signal!.addEventListener("abort", handleAbort, {
            once: true,
          });
          removeAbortListener = () =>
            options.signal!.removeEventListener("abort", handleAbort);
        })
      : null;

    try {
      await Promise.all(
        [...work].map((item) =>
          abort ? Promise.race([item.promise, abort]) : item.promise,
        ),
      );
    } finally {
      removeAbortListener?.();
      releaseDemand();
    }

    return this.readCached(requests);
  }

  private enqueue(cacheKey: string, position: CampusMapWgs84Position) {
    let settle!: () => void;
    const promise = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const work: CoordinateWork = {
      cacheKey,
      position,
      activeConsumers: 0,
      state: "queued",
      promise,
      settle,
    };
    this.workByCoordinate.set(cacheKey, work);
    this.queue.push(work);
    return work;
  }

  private releaseConsumer(work: CoordinateWork) {
    work.activeConsumers = Math.max(0, work.activeConsumers - 1);
    if (work.state === "queued" && work.activeConsumers === 0) {
      this.finishWork(work, { status: "cancelled" });
    }
  }

  private scheduleWorker() {
    if (this.workerActive) return;
    this.workerActive = true;
    queueMicrotask(() => {
      void this.runWorker();
    });
  }

  private async runWorker() {
    try {
      while (true) {
        const batch = this.takeNextBatch();
        if (batch.length === 0) return;
        const positions = await this.convertBatch(batch);
        for (const [index, work] of batch.entries()) {
          this.finishWork(
            work,
            positions
              ? { status: "resolved", position: positions[index]! }
              : { status: "failed" },
          );
        }
      }
    } finally {
      this.workerActive = false;
      if (this.queue.some((work) => work.state === "queued")) {
        this.scheduleWorker();
      }
    }
  }

  private takeNextBatch() {
    let first: CoordinateWork | undefined;
    while (!first && this.queue.length > 0) {
      const candidate = this.queue.shift()!;
      if (candidate.state !== "queued") continue;
      if (candidate.activeConsumers === 0) {
        this.finishWork(candidate, { status: "cancelled" });
        continue;
      }
      first = candidate;
    }
    if (!first) return [];

    const batch = [first];
    const remaining: CoordinateWork[] = [];
    for (const candidate of this.queue) {
      if (candidate.state !== "queued") continue;
      if (candidate.activeConsumers === 0) {
        this.finishWork(candidate, { status: "cancelled" });
      } else if (batch.length < AMAP_CONVERSION_BATCH_SIZE) {
        batch.push(candidate);
      } else {
        remaining.push(candidate);
      }
    }
    this.queue = remaining;
    for (const work of batch) work.state = "running";
    return batch;
  }

  private finishWork(work: CoordinateWork, outcome: CoordinateCompletion) {
    if (work.state === "finished") return;
    work.state = "finished";
    if (outcome.status === "resolved") {
      this.cache.set(work.cacheKey, outcome.position);
    } else if (outcome.status === "failed" && work.activeConsumers > 0) {
      this.cache.set(work.cacheKey, null);
    }
    if (this.workByCoordinate.get(work.cacheKey) === work) {
      this.workByCoordinate.delete(work.cacheKey);
    }
    work.settle();
  }

  private convertBatch(
    batch: readonly CoordinateWork[],
  ): Promise<readonly CampusMapAmapPosition[] | null> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (positions: readonly CampusMapAmapPosition[] | null) => {
        if (settled) return;
        settled = true;
        globalThis.clearTimeout(timeout);
        resolve(positions);
      };
      const timeout = globalThis.setTimeout(
        () => finish(null),
        AMAP_CONVERSION_TIMEOUT_MS,
      );

      try {
        this.converter.convertFrom(
          batch.map(({ position }) =>
            asWgs84Position([position[0], position[1]]),
          ),
          "gps",
          (status, result) => {
            if (status !== "complete") {
              finish(null);
              return;
            }
            if (
              result.info?.toLowerCase() !== "ok" ||
              result.locations?.length !== batch.length
            ) {
              finish(null);
              return;
            }
            try {
              finish(
                result.locations.map(({ lng, lat }) =>
                  asAmapPosition([lng, lat]),
                ),
              );
            } catch {
              finish(null);
            }
          },
        );
      } catch {
        finish(null);
      }
    });
  }
}
