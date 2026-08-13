import { ExternalLink } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function CanteenOrderAction({
  href,
  canteenName,
  className,
  label = "点击点餐",
}: {
  href: string | null;
  canteenName: string;
  className?: string;
  label?: string;
}) {
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        buttonVariants({ variant: "ghost" }),
        "canteen-order-btn",
        className,
      )}
      aria-label={`${canteenName} ${label}`}
    >
      <span>{label}</span>
      <ExternalLink className="size-3.5 shrink-0 opacity-70" aria-hidden />
    </a>
  );
}
