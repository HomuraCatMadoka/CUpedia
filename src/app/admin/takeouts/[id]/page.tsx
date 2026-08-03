import { notFound } from "next/navigation";
import { getTakeoutById, getTakeoutMenuItems } from "@/lib/takeout-actions";
import { TakeoutMenuAdmin } from "@/components/admin/takeout-menu-admin";
import { CanteenTheme } from "@/components/canteen/canteen-theme";

export default async function AdminTakeoutMenuPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const takeout = await getTakeoutById(id);
  if (!takeout) notFound();
  const items = await getTakeoutMenuItems(id);

  return (
    <CanteenTheme>
      <TakeoutMenuAdmin takeout={takeout} items={items} />
    </CanteenTheme>
  );
}
