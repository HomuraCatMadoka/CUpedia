import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockGetCanteens } = vi.hoisted(() => ({
  mockGetCanteens: vi.fn(),
}));

vi.mock("@/lib/canteen-actions", () => ({
  getCanteens: (...args: unknown[]) => mockGetCanteens(...args),
}));

import { GET } from "@/app/api/canteens/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/canteens", () => {
  it("returns public canteen list", async () => {
    mockGetCanteens.mockResolvedValue([
      {
        id: "c1",
        name: "Union",
        location: "SHB",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    const res = await GET();
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.canteens).toHaveLength(1);
    expect(json.canteens[0].name).toBe("Union");
  });
});
