import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  readBrowse: vi.fn(),
  listBuildings: vi.fn(),
  listPlaces: vi.fn(),
  getCurrentPlace: vi.fn(),
  getCurrentPlaceCoverViews: vi.fn(),
  getRevisionPhotoViews: vi.fn(),
  getOptionalUser: vi.fn(),
  listProviderMappings: vi.fn(),
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
vi.mock("@/lib/campus-map/place-photos", () => ({
  getCampusMapCurrentPlaceCoverViews: mocks.getCurrentPlaceCoverViews,
  getCampusMapRevisionPhotoViews: mocks.getRevisionPhotoViews,
}));
vi.mock("@/lib/campus-map/provider-mapping-registry", () => ({
  listCampusMapProviderMappings: mocks.listProviderMappings,
}));
vi.mock("@/lib/campus-map/publish", () => ({
  publishCampusMapChangeset: vi.fn(),
  reconcileCampusMapPublishReceipt: vi.fn(),
}));
vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import {
  loadCampusMapAmapHotspotMappings,
  loadCampusMapBrowseProjection,
  loadCampusMapPlaceCover,
} from "@/lib/campus-map/browse-actions";
import { loadCampusMapEditablePlace } from "@/lib/campus-map/edit-actions";

describe("Campus Map beta server-action authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuth.mockResolvedValue({ id: "user-1" });
    mocks.readBrowse.mockResolvedValue({ buildings: [], places: [] });
    mocks.getCurrentPlace.mockResolvedValue(null);
    mocks.getCurrentPlaceCoverViews.mockResolvedValue({});
    mocks.getRevisionPhotoViews.mockResolvedValue({});
    mocks.listProviderMappings.mockResolvedValue([]);
  });

  it("rejects anonymous browse requests before reading public projections", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(loadCampusMapBrowseProjection()).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.readBrowse).not.toHaveBeenCalled();
  });

  it("rejects anonymous cover refreshes before reading Place photos", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(loadCampusMapPlaceCover("place-1")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.getCurrentPlaceCoverViews).not.toHaveBeenCalled();
  });

  it("rejects anonymous mapping reads before accessing the registry", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(loadCampusMapAmapHotspotMappings()).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.listProviderMappings).not.toHaveBeenCalled();
  });

  it("degrades an authenticated mapping read failure to no mappings", async () => {
    mocks.listProviderMappings.mockRejectedValueOnce(new Error("offline"));

    await expect(loadCampusMapAmapHotspotMappings()).resolves.toEqual([]);
  });

  it("rejects anonymous editable-place reads before accessing facts", async () => {
    mocks.requireAuth.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(loadCampusMapEditablePlace("place-1")).rejects.toThrow(
      "NEXT_REDIRECT",
    );
    expect(mocks.getCurrentPlace).not.toHaveBeenCalled();
  });
});
