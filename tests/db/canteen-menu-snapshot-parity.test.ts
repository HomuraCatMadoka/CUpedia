import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  canteenMenuItems,
  canteenMenuSources,
  canteenMenuSyncRuns,
  canteens,
  type CanteenMenuSourceProvider,
} from "@/db/schema";
import type {
  MenuSnapshotBlockingCode,
  MenuSnapshotEvaluation,
} from "@/lib/canteen-menu-snapshot-evaluator";
import { syncCanteenMenuSource } from "@/lib/canteen-menu-source-sync";
import { expectedMenuSnapshotCompleteness } from "@/lib/canteen-menu-snapshot-completeness";
import {
  applyPreviewedMenuSync,
  previewMenuSync,
} from "@/lib/canteen-menu-sync-store";
import {
  parseMenuSyncJson,
  type MealPeriodAssignment,
  type MenuSnapshotScopeEvidence,
  type MenuSyncInput,
} from "@/lib/canteen-types";

const { fetchMenuFromProvider } = vi.hoisted(() => ({
  fetchMenuFromProvider: vi.fn(),
}));

vi.mock("@/lib/canteen-menu-source-adapters", () => ({
  fetchMenuFromProvider,
}));
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const hasDb = Boolean(process.env.DATABASE_URL);

const AIGENS_SCOPE_EVIDENCE: MenuSnapshotScopeEvidence = {
  provider: "aigens",
  externalStoreId: "parity-store",
  storeName: "Sanitized parity store",
  menuName: "Sanitized parity catalog",
  providerPeriodCodes: ["B", "D", "L"],
  categoryPeriodCodes: ["B", "D", "L"],
  categoryCount: 3,
  groupCount: 3,
};

type SeedItem = {
  id: string;
  externalProductId: string;
  name: string;
  mealPeriods?: MealPeriodAssignment[];
  isAvailable?: boolean;
};

type ParityScenario = {
  name: string;
  provider: CanteenMenuSourceProvider;
  existing: SeedItem[];
  input: MenuSyncInput;
  expectedCode: MenuSnapshotBlockingCode | null;
};

function item(
  externalProductId: string,
  overrides: Partial<SeedItem> = {},
): SeedItem {
  return {
    id: randomUUID(),
    externalProductId,
    name: `菜品 ${externalProductId}`,
    mealPeriods: ["lunch"],
    isAvailable: true,
    ...overrides,
  };
}

function input(
  provider: CanteenMenuSourceProvider,
  items: Array<{
    externalProductId: string;
    name: string;
    mealPeriods?: MealPeriodAssignment[];
  }>,
): MenuSyncInput {
  const parsed = parseMenuSyncJson({
    snapshotCompleteness: expectedMenuSnapshotCompleteness(provider),
    items,
    takeOverLegacyItems: false,
  });
  return provider === "aigens"
    ? { ...parsed, scopeEvidence: AIGENS_SCOPE_EVIDENCE }
    : parsed;
}

const scenarios: ParityScenario[] = [
  {
    name: "exact update",
    provider: "pinme",
    existing: [item("exact", { name: "旧名称" })],
    input: input("pinme", [{ externalProductId: "exact", name: "新名称" }]),
    expectedCode: null,
  },
  {
    name: "reactivation",
    provider: "pinme",
    existing: [item("reactivate", { isAvailable: false })],
    input: input("pinme", [
      { externalProductId: "reactivate", name: "恢复供应菜品" },
    ]),
    expectedCode: null,
  },
  {
    name: "Aigens exact backend identity",
    provider: "aigens",
    existing: [item("42", { name: "旧名称" })],
    input: input("aigens", [{ externalProductId: "42", name: "新名称" }]),
    expectedCode: null,
  },
  {
    name: "missing product",
    provider: "pinme",
    existing: ["a", "b", "c", "d"].map((id) => item(id)),
    input: input(
      "pinme",
      ["a", "b", "c"].map((id) => ({
        externalProductId: id,
        name: `菜品 ${id}`,
      })),
    ),
    expectedCode: null,
  },
  {
    name: "large partial omission",
    provider: "pinme",
    existing: ["drop-a", "drop-b", "drop-c", "drop-d"].map((id) => item(id)),
    input: input(
      "pinme",
      ["drop-a", "drop-b"].map((id) => ({
        externalProductId: id,
        name: `菜品 ${id}`,
      })),
    ),
    expectedCode: null,
  },
  {
    name: "large partial growth",
    provider: "pinme",
    existing: ["old-a", "old-b", "old-c", "old-d"].map((id) => item(id)),
    input: input(
      "pinme",
      ["new-a", "new-b", "new-c", "new-d"].map((id) => ({
        externalProductId: id,
        name: `新菜品 ${id}`,
      })),
    ),
    expectedCode: null,
  },
];

