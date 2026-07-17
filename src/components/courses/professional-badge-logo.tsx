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
    label: "铜标",
    ink: "#AD633D",
  },
  silver: {
    label: "银标",
    ink: "#7A8791",
  },
  gold: {
    label: "金标",
    ink: "#C49317",
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
};

export function ProfessionalBadgeLogo({
  code,
  tier,
  size = 48,
  className,
  ...props
}: ProfessionalBadgeLogoProps) {
  if (!isProfessionalBadgeCode(code)) {
    throw new Error(
      `Professional badge code must contain exactly four uppercase letters: ${code}`,
    );
  }

  const colors = TIER_STYLES[tier];
  const accessibleName = `${code} 专业${colors.label}`;

  return (
    <svg
      {...props}
      aria-label={accessibleName}
      className={cn("inline-block shrink-0", className)}
      data-badge-code={code}
      data-badge-tier={tier}
      height={size}
      role="img"
      viewBox="0 0 64 64"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <title>{accessibleName}</title>
      <text
        dominantBaseline="middle"
        fill={colors.ink}
        fontFamily="ui-sans-serif, system-ui, sans-serif"
        fontSize="16"
        fontWeight="850"
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
