import { describe, expect, it, vi } from "vitest";

import {
  CampusMapPublishReceiptConsumer,
  type CampusMapPublishedReceipt,
  type CampusMapPublishReceiptState,
} from "@/lib/campus-map/publish-receipt-consumer";
import type { CampusMapPublishCommand } from "@/lib/campus-map/publish-contract";

const command = {
  kind: "single",
  idempotencyKey: "10000000-0000-4000-8000-000000000001",
  comment: "新增地点：饮水机（饮水点）",
  sourceSummary: "来源：地图提交",
  reviewRequested: false,
  client: { name: "CUpedia Campus Map", version: "1" },
  warningAcknowledgements: [],
  changes: [],
} satisfies CampusMapPublishCommand;

const receipt: CampusMapPublishedReceipt = {
  status: "published",
  changesetId: "20000000-0000-4000-8000-000000000001",
  changes: [
    {
      placeId: "30000000-0000-4000-8000-000000000001",
      revisionId: "40000000-0000-4000-8000-000000000001",
    },
  ],
  warnings: [],
  suggestions: [],
};

function harness(overrides: Record<string, unknown> = {}) {
  const receiptStates = new Map<string, CampusMapPublishReceiptState>();
  const actorBindings = new Map<string, string>();
  actorBindings.set(
    command.idempotencyKey,
    "50000000-0000-4000-8000-000000000001",
  );
  let canonicalPlaceId: string | null = null;
  const dependencies = {
    identifyActor: vi.fn(
      async () =>
        ({
          status: "authenticated",
          actorId: "50000000-0000-4000-8000-000000000001",
        }) as const,
    ),
    readActorBinding: vi.fn(
      (identity: string) => actorBindings.get(identity) ?? null,
    ),
    bindActor: vi.fn((identity: string, actorId: string) => {
      actorBindings.set(identity, actorId);
      return true;
    }),
    reconcile: vi.fn(async () => ({ status: "committed", receipt }) as const),
    retry: vi.fn(async () => receipt),
    refresh: vi.fn(async () => ({ status: "applied" }) as const),
    applyProjectionAndOpen: vi.fn(({ placeId }: { placeId: string }) => {
      canonicalPlaceId = placeId;
      return { status: "applied" } as const;
    }),
    isCanonicalPlaceOpen: vi.fn(
      (placeId: string) => canonicalPlaceId === placeId,
    ),
    readReceiptState: vi.fn(
      (identity: string) => receiptStates.get(identity) ?? null,
    ),
    writeReceiptState: vi.fn(
      (identity: string, value: CampusMapPublishReceiptState) => {
        receiptStates.set(identity, value);
        return true;
      },
    ),
    withLock: async <T>(_identity: string, work: () => Promise<T>) => work(),
    timeoutMs: 10,
    ...overrides,
  };
  return {
    consumer: new CampusMapPublishReceiptConsumer(dependencies),
    dependencies,
  };
}

