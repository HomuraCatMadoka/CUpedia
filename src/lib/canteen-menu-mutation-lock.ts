import { db } from "@/db";
import { canteenMenuSources, canteens } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Serialize every database-backed menu mutation for one canteen.
 *
 * Locking only existing menu-item rows cannot cover inserts. All admin and
 * synchronization write paths must acquire this parent-row lock before reading
 * or changing the menu projection.
 */
export async function lockCanteenMenuMutation(
  executor: Pick<typeof db, "select">,
  canteenId: string,
): Promise<void> {
  const [canteen] = await executor
    .select({ id: canteens.id })
    .from(canteens)
    .where(eq(canteens.id, canteenId))
    .for("update", { of: canteens });
  if (!canteen) throw new Error("CANTEEN_NOT_FOUND");
}

/** Lock the canteen parent before its source row to keep one global lock order. */
export async function lockCanteenMenuMutationForSource(
  executor: Pick<typeof db, "select">,
  sourceId: string,
): Promise<string | null> {
  const [canteen] = await executor
    .select({ id: canteens.id })
    .from(canteenMenuSources)
    .innerJoin(canteens, eq(canteens.id, canteenMenuSources.canteenId))
    .where(eq(canteenMenuSources.id, sourceId))
    .for("update", { of: canteens });
  return canteen?.id ?? null;
}
