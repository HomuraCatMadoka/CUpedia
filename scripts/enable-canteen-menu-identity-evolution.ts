import { db } from "@/db";
import { canteenMenuSources, siteSettings } from "@/db/schema";
import { readCanonicalIdentityDryRunReport } from "@/lib/canteen-menu-identity-dry-run-store";
import { assertCanonicalIdentityActivationFingerprint } from "@/lib/canteen-menu-identity-rollout";
import { CANTEEN_MENU_IDENTITY_EVOLUTION_SETTING } from "@/lib/canteen-menu-sync-store";
import { sql } from "drizzle-orm";

function requiredArgument(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1]?.trim();
  if (!value) {
    throw new Error(
      "Usage: pnpm canteen:identity-enable -- --expected-fingerprint <reviewed-sha256> --confirm-enable",
    );
  }
  return value;
}

async function main(): Promise<void> {
  if (!process.argv.includes("--confirm-enable")) {
    throw new Error("IDENTITY_EVOLUTION_ENABLE_CONFIRMATION_REQUIRED");
  }
  const expectedFingerprint = requiredArgument("--expected-fingerprint");
  const result = await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction isolation level serializable`);
    await tx.execute(
      sql`select ${canteenMenuSources.id} from ${canteenMenuSources} where ${canteenMenuSources.enabled} = true order by ${canteenMenuSources.id} for update`,
    );
    const claimResult = await tx.execute<{ liveClaims: number }>(
      sql`select count(*)::integer as "liveClaims" from ${canteenMenuSources} where ${canteenMenuSources.syncClaimToken} is not null and ${canteenMenuSources.syncClaimExpiresAt} > now()`,
    );
    const [{ liveClaims }] = claimResult.rows;
    if ((liveClaims ?? 0) > 0) throw new Error("MENU_SYNC_IN_PROGRESS");
    const report = await readCanonicalIdentityDryRunReport(tx, new Date());
    assertCanonicalIdentityActivationFingerprint(
      expectedFingerprint,
      report.fingerprint,
    );
    await tx
      .insert(siteSettings)
      .values({
        key: CANTEEN_MENU_IDENTITY_EVOLUTION_SETTING,
        value: "enabled",
      })
      .onConflictDoUpdate({
        target: siteSettings.key,
        set: { value: "enabled" },
      });
    return {
      setting: CANTEEN_MENU_IDENTITY_EVOLUTION_SETTING,
      value: "enabled",
      fingerprint: report.fingerprint,
      mergeGroupCount: report.mergeGroupCount,
      retiredItems: report.totals.retiredItems,
    };
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "UNKNOWN_ERROR");
  process.exitCode = 1;
});
