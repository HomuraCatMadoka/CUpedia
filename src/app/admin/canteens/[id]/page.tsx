import { notFound } from "next/navigation";
import { getCanteenById, getCanteenMenuItems } from "@/lib/canteen-actions";
import { CanteenMenuAdmin } from "@/components/admin/canteen-menu-admin";
import { CanteenTheme } from "@/components/canteen/canteen-theme";

export default async function AdminCanteenMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const canteen = await getCanteenById(id);
  if (!canteen) notFound();
  const items = await getCanteenMenuItems(id);

  return (
    <CanteenTheme>
      <CanteenMenuAdmin canteen={canteen} items={items} />
    </CanteenTheme>
  );
}
