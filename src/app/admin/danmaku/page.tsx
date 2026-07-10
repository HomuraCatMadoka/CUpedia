import { DanmakuAdminPanel } from "@/components/admin/danmaku-admin-panel";
import { adminListCurrentMonthDanmaku } from "@/lib/danmaku-actions";

export default async function AdminDanmakuPage() {
  const messages = await adminListCurrentMonthDanmaku();
  return <DanmakuAdminPanel messages={messages} />;
}
