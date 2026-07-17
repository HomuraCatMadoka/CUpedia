/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  PROFESSIONAL_BADGE_TIERS,
  ProfessionalBadgeLogo,
  isProfessionalBadgeCode,
} from "@/components/courses/professional-badge-logo";

afterEach(cleanup);

describe("ProfessionalBadgeLogo", () => {
  const tierLabels = {
    bronze: "铜标",
    silver: "银标",
    gold: "金标",
  } as const;

  it.each(PROFESSIONAL_BADGE_TIERS)(
    "renders the %s tier as an accessible SVG",
    (tier) => {
      render(<ProfessionalBadgeLogo code="MATH" tier={tier} />);

      const badge = screen.getByRole("img", {
        name: `MATH 专业${tierLabels[tier]}`,
      });
      expect(badge.tagName).toBe("svg");
      expect(badge.getAttribute("data-badge-tier")).toBe(tier);
      expect(badge.getAttribute("viewBox")).toBe("0 0 64 64");
      expect(badge.textContent).toContain("MATH");
    },
  );

  it("uses stable default and requested sizes", () => {
    const { rerender } = render(
      <ProfessionalBadgeLogo code="CSCI" tier="silver" />,
    );
    let badge = screen.getByRole("img");
    expect(badge.getAttribute("width")).toBe("48");
    expect(badge.getAttribute("height")).toBe("48");

    rerender(<ProfessionalBadgeLogo code="CSCI" size={28} tier="silver" />);
    badge = screen.getByRole("img");
    expect(badge.getAttribute("width")).toBe("28");
    expect(badge.getAttribute("height")).toBe("28");
  });

  it.each(["math", "Math", "MAT", "MATHS", "数学01", "AB1D"])(
    "rejects invalid professional code %s",
    (code) => {
      expect(isProfessionalBadgeCode(code)).toBe(false);
      expect(() =>
        render(<ProfessionalBadgeLogo code={code} tier="bronze" />),
      ).toThrow(/exactly four uppercase letters/);
    },
  );

  it("preserves the configured uppercase code", () => {
    render(<ProfessionalBadgeLogo code="IBBA" tier="gold" />);

    expect(isProfessionalBadgeCode("IBBA")).toBe(true);
    expect(screen.getByRole("img").textContent).toContain("IBBA");
  });
});
