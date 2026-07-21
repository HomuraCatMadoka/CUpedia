import { DishCommentAdminPanel } from "@/components/admin/dish-comment-admin-panel";
import {
  adminListDishCommentAuditLogs,
  adminListDishComments,
} from "@/lib/canteen-comment-actions";

export const dynamic = "force-dynamic";

export default async function AdminCommentsPage() {
  const [comments, auditLogs] = await Promise.all([
    adminListDishComments(),
    adminListDishCommentAuditLogs(),
  ]);
  return <DishCommentAdminPanel comments={comments} auditLogs={auditLogs} />;
}
