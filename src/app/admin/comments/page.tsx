import { DishCommentAdminPanel } from "@/components/admin/dish-comment-admin-panel";
import { adminListDishComments } from "@/lib/canteen-comment-actions";

export const dynamic = "force-dynamic";

export default async function AdminCommentsPage() {
  const comments = await adminListDishComments();
  return <DishCommentAdminPanel comments={comments} />;
}
