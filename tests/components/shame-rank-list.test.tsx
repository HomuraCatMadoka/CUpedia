/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
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

import {
  appendShameVote,
  type ShameVoteResult,
} from "@/lib/canteen-shame-actions";

const appendMock = vi.mocked(appendShameVote);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

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
    const link = screen.getByRole("link", { name: "💩堂榜" });
    expect(link.getAttribute("href")).toBe("/canteen/shit-rank");
  });
});

describe("ShameRankList", () => {
  beforeEach(() => {
    appendMock.mockReset();
    refreshMock.mockReset();
    appendMock.mockResolvedValue({
      ok: true,
      canteenId: "a",
      voteDate: "2026-07-27",
    });
  });

  it("ranks by dislike count and increments on each stomp", async () => {
    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂"), canteen("b", "乙食堂")]}
        initialTodayCounts={{ a: 1, b: 5 }}
        initialAllTimeCounts={{ a: 11, b: 8 }}
        previousCounts={{}}
        voteDate="2026-07-27"
        votingEndDate="2026-09-01"
        votingOpen
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items[0].textContent).toContain("乙食堂");
    expect(items[0].textContent).toContain("5");

    fireEvent.click(screen.getByRole("button", { name: "投 💩 给 甲食堂" }));
    fireEvent.click(screen.getByRole("button", { name: "投 💩 给 甲食堂" }));

    await waitFor(() => {
      expect(appendMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
      ).toContain("3");
    });
  });

  it("switches to cumulative history and keeps both totals in sync", async () => {
    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂"), canteen("b", "乙食堂")]}
        initialTodayCounts={{ a: 1, b: 5 }}
        initialAllTimeCounts={{ a: 11, b: 8 }}
        previousCounts={{}}
        voteDate="2026-07-27"
        votingEndDate="2026-09-01"
        votingOpen
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "历史" }));
    expect(screen.getAllByRole("listitem")[0].textContent).toContain("甲食堂");
    expect(
      screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
    ).toContain("11");

    fireEvent.click(screen.getByRole("button", { name: "投 💩 给 甲食堂" }));
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
      ).toContain("12");
    });

    fireEvent.click(screen.getByRole("tab", { name: "今日" }));
    expect(
      screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
    ).toContain("2");
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
        initialTodayCounts={{ a: 4, b: 5 }}
        initialAllTimeCounts={{ a: 4, b: 5 }}
        previousCounts={{}}
        voteDate="2026-07-27"
        votingEndDate="2026-09-01"
        votingOpen
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "投 💩 给 甲食堂" }));

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

  it("keeps failed votes out of the confirmed count", async () => {
    appendMock.mockResolvedValueOnce({
      ok: false,
      code: "RATE_LIMIT_EXCEEDED",
    });

    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂"), canteen("b", "乙食堂")]}
        initialTodayCounts={{ a: 1, b: 5 }}
        initialAllTimeCounts={{ a: 11, b: 15 }}
        previousCounts={{}}
        voteDate="2026-07-27"
        votingEndDate="2026-09-01"
        votingOpen
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "投 💩 给 甲食堂" }));

    await waitFor(() => {
      expect(appendMock).toHaveBeenCalledTimes(1);
    });

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
      ).toContain("1");
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "1 票未计入；最近原因：匿名投票太频繁",
    );
  });

  it("settles concurrent votes independently when responses arrive out of order", async () => {
    const first = deferred<ShameVoteResult>();
    const second = deferred<ShameVoteResult>();
    const third = deferred<ShameVoteResult>();
    appendMock
      .mockImplementationOnce(() => first.promise)
      .mockImplementationOnce(() => second.promise)
      .mockImplementationOnce(() => third.promise);

    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂")]}
        initialTodayCounts={{ a: 1 }}
        initialAllTimeCounts={{ a: 11 }}
        previousCounts={{}}
        voteDate="2026-07-27"
        votingEndDate="2026-09-01"
        votingOpen
      />,
    );

    const voteButton = screen.getByRole("button", {
      name: "投 💩 给 甲食堂",
    });
    fireEvent.click(voteButton);
    fireEvent.click(voteButton);
    fireEvent.click(voteButton);

    expect(
      voteButton.querySelector('[data-testid="shame-vote-count"]')?.textContent,
    ).toBe("1");
    expect(screen.getByRole("status").textContent).toContain("3 票提交中");

    await act(async () => {
      second.resolve({ ok: true, canteenId: "a", voteDate: "2026-07-27" });
      await second.promise;
    });
    expect(
      voteButton.querySelector('[data-testid="shame-vote-count"]')?.textContent,
    ).toBe("2");
    expect(screen.getByRole("status").textContent).toContain("2 票提交中");

    await act(async () => {
      first.resolve({ ok: false, code: "RATE_LIMIT_EXCEEDED" });
      await first.promise;
    });
    expect(
      voteButton.querySelector('[data-testid="shame-vote-count"]')?.textContent,
    ).toBe("2");
    expect(screen.getByRole("status").textContent).toContain("1 票提交中");
    expect(screen.getByRole("alert").textContent).toContain("1 票未计入");

    await act(async () => {
      third.resolve({ ok: true, canteenId: "a", voteDate: "2026-07-27" });
      await third.promise;
    });
    expect(
      voteButton.querySelector('[data-testid="shame-vote-count"]')?.textContent,
    ).toBe("3");
    expect(screen.getByRole("status").textContent).toBe("");
    expect(screen.getByRole("alert").textContent).toContain("1 票未计入");
  });

  it("refreshes instead of adding a new-day vote to the old ranking", async () => {
    appendMock.mockResolvedValueOnce({
      ok: true,
      canteenId: "a",
      voteDate: "2026-07-28",
    });
    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂")]}
        initialTodayCounts={{ a: 1 }}
        initialAllTimeCounts={{ a: 11 }}
        previousCounts={{}}
        voteDate="2026-07-27"
        votingEndDate="2026-09-01"
        votingOpen
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "投 💩 给 甲食堂" }));

    await waitFor(() => expect(refreshMock).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
    ).toContain("1");
  });

  it("disables voting after the configured deadline", () => {
    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂")]}
        initialTodayCounts={{ a: 1 }}
        initialAllTimeCounts={{ a: 11 }}
        previousCounts={{}}
        voteDate="2026-09-02"
        votingEndDate="2026-09-01"
        votingOpen={false}
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: "投 💩 给 甲食堂",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByText(/投票已截止/)).toBeTruthy();
  });

  it("defaults to expanded and can collapse to hide unranked canteens", () => {
    const canteens = Array.from({ length: 20 }, (_, index) =>
      canteen(String(index), `${index + 1} 号食堂`),
    );
    render(
      <ShameRankList
        canteens={canteens}
        initialTodayCounts={{ "0": 3, "1": 2, "2": 1 }}
        initialAllTimeCounts={{ "0": 3, "1": 2, "2": 1 }}
        previousCounts={{}}
        voteDate="2026-07-27"
        votingEndDate="2026-09-01"
        votingOpen
      />,
    );

    // Default: all 20 items visible with collapse button
    expect(screen.getAllByRole("listitem")).toHaveLength(20);
    expect(screen.getByRole("list", { name: "尚未上榜的食堂" })).toBeTruthy();
    expect(screen.getByText("收起榜单 ↑")).toBeTruthy();

    // Collapse → only top 10 ranked visible
    fireEvent.click(screen.getByRole("button", { name: "收起榜单 ↑" }));

    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByText("尚未上榜 · 17 家食堂")).toBeTruthy();
    expect(screen.getByText(/查看完整榜单（20）/)).toBeTruthy();
  });
});
