import { sql } from "drizzle-orm";
import type { MenuSyncTransaction } from "./canteen-menu-sync-store";

export async function readMenuSyncDatabaseNow(
  tx: Pick<MenuSyncTransaction, "execute">,
): Promise<Date> {
  const result = await tx.execute<{ database_now: string | Date }>(
    sql`select now() as database_now`,
  );
  const databaseNow = new Date(String(result.rows[0]?.database_now));
  if (Number.isNaN(databaseNow.getTime())) {
    throw new Error("DATABASE_NOW_MISSING");
  }
  return databaseNow;
}