describe.skipIf(!hasDb)("menu snapshot evaluation path parity", () => {
  const canteenId = randomUUID();
  const sourceId = randomUUID();

  async function resetScenario(scenario: ParityScenario): Promise<void> {
    await db.delete(canteens).where(eq(canteens.id, canteenId));
    await db.insert(canteens).values({ id: canteenId, name: "路径一致性食堂" });
    await db.insert(canteenMenuSources).values({
      id: sourceId,
      canteenId,
      provider: scenario.provider,
      externalStoreId: "parity-store",
      enabled: true,
      legacyTakeoverAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    await db.insert(canteenMenuItems).values(
      scenario.existing.map((existing) => ({
        id: existing.id,
        canteenId,
        name: existing.name,
        mealPeriods: existing.mealPeriods,
        menuSourceId: sourceId,
        externalProductId: existing.externalProductId,
        isAvailable: existing.isAvailable,
      })),
    );
  }

  async function menuState(scenario: ParityScenario) {
    const seededIds = new Set(scenario.existing.map(({ id }) => id));
    const rows = await db
      .select({
        id: canteenMenuItems.id,
        externalProductId: canteenMenuItems.externalProductId,
        name: canteenMenuItems.name,
        mealPeriods: canteenMenuItems.mealPeriods,
        isAvailable: canteenMenuItems.isAvailable,
      })
      .from(canteenMenuItems)
      .where(eq(canteenMenuItems.canteenId, canteenId))
      .orderBy(asc(canteenMenuItems.externalProductId));
    return rows.map((row) => ({
      ...row,
      id: seededIds.has(row.id) ? row.id : "<created>",
    }));
  }

  afterEach(async () => {
    fetchMenuFromProvider.mockReset();
    await db.delete(canteens).where(eq(canteens.id, canteenId));
  });

  it.each(scenarios)(
    "keeps preview, scheduled sync, and locked apply in parity for $name",
    async (scenario) => {
      await resetScenario(scenario);
      const preview = await previewMenuSync(sourceId, scenario.input);
      const previewEvaluation: MenuSnapshotEvaluation = {
        canonicalState: preview.canonicalState,
        plan: preview.plan,
        identityObservation: preview.identityObservation,
        blockingReasons: preview.blockingReasons,
        blockingDecision: preview.blockingDecision,
      };
      expect(preview.blockingDecision.code).toBe(scenario.expectedCode);

      fetchMenuFromProvider.mockResolvedValueOnce(scenario.input);
      const scheduledResult = await syncCanteenMenuSource(sourceId);
      const [scheduledRun] = await db
        .select({
          observation: canteenMenuSyncRuns.observation,
          errorCode: canteenMenuSyncRuns.errorCode,
          createdCount: canteenMenuSyncRuns.createdCount,
          updatedCount: canteenMenuSyncRuns.updatedCount,
          deactivatedCount: canteenMenuSyncRuns.deactivatedCount,
        })
        .from(canteenMenuSyncRuns)
        .where(eq(canteenMenuSyncRuns.menuSourceId, sourceId))
        .orderBy(desc(canteenMenuSyncRuns.startedAt))
        .limit(1);
      expect(scheduledRun.observation).toEqual(
        previewEvaluation.identityObservation,
      );
      if (scenario.expectedCode === null) {
        expect(["applied", "unchanged"]).toContain(scheduledResult.status);
        expect(scheduledRun).toMatchObject({
          errorCode: null,
          createdCount: preview.plan.actions.filter(
            (action) => action.action === "create",
          ).length,
          updatedCount: preview.plan.actions.filter((action) =>
            ["update", "reactivate", "claim"].includes(action.action),
          ).length,
          deactivatedCount: preview.plan.actions.filter(
            (action) => action.action === "deactivate",
          ).length,
        });
      } else {
        expect(scheduledResult).toMatchObject({
          status: "blocked",
          code: scenario.expectedCode,
        });
        expect(scheduledRun.errorCode).toBe(
          previewEvaluation.blockingDecision.code,
        );
      }
      const scheduledState = await menuState(scenario);

      await resetScenario(scenario);
      const transactionPreview = await previewMenuSync(
        sourceId,
        scenario.input,
      );
      const { previewToken, ...transactionPreviewEvaluation } =
        transactionPreview;
      expect(transactionPreviewEvaluation).toEqual(previewEvaluation);
      if (scenario.expectedCode === null) {
        await expect(
          applyPreviewedMenuSync(sourceId, scenario.input, previewToken),
        ).resolves.toEqual(previewEvaluation);
      } else {
        await expect(
          applyPreviewedMenuSync(sourceId, scenario.input, previewToken),
        ).rejects.toMatchObject({
          message: scenario.expectedCode,
          evaluation: previewEvaluation,
          blockingDecision: previewEvaluation.blockingDecision,
          observation: previewEvaluation.identityObservation,
        });
      }
      expect(await menuState(scenario)).toEqual(scheduledState);
    },
  );
});
