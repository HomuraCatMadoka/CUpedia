import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import {
  canteens,
  canteenMenuItems,
  canteenDishVotes,
} from "@/db/schema";

const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("canteen menu item hard delete cascade", () => {
  let pool: Pool;
  let db: ReturnType<typeof drizzle>;
  let canteenId: string;
  let menuItemId: string;

  beforeAll(async () => {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool);

    const now = new Date();
    const [canteen] = await db
      .insert(canteens)
      .values({
        name: "级联测试食堂",
        location: "test",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: canteens.id });
    canteenId = canteen.id;

    const [item] = await db
      .insert(canteenMenuItems)
      .values({
        canteenId,
        name: "级联测试菜品",
        price: 10,
        mealPeriod: "lunch",
        sortOrder: 0,
        svgKey: "default",
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: canteenMenuItems.id });
    menuItemId = item.id;

    await db.insert(canteenDishVotes).values({
      menuItemId,
      userId: null,
      anonymousSessionId: "00000000-0000-4000-f000-000000000001",
      vote: "like",
    });
  });

  afterAll(async () => {
    if (!pool) return;
    await db.delete(canteens).where(eq(canteens.id, canteenId));
    await pool.end();
  });

  it("deleting a menu item cascades away its vote rows", async () => {
    const votesBefore = await db
      .select()
      .from(canteenDishVotes)
      .where(eq(canteenDishVotes.menuItemId, menuItemId));
    expect(votesBefore).toHaveLength(1);

    await db
      .delete(canteenMenuItems)
      .where(eq(canteenMenuItems.id, menuItemId));

    const votesAfter = await db
      .select()
      .from(canteenDishVotes)
      .where(eq(canteenDishVotes.menuItemId, menuItemId));
    expect(votesAfter).toHaveLength(0);
  });
});
