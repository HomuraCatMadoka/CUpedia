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
import { eq } from "drizzle-orm";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const requestedCanteenId = argument("--canteen-id");
  const requestedCanteenName = argument("--canteen-name")?.trim();
  const provider = argument("--provider") as
    | CanteenMenuSourceProvider
    | undefined;
  const externalStoreId = argument("--store-id")?.trim();
  const handoffProvider = argument("--handoff-provider");
  const handoffUrl = argument("--handoff-url");
  if (
    (!requestedCanteenId && !requestedCanteenName) ||
    !provider ||
    !CANTEEN_MENU_SOURCE_PROVIDERS.includes(provider) ||
    !externalStoreId
  ) {
    throw new Error(
      "Usage: pnpm canteen:menu-source:set -- (--canteen-id <uuid> | --canteen-name <exact name>) --provider <aigens|ichef|pinme|qmai> --store-id <id> [--handoff-provider <provider>] [--handoff-url <https-url>] [--dry-run]",
    );
  }
  const canteen = await db.query.canteens.findFirst({
    where: requestedCanteenId
      ? eq(canteens.id, requestedCanteenId)
      : eq(canteens.name, requestedCanteenName!),
    columns: { id: true, name: true },
  });
  if (!canteen) throw new Error("CANTEEN_NOT_FOUND");
  const canteenId = canteen.id;

  if (process.argv.includes("--dry-run")) {
    const menu = await fetchMenuFromProvider({
      provider,
      externalStoreId,
      config: {},
    });
    const url = handoffUrl ? parseOrderingHandoffUrl(handoffUrl) : null;
    process.stdout.write(
      `${JSON.stringify(
        {
          canteen,
          source: { provider, externalStoreId, itemCount: menu.items.length },
          sample: menu.items.slice(0, 5),
          handoff:
            handoffProvider && url ? { provider: handoffProvider, url } : null,
        },
        null,
        2,
      )}\n`,
    );
    return;
  }

  const [source] = await db
    .insert(canteenMenuSources)
    .values({ canteenId, provider, externalStoreId })
    .onConflictDoUpdate({
      target: canteenMenuSources.canteenId,
      set: {
        provider,
        externalStoreId,
        enabled: true,
        lastSnapshotHash: null,
        lastError: null,
        updatedAt: new Date(),
      },
    })
    .returning();
  let handoff = null;
  if (handoffProvider || handoffUrl) {
    if (
      !handoffUrl ||
      !handoffProvider ||
      !CANTEEN_ORDERING_HANDOFF_PROVIDERS.includes(
        handoffProvider as (typeof CANTEEN_ORDERING_HANDOFF_PROVIDERS)[number],
      )
    ) {
      throw new Error("INVALID_ORDERING_HANDOFF");
    }
    const providerValue =
      handoffProvider as (typeof CANTEEN_ORDERING_HANDOFF_PROVIDERS)[number];
    const url = parseOrderingHandoffUrl(handoffUrl);
    [handoff] = await db
      .insert(canteenOrderingHandoffs)
      .values({ canteenId, provider: providerValue, url })
      .onConflictDoUpdate({
        target: canteenOrderingHandoffs.canteenId,
        set: {
          provider: providerValue,
          url,
          enabled: true,
          updatedAt: new Date(),
        },
      })
      .returning();
  }
  process.stdout.write(`${JSON.stringify({ source, handoff }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
