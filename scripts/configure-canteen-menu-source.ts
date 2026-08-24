import { db } from "../src/db";
import {
  CANTEEN_MENU_SOURCE_PROVIDERS,
  CANTEEN_ORDERING_HANDOFF_PROVIDERS,
  canteenMenuSources,
  canteenOrderingHandoffs,
  canteens,
  type CanteenMenuSourceProvider,
} from "../src/db/schema";
import { parseOrderingHandoffUrl } from "../src/lib/canteen-ordering-handoff";
import { fetchMenuFromProvider } from "../src/lib/canteen-menu-source-adapters";
import { previewMenuSync } from "../src/lib/canteen-menu-sync-store";
import { readMenuSyncDatabaseNow } from "../src/lib/canteen-menu-sync-clock";
import { menuObservationContextAt } from "../src/lib/canteen-menu-sync-window";
import { eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function configArgument(): Record<string, unknown> {
  const value = argument("--config");
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("INVALID_MENU_SOURCE_CONFIG");
  }
  return parsed as Record<string, unknown>;
}

async function main() {
  const requestedCanteenId = argument("--canteen-id");
  const requestedCanteenName = argument("--canteen-name")?.trim();
  const provider = argument("--provider") as
    | CanteenMenuSourceProvider
    | undefined;
  const externalStoreId = argument("--store-id")?.trim();
  const externalOwnerId = argument("--owner-id")?.trim() || null;
  const handoffProvider = argument("--handoff-provider");
  const handoffUrl = argument("--handoff-url");
  const config = configArgument();
  const allowLegacyTakeover = process.argv.includes("--allow-legacy-takeover");
  if (
    (!requestedCanteenId && !requestedCanteenName) ||
    !provider ||
    !CANTEEN_MENU_SOURCE_PROVIDERS.includes(provider) ||
    !externalStoreId ||
    (provider === "qmai" ? !externalOwnerId : externalOwnerId !== null)
  ) {
    throw new Error(
      "Usage: pnpm canteen:menu-source:set -- (--canteen-id <uuid> | --canteen-name <exact name>) --provider <aigens|ichef|pinme|qmai> --store-id <id> [--owner-id <qmai seller id>] [--config <json>] [--allow-legacy-takeover --dry-run] [--handoff-provider <provider>] [--handoff-url <https-url>] [--dry-run]",
    );
  }
  const dryRun = process.argv.includes("--dry-run");
  if (allowLegacyTakeover && !dryRun) {
    throw new Error("LEGACY_TAKEOVER_REQUIRES_ADMIN_PREVIEW_APPLY");
  }
  const canteen = await db.query.canteens.findFirst({
    where: requestedCanteenId
      ? eq(canteens.id, requestedCanteenId)
      : eq(canteens.name, requestedCanteenName!),
    columns: { id: true, name: true },
  });
  if (!canteen) throw new Error("CANTEEN_NOT_FOUND");
  const canteenId = canteen.id;

  if (dryRun) {
    const fetched = await fetchMenuFromProvider(
      { provider, externalOwnerId, externalStoreId, config },
      menuObservationContextAt(await readMenuSyncDatabaseNow(db)),
    );
    const menu = {
      ...fetched,
      takeOverLegacyItems: allowLegacyTakeover,
    };
    const existingSource = await db.query.canteenMenuSources.findFirst({
      where: eq(canteenMenuSources.canteenId, canteenId),
    });
    if (!existingSource) {
      throw new Error("MENU_SOURCE_MUST_BE_CONFIGURED_BEFORE_PREVIEW");
    }
    const preview = await previewMenuSync(existingSource.id, menu);
    const url = handoffUrl ? parseOrderingHandoffUrl(handoffUrl) : null;
    process.stdout.write(
      `${JSON.stringify(
        {
          canteen,
          source: {
            provider,
            externalOwnerId,
            externalStoreId,
            itemCount: menu.items.length,
          },
          sample: menu.items.slice(0, 5),
          snapshot: menu,
          plan: preview.plan,
          handoff:
            handoffProvider && url ? { provider: handoffProvider, url } : null,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const providerValue = handoffProvider as
    | (typeof CANTEEN_ORDERING_HANDOFF_PROVIDERS)[number]
    | undefined;
  if (
    (handoffProvider || handoffUrl) &&
    (!handoffUrl ||
      !providerValue ||
      !CANTEEN_ORDERING_HANDOFF_PROVIDERS.includes(providerValue))
  ) {
    throw new Error("INVALID_ORDERING_HANDOFF");
  }
  const parsedHandoffUrl = handoffUrl
    ? parseOrderingHandoffUrl(handoffUrl)
    : null;
  const { source, handoff } = await db.transaction(async (tx) => {
    const current = await tx.query.canteenMenuSources.findFirst({
      where: eq(canteenMenuSources.canteenId, canteenId),
    });
    if (
      current &&
      (current.provider !== provider ||
        current.externalOwnerId !== externalOwnerId ||
        current.externalStoreId !== externalStoreId)
    ) {
      throw new Error("MENU_SOURCE_REPLACEMENT_REQUIRES_MIGRATION");
    }
    if (current && !isDeepStrictEqual(current.config, config)) {
      throw new Error("MENU_SOURCE_CONFIG_CHANGE_REQUIRES_MIGRATION");
    }
    const [savedSource] = current
      ? await tx
          .update(canteenMenuSources)
          .set({ config, enabled: true, updatedAt: new Date() })
          .where(eq(canteenMenuSources.id, current.id))
          .returning()
      : await tx
          .insert(canteenMenuSources)
          .values({
            canteenId,
            provider,
            externalOwnerId,
            externalStoreId,
            config,
          })
          .returning();
    let savedHandoff = null;
    if (providerValue && parsedHandoffUrl) {
      [savedHandoff] = await tx
        .insert(canteenOrderingHandoffs)
        .values({ canteenId, provider: providerValue, url: parsedHandoffUrl })
        .onConflictDoUpdate({
          target: canteenOrderingHandoffs.canteenId,
          set: {
            provider: providerValue,
            url: parsedHandoffUrl,
            enabled: true,
            updatedAt: new Date(),
          },
        })
        .returning();
    }
    return { source: savedSource, handoff: savedHandoff };
  });
  process.stdout.write(`${JSON.stringify({ source, handoff }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
