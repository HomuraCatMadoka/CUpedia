import {
  getCanteenShameVoteEndDateSetting,
  getWikiEditRoleSetting,
} from "@/lib/admin-actions";
import { SiteSettingsForm } from "@/components/admin/site-settings-form";

export default async function AdminSettingsPage() {
  const [wikiEditRole, canteenShameVoteEndDate] = await Promise.all([
    getWikiEditRoleSetting(),
    getCanteenShameVoteEndDateSetting(),
  ]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">站点设置</h2>
      <SiteSettingsForm
        wikiEditRole={wikiEditRole}
        canteenShameVoteEndDate={canteenShameVoteEndDate}
      />
    </div>
  );
}
