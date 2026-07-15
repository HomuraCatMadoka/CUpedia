import { CanteenCommentAdminPanel } from "@/components/admin/canteen-comment-admin-panel";
import { adminListDishComments } from "@/lib/canteen-comment-actions";

export const dynamic = "force-dynamic";

export default async function AdminCanteenCommentsPage() {
  const comments = await adminListDishComments();
  return <CanteenCommentAdminPanel comments={comments} />;
}
