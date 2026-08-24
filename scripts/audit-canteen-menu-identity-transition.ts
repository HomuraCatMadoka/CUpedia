import { db } from "../src/db";
import { canteenMenuSources } from "../src/db/schema";
import { fetchMenuFromProvider } from "../src/lib/canteen-menu-source-adapters";
import { auditMenuIdentityTransition } from "../src/lib/canteen-menu-sync-store";
import { readMenuSyncDatabaseNow } from "../src/lib/canteen-menu-sync-clock";
import { menuObservationContextAt } from "../src/lib/canteen-menu-sync-window";
import { eq } from "drizzle-orm";

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1]?.trim();
  if (!value) {
    throw new Error(
      "Usage: pnpm canteen:identity-transition:audit -- --source-id <uuid>",
    );
  }
  return value;
}

async function main() {
  const sourceId = requiredArgument("--source-id");
  const source = await db.query.canteenMenuSources.findFirst({
    where: eq(canteenMenuSources.id, sourceId),
  });
  if (!source) throw new Error("MENU_SOURCE_NOT_FOUND");

  const fetched = await fetchMenuFromProvider(
    source,
    menuObservationContextAt(await readMenuSyncDatabaseNow(db)),
  );
  const input = { ...fetched, takeOverLegacyItems: false };
  const artifact = await auditMenuIdentityTransition(source, input);

  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "UNKNOWN_ERROR");
  process.exitCode = 1;
});
