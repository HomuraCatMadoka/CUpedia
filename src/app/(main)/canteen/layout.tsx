import { CanteenTheme } from "@/components/canteen/canteen-theme";
import { CanteenAnonSessionInit } from "@/components/canteen/canteen-anon-session-init";

export default function CanteenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CanteenTheme>
      <CanteenAnonSessionInit />
      <div className="min-h-[calc(100vh-3.5rem)]">{children}</div>
    </CanteenTheme>
  );
}
