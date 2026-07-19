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
    expect(frame?.classList.contains("w-44")).toBe(true);
    expect(title.classList.contains("w-full")).toBe(true);
    expect(title.classList.contains("border-t")).toBe(true);
    expect(title.classList.contains("truncate")).toBe(false);
    expect(title.classList.contains("whitespace-normal")).toBe(true);
    expect(title.classList.contains("break-all")).toBe(true);
    expect(avatar?.classList.contains("rounded-b-none")).toBe(true);
    expect(avatar?.classList.contains("after:rounded-b-none")).toBe(true);
    expect(avatar?.classList.contains("after:border-0")).toBe(true);
  });

  it("uses one explicit width for the small avatar and title frame", () => {
    render(
      <AchievementAvatar
        image="/avatar.png"
        size="sm"
        title={{ badgeCode: "GROT", displayName: "格劳秀斯" }}
      />,
    );

    const title = screen.getByText("格劳秀斯");
    const frame = title.parentElement;
    const avatar = screen.getByText("CU").parentElement;

    expect(frame?.classList.contains("w-20")).toBe(true);
    expect(avatar?.classList.contains("size-20")).toBe(true);
    expect(title.classList.contains("min-h-7")).toBe(true);
    expect(title.classList.contains("items-center")).toBe(true);
  });

  it("keeps an untitled small avatar at its original size", () => {
    render(<AchievementAvatar image="/avatar.png" size="sm" />);

    const avatar = screen.getByText("CU").parentElement;

    expect(avatar?.classList.contains("size-11")).toBe(true);
    expect(avatar?.classList.contains("size-20")).toBe(false);
  });

  it("keeps titles from one through fourteen characters complete and wrappable", () => {
    const titles = [
      "侠",
      "格劳秀斯",
      "山城夜行观察家",
      "一二三四五六七八九十甲乙丙丁",
    ];

    render(
      <div>
        {titles.map((displayName) => (
          <AchievementAvatar
            key={displayName}
            size="sm"
            title={{ badgeCode: "TEST", displayName }}
          />
        ))}
      </div>,
    );

    for (const displayName of titles) {
      const title = screen.getByText(displayName);
      expect(title.textContent).toBe(displayName);
      expect(title.classList.contains("truncate")).toBe(false);
      expect(title.classList.contains("whitespace-normal")).toBe(true);
      expect(title.classList.contains("break-all")).toBe(true);
    }
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
