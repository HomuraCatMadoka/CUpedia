import { CanteenMenuSyncHealth } from "@/components/admin/canteen-menu-sync-health";
import { adminListCanteenMenuSourceHealth } from "@/lib/canteen-menu-sync-health";

export const dynamic = "force-dynamic";

export default async function AdminCanteenSyncPage() {
  const evaluatedAt = new Date();
  const sources = await adminListCanteenMenuSourceHealth(evaluatedAt);
  return <CanteenMenuSyncHealth sources={sources} evaluatedAt={evaluatedAt} />;
}
