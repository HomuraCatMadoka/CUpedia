import { notFound } from "next/navigation";
import { getCanteenById, getCanteenMenuItems } from "@/lib/canteen-actions";
import { isCanteenMockMode } from "@/lib/canteen-mock";
import { CanteenMenuAdmin } from "@/components/admin/canteen-menu-admin";

function assertPreviewAvailable() {
  if (!isCanteenMockMode() || process.env.NODE_ENV !== "development") {
    notFound();
  }
}

export default async function CanteenManageMenuPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  assertPreviewAvailable();
  const { id } = await params;
  const canteen = await getCanteenById(id);
  if (!canteen) notFound();
  const items = await getCanteenMenuItems(id);
  return <CanteenMenuAdmin canteen={canteen} items={items} previewMode />;
}
