import { CanteenMenuSyncHealth } from "@/components/admin/canteen-menu-sync-health";
import { CanteenReviewedIdentityTransitionPanel } from "@/components/admin/canteen-reviewed-identity-transition-panel";
import { adminListCanteenMenuSourceHealth } from "@/lib/canteen-menu-sync-health";
import { listReviewedIdentityTransitions } from "@/lib/canteen-reviewed-identity-transition";

export const dynamic = "force-dynamic";

export default async function AdminCanteenSyncPage() {
  const evaluatedAt = new Date();
  const sources = await adminListCanteenMenuSourceHealth(evaluatedAt);
  const transitions = listReviewedIdentityTransitions();
  return (
    <div className="space-y-8">
      <CanteenMenuSyncHealth sources={sources} evaluatedAt={evaluatedAt} />
      <CanteenReviewedIdentityTransitionPanel options={transitions} />
    </div>
  );
}
