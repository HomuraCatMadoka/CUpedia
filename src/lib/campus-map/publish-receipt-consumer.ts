import type {
  CampusMapPublishCommand,
  CampusMapPublishResult,
} from "./publish-contract";

export type CampusMapPublishedReceipt = Extract<
  CampusMapPublishResult,
  { status: "published" }
>;

export type CampusMapPublishReconciliation =
  | { status: "committed"; receipt: CampusMapPublishedReceipt }
  | { status: "not-committed" }
  | { status: "authentication-required" }
  | { status: "unavailable" };

export type CampusMapPublishReceiptOutcome =
  | { status: "applied"; receipt: CampusMapPublishedReceipt }
  | { status: "already-consumed"; receipt: CampusMapPublishedReceipt }
  | { status: "publish-result"; result: CampusMapPublishResult }
  | {
      status: "recoverable";
      reason:
        | "reconciliation-unavailable"
        | "projection-failed"
        | "projection-superseded"
        | "missing-target"
        | "superseded";
      receipt?: CampusMapPublishedReceipt;
    };

interface CampusMapPublishReceiptConsumerDependencies {
  reconcile(identity: {
    idempotencyKey: string;
  }): Promise<CampusMapPublishReconciliation>;
  retry(command: CampusMapPublishCommand): Promise<CampusMapPublishResult>;
  refresh(receipt: {
    placeId: string;
  }): Promise<{ status: "applied" | "failed" | "superseded" }>;
  applyProjectionAndOpen(input: { placeId: string; intentToken: number }): {
    status: "applied" | "missing-target" | "superseded";
  };
  isCanonicalPlaceOpen(placeId: string): boolean;
  readConsumed(identity: string): CampusMapPublishedReceipt | null;
  markConsumed(identity: string, receipt: CampusMapPublishedReceipt): void;
  withLock<T>(identity: string, work: () => Promise<T>): Promise<T>;
  timeoutMs: number;
}

const fallbackLocks = new Map<string, Promise<void>>();
const fallbackConsumedReceipts = new Map<string, CampusMapPublishedReceipt>();
const CONSUMED_PREFIX = "cupedia:campus-map:publish-receipt:v1:";

export function readBrowserConsumedCampusMapReceipt(
  identity: string,
): CampusMapPublishedReceipt | null {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(`${CONSUMED_PREFIX}${identity}`) ?? "null",
    ) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("status" in parsed) ||
      parsed.status !== "published" ||
      !("changesetId" in parsed) ||
      typeof parsed.changesetId !== "string" ||
      !("changes" in parsed) ||
      !Array.isArray(parsed.changes)
    ) {
      return fallbackConsumedReceipts.get(identity) ?? null;
    }
    return parsed as CampusMapPublishedReceipt;
  } catch {
    return fallbackConsumedReceipts.get(identity) ?? null;
  }
}

export function markBrowserConsumedCampusMapReceipt(
  identity: string,
  receipt: CampusMapPublishedReceipt,
) {
  fallbackConsumedReceipts.set(identity, receipt);
  try {
    window.localStorage.setItem(
      `${CONSUMED_PREFIX}${identity}`,
      JSON.stringify(receipt),
    );
  } catch {}
}

export async function withBrowserCampusMapReceiptLock<T>(
  identity: string,
  work: () => Promise<T>,
): Promise<T> {
  if (navigator.locks) {
    return navigator.locks.request(`campus-map-publish:${identity}`, work);
  }
  const previous = fallbackLocks.get(identity) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);
  fallbackLocks.set(identity, queued);
  await previous;
  try {
    return await work();
  } finally {
    release();
    if (fallbackLocks.get(identity) === queued) fallbackLocks.delete(identity);
  }
}

type Bounded<T> = { status: "settled"; value: T } | { status: "unavailable" };

/**
 * The single client-side owner for reconciling and consuming a publish receipt.
 * It never guesses that a timed-out request committed: it asks the server using
 * the original idempotency key before it can retry the original command.
 */
export class CampusMapPublishReceiptConsumer {
  constructor(
    private readonly dependencies: CampusMapPublishReceiptConsumerDependencies,
  ) {}

