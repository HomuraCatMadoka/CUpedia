import type { SVGProps } from "react";

import { cn } from "@/lib/utils";

export const PROFESSIONAL_BADGE_TIERS = ["bronze", "silver", "gold"] as const;

export type ProfessionalBadgeTier = (typeof PROFESSIONAL_BADGE_TIERS)[number];

const TIER_STYLES: Record<
  ProfessionalBadgeTier,
  {
    label: string;
    rim: string;
    face: string;
    inset: string;
    detail: string;
    ink: string;
  }
> = {
  bronze: {
    label: "铜标",
    rim: "#653A26",
    face: "#B96E43",
    inset: "#E7B58E",
    detail: "#7E472D",
    ink: "#382018",
  },
  silver: {
    label: "银标",
    rim: "#56616B",
    face: "#AAB4BD",
    inset: "#E2E7EA",
    detail: "#687681",
    ink: "#26313A",
  },
  gold: {
    label: "金标",
    rim: "#76530C",
    face: "#D6A629",
    inset: "#F6DE83",
    detail: "#8E6711",
    ink: "#3E2B07",
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
  const rankMarks = PROFESSIONAL_BADGE_TIERS.indexOf(tier) + 1;

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
      <circle cx="32" cy="32" fill={colors.rim} r="30" />
      <circle
        cx="32"
        cy="32"
        fill={colors.face}
        r="26"
        stroke={colors.inset}
        strokeWidth="1.5"
      />
      <circle
        cx="32"
        cy="32"
        fill={colors.inset}
        r="20.5"
        stroke={colors.detail}
        strokeWidth="1.25"
      />
      <path
        d="M13 24.5c3.5-8.3 10-13 19-13s15.5 4.7 19 13"
        fill="none"
        opacity="0.74"
        stroke={colors.detail}
        strokeLinecap="round"
        strokeWidth="1.25"
      />
      <path
        d="M13 39.5c3.5 8.3 10 13 19 13s15.5-4.7 19-13"
        fill="none"
        opacity="0.74"
        stroke={colors.detail}
        strokeLinecap="round"
        strokeWidth="1.25"
      />
      <text
        dominantBaseline="middle"
        fill={colors.ink}
        fontFamily="ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
        fontSize="11"
        fontWeight="800"
        letterSpacing="0.35"
        textAnchor="middle"
        x="32"
        y="32.5"
      >
        {code}
      </text>
      {Array.from({ length: rankMarks }, (_, index) => (
        <circle
          key={index}
          cx={32 + (index - (rankMarks - 1) / 2) * 5}
          cy="47"
          fill={colors.detail}
          r="1.3"
        />
      ))}
    </svg>
  );
}
