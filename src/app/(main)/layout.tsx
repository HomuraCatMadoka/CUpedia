import { cookies } from "next/headers";
import { MainShell } from "@/components/layout/main-shell";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
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
        <MainShell>{children}</MainShell>
      </SidebarProvider>
    </ContributorSetupProvider>
  );
}
