import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCanteens, mockGetShameVoteCountsForDate, mockGetShameVoteCounts } =
  vi.hoisted(() => ({
    mockGetCanteens: vi.fn(),
    mockGetShameVoteCountsForDate: vi.fn(),
    mockGetShameVoteCounts: vi.fn(),
  }));

vi.mock("@/lib/canteen-actions", () => ({
  getCanteens: (...args: unknown[]) => mockGetCanteens(...args),
}));

vi.mock("@/lib/canteen-shame-actions", () => ({
  getShameVoteCountsForDate: (...args: unknown[]) =>
    mockGetShameVoteCountsForDate(...args),
  getShameVoteCounts: (...args: unknown[]) => mockGetShameVoteCounts(...args),
}));

import { GET } from "@/app/api/canteens/shit-rank/route";
import { hktCalendarDate } from "@/lib/canteen-shame-rank";

const CANTEENS = [
  {
    id: "c1",
    name: "Union",
    location: "SHB",
    announcement: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "c2",
    name: "MedCan",
    location: "Prinny",
    announcement: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "c3",
    name: "Basic",
    location: "NA",
    announcement: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

function makeRequest(period?: string): Request {
  const query = period === undefined ? "" : `?period=${period}`;
  return new Request(`http://localhost/api/canteens/shit-rank${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/canteens/shit-rank", () => {
  it("defaults to today and returns vote counts for the current HKT date", async () => {
    mockGetCanteens.mockResolvedValue(CANTEENS);
    mockGetShameVoteCountsForDate.mockResolvedValue({ c1: 3, c2: 1 });

    const res = await GET(makeRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetShameVoteCountsForDate).toHaveBeenCalledWith(
      hktCalendarDate(),
    );
    expect(mockGetShameVoteCounts).not.toHaveBeenCalled();
    expect(json).toEqual({
      period: "today",
      rankings: [
        { canteen: { id: "c1", name: "Union", location: "SHB" }, votes: 3 },
        { canteen: { id: "c2", name: "MedCan", location: "Prinny" }, votes: 1 },
        { canteen: { id: "c3", name: "Basic", location: "NA" }, votes: 0 },
      ],
    });
  });

  it("period=today behaves like the default", async () => {
    mockGetCanteens.mockResolvedValue(CANTEENS);
    mockGetShameVoteCountsForDate.mockResolvedValue({});

    const res = await GET(makeRequest("today"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.period).toBe("today");
    expect(mockGetShameVoteCountsForDate).toHaveBeenCalledWith(
      hktCalendarDate(),
    );
    expect(mockGetShameVoteCounts).not.toHaveBeenCalled();
  });

  it("period=all returns all-time counts sorted by votes descending", async () => {
    mockGetCanteens.mockResolvedValue(CANTEENS);
    mockGetShameVoteCounts.mockResolvedValue({ c2: 9, c1: 2 });

    const res = await GET(makeRequest("all"));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(mockGetShameVoteCounts).toHaveBeenCalledTimes(1);
    expect(mockGetShameVoteCountsForDate).not.toHaveBeenCalled();
    expect(json.period).toBe("all");
    expect(json.rankings.map((r: { canteen: { id: string } }) => r.canteen.id)).toEqual([
      "c2",
      "c1",
      "c3",
    ]);
    expect(json.rankings[0].votes).toBe(9);
    expect(json.rankings[2].votes).toBe(0);
  });

  it("ties break by canteen id ascending", async () => {
    mockGetCanteens.mockResolvedValue(CANTEENS);
    mockGetShameVoteCounts.mockResolvedValue({ c3: 5, c1: 5 });

    const res = await GET(makeRequest("all"));
    const json = await res.json();

    expect(
      json.rankings.map((r: { canteen: { id: string } }) => r.canteen.id),
    ).toEqual(["c1", "c3", "c2"]);
  });

  it("returns 400 INVALID_PARAMS for an unknown period", async () => {
    const res = await GET(makeRequest("week"));
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json).toEqual({ error: "INVALID_PARAMS" });
    expect(mockGetCanteens).not.toHaveBeenCalled();
  });
});
