import { notFound } from "next/navigation";
import { getCanteens } from "@/lib/canteen-actions";
import { isCanteenMockMode } from "@/lib/canteen-mock";
import { CanteenAdminPanel } from "@/components/admin/canteen-admin-panel";

function assertPreviewAvailable() {
  if (!isCanteenMockMode() || process.env.NODE_ENV !== "development") {
    notFound();
  }
}

export default async function CanteenManagePreviewPage() {
  assertPreviewAvailable();
  const canteens = await getCanteens();
  return <CanteenAdminPanel canteens={canteens} previewMode />;
}
