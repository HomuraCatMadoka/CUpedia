/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  ShameRankEntryLink,
  ShameRankList,
} from "@/components/canteen/shame-rank-list";
import type { Canteen } from "@/lib/canteen-types";

vi.mock("@/lib/canteen-shame-actions", () => ({
  appendShameVote: vi.fn(),
}));

import { appendShameVote } from "@/lib/canteen-shame-actions";

const appendMock = vi.mocked(appendShameVote);

function canteen(id: string, name: string): Canteen {
  const t = new Date("2026-07-27T00:00:00Z");
  return {
    id,
    name,
    location: null,
    announcement: null,
    createdAt: t,
    updatedAt: t,
  };
}

describe("ShameRankEntryLink", () => {
  it("links to the daily shit-rank page", () => {
    render(<ShameRankEntryLink />);
    const link = screen.getByRole("link", { name: "每日💩堂榜" });
    expect(link.getAttribute("href")).toBe("/canteen/shit-rank");
  });
});

describe("ShameRankList", () => {
  beforeEach(() => {
    appendMock.mockReset();
    appendMock.mockResolvedValue({
      canteenId: "a",
      voteDate: "2026-07-27",
    });
  });

  it("ranks by dislike count and increments on each stomp", async () => {
    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂"), canteen("b", "乙食堂")]}
        initialCounts={{ a: 1, b: 5 }}
        voteDate="2026-07-27"
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("乙食堂");
    expect(items[0].textContent).toContain("5");

    fireEvent.click(screen.getByRole("button", { name: "踩 甲食堂" }));
    fireEvent.click(screen.getByRole("button", { name: "踩 甲食堂" }));

    await waitFor(() => {
      expect(appendMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "踩 甲食堂" }).textContent).toContain(
        "3",
      );
    });
  });
});
