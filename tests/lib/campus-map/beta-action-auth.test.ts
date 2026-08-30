import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  readBrowse: vi.fn(),
  listBuildings: vi.fn(),
  listPlaces: vi.fn(),
  getCurrentPlace: vi.fn(),
  getOptionalUser: vi.fn(),
  resolveMapping: vi.fn(),
  projectAmapPoiCard: vi.fn(),
}));

vi.mock("@/lib/auth-guard", () => ({
  requireAuth: mocks.requireAuth,
  getOptionalUser: mocks.getOptionalUser,
}));
vi.mock("@/lib/campus-map/browse-projection", () => ({
  readCampusMapBrowse: mocks.readBrowse,
}));
vi.mock("@/lib/campus-map/fact-store", () => ({
  listCampusMapBrowseBuildings: mocks.listBuildings,
  listCampusMapCurrentPlaces: mocks.listPlaces,
  getCampusMapCurrentPlace: mocks.getCurrentPlace,
}));
vi.mock("@/lib/campus-map/provider-mapping-registry", () => ({
  resolveCampusMapProviderSelection: mocks.resolveMapping,
}));
vi.mock("@/lib/campus-map/amap-browse-projection", () => ({
  projectCampusMapAmapPoiCard: mocks.projectAmapPoiCard,
}));
vi.mock("@/lib/campus-map/publish", () => ({
  publishCampusMapChangeset: vi.fn(),
  reconcileCampusMapPublishReceipt: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import {
  loadCampusMapAmapPoiCard,
  loadCampusMapBrowseProjection,
} from "@/lib/campus-map/browse-actions";
import { loadCampusMapEditablePlace } from "@/lib/campus-map/edit-actions";

describe("Campus Map beta server-action authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });
    mocks.readBrowse.mockResolvedValue({ buildings: [], places: [] });
    mocks.getCurrentPlace.mockResolvedValue(null);
  });

  it("rejects anonymous browse requests before reading public projections", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(loadCampusMapBrowseProjection()).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.readBrowse).not.toHaveBeenCalled();
  });

  it("rejects anonymous provider-card requests before mapping lookup", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(
      loadCampusMapAmapPoiCard({
        providerObjectId: "amap-1",
        name: "External POI",
        position: [114.2, 22.4],
      }),
    ).rejects.toThrow("NEXT_REDIRECT");
    expect(mocks.resolveMapping).not.toHaveBeenCalled();
  });

  it("rejects anonymous editable-place reads before accessing facts", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(loadCampusMapEditablePlace("place-1")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.getCurrentPlace).not.toHaveBeenCalled();
  });
});
