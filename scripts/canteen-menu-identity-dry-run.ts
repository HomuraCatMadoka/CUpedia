import { db } from "@/db";
import { readCanonicalIdentityDryRunReport } from "@/lib/canteen-menu-identity-dry-run-store";
import { sql } from "drizzle-orm";

async function main(): Promise<void> {
  const report = await db.transaction(async (tx) => {
    await tx.execute(sql`set transaction read only`);
    return readCanonicalIdentityDryRunReport(tx, new Date());
  });
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
