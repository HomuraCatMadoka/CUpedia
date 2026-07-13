import { DanmakuAdminPanel } from "@/components/admin/danmaku-admin-panel";
import { adminListDanmaku } from "@/lib/danmaku-actions";

export default async function AdminDanmakuPage() {
  const messages = await adminListDanmaku();
  return <DanmakuAdminPanel messages={messages} />;
}