  async consume(input: {
    command: CampusMapPublishCommand;
    intentToken: number;
    receipt?: CampusMapPublishedReceipt;
    transport?: Promise<CampusMapPublishResult>;
  }): Promise<CampusMapPublishReceiptOutcome> {
    let receipt = input.receipt;
    if (!receipt && input.transport) {
      const transport = await this.bounded(input.transport);
      if (transport.status === "settled") {
        if (transport.value.status !== "published") {
          return { status: "publish-result", result: transport.value };
        }
        receipt = transport.value;
      }
    }

    if (!receipt) {
      const reconciliation = await this.bounded(
        this.dependencies.reconcile({
          idempotencyKey: input.command.idempotencyKey,
        }),
      );
      if (
        reconciliation.status === "unavailable" ||
        reconciliation.value.status === "unavailable"
      ) {
        return { status: "recoverable", reason: "reconciliation-unavailable" };
      }
      if (reconciliation.value.status === "authentication-required") {
        return {
          status: "publish-result",
          result: {
            status: "authentication-required",
            code: "authentication-required",
          },
        };
      }
      if (reconciliation.value.status === "committed") {
        receipt = reconciliation.value.receipt;
      } else {
        const retry = await this.bounded(
          this.dependencies.retry(input.command),
        );
        if (retry.status === "unavailable") {
          return {
            status: "recoverable",
            reason: "reconciliation-unavailable",
          };
        }
        if (retry.value.status !== "published") {
          return { status: "publish-result", result: retry.value };
        }
        receipt = retry.value;
      }
    }

    return this.consumeReceipt(
      input.command.idempotencyKey,
      input.intentToken,
      receipt,
    );
  }

  private async consumeReceipt(
    identity: string,
    intentToken: number,
    receipt: CampusMapPublishedReceipt,
  ): Promise<CampusMapPublishReceiptOutcome> {
    return this.dependencies.withLock(identity, async () => {
      const consumed = this.dependencies.readConsumed(identity);
      if (consumed) {
        const consumedPlaceId = consumed.changes[0]?.placeId;
        if (!consumedPlaceId) {
          return {
            status: "recoverable",
            reason: "missing-target",
            receipt: consumed,
          };
        }
        if (this.dependencies.isCanonicalPlaceOpen(consumedPlaceId)) {
          return { status: "already-consumed", receipt: consumed };
        }
        const synchronized = await this.refreshAndOpen(
          consumed,
          consumedPlaceId,
          intentToken,
        );
        return synchronized.status === "applied"
          ? { status: "already-consumed", receipt: consumed }
          : synchronized;
      }

      const placeId = receipt.changes[0]?.placeId;
      if (!placeId) {
        return { status: "recoverable", reason: "missing-target", receipt };
      }
      const applied = await this.refreshAndOpen(receipt, placeId, intentToken);
      if (applied.status !== "applied") return applied;
      this.dependencies.markConsumed(identity, receipt);
      return { status: "applied", receipt };
    });
  }

  private async refreshAndOpen(
    receipt: CampusMapPublishedReceipt,
    placeId: string,
    intentToken: number,
  ): Promise<
    | { status: "applied" }
    | Extract<CampusMapPublishReceiptOutcome, { status: "recoverable" }>
  > {
    const refresh = await this.dependencies.refresh({ placeId });
    if (refresh.status === "failed") {
      return {
        status: "recoverable",
        reason: "projection-failed",
        receipt,
      };
    }
    if (refresh.status === "superseded") {
      return {
        status: "recoverable",
        reason: "projection-superseded",
        receipt,
      };
    }
    const handoff = this.dependencies.applyProjectionAndOpen({
      placeId,
      intentToken,
    });
    if (handoff.status !== "applied") {
      return {
        status: "recoverable",
        reason: handoff.status,
        receipt,
      };
    }
    return { status: "applied" };
  }

  private async bounded<T>(promise: Promise<T>): Promise<Bounded<T>> {
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    try {
      return await Promise.race([
        promise.then(
          (value) => ({ status: "settled", value }) as const,
          () => ({ status: "unavailable" }) as const,
        ),
        new Promise<{ status: "unavailable" }>((resolve) => {
          timeoutId = setTimeout(
            () => resolve({ status: "unavailable" }),
            this.dependencies.timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeoutId !== null) clearTimeout(timeoutId);
    }
  }
}
