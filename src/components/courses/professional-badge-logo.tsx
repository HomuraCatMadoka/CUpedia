import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

export const PROFESSIONAL_BADGE_TIERS = ["bronze", "silver", "gold"] as const;

export type ProfessionalBadgeTier = (typeof PROFESSIONAL_BADGE_TIERS)[number];

const TIER_STYLES: Record<
  ProfessionalBadgeTier,
  {
    label: string;
    ink: string;
    fontSize: number;
    fontWeight: number;
  }
> = {
  bronze: {
    label: "铜级",
    ink: "#A34B32",
    fontSize: 16,
    fontWeight: 800,
  },
  silver: {
    label: "银级",
    ink: "#526775",
    fontSize: 17,
    fontWeight: 850,
  },
  gold: {
    label: "金级",
    ink: "#B27800",
    fontSize: 18,
    fontWeight: 900,
  },
};

export function isProfessionalBadgeCode(code: string): boolean {
  return /^[A-Z]{4}$/.test(code);
}

type ProfessionalBadgeLogoProps = Omit<
  SVGProps<SVGSVGElement>,
  "children" | "height" | "width"
> & {
  code: string;
  tier: ProfessionalBadgeTier;
  size?: number;
  compact?: boolean;
};

export function ProfessionalBadgeLogo({
  code,
  tier,
  size = 48,
  compact = false,
  className,
  ...props
}: ProfessionalBadgeLogoProps) {
  if (!isProfessionalBadgeCode(code)) {
    throw new Error(
      `Professional badge code must contain exactly four uppercase letters: ${code}`,
    );
  }

  const colors = TIER_STYLES[tier];
  const accessibleName = `${code} ${colors.label}专业成就`;

  return (
    <svg
      {...props}
      aria-label={accessibleName}
      className={cn("inline-block shrink-0", className)}
      data-badge-code={code}
      data-badge-tier={tier}
      height={compact ? Math.round((size * 27) / 64) : size}
      role="img"
      viewBox={compact ? "0 19 64 27" : "0 0 64 64"}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{accessibleName}</title>
      <text
        dominantBaseline="middle"
        fill={colors.ink}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize={colors.fontSize}
        fontWeight={colors.fontWeight}
        letterSpacing="0.25"
        textAnchor="middle"
        x="32"
        y="32.5"
      >
        {code}
      </text>
    </svg>
  );
}
