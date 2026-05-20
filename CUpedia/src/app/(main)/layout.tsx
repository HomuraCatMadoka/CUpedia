import { Navbar } from "@/components/layout/navbar";
import { SidebarProvider } from "@/components/layout/sidebar-provider";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <Navbar />
      <main className="flex min-h-[calc(100vh-3.5rem)]">{children}</main>
    </SidebarProvider>
  );
}
