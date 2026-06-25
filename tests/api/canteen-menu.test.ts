import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockGetCanteenById, mockGetCanteenMenuItems } = vi.hoisted(() => ({
  mockGetCanteenById: vi.fn(),
  mockGetCanteenMenuItems: vi.fn(),
}));

vi.mock("@/lib/canteen-actions", () => ({
  getCanteenById: (...args: unknown[]) => mockGetCanteenById(...args),
  getCanteenMenuItems: (...args: unknown[]) => mockGetCanteenMenuItems(...args),
}));

import { GET } from "@/app/api/canteens/[id]/menu/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/canteens/[id]/menu", () => {
  it("returns 404 when canteen does not exist", async () => {
    mockGetCanteenById.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/canteens/missing/menu"), {
      params: Promise.resolve({ id: "missing" }),
    });

    expect(res.status).toBe(404);
  });

  it("returns canteen and menu items", async () => {
    const canteen = {
      id: "c1",
      name: "Union",
      location: "SHB",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const items = [
      {
        id: "i1",
        canteenId: "c1",
        name: "叉烧饭",
        price: 28,
        mealPeriod: "lunch" as const,
        sortOrder: 0,
        svgKey: "rice",
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    mockGetCanteenById.mockResolvedValue(canteen);
    mockGetCanteenMenuItems.mockResolvedValue(items);

    const res = await GET(new NextRequest("http://localhost/api/canteens/c1/menu"), {
      params: Promise.resolve({ id: "c1" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.canteen.name).toBe("Union");
    expect(json.items).toHaveLength(1);
    expect(json.items[0].name).toBe("叉烧饭");
  });
});
