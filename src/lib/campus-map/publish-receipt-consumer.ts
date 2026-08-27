import type {
  CampusMapPublishCommand,
  CampusMapPublishResult,
} from "./publish-contract";
import { isCanonicalCampusMapId } from "./scene-semantics";

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

export type CampusMapPublishReceiptState = {
  phase: "pending" | "handoff-started" | "completed";
  receipt: CampusMapPublishedReceipt;
};

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
        | "handoff-failed"
        | "receipt-state-unavailable";
      receipt?: CampusMapPublishedReceipt;
    };

interface CampusMapPublishReceiptConsumerDependencies {
  identifyActor(): Promise<CampusMapPublishActorIdentity>;
  readActorBinding(identity: string): string | null;
  bindActor(identity: string, actorId: string): boolean;
  reconcile(identity: {
    command: CampusMapPublishCommand;
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
  readReceiptState(identity: string): CampusMapPublishReceiptState | null;
  writeReceiptState(
    identity: string,
    state: CampusMapPublishReceiptState,
  ): boolean;
  withLock<T>(identity: string, work: () => Promise<T>): Promise<T>;
  timeoutMs: number;
}

const fallbackReceiptStates = new Map<string, CampusMapPublishReceiptState>();
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isPublishIssue(value: unknown, warning: boolean): boolean {
  if (!isRecord(value) || !isCanonicalCampusMapId(value.code)) return false;
  if (!isRecord(value.anchor)) return false;
  const { changeIndex, placeId, field } = value.anchor;
  if (
    changeIndex !== undefined &&
    (!Number.isInteger(changeIndex) || Number(changeIndex) < 0)
  ) {
    return false;
  }
  if (placeId !== undefined && !isCanonicalCampusMapId(placeId)) return false;
  if (field !== undefined && !isCanonicalCampusMapId(field)) return false;
  return !warning || isCanonicalCampusMapId(value.fingerprint);
}

function isPublishedReceipt(
  value: unknown,
): value is CampusMapPublishedReceipt {
  return Boolean(
    isRecord(value) &&
    value.status === "published" &&
    isCanonicalCampusMapId(value.changesetId) &&
    Array.isArray(value.changes) &&
    value.changes.length > 0 &&
    value.changes.every(
      (change) =>
        isRecord(change) &&
        isCanonicalCampusMapId(change.placeId) &&
        isCanonicalCampusMapId(change.revisionId),
    ) &&
    Array.isArray(value.warnings) &&
    value.warnings.every((warning) => isPublishIssue(warning, true)) &&
    Array.isArray(value.suggestions) &&
    value.suggestions.every((suggestion) => isPublishIssue(suggestion, false)),
  );
}

export function readBrowserCampusMapPublishReceiptState(
  identity: string,
): CampusMapPublishReceiptState | null {
  try {
    const parsed = JSON.parse(
      window.localStorage.getItem(`${CONSUMED_PREFIX}${identity}`) ?? "null",
    ) as unknown;
    if (
      parsed &&
      typeof parsed === "object" &&
      "phase" in parsed &&
      (parsed.phase === "pending" ||
        parsed.phase === "handoff-started" ||
        parsed.phase === "completed") &&
      "receipt" in parsed &&
      isPublishedReceipt(parsed.receipt)
    ) {
      return parsed as CampusMapPublishReceiptState;
    }
    // Records written by the pre-phase implementation were claimed before
    // projection handoff, so they can only be recovered as pending.
    if (isPublishedReceipt(parsed))
      return { phase: "pending", receipt: parsed };
    return fallbackReceiptStates.get(identity) ?? null;
  } catch {
    return fallbackReceiptStates.get(identity) ?? null;
  }
}

export function writeBrowserCampusMapPublishReceiptState(
  identity: string,
  state: CampusMapPublishReceiptState,
) {
  try {
    window.localStorage.setItem(
      `${CONSUMED_PREFIX}${identity}`,
      JSON.stringify(state),
    );
    fallbackReceiptStates.set(identity, state);
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
    if (actorBinding.status === "recoverable") return actorBinding;
    let actorBound = actorBinding.status === "bound";
    if (actorBound) input.onIdentityVerified?.();

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
          command: input.command,
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
        if (!actorBound) {
          const recoveredBinding = await this.ensureActorBinding(
            identity,
            actorIdentity.value.actorId,
            true,
          );
          if (recoveredBinding.status === "recoverable") {
            return recoveredBinding;
          }
          actorBound = true;
          input.onIdentityVerified?.();
        }
        receipt = reconciliation.value.receipt;
      } else {
        if (!actorBound) {
          return { status: "recoverable", reason: "identity-unavailable" };
        }
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
  ): Promise<
    | { status: "bound" | "unbound" }
    | Extract<CampusMapPublishReceiptOutcome, { status: "recoverable" }>
  > {
    try {
      return await this.dependencies.withLock(identity, async () => {
        const boundActor = this.dependencies.readActorBinding(identity);
        if (boundActor && boundActor !== actorId) {
          return { status: "recoverable", reason: "identity-mismatch" };
        }
        if (boundActor) return { status: "bound" } as const;
        if (!canCreate) {
          return { status: "unbound" } as const;
        }
        return this.dependencies.bindActor(identity, actorId)
          ? ({ status: "bound" } as const)
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
        const stored = this.dependencies.readReceiptState(identity);
        if (stored?.phase === "completed") {
          return { status: "already-consumed", receipt: stored.receipt };
        }
        const activeReceipt = stored?.receipt ?? receipt;
        const placeId = activeReceipt.changes[0]?.placeId;
        if (!placeId) {
          return {
            status: "recoverable",
            reason: "missing-target",
            receipt: activeReceipt,
          };
        }
        if (
          !stored &&
          !this.dependencies.writeReceiptState(identity, {
            phase: "pending",
            receipt: activeReceipt,
          })
        ) {
          return {
            status: "recoverable",
            reason: "receipt-state-unavailable",
            receipt: activeReceipt,
          };
        }
        if (this.dependencies.isCanonicalPlaceOpen(placeId)) {
          return this.dependencies.writeReceiptState(identity, {
            phase: "completed",
            receipt: activeReceipt,
          })
            ? { status: "already-consumed", receipt: activeReceipt }
            : {
                status: "recoverable",
                reason: "receipt-state-unavailable",
                receipt: activeReceipt,
              };
        }
        const refreshed = await this.refresh(activeReceipt, placeId);
        if (refreshed.status !== "applied") return refreshed;
        if (
          !this.dependencies.writeReceiptState(identity, {
            phase: "handoff-started",
            receipt: activeReceipt,
          })
        ) {
          return {
            status: "recoverable",
            reason: "receipt-state-unavailable",
            receipt: activeReceipt,
          };
        }
        let handoff: ReturnType<
          CampusMapPublishReceiptConsumerDependencies["applyProjectionAndOpen"]
        >;
        try {
          handoff = this.dependencies.applyProjectionAndOpen({
            placeId,
            intentToken,
          });
        } catch {
          this.dependencies.writeReceiptState(identity, {
            phase: "pending",
            receipt: activeReceipt,
          });
          return {
            status: "recoverable",
            reason: "handoff-failed",
            receipt: activeReceipt,
          };
        }
        if (handoff.status !== "applied") {
          if (
            !this.dependencies.writeReceiptState(identity, {
              phase: "pending",
              receipt: activeReceipt,
            })
          ) {
            return {
              status: "recoverable",
              reason: "receipt-state-unavailable",
              receipt: activeReceipt,
            };
          }
          return {
            status: "recoverable",
            reason: handoff.status,
            receipt: activeReceipt,
          };
        }
        if (
          !this.dependencies.writeReceiptState(identity, {
            phase: "completed",
            receipt: activeReceipt,
          })
        ) {
          return {
            status: "recoverable",
            reason: "receipt-state-unavailable",
            receipt: activeReceipt,
          };
        }
        return { status: "applied", receipt: activeReceipt };
      });
    } catch {
      return {
        status: "recoverable",
        reason: "receipt-lock-unavailable",
        receipt,
      };
    }
  }

  private async refresh(
    receipt: CampusMapPublishedReceipt,
    placeId: string,
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
