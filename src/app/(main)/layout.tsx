import { cookies } from "next/headers";
import { Navbar } from "@/components/layout/navbar";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { SidebarMobileToggle } from "@/components/layout/sidebar-mobile-toggle";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-cookie";
import { ContributorSetupProvider } from "@/components/auth/contributor-setup-provider";

export default async function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const collapsed =
    (await cookies()).get(SIDEBAR_COOKIE)?.value === "collapsed";

  return (
    <ContributorSetupProvider>
      <SidebarProvider initialCollapsed={collapsed}>
        <Navbar leading={<SidebarMobileToggle />} />
        <main className="flex min-h-[calc(100dvh-var(--navbar-height))] min-w-0">
          {children}
        </main>
      </SidebarProvider>
    </ContributorSetupProvider>
  );
}
