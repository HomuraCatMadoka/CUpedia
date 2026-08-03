import Image from "next/image";
import { ChevronDown, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";

export function CanteenQrBadge({
  src,
  canteenName,
  className,
}: {
  /** Public path like `/assets/canteen-qr/<id>.png`; omit for placeholder. */
  src?: string | null;
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
        {src ? (
          <Image
            src={src}
            alt={`${canteenName} 点单二维码`}
            fill
            sizes="(min-width: 640px) 80px, 64px"
            className="object-contain p-1"
            unoptimized
          />
        ) : (
          <div
            className="flex size-full flex-col items-center justify-center gap-0.5 px-1 text-center"
            aria-hidden
          >
            <QrPlaceholderGlyph />
            <span className="text-[0.55rem] font-medium tracking-wide text-[var(--canteen-muted)] sm:text-[0.65rem]">
              二维码
            </span>
          </div>
        )}
      </div>
      <figcaption className="max-w-16 text-center text-[0.6rem] leading-tight text-[var(--canteen-muted)] sm:max-w-20 sm:text-[0.7rem]">
        扫码点单
      </figcaption>
    </figure>
  );
}

export function CanteenQrAction({
  src,
  canteenName,
}: {
  src: string | null;
  canteenName: string;
}) {
  if (!src) return null;

  return (
    <>
      <CanteenQrBadge
        src={src}
        canteenName={canteenName}
        className="hidden sm:flex"
      />
      <details className="canteen-mobile-qr sm:hidden">
        <summary aria-label="查看点单码">
          <QrCode className="size-5" aria-hidden />
        </summary>
        <div className="canteen-mobile-qr-sheet">
          <div className="flex items-center justify-between gap-3">
            <p className="canteen-display font-semibold">扫码点单</p>
            <ChevronDown
              className="size-4 text-[var(--canteen-muted)]"
              aria-hidden
            />
          </div>
          <CanteenQrBadge src={src} canteenName={canteenName} />
        </div>
      </details>
    </>
  );
}

function QrPlaceholderGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5 text-[var(--canteen-ink)] sm:size-6"
      fill="currentColor"
      aria-hidden
    >
      <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm12-2h2v2h-2v-2zm4 0h2v2h-2v-2zm-4 4h2v2h-2v-2zm4 0h2v6h-6v-2h2v-2h2v-2zm-4 4h2v2h-2v-2z" />
    </svg>
  );
}
