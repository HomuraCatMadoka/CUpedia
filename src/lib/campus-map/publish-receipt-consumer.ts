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
  | { status: "identity-mismatch" }
  | { status: "authentication-required" }
  | { status: "unavailable" };

export type CampusMapPublishActorIdentity =
  | { status: "authenticated"; actorId: string }
  | { status: "authentication-required" }
  | { status: "unavailable" };

export type CampusMapPublishTransportResult =
  | CampusMapPublishResult
  | { status: "identity-mismatch" };

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
        | "superseded"
        | "receipt-lock-unavailable"
        | "identity-mismatch"
        | "identity-unavailable"
        | "receipt-state-unavailable";
      receipt?: CampusMapPublishedReceipt;
    };

interface CampusMapPublishReceiptConsumerDependencies {
  identifyActor(): Promise<CampusMapPublishActorIdentity>;
  readActorBinding(identity: string): string | null;
  bindActor(identity: string, actorId: string): boolean;
  reconcile(identity: {
    idempotencyKey: string;
    actorId: string;
  }): Promise<CampusMapPublishReconciliation>;
  retry(
    command: CampusMapPublishCommand,
    actorId: string,
  ): Promise<CampusMapPublishTransportResult>;
  refresh(receipt: {
    placeId: string;
  }): Promise<{ status: "applied" | "failed" | "superseded" }>;
  applyProjectionAndOpen(input: { placeId: string; intentToken: number }): {
    status: "applied" | "missing-target" | "superseded";
  };
  isCanonicalPlaceOpen(placeId: string): boolean;
  readConsumed(identity: string): CampusMapPublishedReceipt | null;
  markConsumed(identity: string, receipt: CampusMapPublishedReceipt): boolean;
  withLock<T>(identity: string, work: () => Promise<T>): Promise<T>;
  timeoutMs: number;
}

const fallbackConsumedReceipts = new Map<string, CampusMapPublishedReceipt>();
const CONSUMED_PREFIX = "cupedia:campus-map:publish-receipt:v1:";
const ACTOR_PREFIX = "cupedia:campus-map:publish-actor:v1:";

export function readBrowserCampusMapPublishActor(
  identity: string,
): string | null {
  try {
    const actorId = window.localStorage.getItem(`${ACTOR_PREFIX}${identity}`);
    return actorId && actorId === actorId.trim() ? actorId : null;
  } catch {
    return null;
  }
}

export function bindBrowserCampusMapPublishActor(
  identity: string,
  actorId: string,
): boolean {
  try {
    window.localStorage.setItem(`${ACTOR_PREFIX}${identity}`, actorId);
    return true;
  } catch {
    return false;
  }
}

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
  try {
    window.localStorage.setItem(
      `${CONSUMED_PREFIX}${identity}`,
      JSON.stringify(receipt),
    );
    fallbackConsumedReceipts.set(identity, receipt);
    return true;
  } catch {
    return false;
  }
}

export async function withBrowserCampusMapReceiptLock<T>(
  identity: string,
  work: () => Promise<T>,
): Promise<T> {
  if (!navigator.locks) {
    throw new Error("Campus Map cross-tab receipt lock is unavailable");
  }
  try {
    return await navigator.locks.request(
      `campus-map-publish:${identity}`,
      work,
    );
  } catch {
    throw new Error("Campus Map cross-tab receipt lock is unavailable");
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
    transport?: (actorId: string) => Promise<CampusMapPublishTransportResult>;
    onIdentityVerified?: () => void;
  }): Promise<CampusMapPublishReceiptOutcome> {
    const actorIdentity = await this.bounded(this.dependencies.identifyActor());
    if (
      actorIdentity.status === "unavailable" ||
      actorIdentity.value.status === "unavailable"
    ) {
      return { status: "recoverable", reason: "identity-unavailable" };
    }
    if (actorIdentity.value.status === "authentication-required") {
      return {
        status: "publish-result",
        result: {
          status: "authentication-required",
          code: "authentication-required",
        },
      };
    }
    const identity = input.command.idempotencyKey;
    const actorBinding = await this.ensureActorBinding(
      identity,
      actorIdentity.value.actorId,
      Boolean(input.transport || input.receipt),
    );
    if (actorBinding) return actorBinding;
    input.onIdentityVerified?.();

    let receipt = input.receipt;
    if (!receipt && input.transport) {
      const transport = await this.bounded(
        input.transport(actorIdentity.value.actorId),
      );
      if (transport.status === "settled") {
        if (transport.value.status === "identity-mismatch") {
          return { status: "recoverable", reason: "identity-mismatch" };
        }
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
          actorId: actorIdentity.value.actorId,
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
      if (reconciliation.value.status === "identity-mismatch") {
        return { status: "recoverable", reason: "identity-mismatch" };
      }
      if (reconciliation.value.status === "committed") {
        receipt = reconciliation.value.receipt;
      } else {
        const retry = await this.bounded(
          this.dependencies.retry(input.command, actorIdentity.value.actorId),
        );
        if (retry.status === "unavailable") {
          return {
            status: "recoverable",
            reason: "reconciliation-unavailable",
          };
        }
        if (retry.value.status === "identity-mismatch") {
          return { status: "recoverable", reason: "identity-mismatch" };
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

  private async ensureActorBinding(
    identity: string,
    actorId: string,
    canCreate: boolean,
  ): Promise<Extract<
    CampusMapPublishReceiptOutcome,
    { status: "recoverable" }
  > | null> {
    try {
      return await this.dependencies.withLock(identity, async () => {
        const boundActor = this.dependencies.readActorBinding(identity);
        if (boundActor && boundActor !== actorId) {
          return { status: "recoverable", reason: "identity-mismatch" };
        }
        if (boundActor) return null;
        if (!canCreate) {
          return { status: "recoverable", reason: "identity-unavailable" };
        }
        return this.dependencies.bindActor(identity, actorId)
          ? null
          : {
              status: "recoverable",
              reason: "receipt-state-unavailable",
            };
      });
    } catch {
      return { status: "recoverable", reason: "receipt-lock-unavailable" };
    }
  }

  private async consumeReceipt(
    identity: string,
    intentToken: number,
    receipt: CampusMapPublishedReceipt,
  ): Promise<CampusMapPublishReceiptOutcome> {
    try {
      return await this.dependencies.withLock(identity, async () => {
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
        if (!this.dependencies.markConsumed(identity, receipt)) {
          return {
            status: "recoverable",
            reason: "receipt-state-unavailable",
            receipt,
          };
        }
        const applied = await this.refreshAndOpen(
          receipt,
          placeId,
          intentToken,
        );
        if (applied.status !== "applied") return applied;
        return { status: "applied", receipt };
      });
    } catch {
      return {
        status: "recoverable",
        reason: "receipt-lock-unavailable",
        receipt,
      };
    }
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
