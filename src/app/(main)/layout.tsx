import { MainShell } from "@/components/layout/main-shell";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { ContributorSetupProvider } from "@/components/auth/contributor-setup-provider";
import { SIDEBAR_PREFERENCE_BOOTSTRAP_SCRIPT } from "@/lib/sidebar-preference";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: SIDEBAR_PREFERENCE_BOOTSTRAP_SCRIPT,
        }}
      />
      <ContributorSetupProvider>
        <SidebarProvider>
          <MainShell>{children}</MainShell>
        </SidebarProvider>
      </ContributorSetupProvider>
    </>
  );
}
