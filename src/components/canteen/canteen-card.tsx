"use client";

import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import type { CSSProperties } from "react";
import { CanteenOpenDot } from "@/components/canteen/canteen-open-dot";
import { useCanteenOpenStatus } from "@/hooks/use-canteen-open-status";
import type { Canteen, CanteenOpenStatus } from "@/lib/canteen-types";
import { mockCanteenIcon } from "@/lib/canteen-icon-mock";
import { cn } from "@/lib/utils";

function CanteenIconOrb({
  canteen,
  iconSrc,
  pending,
}: {
  canteen: Canteen;
  iconSrc?: string | null;
  pending: boolean;
}) {
  const { fill, initials } = mockCanteenIcon(canteen.id, canteen.name);
  const hasPhoto = Boolean(iconSrc);

  return (
    <span
      className={cn(
        "canteen-icon-orb",
        hasPhoto ? "canteen-icon-orb--photo" : "canteen-icon-orb--fallback",
      )}
      style={
        hasPhoto
          ? undefined
          : ({ "--canteen-icon-fill": fill } as CSSProperties)
      }
      aria-hidden
    >
      {iconSrc ? (
        <Image
          src={iconSrc}
          alt=""
          fill
          sizes="(min-width: 640px) 88px, 76px"
          className="canteen-icon-photo"
          unoptimized
        />
      ) : !pending ? (
        <span className="canteen-icon-initials">{initials}</span>
      ) : null}
      {pending ? <span className="canteen-icon-pending" /> : null}
    </span>
  );
}

export function CanteenCard({
  canteen,
  itemCount,
  href,
  iconSrc,
  className,
  showOpenState = false,
}: {
  canteen: Canteen;
  /** Kept for call-site compatibility; icon launcher omits counts. */
  itemCount?: number;
  href: string;
  /** `/assets/canteen-icons/<id>.ext` when file exists; omit for mock. */
  iconSrc?: string | null;
  className?: string;
  /**
   * Render the open/closed dot beside the name. Off by default so admin
   * surfaces and the takeout zone keep their existing markup.
   */
  showOpenState?: boolean;
}) {
  const openStatus = useCanteenOpenStatus(canteen.openingHours, showOpenState);
  const accessibleName = [canteen.name, canteen.location, openStatus?.label]
    .filter(Boolean)
    .join(" ");

  return (
    <Link
      href={href}
      prefetch={false}
      className={cn("canteen-icon-link", className)}
      aria-label={accessibleName}
    >
      <CanteenCardSurface
        canteen={canteen}
        itemCount={itemCount}
        iconSrc={iconSrc}
        openStatus={openStatus}
      />
    </Link>
  );
}

function CanteenCardSurface({
  canteen,
  itemCount,
  iconSrc,
  openStatus,
}: {
  canteen: Canteen;
  itemCount?: number;
  iconSrc?: string | null;
  openStatus?: CanteenOpenStatus | null;
}) {
  const { pending } = useLinkStatus();
  const nameLabel = (
    <span className="canteen-icon-label canteen-display">{canteen.name}</span>
  );

  return (
    <span
      className="group flex w-full flex-col items-center gap-2 touch-manipulation"
      aria-busy={pending || undefined}
    >
      <CanteenIconOrb canteen={canteen} iconSrc={iconSrc} pending={pending} />
      {openStatus ? (
        <span className="canteen-icon-name-row">
          {nameLabel}
          <CanteenOpenDot status={openStatus} />
        </span>
      ) : (
        nameLabel
      )}
      {canteen.location ? (
        <span className="sr-only">{canteen.location}</span>
      ) : null}
      {itemCount !== undefined ? (
        <span className="sr-only">
          {itemCount > 0 ? `${itemCount} 道菜` : "暂无菜单"}
        </span>
      ) : null}
    </span>
  );
}
