import { and, desc, eq, lte } from "drizzle-orm";

import { db } from "@/db";
import { productUpdates } from "@/db/schema";
import {
  isProductUpdateId,
  type PublicProductUpdate,
} from "@/lib/product-update-types";

function toPublicProductUpdate(
  row: typeof productUpdates.$inferSelect,
): PublicProductUpdate {
  return {
    id: row.id,
    title: row.title,
    summary: row.summary,
    content: row.content,
    type: row.type,
    areas: row.areas,
    publishedAt: row.publishedAt.toISOString(),
  };
}

export async function listPublicProductUpdates(): Promise<
  PublicProductUpdate[]
> {
  const rows = await db
    .select()
    .from(productUpdates)
    .where(lte(productUpdates.publishedAt, new Date()))
    .orderBy(desc(productUpdates.publishedAt), desc(productUpdates.id));
  return rows.map(toPublicProductUpdate);
}

export async function getPublicProductUpdate(
  id: string,
): Promise<PublicProductUpdate | null> {
  if (!isProductUpdateId(id)) return null;
  const [row] = await db
    .select()
    .from(productUpdates)
    .where(
      and(
        eq(productUpdates.id, id),
        lte(productUpdates.publishedAt, new Date()),
      ),
    )
    .limit(1);
  return row ? toPublicProductUpdate(row) : null;
}
