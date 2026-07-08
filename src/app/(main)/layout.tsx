import { cookies } from "next/headers";
import { Navbar } from "@/components/layout/navbar";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { SidebarMobileToggle } from "@/components/layout/sidebar-mobile-toggle";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-cookie";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collapsed =
    (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <SidebarProvider initialCollapsed={collapsed}>
      <Navbar leading={<SidebarMobileToggle />} />
      <main className="flex min-h-[calc(100vh-3.5rem)]">{children}</main>
    </SidebarProvider>
  );
}
