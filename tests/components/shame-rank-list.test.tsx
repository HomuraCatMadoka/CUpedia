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

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
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
    refreshMock.mockReset();
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
        votingEndDate="2026-09-01"
        votingOpen
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
      expect(
        screen.getByRole("button", { name: "踩 甲食堂" }).textContent,
      ).toContain("3");
    });
  });

  it("keeps window scroll position when a row reorders upward", async () => {
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      get: () => 420,
    });
    window.scrollTo = scrollTo as typeof window.scrollTo;

    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂"), canteen("b", "乙食堂")]}
        initialCounts={{ a: 4, b: 5 }}
        voteDate="2026-07-27"
        votingEndDate="2026-09-01"
        votingOpen
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "踩 甲食堂" }));

    await waitFor(() => {
      expect(appendMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(screen.getAllByRole("listitem")[0].textContent).toContain(
        "甲食堂",
      );
    });

    expect(scrollTo).toHaveBeenCalled();
    expect(
      scrollTo.mock.calls.some(
        (args) =>
          (typeof args[0] === "object" && args[0]?.top === 420) ||
          args[1] === 420,
      ),
    ).toBe(true);
  });

  it("rolls back optimistic count when appendShameVote fails", async () => {
    appendMock.mockRejectedValueOnce(new Error("RATE_LIMIT_EXCEEDED"));

    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂"), canteen("b", "乙食堂")]}
        initialCounts={{ a: 1, b: 5 }}
        voteDate="2026-07-27"
        votingEndDate="2026-09-01"
        votingOpen
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "踩 甲食堂" }));

    await waitFor(() => {
      expect(appendMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "踩 甲食堂" }).textContent,
      ).toContain("1");
    });
  });

  it("refreshes instead of adding a new-day vote to the old ranking", async () => {
    appendMock.mockResolvedValueOnce({
      canteenId: "a",
      voteDate: "2026-07-28",
    });
    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂")]}
        initialCounts={{ a: 1 }}
        voteDate="2026-07-27"
        votingEndDate="2026-09-01"
        votingOpen
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "踩 甲食堂" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("button", { name: "踩 甲食堂" }).textContent,
    ).toContain("1");
  });

  it("disables voting after the configured deadline", () => {
    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂")]}
        initialCounts={{ a: 1 }}
        voteDate="2026-09-02"
        votingEndDate="2026-09-01"
        votingOpen={false}
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: "踩 甲食堂",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(/投票已截止/)).toBeTruthy();
  });
});
