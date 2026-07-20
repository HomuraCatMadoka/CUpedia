import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

export const PROFESSIONAL_BADGE_TIERS = ["bronze", "silver", "gold"] as const;

export type ProfessionalBadgeTier = (typeof PROFESSIONAL_BADGE_TIERS)[number];

const TIER_STYLES: Record<
  ProfessionalBadgeTier,
  {
    label: string;
    ink: string;
  }
> = {
  bronze: {
    label: "铜级",
    ink: "#A34B32",
  },
  silver: {
    label: "银级",
    ink: "#526775",
  },
  gold: {
    label: "金级",
    ink: "#B27800",
  },
};

const BADGE_FONT_SIZE = 17;
const BADGE_FONT_WEIGHT = 800;

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
      height={compact ? Math.round((size * 18) / 64) : size}
      role="img"
      viewBox={compact ? "0 24 64 18" : "0 0 64 64"}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{accessibleName}</title>
      <text
        dominantBaseline={compact ? "alphabetic" : "middle"}
        fill={colors.ink}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize={BADGE_FONT_SIZE}
        fontWeight={BADGE_FONT_WEIGHT}
        letterSpacing="0.25"
        textAnchor={compact ? "start" : "middle"}
        x={compact ? "0" : "32"}
        y={compact ? "39" : "32.5"}
      >
        {code}
      </text>
    </svg>
  );
}
