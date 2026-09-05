/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
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

  it("orders today's counts and keeps zero-vote canteens visible", async () => {
    render(
      <ShameRankList
        canteens={[
          canteen("a", "甲食堂"),
          canteen("b", "乙食堂"),
          canteen("c", "丙食堂"),
        ]}
        initialTodayCounts={{ a: 1, b: 5 }}
        initialAllTimeCounts={{ a: 11, b: 8 }}
        voteDate="2026-07-27"
      />,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain("乙食堂");
    expect(items[0].textContent).toContain("5");
    expect(items[2].textContent).toContain("丙食堂");
    expect(items[2].textContent).toContain("—");

    fireEvent.click(screen.getByRole("button", { name: "投 💩 给 甲食堂" }));
    fireEvent.click(screen.getByRole("button", { name: "投 💩 给 甲食堂" }));

    await waitFor(() => {
      expect(appendMock).toHaveBeenCalledTimes(2);
      expect(
        screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
      ).toContain("3");
    });
  });

  it("switches to cumulative counts and keeps both totals in sync", async () => {
    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂"), canteen("b", "乙食堂")]}
        initialTodayCounts={{ a: 1, b: 5 }}
        initialAllTimeCounts={{ a: 11, b: 8 }}
        voteDate="2026-07-27"
      />,
    );

    fireEvent.click(screen.getByRole("tab", { name: "累计" }));
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

  it("rolls back a rejected vote and shows the server reason", async () => {
    appendMock.mockResolvedValueOnce({
      ok: false,
      code: "RATE_LIMIT_EXCEEDED",
    });

    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂"), canteen("b", "乙食堂")]}
        initialTodayCounts={{ a: 1, b: 5 }}
        initialAllTimeCounts={{ a: 11, b: 15 }}
        voteDate="2026-07-27"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "投 💩 给 甲食堂" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
      ).toContain("1");
      expect(screen.getByRole("alert").textContent).toContain(
        "投票失败：匿名投票太频繁",
      );
    });

    fireEvent.click(screen.getByRole("tab", { name: "累计" }));
    expect(
      screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
    ).toContain("11");
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
        voteDate="2026-07-27"
      />,
    );

    const voteButton = screen.getByRole("button", {
      name: "投 💩 给 甲食堂",
    });
    fireEvent.click(voteButton);
    fireEvent.click(voteButton);
    fireEvent.click(voteButton);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
      ).toContain("4");
      expect(appendMock).toHaveBeenCalledTimes(3);
    });

    await act(async () => {
      second.resolve({ ok: true, canteenId: "a", voteDate: "2026-07-27" });
      await second.promise;
    });
    expect(
      screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
    ).toContain("4");

    await act(async () => {
      first.resolve({ ok: false, code: "RATE_LIMIT_EXCEEDED" });
      await first.promise;
    });
    expect(
      screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
    ).toContain("3");
    expect(screen.getByRole("alert").textContent).toContain(
      "投票失败：匿名投票太频繁",
    );

    await act(async () => {
      third.resolve({ ok: true, canteenId: "a", voteDate: "2026-07-27" });
      await third.promise;
    });
    expect(
      screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
    ).toContain("3");
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
        voteDate="2026-07-27"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "投 💩 给 甲食堂" }));

    await waitFor(() => {
      expect(refreshMock).toHaveBeenCalledOnce();
      expect(
        screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
      ).toContain("1");
    });

    fireEvent.click(screen.getByRole("tab", { name: "累计" }));
    expect(
      screen.getByRole("button", { name: "投 💩 给 甲食堂" }).textContent,
    ).toContain("12");
  });

  it("keeps voting enabled after the former configured deadline", () => {
    render(
      <ShameRankList
        canteens={[canteen("a", "甲食堂")]}
        initialTodayCounts={{ a: 1 }}
        initialAllTimeCounts={{ a: 11 }}
        voteDate="2026-09-02"
      />,
    );

    expect(
      (
        screen.getByRole("button", {
          name: "投 💩 给 甲食堂",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
    expect(screen.getByText(/投票长期开放/)).toBeTruthy();
  });
});