describe("Campus Map publish receipt recovery/consumer (#766)", () => {
  it("refreshes projection before atomically opening the canonical Place once", async () => {
    const order: string[] = [];
    const { consumer } = harness({
      refresh: vi.fn(async () => {
        order.push("refresh");
        return { status: "applied" } as const;
      }),
      applyProjectionAndOpen: vi.fn(() => {
        order.push("handoff");
        return { status: "applied" } as const;
      }),
    });

    await expect(
      consumer.consume({ command, intentToken: 7, receipt }),
    ).resolves.toMatchObject({ status: "applied", receipt });
    await expect(
      consumer.consume({ command, intentToken: 7, receipt }),
    ).resolves.toMatchObject({ status: "already-consumed", receipt });
    expect(order).toEqual(["refresh", "handoff"]);
  });

  it("recovers a committed receipt with the original idempotency key", async () => {
    const { consumer, dependencies } = harness();

    await expect(
      consumer.consume({ command, intentToken: 3 }),
    ).resolves.toMatchObject({ status: "applied", receipt });
    expect(dependencies.reconcile).toHaveBeenCalledWith({
      idempotencyKey: command.idempotencyKey,
      actorId: "50000000-0000-4000-8000-000000000001",
    });
    expect(dependencies.retry).not.toHaveBeenCalled();
  });

  it("retries the original command only after reconciliation says it was not committed", async () => {
    const { consumer, dependencies } = harness({
      reconcile: vi.fn(async () => ({ status: "not-committed" }) as const),
    });

    await expect(
      consumer.consume({ command, intentToken: 3 }),
    ).resolves.toMatchObject({ status: "applied", receipt });
    expect(dependencies.retry).toHaveBeenCalledOnce();
    expect(dependencies.retry).toHaveBeenCalledWith(
      command,
      "50000000-0000-4000-8000-000000000001",
    );
  });

  it("fails closed before reconciliation when the current actor differs from the bound publisher", async () => {
    const { consumer, dependencies } = harness({
      identifyActor: vi.fn(
        async () =>
          ({
            status: "authenticated",
            actorId: "50000000-0000-4000-8000-000000000002",
          }) as const,
      ),
      readActorBinding: vi.fn(() => "50000000-0000-4000-8000-000000000001"),
    });

    await expect(
      consumer.consume({ command, intentToken: 3 }),
    ).resolves.toEqual({
      status: "recoverable",
      reason: "identity-mismatch",
    });
    expect(dependencies.reconcile).not.toHaveBeenCalled();
    expect(dependencies.retry).not.toHaveBeenCalled();
    expect(dependencies.refresh).not.toHaveBeenCalled();
  });

  it("binds the current actor before starting the initial publish transport", async () => {
    let boundActor: string | null = null;
    const transport = vi.fn(async (actorId: string) => {
      expect(actorId).toBe("50000000-0000-4000-8000-000000000001");
      expect(boundActor).toBe("50000000-0000-4000-8000-000000000001");
      return receipt;
    });
    const { consumer } = harness({
      readActorBinding: vi.fn(() => null),
      bindActor: vi.fn((_identity: string, actorId: string) => {
        boundActor = actorId;
        return true;
      }),
    });

    await expect(
      consumer.consume({ command, intentToken: 3, transport }),
    ).resolves.toMatchObject({ status: "applied", receipt });
    expect(transport).toHaveBeenCalledOnce();
  });

  it("performs the first actor binding inside the cross-tab receipt lock", async () => {
    let insideLock = false;
    const { consumer } = harness({
      readActorBinding: vi.fn(() => {
        expect(insideLock).toBe(true);
        return null;
      }),
      bindActor: vi.fn(() => {
        expect(insideLock).toBe(true);
        return true;
      }),
      withLock: async <T>(_identity: string, work: () => Promise<T>) => {
        insideLock = true;
        try {
          return await work();
        } finally {
          insideLock = false;
        }
      },
    });

    await expect(
      consumer.consume({ command, intentToken: 3, receipt }),
    ).resolves.toMatchObject({ status: "applied", receipt });
  });

  it("does not reconcile or retry a remount whose actor binding is missing", async () => {
    const { consumer, dependencies } = harness({
      readActorBinding: vi.fn(() => null),
    });

    await expect(
      consumer.consume({ command, intentToken: 3 }),
    ).resolves.toEqual({
      status: "recoverable",
      reason: "identity-unavailable",
    });
    expect(dependencies.reconcile).not.toHaveBeenCalled();
    expect(dependencies.retry).not.toHaveBeenCalled();
  });

  it("fails closed if the server detects an actor switch during reconciliation", async () => {
    const { consumer, dependencies } = harness({
      reconcile: vi.fn(async () => ({ status: "identity-mismatch" }) as const),
    });

    await expect(
      consumer.consume({ command, intentToken: 3 }),
    ).resolves.toEqual({
      status: "recoverable",
      reason: "identity-mismatch",
    });
    expect(dependencies.retry).not.toHaveBeenCalled();
  });

  it.each([
    ["failed", "projection-failed"],
    ["superseded", "projection-superseded"],
  ] as const)(
    "returns a typed recoverable outcome for %s refresh",
    async (status, reason) => {
      const { consumer, dependencies } = harness({
        refresh: vi.fn(async () => ({ status }) as const),
      });

      await expect(
        consumer.consume({ command, intentToken: 1, receipt }),
      ).resolves.toEqual({ status: "recoverable", reason, receipt });
      expect(dependencies.applyProjectionAndOpen).not.toHaveBeenCalled();
    },
  );

  it("retries a pending receipt after projection refresh recovers", async () => {
    const refresh = vi
      .fn()
      .mockResolvedValueOnce({ status: "failed" } as const)
      .mockResolvedValueOnce({ status: "applied" } as const);
    const { consumer, dependencies } = harness({ refresh });

    await expect(
      consumer.consume({ command, intentToken: 1, receipt }),
    ).resolves.toEqual({
      status: "recoverable",
      reason: "projection-failed",
      receipt,
    });
    await expect(
      consumer.consume({ command, intentToken: 1, receipt }),
    ).resolves.toEqual({ status: "applied", receipt });
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(dependencies.applyProjectionAndOpen).toHaveBeenCalledOnce();
  });

  it.each([
    ["missing-target", "missing-target"],
    ["superseded", "superseded"],
  ] as const)("fails closed when handoff is %s", async (status, reason) => {
    const { consumer } = harness({
      applyProjectionAndOpen: vi.fn(() => ({ status }) as const),
    });

    await expect(
      consumer.consume({ command, intentToken: 11, receipt }),
    ).resolves.toEqual({ status: "recoverable", reason, receipt });
  });

  it("turns a hung transport and hung reconciliation into an unknown recoverable outcome", async () => {
    const never = new Promise<never>(() => {});
    const { consumer } = harness({ reconcile: vi.fn(() => never) });

    await expect(
      consumer.consume({ command, intentToken: 1, transport: () => never }),
    ).resolves.toEqual({
      status: "recoverable",
      reason: "reconciliation-unavailable",
    });
  });

  it("reconciles a rejected transport instead of immediately retrying it", async () => {
    const { consumer, dependencies } = harness();

    await expect(
      consumer.consume({
        command,
        intentToken: 1,
        transport: () => Promise.reject(new Error("response lost")),
      }),
    ).resolves.toMatchObject({ status: "applied", receipt });
    expect(dependencies.reconcile).toHaveBeenCalledOnce();
    expect(dependencies.retry).not.toHaveBeenCalled();
  });

  it("serializes concurrent tab consumers so the receipt handoff runs once", async () => {
    const receiptStates = new Map<string, CampusMapPublishReceiptState>();
    let canonicalPlaceId: string | null = null;
    let queue = Promise.resolve();
    const applyProjectionAndOpen = vi.fn(({ placeId }: { placeId: string }) => {
      canonicalPlaceId = placeId;
      return { status: "applied" as const };
    });
    const dependencies = {
      identifyActor: vi.fn(
        async () =>
          ({
            status: "authenticated",
            actorId: "50000000-0000-4000-8000-000000000001",
          }) as const,
      ),
      readActorBinding: () => "50000000-0000-4000-8000-000000000001",
      bindActor: vi.fn(() => true),
      reconcile: vi.fn(async () => ({ status: "committed", receipt }) as const),
      retry: vi.fn(async () => receipt),
      refresh: vi.fn(async () => ({ status: "applied" }) as const),
      applyProjectionAndOpen,
      isCanonicalPlaceOpen: (placeId: string) => canonicalPlaceId === placeId,
      readReceiptState: (identity: string) =>
        receiptStates.get(identity) ?? null,
      writeReceiptState: (
        identity: string,
        value: CampusMapPublishReceiptState,
      ) => {
        receiptStates.set(identity, value);
        return true;
      },
      withLock: async <T>(_identity: string, work: () => Promise<T>) => {
        const previous = queue;
        let release!: () => void;
        queue = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await work();
        } finally {
          release();
        }
      },
      timeoutMs: 10,
    };
    const first = new CampusMapPublishReceiptConsumer(dependencies);
    const second = new CampusMapPublishReceiptConsumer(dependencies);

    await expect(
      Promise.all([
        first.consume({ command, intentToken: 2, receipt }),
        second.consume({ command, intentToken: 2, receipt }),
      ]),
    ).resolves.toEqual([
      { status: "applied", receipt },
      { status: "already-consumed", receipt },
    ]);
    expect(applyProjectionAndOpen).toHaveBeenCalledOnce();
  });

  it("does not hand off a completed receipt again in an independent tab after navigation", async () => {
    const receiptStates = new Map<string, CampusMapPublishReceiptState>();
    let queue = Promise.resolve();
    const shared = {
      identifyActor: vi.fn(
        async () =>
          ({
            status: "authenticated",
            actorId: "50000000-0000-4000-8000-000000000001",
          }) as const,
      ),
      readActorBinding: () => "50000000-0000-4000-8000-000000000001",
      bindActor: vi.fn(() => true),
      reconcile: vi.fn(async () => ({ status: "committed", receipt }) as const),
      retry: vi.fn(async () => receipt),
      refresh: vi.fn(async () => ({ status: "applied" }) as const),
      readReceiptState: (identity: string) =>
        receiptStates.get(identity) ?? null,
      writeReceiptState: (
        identity: string,
        value: CampusMapPublishReceiptState,
      ) => {
        receiptStates.set(identity, value);
        return true;
      },
      withLock: async <T>(_identity: string, work: () => Promise<T>) => {
        const previous = queue;
        let release!: () => void;
        queue = new Promise<void>((resolve) => {
          release = resolve;
        });
        await previous;
        try {
          return await work();
        } finally {
          release();
        }
      },
      timeoutMs: 10,
    };
    const firstHandoff = vi.fn(() => ({ status: "applied" }) as const);
    const secondHandoff = vi.fn(() => ({ status: "applied" }) as const);
    const first = new CampusMapPublishReceiptConsumer({
      ...shared,
      applyProjectionAndOpen: firstHandoff,
      isCanonicalPlaceOpen: () => false,
    });
    const second = new CampusMapPublishReceiptConsumer({
      ...shared,
      applyProjectionAndOpen: secondHandoff,
      isCanonicalPlaceOpen: () => false,
    });

    await expect(
      first.consume({ command, intentToken: 2, receipt }),
    ).resolves.toEqual({ status: "applied", receipt });
    await expect(
      second.consume({ command, intentToken: 9, receipt }),
    ).resolves.toEqual({ status: "already-consumed", receipt });
    expect(firstHandoff).toHaveBeenCalledOnce();
    expect(secondHandoff).not.toHaveBeenCalled();
  });

  it("does not let an A refresh handoff replace a later B navigation", async () => {
    let resolveRefresh!: () => void;
    let currentIntentToken = 4;
    const writeReceiptState = vi.fn(() => true);
    const { consumer } = harness({
      refresh: vi.fn(
        () =>
          new Promise<{ status: "applied" }>((resolve) => {
            resolveRefresh = () => resolve({ status: "applied" });
          }),
      ),
      applyProjectionAndOpen: vi.fn(
        ({ intentToken }: { intentToken: number }) =>
          intentToken === currentIntentToken
            ? ({ status: "applied" } as const)
            : ({ status: "superseded" } as const),
      ),
      writeReceiptState,
    });
    const pending = consumer.consume({ command, intentToken: 4, receipt });
    await vi.waitFor(() => expect(resolveRefresh).toBeTypeOf("function"));
    currentIntentToken = 5;
    resolveRefresh();

    await expect(pending).resolves.toEqual({
      status: "recoverable",
      reason: "superseded",
      receipt,
    });
    expect(writeReceiptState).toHaveBeenNthCalledWith(
      1,
      command.idempotencyKey,
      { phase: "pending", receipt },
    );
    expect(writeReceiptState).toHaveBeenNthCalledWith(
      2,
      command.idempotencyKey,
      { phase: "handoff-started", receipt },
    );
    expect(writeReceiptState).toHaveBeenNthCalledWith(
      3,
      command.idempotencyKey,
      { phase: "pending", receipt },
    );
  });

  it("fails closed before handoff when the consumed receipt cannot be persisted", async () => {
    const { consumer, dependencies } = harness({
      writeReceiptState: vi.fn(() => false),
    });

    await expect(
      consumer.consume({ command, intentToken: 1, receipt }),
    ).resolves.toEqual({
      status: "recoverable",
      reason: "receipt-state-unavailable",
      receipt,
    });
    expect(dependencies.refresh).not.toHaveBeenCalled();
    expect(dependencies.applyProjectionAndOpen).not.toHaveBeenCalled();
  });

  it("fails closed before handoff when handoff-started state cannot be persisted", async () => {
    const writeReceiptState = vi
      .fn()
      .mockReturnValueOnce(true)
      .mockReturnValueOnce(false);
    const { consumer, dependencies } = harness({ writeReceiptState });

    await expect(
      consumer.consume({ command, intentToken: 1, receipt }),
    ).resolves.toEqual({
      status: "recoverable",
      reason: "receipt-state-unavailable",
      receipt,
    });
    expect(dependencies.refresh).toHaveBeenCalledOnce();
    expect(dependencies.applyProjectionAndOpen).not.toHaveBeenCalled();
  });

  it("resumes a receipt interrupted after handoff-started was persisted", async () => {
    const writeReceiptState = vi.fn(() => true);
    const { consumer, dependencies } = harness({
      readReceiptState: vi.fn(() => ({
        phase: "handoff-started" as const,
        receipt,
      })),
      isCanonicalPlaceOpen: vi.fn(() => false),
      writeReceiptState,
    });

    await expect(
      consumer.consume({ command, intentToken: 4, receipt }),
    ).resolves.toEqual({ status: "applied", receipt });
    expect(dependencies.refresh).toHaveBeenCalledOnce();
    expect(dependencies.applyProjectionAndOpen).toHaveBeenCalledOnce();
    expect(writeReceiptState).toHaveBeenLastCalledWith(command.idempotencyKey, {
      phase: "completed",
      receipt,
    });
  });

  it("completes an interrupted handoff without replay when its Place is already open", async () => {
    const writeReceiptState = vi.fn(() => true);
    const { consumer, dependencies } = harness({
      readReceiptState: vi.fn(() => ({
        phase: "handoff-started" as const,
        receipt,
      })),
      isCanonicalPlaceOpen: vi.fn(() => true),
      writeReceiptState,
    });

    await expect(
      consumer.consume({ command, intentToken: 4, receipt }),
    ).resolves.toEqual({ status: "already-consumed", receipt });
    expect(dependencies.refresh).not.toHaveBeenCalled();
    expect(dependencies.applyProjectionAndOpen).not.toHaveBeenCalled();
    expect(writeReceiptState).toHaveBeenCalledWith(command.idempotencyKey, {
      phase: "completed",
      receipt,
    });
  });

  it("fails closed when the browser cannot provide a cross-tab lock", async () => {
    const { consumer } = harness({
      withLock: async () => {
        throw new Error("locks unavailable");
      },
    });

    await expect(
      consumer.consume({ command, intentToken: 1, receipt }),
    ).resolves.toEqual({
      status: "recoverable",
      reason: "receipt-lock-unavailable",
    });
  });
});
