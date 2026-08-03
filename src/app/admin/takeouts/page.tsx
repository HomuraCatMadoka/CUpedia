import { getTakeouts } from "@/lib/takeout-actions";
import { TakeoutAdminPanel } from "@/components/admin/takeout-admin-panel";
import { CanteenTheme } from "@/components/canteen/canteen-theme";

export default async function AdminTakeoutsPage() {
  const takeouts = await getTakeouts();
  return (
    <CanteenTheme>
      <TakeoutAdminPanel takeouts={takeouts} />
    </CanteenTheme>
  );
}
