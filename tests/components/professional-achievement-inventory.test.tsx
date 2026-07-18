/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type {
  ProfessionalAchievementInventoryProgramme,
  ProfessionalAchievementTier,
} from "@/lib/achievement-inventory";

const { mockRedeem, mockRefresh, mockSetPrimary, mockToastSuccess } =
  vi.hoisted(() => ({
    mockRedeem: vi.fn(),
    mockRefresh: vi.fn(),
    mockSetPrimary: vi.fn(),
    mockToastSuccess: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mockRefresh }),
}));
vi.mock("sonner", () => ({
  toast: { success: mockToastSuccess },
}));
vi.mock("@/lib/achievement-actions", () => ({
  redeemProfessionalAchievement: (...args: unknown[]) => mockRedeem(...args),
}));
vi.mock("@/lib/achievement-profile-actions", () => ({
  setPrimaryAchievement: (...args: unknown[]) => mockSetPrimary(...args),
}));
vi.mock("@/components/courses/achievement-revoke-button", () => ({
  AchievementRevokeButton: ({ displayName }: { displayName: string }) => (
    <button type="button">撤销 {displayName}</button>
  ),
}));

import {
  ProfessionalAchievementInventory,
  sortProfessionalAchievementInventory,
} from "@/components/courses/professional-achievement-inventory";

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

type ProgrammeOptions = {
  displayName?: string;
  currentTier?: ProfessionalAchievementTier | null;
  eligible?: boolean;
  matchedCount?: number;
  requiredCount?: number;
  tiers?: ProfessionalAchievementTier[];
  noNext?: boolean;
};

function makeProgramme(
  badgeCode: string,
  {
    displayName = badgeCode,
    currentTier = null,
    eligible = false,
    matchedCount = 0,
    requiredCount = 4,
    tiers = ["bronze", "silver", "gold"],
    noNext = false,
  }: ProgrammeOptions = {},
): ProfessionalAchievementInventoryProgramme {
  const programmeKey = badgeCode.toLocaleLowerCase();
  const currentIndex = currentTier ? tiers.indexOf(currentTier) : -1;
  const nextTier = currentTier ? tiers[currentIndex + 1] : tiers[0];

  return {
    programmeKey,
    badgeCode,
    displayName,
    description: "",
    tiers: tiers.map((tier, index) => ({
      tier,
      ruleId: `${programmeKey}-${tier}`,
      status:
        index < currentIndex
          ? "completed"
          : index === currentIndex
            ? "current"
            : "locked",
    })),
    current: currentTier
      ? {
          achievementId: `achievement-${programmeKey}`,
          ruleId: `${programmeKey}-${currentTier}`,
          tier: currentTier,
        }
      : null,
    next:
      noNext || !nextTier
        ? null
        : {
            ruleId: `${programmeKey}-${nextTier}`,
            tier: nextTier,
            displayName,
            description: "",
            subjectGroups: [
              {
                subjectCodes: [badgeCode],
                matchedCount,
                requiredCount,
              },
            ],
            matchedCount,
            requiredCount,
            eligible,
            prerequisiteSatisfied: true,
            slotAvailable: true,
            action: currentTier ? "upgrade" : "claim",
          },
  };
}

