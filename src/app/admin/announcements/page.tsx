import { AnnouncementAdminPanel } from "@/components/admin/announcement-admin-panel";
import { adminListAnnouncements } from "@/lib/announcement-actions";

export const dynamic = "force-dynamic";

export default async function AdminAnnouncementsPage() {
  const announcements = await adminListAnnouncements();
  return <AnnouncementAdminPanel announcements={announcements} />;
}
