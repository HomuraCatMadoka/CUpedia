import { AnnouncementAdminPanel } from "@/components/admin/announcement-admin-panel";
import { adminListAnnouncements } from "@/lib/announcement-actions";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage({
  searchParams,
}: {
  searchParams: Promise<{ announcement?: string }>;
}) {
  const { announcement } = await searchParams;
  const announcements = await adminListAnnouncements();
  const serverNow = new Date().toISOString();
  return (
    <AnnouncementAdminPanel
      key={serverNow}
      announcements={announcements}
      serverNow={serverNow}
      initialAnnouncementId={announcement}
    />
  );
}
