import { getWikiEditRoleSetting } from "@/lib/admin-actions";
import { SiteSettingsForm } from "@/components/admin/site-settings-form";

export default async function AdminSettingsPage() {
  const wikiEditRole = await getWikiEditRoleSetting();

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-medium">Wiki 编辑权限</h2>
      <SiteSettingsForm wikiEditRole={wikiEditRole} />
    </div>
  );
}
