import { CanteenTheme } from "@/components/canteen/canteen-theme";
import { CanteenAnonSessionInit } from "@/components/canteen/canteen-anon-session-init";
import { CanteenRouteScrollTop } from "@/components/canteen/canteen-route-scroll-top";

export default function CanteenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CanteenTheme>
      <CanteenRouteScrollTop />
      <CanteenAnonSessionInit />
      <div className="min-h-[calc(100dvh-var(--navbar-height))] min-w-0">
        {children}
      </div>
    </CanteenTheme>
  );
}