describe("ProfessionalAchievementInventory", () => {
  it("sorts owned gold, silver, and bronze before claimable and remaining achievements", () => {
    const items = [
      makeProgramme("EPRG", { matchedCount: 3 }),
      makeProgramme("DCLM", { eligible: true, matchedCount: 4 }),
      makeProgramme("CBRZ", { currentTier: "bronze" }),
      makeProgramme("AUPG", {
        currentTier: "bronze",
        eligible: true,
        matchedCount: 4,
      }),
      makeProgramme("BSIL", { currentTier: "silver" }),
      makeProgramme("AGLD", { currentTier: "gold", noNext: true }),
    ];

    expect(
      sortProfessionalAchievementInventory(items).map((item) => item.badgeCode),
    ).toEqual(["AGLD", "BSIL", "AUPG", "CBRZ", "DCLM", "EPRG"]);
  });

  it("marks only claimable and upgradeable slots with an orange action dot", () => {
    render(
      <ProfessionalAchievementInventory
        items={[
          makeProgramme("UPGD", {
            displayName: "升级专业",
            currentTier: "bronze",
            eligible: true,
            matchedCount: 4,
          }),
          makeProgramme("CLAM", {
            displayName: "领取专业",
            eligible: true,
            matchedCount: 4,
          }),
          makeProgramme("OWND", {
            displayName: "已有专业",
            currentTier: "bronze",
          }),
          makeProgramme("PROG", {
            displayName: "进度专业",
            matchedCount: 2,
          }),
        ]}
        primaryAchievementId={null}
      />,
    );

    const upgrade = screen.getByRole("button", { name: "升级专业，可以升级" });
    const claim = screen.getByRole("button", { name: "领取专业，可以领取" });
    const owned = screen.getByRole("button", { name: "已有专业，已获得" });
    const progress = screen.getByRole("button", {
      name: "进度专业，进度 2/4",
    });

    expect(upgrade.querySelector(".bg-amber-600")).not.toBeNull();
    expect(claim.querySelector(".bg-amber-600")).not.toBeNull();
    expect(owned.querySelector(".bg-amber-600")).toBeNull();
    expect(progress.querySelector(".bg-amber-600")).toBeNull();
  });

  it("searches by professional code or display name", () => {
    render(
      <ProfessionalAchievementInventory
        items={[
          makeProgramme("MATH", { displayName: "数学" }),
          makeProgramme("PHYS", { displayName: "物理" }),
          makeProgramme("ECON", { displayName: "经济学" }),
        ]}
        primaryAchievementId={null}
      />,
    );

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索专业成就" }), {
      target: { value: "经济" },
    });

    const backpack = screen.getByLabelText("专业成就背包");
    expect(within(backpack).getAllByRole("button")).toHaveLength(1);
    expect(
      within(backpack).getByRole("button", { name: /经济学/ }),
    ).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox", { name: "搜索专业成就" }), {
      target: { value: "math" },
    });
    expect(
      within(screen.getByLabelText("专业成就背包")).getByRole("button", {
        name: /数学/,
      }),
    ).toBeTruthy();
  });

  it("paginates the backpack in groups of 12", () => {
    const codes = [
      "AAAA",
      "AAAB",
      "AAAC",
      "AAAD",
      "AAAE",
      "AAAF",
      "AAAG",
      "AAAH",
      "AAAI",
      "AAAJ",
      "AAAK",
      "AAAL",
      "AAAM",
    ];
    render(
      <ProfessionalAchievementInventory
        items={codes.map((code) => makeProgramme(code))}
        primaryAchievementId={null}
      />,
    );

    expect(
      within(screen.getByLabelText("专业成就背包")).getAllByRole("button"),
    ).toHaveLength(12);
    expect(screen.getByText("1 / 2")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "下一页" }));

    expect(
      within(screen.getByLabelText("专业成就背包")).getAllByRole("button"),
    ).toHaveLength(1);
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  it("frames only the current tier and labels every future tier as locked", () => {
    render(
      <ProfessionalAchievementInventory
        items={[
          makeProgramme("MATH", {
            displayName: "数学",
            currentTier: "silver",
            matchedCount: 1,
          }),
        ]}
        primaryAchievementId={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "数学，已获得" }));

    expect(screen.getByRole("dialog")).toBeTruthy();
    const bronze = screen.getByRole("listitem", {
      name: "MATH 铜级，已完成",
    });
    const silver = screen.getByRole("listitem", {
      name: "MATH 银级，当前",
    });
    const gold = screen.getByRole("listitem", {
      name: "MATH 金级，未解锁",
    });
    const tierSteps = [bronze, silver, gold];

    expect(
      tierSteps.filter((step) => step.className.includes("border-[#")),
    ).toHaveLength(1);
    expect(silver.className).toContain("border-[#bcc9d0]");
    expect(bronze.className).not.toContain("border-[#");
    expect(gold.className).not.toContain("border-[#");
    expect(within(gold).getByText("未解锁")).toBeTruthy();
    expect(
      within(gold)
        .getByRole("img", { name: "MATH 金级专业成就" })
        .querySelector("text")
        ?.getAttribute("fill"),
    ).toBe("#B27800");
  });

  it("keeps comment display controls available while an achievement can upgrade", () => {
    render(
      <ProfessionalAchievementInventory
        items={[
          makeProgramme("MATH", {
            displayName: "数学",
            currentTier: "bronze",
            eligible: true,
            matchedCount: 4,
          }),
        ]}
        primaryAchievementId={null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "数学，可以升级" }));

    expect(screen.getByRole("button", { name: "设为评论旁展示" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "升级 MATH" })).toBeTruthy();
    const footerClassName = screen
      .getByRole("dialog")
      .querySelector('[data-slot="dialog-footer"]')?.className;
    expect(footerClassName).toContain("flex-row");
    expect(footerClassName).toContain("items-center");
    expect(footerClassName).toContain("justify-between");
    expect(footerClassName).toContain("sm:justify-between");
    expect(footerClassName).not.toContain("flex-col-reverse");
  });

  it("does not offer to remove the current achievement from comment display", () => {
    const item = makeProgramme("MATH", {
      displayName: "数学",
      currentTier: "silver",
      eligible: false,
    });

    render(
      <ProfessionalAchievementInventory
        items={[item]}
        primaryAchievementId={item.current?.achievementId ?? null}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "数学，已获得" }));

    expect(screen.queryByRole("button", { name: "取消评论旁展示" })).toBeNull();
    expect(screen.queryByRole("button", { name: "设为评论旁展示" })).toBeNull();
    expect(screen.getByRole("button", { name: /撤销/ })).toBeTruthy();
    expect(
      screen.getByRole("region", { name: "升级条件" }).querySelector(".mt-3")
        ?.className,
    ).not.toContain("border-y");
  });

  it("supports a silver-to-gold achievement with no bronze tier", () => {
    render(
      <ProfessionalAchievementInventory
        items={[
          makeProgramme("IMSC", {
            displayName: "跨学科数学与科学教育",
            tiers: ["silver", "gold"],
            matchedCount: 4,
            requiredCount: 8,
          }),
        ]}
        primaryAchievementId={null}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "跨学科数学与科学教育，进度 4/8",
      }),
    );

    const tierSteps = screen.getAllByRole("listitem");
    expect(tierSteps).toHaveLength(2);
    expect(
      screen.getByRole("listitem", { name: "IMSC 银级，未解锁" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("listitem", { name: "IMSC 金级，未解锁" }),
    ).toBeTruthy();
    expect(screen.queryByText("铜级")).toBeNull();
    expect(screen.getAllByText("未解锁")).toHaveLength(2);
    expect(tierSteps.some((step) => step.className.includes("border-[#"))).toBe(
      false,
    );
  });
});
