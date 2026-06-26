import { CanteenTheme } from "@/components/canteen/canteen-theme";

export default function CanteenLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <CanteenTheme>
      <div className="min-h-[calc(100vh-3.5rem)]">{children}</div>
    </CanteenTheme>
  );
}
