import { describe, expect, it, vi } from "vitest";

import {
  CampusMapPublishReceiptConsumer,
  type CampusMapPublishedReceipt,
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
  const consumed = new Map<string, typeof receipt>();
  let canonicalPlaceId: string | null = null;
  const dependencies = {
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
    readConsumed: vi.fn((identity: string) => consumed.get(identity) ?? null),
    markConsumed: vi.fn((identity: string, value: typeof receipt) => {
      consumed.set(identity, value);
    }),
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
      isCanonicalPlaceOpen: vi.fn(() => true),
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
    expect(dependencies.retry).toHaveBeenCalledWith(command);
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
      consumer.consume({ command, intentToken: 1, transport: never }),
    ).resolves.toEqual({
      status: "recoverable",
      reason: "reconciliation-unavailable",
    });
  });
});
