import { db } from "@/db";
import { wikiPages } from "@/db/schema";
import { eq, isNull, desc, sql, count } from "drizzle-orm";

export async function getCategoryCards() {
  const children = db
    .select({ parentId: wikiPages.parentId, cnt: count().as("cnt") })
    .from(wikiPages)
    .where(isNull(wikiPages.deletedAt))
    .groupBy(wikiPages.parentId)
    .as("children");

  // inner join drops top-level pages with no children (childCount === 0)
  return db
    .select({
      id: wikiPages.id,
      slug: wikiPages.slug,
      title: wikiPages.title,
      childCount: sql<number>`${children.cnt}`.as("childCount"),
    })
    .from(wikiPages)
    .innerJoin(children, eq(wikiPages.id, children.parentId))
    .where(
      sql`${wikiPages.parentId} IS NULL AND ${wikiPages.deletedAt} IS NULL`,
    )
    .orderBy(wikiPages.sortOrder);
}

export async function getRecentPages(limit = 8) {
  return db.query.wikiPages.findMany({
    where: isNull(wikiPages.deletedAt),
    orderBy: [desc(wikiPages.updatedAt)],
    limit,
    columns: {
      id: true,
      slug: true,
      title: true,
      updatedAt: true,
      parentId: true,
    },
    with: {
      updatedByUser: { columns: { nickname: true } },
    },
  });
}
