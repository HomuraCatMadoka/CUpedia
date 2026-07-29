import Image from "next/image";
import { cn } from "@/lib/utils";

export function CanteenQrBadge({
  src,
  canteenName,
  className,
}: {
  /** Public path like `/assets/canteen-qr/<id>.png`. */
  src: string;
  canteenName: string;
  className?: string;
}) {
  return (
    <figure
      className={cn(
        "canteen-qr-badge m-0 flex shrink-0 flex-col items-center gap-1",
        className,
      )}
    >
      <div
        className={cn(
          "relative size-16 overflow-hidden rounded-2xl sm:size-20",
          "border border-black/[0.06] bg-white",
          "shadow-[0_4px_18px_rgba(0,0,0,0.06)]",
        )}
      >
        <Image
          src={src}
          alt={`${canteenName} 点单二维码`}
          fill
          sizes="(min-width: 640px) 80px, 64px"
          className="object-contain p-1"
          unoptimized
        />
      </div>
      <figcaption className="max-w-16 text-center text-[0.6rem] leading-tight text-[var(--canteen-muted)] sm:max-w-20 sm:text-[0.7rem]">
        扫码点单
      </figcaption>
    </figure>
  );
}
