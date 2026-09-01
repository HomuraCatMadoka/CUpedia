import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  headers: vi.fn(),
}));

vi.mock("next/headers", () => ({
  headers: mocks.headers,
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: mocks.requireAuth,
}));

import CampusMapLayout from "@/app/(main)/campus-map/layout";

const placeId = "00000000-0000-4000-8000-000000008170";

describe("Campus Map authentication boundary (#817)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.headers.mockResolvedValue(
      new Headers({
        "x-campus-map-return-path": `/campus-map/places/${placeId}/history?cursor=next-page`,
      }),
    );
  });

  it("keeps non-detail Campus Map routes behind authentication", async () => {
    const children = <div>nested Campus Map route</div>;

    const result = await CampusMapLayout({ children });

    expect(mocks.requireAuth).toHaveBeenCalledWith(
      `/campus-map/places/${placeId}/history?cursor=next-page`,
    );
    expect(result).toBe(children);
  });

  it("lets guests read the stable public Place detail while writes stay server-gated", async () => {
    mocks.headers.mockResolvedValueOnce(
      new Headers({
        "x-campus-map-return-path": `/campus-map/places/${placeId}?reviewsAfter=opaque`,
      }),
    );
    const children = <div>public Place detail</div>;

    const result = await CampusMapLayout({ children });

    expect(mocks.requireAuth).not.toHaveBeenCalled();
    expect(result).toBe(children);
  });
});
