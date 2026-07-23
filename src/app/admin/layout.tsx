import { cookies } from "next/headers";
import { requireAdmin } from "@/lib/auth-guard";
import { Navbar } from "@/components/layout/navbar";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-cookie";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();
  const collapsed =
    (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <SidebarProvider initialCollapsed={collapsed}>
      <Navbar />
      <main className="mx-auto w-full max-w-7xl px-4 py-6">
        <p className="mb-4 text-sm text-muted-foreground">管理后台</p>
        <AdminTabs />
        {children}
      </main>
    </SidebarProvider>
  );
}
