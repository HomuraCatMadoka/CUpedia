import { getCanteens } from "@/lib/canteen-actions";
import { CanteenAdminPanel } from "@/components/admin/canteen-admin-panel";
import { CanteenTheme } from "@/components/canteen/canteen-theme";

export default async function AdminCanteensPage() {
  const canteens = await getCanteens();
  return (
    <CanteenTheme>
      <CanteenAdminPanel canteens={canteens} />
    </CanteenTheme>
  );
}
