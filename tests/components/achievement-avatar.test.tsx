/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AchievementAvatar } from "@/components/user/achievement-avatar";

afterEach(cleanup);

describe("AchievementAvatar", () => {
  it("joins an equipped title and avatar in one shared frame", () => {
    render(
      <AchievementAvatar
        image="/avatar.png"
        size="preview"
        title={{ badgeCode: "BUFF", displayName: "巴菲特" }}
      />,
    );

    const title = screen.getByText("巴菲特");
    const frame = title.parentElement;
    const avatar = screen.getByText("CU").parentElement;

    expect(frame?.classList.contains("overflow-hidden")).toBe(true);
    expect(frame?.classList.contains("ring-1")).toBe(true);
    expect(title.classList.contains("w-full")).toBe(true);
    expect(title.classList.contains("border-t")).toBe(true);
    expect(avatar?.classList.contains("rounded-b-none")).toBe(true);
    expect(avatar?.classList.contains("after:rounded-b-none")).toBe(true);
  });

  it("does not render a title frame at the extra-small size", () => {
    render(
      <AchievementAvatar
        size="xs"
        title={{ badgeCode: "BUFF", displayName: "巴菲特" }}
      />,
    );

    expect(screen.queryByText("巴菲特")).toBeNull();
    expect(
      screen
        .getByText("CU")
        .parentElement?.classList.contains("rounded-b-none"),
    ).toBe(false);
  });
});
