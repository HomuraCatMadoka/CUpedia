import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHistory: vi.fn(),
  getRevision: vi.fn(),
  listBuildings: vi.fn(),
  getViewer: vi.fn(),
  getFeedbackPage: vi.fn(),
  getViewerFeedback: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/campus-map/fact-store", () => ({
  getCampusMapPlaceHistory: mocks.getHistory,
  getCampusMapPlaceRevision: mocks.getRevision,
  listCampusMapBrowseBuildings: mocks.listBuildings,
}));
vi.mock("@/lib/auth-guard", () => ({
  getAuthenticatedUserForApi: mocks.getViewer,
}));
vi.mock("@/lib/campus-map/place-feedback", () => ({
  getCampusMapPlaceFeedbackPage: mocks.getFeedbackPage,
  getCampusMapViewerPlaceFeedback: mocks.getViewerFeedback,
}));
vi.mock("next/navigation", () => ({ notFound: mocks.notFound }));

import CampusMapPlacePage from "@/app/(main)/campus-map/places/[placeId]/page";
import { CampusMapPlaceDetail } from "@/components/campus-map/place-detail";

const placeId = "00000000-0000-4000-8000-000000008160";
const revisionId = "00000000-0000-4000-8000-000000008161";

describe("Campus Map stable Place page (#816)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getHistory.mockResolvedValue({
      placeExists: true,
      head: {
        revisionId,
        status: "retired",
        visibility: "public",
        mergedIntoPlaceId: null,
        name: "停用的饮水点",
      },
      // Deliberately unrelated: the page must load the canonical head by ID.
      items: [{ id: "older-page-item" }],
      nextCursor: null,
    });
    mocks.getRevision.mockResolvedValue({
      id: revisionId,
      placeId,
      operation: "retire",
      comment: "地点已拆除",
      content: {
        visibility: "public",
        fact: {
          name: "停用的饮水点",
          pinType: "water",
          capabilities: [],
          gender: "unknown",
          wheelchairAccess: "unknown",
          audience: "unknown",
          credentialRequirement: "unknown",
          accessSchedule: { kind: "unknown" },
          reservationRequirement: "unknown",
          temporaryStatus: "normal",
          buildingId: "00000000-0000-4000-8000-000000008162",
          floorId: "00000000-0000-4000-8000-000000008163",
          locationKind: "floor",
          pointPrecision: null,
          longitude: null,
          latitude: null,
          coordinateCrs: null,
          observedAt: null,
          verifiedAt: null,
          provenance: [],
        },
      },
    });
    mocks.listBuildings.mockResolvedValue([
      {
        buildingId: "00000000-0000-4000-8000-000000008162",
        name: "联合书院图书馆",
        englishName: null,
        code: null,
        aliases: [],
        anchor: null,
        floors: [
          {
            floorId: "00000000-0000-4000-8000-000000008163",
            displayLabel: "1/F",
            sortOrder: 1,
          },
        ],
      },
    ]);
    mocks.getViewer.mockResolvedValue({
      id: "00000000-0000-4000-8000-000000008166",
      role: "admin",
    });
    mocks.getFeedbackPage.mockResolvedValue({
      placeStatus: "retired",
      summary: {
        placeId,
        averageRating: 4.2,
        ratingCount: 5,
        reviewCount: 3,
      },
      page: { items: [], nextCursor: null },
    });
    mocks.getViewerFeedback.mockResolvedValue(null);
  });

  it("uses the current revision for the tombstone reason and exposes lifecycle UI only to a fresh admin", async () => {
    const element = await CampusMapPlacePage({
      params: Promise.resolve({ placeId }),
    });

    expect(element.type).toBe(CampusMapPlaceDetail);
    expect(mocks.getRevision).toHaveBeenCalledWith(placeId, revisionId);
    expect(element.props).toMatchObject({
      placeId,
      retirementReason: "地点已拆除",
      mapHref: "/campus-map?v=1",
      building: { name: "联合书院图书馆", floorLabel: "1/F" },
      isAdmin: true,
      feedback: {
        placeStatus: "retired",
        summary: { averageRating: 4.2, ratingCount: 5, reviewCount: 3 },
      },
    });

    mocks.getViewer.mockResolvedValueOnce({
      id: "00000000-0000-4000-8000-000000008167",
      role: "user",
    });
    const contributorElement = await CampusMapPlacePage({
      params: Promise.resolve({ placeId }),
    });
    expect(contributorElement.props.isAdmin).toBe(false);
  });

  it("serves the safe public feedback projection to a guest without loading a private viewer row", async () => {
    mocks.getViewer.mockResolvedValueOnce(null);

    const element = await CampusMapPlacePage({
      params: Promise.resolve({ placeId }),
      searchParams: Promise.resolve({ reviewsAfter: "opaque-page" }),
    });

    expect(mocks.getFeedbackPage).toHaveBeenCalledWith(placeId, {
      cursor: "opaque-page",
      limit: 10,
    });
    expect(mocks.getViewerFeedback).not.toHaveBeenCalled();
    expect(element.props).toMatchObject({
      viewerCanWrite: false,
      viewerFeedback: null,
      feedbackPageIsPaginated: true,
    });
  });
});
