import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adminAuditLogs } from "@/db/schema";
import {
  ADMIN_AUDIT_LOG_LIST_LIMIT,
  DISH_COMMENT_DELETE_AUDIT_ACTION,
  type AdminAuditLog,
  type DishCommentDeleteAuditDetails,
} from "@/lib/admin-audit-types";

export async function listRecentDishCommentAuditLogs(
  limit = ADMIN_AUDIT_LOG_LIST_LIMIT,
): Promise<AdminAuditLog[]> {
  const rows = await db
    .select()
    .from(adminAuditLogs)
    .where(eq(adminAuditLogs.action, DISH_COMMENT_DELETE_AUDIT_ACTION))
    .orderBy(desc(adminAuditLogs.createdAt), desc(adminAuditLogs.id))
    .limit(limit);

  return rows.map((row) => ({
    ...row,
    action: DISH_COMMENT_DELETE_AUDIT_ACTION,
    targetType: "canteen_dish_comment",
    details: row.details as DishCommentDeleteAuditDetails,
  }));
}
