/**
 * @vitest-environment jsdom
 */
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { StrictMode, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockLoadBrowseProjection,
  mockLoadPlaceCover,
  mockLoadProviderPoiCard,
  mockRequestContributorSetup,
} = vi.hoisted(() => ({
  mockLoadBrowseProjection: vi.fn(),
  mockLoadPlaceCover: vi.fn(),
  mockLoadProviderPoiCard: vi.fn(),
  mockRequestContributorSetup: vi.fn(),
}));

vi.mock("next/script", () => ({
  default: () => null,
}));
vi.mock("@/components/auth/contributor-setup-provider", () => ({
  useContributorSetup: () => ({
    ensureContributorSetup: vi.fn(async () => true),
    requestContributorSetup: mockRequestContributorSetup,
  }),
}));
vi.mock("@/lib/campus-map/edit-actions", () => ({
  identifyCampusMapEditPublisher: vi.fn(async () => ({
    status: "authenticated",
    actorId: "60000000-0000-4000-8000-000000000001",
  })),
  publishCampusMapEdit: vi.fn(),
  reconcileCampusMapEditPublish: vi.fn(async () => ({
    status: "not-committed",
  })),
  loadCampusMapEditablePlace: vi.fn(async (placeId: string) => ({
    placeId,
    baseRevisionId: "72000000-0000-4000-8000-000000000005",
    locationDisplay: null,
    fact: {
      name: "饮水机",
      buildingId: null,
      floorId: null,
      pinType: "water",
      capabilities: [],
      gender: "unknown",
      wheelchairAccess: "unknown",
      audience: "cuhk-member",
      credentialRequirement: "unknown",
      accessSchedule: { kind: "unknown" },
      reservationRequirement: "unknown",
      temporaryStatus: "unknown",
      location: {
        kind: "outdoor-point",
        longitude: 114.2049,
        latitude: 22.4195,
        crs: "wgs84",
        precision: "approximate",
      },
      observedAt: null,
    },
  })),
}));
vi.mock("@/lib/campus-map/browse-actions", () => ({
  loadCampusMapBrowseProjection: mockLoadBrowseProjection,
  loadCampusMapPlaceCover: mockLoadPlaceCover,
  loadCampusMapAmapPoiCard: mockLoadProviderPoiCard,
}));

import { CampusMapRuntime as CampusMapRuntimeView } from "@/components/campus-map/campus-map-runtime";
import {
  identifyCampusMapEditPublisher,
  loadCampusMapEditablePlace,
  publishCampusMapEdit,
  reconcileCampusMapEditPublish,
} from "@/lib/campus-map/edit-actions";
import {
  bindBrowserCampusMapPublishActor,
  readBrowserCampusMapPublishReceiptState,
  writeBrowserCampusMapPublishReceiptState,
} from "@/lib/campus-map/publish-receipt-consumer";
import {
  encodeCampusMapEditSnapshot,
  transitionCampusMapEdit,
} from "@/lib/campus-map/edit-session";
import { projectCampusMapBrowse } from "@/lib/campus-map/browse-projection";
import type { CampusMapCurrentPlace } from "@/lib/campus-map/fact-store";
import type {
  CampusMapPublishFactInput,
  CampusMapPublishSourceInput,
} from "@/lib/campus-map/publish-contract";
import { installAmapRuntime } from "../helpers/amap-runtime";
import { createCampusMapBrowseFixture } from "../helpers/campus-map-browse-projection";

function CampusMapRuntime(props: ComponentProps<typeof CampusMapRuntimeView>) {
  return (
    <CampusMapRuntimeView
      initialBrowseProjection={createCampusMapBrowseFixture()}
      {...props}
    />
  );
}

beforeEach(() => {
  const localStorageValues = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: {
      get length() {
        return localStorageValues.size;
      },
      clear: () => localStorageValues.clear(),
      getItem: (key: string) => localStorageValues.get(key) ?? null,
      key: (index: number) => [...localStorageValues.keys()][index] ?? null,
      removeItem: (key: string) => localStorageValues.delete(key),
      setItem: (key: string, value: string) => {
        localStorageValues.set(key, value);
      },
    } satisfies Storage,
  });
  vi.restoreAllMocks();
  vi.mocked(identifyCampusMapEditPublisher).mockReset();
  vi.mocked(identifyCampusMapEditPublisher).mockResolvedValue({
    status: "authenticated",
    actorId: "60000000-0000-4000-8000-000000000001",
  });
  vi.mocked(publishCampusMapEdit).mockReset();
  vi.mocked(reconcileCampusMapEditPublish).mockReset();
  vi.mocked(reconcileCampusMapEditPublish).mockResolvedValue({
    status: "not-committed",
  });
  mockRequestContributorSetup.mockReset();
  mockRequestContributorSetup.mockResolvedValue("complete");
  mockLoadBrowseProjection.mockReset();
  mockLoadBrowseProjection.mockImplementation(async () =>
    createCampusMapBrowseFixture(),
  );
  mockLoadPlaceCover.mockReset();
  mockLoadPlaceCover.mockResolvedValue(null);
  mockLoadProviderPoiCard.mockReset();
  window.sessionStorage.clear();
  Object.defineProperty(navigator, "locks", {
    configurable: true,
    value: {
      request: async (_name: string, work: () => Promise<unknown>) => work(),
    },
  });
  window.history.replaceState(null, "", "/campus-map");
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        configured: true,
        key: "test-key",
        serviceHost: "/_AMapService",
      }),
    }),
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(async () => {
  cleanup();
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  });
  document
    .querySelectorAll("script[data-amap-campus]")
    .forEach((script) => script.remove());
  vi.unstubAllGlobals();
});

async function selectScienceCentre() {
  const search = screen.getByPlaceholderText("搜索建筑或地点…");
  fireEvent.change(search, { target: { value: "科学馆" } });
  fireEvent.submit(search.closest("form")!);
  const result = await screen.findByRole("button", { name: /科学馆/ });
  fireEvent.click(result);
  await screen.findByRole("heading", { name: "科学馆" });
}

async function selectScienceCentreForAdd() {
  fireEvent.click(await screen.findByRole("button", { name: "这是室外设施" }));
  fireEvent.click(screen.getByRole("button", { name: "输入坐标" }));
  fireEvent.change(screen.getByRole("textbox", { name: "经度（WGS84）" }), {
    target: { value: "114.20801" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "纬度（WGS84）" }), {
    target: { value: "22.41966" },
  });
  fireEvent.click(screen.getByRole("button", { name: "使用输入坐标" }));
  await screen.findByRole("heading", { name: "新增设施" });
}

function formalCurrentFactsProjection() {
  const buildingId = "10000000-0000-4000-8000-000000000010";
  const floorId = "20000000-0000-4000-8000-000000000010";
  const secondFloorId = "20000000-0000-4000-8000-000000000011";
  const currentPlace = (
    placeId: string,
    name: string,
    floor: { id: string; label: string; sortOrder: number },
  ): CampusMapCurrentPlace => ({
    id: placeId,
    revisionId: placeId.replace("30000000", "40000000"),
    factSchemaVersion: 1,
    name,
    pinType: "toilet",
    capabilities: [],
    access: {
      audience: "public",
      credentialRequirement: "none",
      schedule: { kind: "unknown" },
      reservationRequirement: "none",
      temporaryStatus: "normal",
    },
    facets: { gender: "unknown", wheelchairAccess: "unknown" },
    location: {
      kind: "floor",
      building: {
        id: buildingId,
        name: "何善衡工程学大楼",
        englishName: "Ho Sin-Hang Engineering Building",
        code: "ERB",
      },
      floor: {
        id: floor.id,
        displayLabel: floor.label,
        sortOrder: floor.sortOrder,
      },
    },
    observedAt: null,
    verifiedAt: null,
    publishedAt: new Date("2026-08-26T00:00:00.000Z"),
    provenance: [],
  });
  return projectCampusMapBrowse({
    buildings: [
      {
        buildingId,
        name: "何善衡工程学大楼",
        englishName: "Ho Sin-Hang Engineering Building",
        code: "ERB",
        aliases: ["Engineering Building"],
        anchor: {
          longitude: 114.2101,
          latitude: 22.4181,
          crs: "wgs84",
        },
        floors: [
          { floorId, displayLabel: "1/F", sortOrder: 1 },
          { floorId: secondFloorId, displayLabel: "2/F", sortOrder: 2 },
        ],
      },
    ],
    places: [
      currentPlace("30000000-0000-4000-8000-000000000010", "东翼洗手间", {
        id: floorId,
        label: "1/F",
        sortOrder: 1,
      }),
      currentPlace("30000000-0000-4000-8000-000000000011", "西翼洗手间", {
        id: secondFloorId,
        label: "2/F",
        sortOrder: 2,
      }),
    ],
  });
}

function duplicateBuildingNameProjection() {
  const buildingName = "卫星遥感地面接收站";
  const buildingEnglishName = "Satellite Remote Sensing Receiving Station";
  const westBuildingId = "10000000-0000-4000-8000-000000000040";
  const eastBuildingId = "10000000-0000-4000-8000-000000000013";
  const floorId = "20000000-0000-4000-8000-000000000040";
  const facility: CampusMapCurrentPlace = {
    id: "30000000-0000-4000-8000-000000000040",
    revisionId: "40000000-0000-4000-8000-000000000040",
    factSchemaVersion: 1,
    name: "西区饮水机",
    pinType: "water",
    capabilities: [],
    access: {
      audience: "public",
      credentialRequirement: "none",
      schedule: { kind: "always" },
      reservationRequirement: "none",
      temporaryStatus: "normal",
    },
    facets: { gender: "unknown", wheelchairAccess: "unknown" },
    location: {
      kind: "floor",
      building: {
        id: westBuildingId,
        name: buildingName,
        englishName: buildingEnglishName,
        code: "H40",
      },
      floor: { id: floorId, displayLabel: "1/F", sortOrder: 1 },
    },
    observedAt: null,
    verifiedAt: null,
    publishedAt: new Date("2026-08-26T00:00:00.000Z"),
    provenance: [],
  };

  return projectCampusMapBrowse({
    buildings: [
      {
        buildingId: westBuildingId,
        name: buildingName,
        englishName: buildingEnglishName,
        code: "H40",
        aliases: [],
        anchor: { longitude: 114.2, latitude: 22.42, crs: "wgs84" },
        floors: [{ floorId, displayLabel: "1/F", sortOrder: 1 }],
      },
      {
        buildingId: eastBuildingId,
        name: buildingName,
        englishName: buildingEnglishName,
        code: "E13",
        aliases: [],
        anchor: { longitude: 114.21, latitude: 22.42, crs: "wgs84" },
        floors: [],
      },
    ],
    places: [facility],
  });
}

function emptyBuildingProjection() {
  return projectCampusMapBrowse({
    buildings: [
      {
        buildingId: "10000000-0000-4000-8000-000000000012",
        name: "空置测试楼",
        englishName: "Empty Test Building",
        code: "EMPTY",
        aliases: [],
        anchor: {
          longitude: 114.2101,
          latitude: 22.4181,
          crs: "wgs84",
        },
        floors: [],
      },
    ],
    places: [],
  });
}

function publishedOutdoorProjectionFor(
  places: Array<{ id: string; name: string }>,
) {
  return projectCampusMapBrowse({
    buildings: [],
    places: places.map(
      ({ id, name }) =>
        ({
          id,
          revisionId: "40000000-0000-4000-8000-000000000020",
          factSchemaVersion: 1,
          name,
          pinType: "water",
          capabilities: [],
          access: {
            audience: "public",
            credentialRequirement: "none",
            schedule: { kind: "unknown" },
            reservationRequirement: "none",
            temporaryStatus: "normal",
          },
          facets: { gender: "unknown", wheelchairAccess: "unknown" },
          location: {
            kind: "outdoor-point",
            point: {
              longitude: 114.21,
              latitude: 22.42,
              crs: "wgs84",
              precision: "approximate",
            },
          },
          observedAt: null,
          verifiedAt: null,
          publishedAt: new Date("2026-08-26T00:00:00.000Z"),
          provenance: [],
        }) satisfies CampusMapCurrentPlace,
    ),
  });
}

function publishedOutdoorProjection(placeId: string) {
  return publishedOutdoorProjectionFor([{ id: placeId, name: "新发布饮水点" }]);
}

function mixedWaterProjection() {
  const buildings = createCampusMapBrowseFixture();
  const outdoor = publishedOutdoorProjection(
    "30000000-0000-4000-8000-000000000021",
  );
  return {
    ...buildings,
    places: [...buildings.places, ...outdoor.places],
    markers: [...buildings.markers, ...outdoor.markers],
  };
}

describe("CampusMapRuntime", () => {
  it("renders category results as name, location, and rating summary without repeating the known category", async () => {
    const placeId = "71000000-0000-4000-8000-000000000002";
    render(
      <CampusMapRuntime
        initialFeedbackSummaries={{
          [placeId]: {
            placeId,
            averageRating: 4.4,
            ratingCount: 5,
            reviewCount: 3,
          },
        }}
        initialPlaceCovers={{
          [placeId]: {
            id: "71000000-0000-4000-8000-000000000818",
            url: "/api/campus-map/place-photos/71000000-0000-4000-8000-000000000818/full",
            thumbnailUrl:
              "/api/campus-map/place-photos/71000000-0000-4000-8000-000000000818/thumbnail",
            width: 1200,
            height: 800,
            thumbnailWidth: 480,
            thumbnailHeight: 320,
            role: "overview",
            sortOrder: 0,
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    const result = await screen.findByRole("button", {
      name: /饮水机.*科学馆 · 1\/F.*4.4 分 · 5 个评分 · 3 条评价/u,
    });
    expect(result.textContent).not.toContain("饮水点");
    expect(result.querySelector("img")?.getAttribute("alt")).toBe("");
    expect(result.querySelector("img")?.getAttribute("src")).toContain(
      "place-photos",
    );
  });

  it("rejects a malformed persisted publish receipt", () => {
    const idempotencyKey = "10000000-0000-4000-8000-000000000099";
    window.localStorage.setItem(
      `cupedia:campus-map:publish-receipt:v1:${idempotencyKey}`,
      JSON.stringify({
        phase: "completed",
        receipt: {
          status: "published",
          changesetId: "50000000-0000-4000-8000-000000000099",
          changes: [{}],
          warnings: [],
          suggestions: [],
        },
      }),
    );

    expect(readBrowserCampusMapPublishReceiptState(idempotencyKey)).toBeNull();
  });

  it("uses the formal edit schema labels for browse categories", () => {
    render(<CampusMapRuntime />);

    expect(screen.getByRole("button", { name: "饮水点" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "打印服务" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "打印机" })).toBeNull();
  });

  it("describes the combined Building and Place search interface", () => {
    render(<CampusMapRuntime />);

    const search = screen.getByRole("textbox", {
      name: "搜索建筑或地点",
    });
    expect(search.getAttribute("placeholder")).toBe("搜索建筑或地点…");
    expect(search.getAttribute("name")).toBe("campus-map-search");
    expect(search.getAttribute("autocomplete")).toBe("off");
  });

  it("uses plain language when search has no results", async () => {
    render(<CampusMapRuntime />);

    fireEvent.change(screen.getByPlaceholderText("搜索建筑或地点…"), {
      target: { value: "不存在的地点" },
    });

    expect(await screen.findByText("没有找到建筑或地点")).not.toBeNull();
    expect(screen.queryByText(/正式建筑或设施/)).toBeNull();
  });

  it("keeps a unique building code searchable without repeating it in the UI", async () => {
    render(<CampusMapRuntime />);

    fireEvent.change(screen.getByPlaceholderText("搜索建筑或地点…"), {
      target: { value: "H10" },
    });
    const result = await screen.findByRole("button", { name: /科学馆/u });

    expect(result.textContent).toContain("科学馆");
    expect(result.textContent).not.toContain("H10");

    fireEvent.click(result);
    const heading = await screen.findByRole("heading", { name: "科学馆" });
    expect(heading.closest("section")?.textContent).not.toContain("H10");
  });

  it("keeps the qualifier on facilities inside duplicate-name buildings", async () => {
    render(
      <CampusMapRuntime
        initialBrowseProjection={duplicateBuildingNameProjection()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("搜索建筑或地点…"), {
      target: { value: "西区饮水机" },
    });
    const result = await screen.findByRole("button", {
      name: /西区饮水机.*卫星遥感地面接收站（H40）/u,
    });
    expect(result.textContent).not.toContain("E13");

    fireEvent.click(result);
    const heading = await screen.findByRole("heading", { name: "西区饮水机" });
    expect(heading.closest("section")?.textContent).toContain(
      "卫星遥感地面接收站（H40）",
    );
  });

  it("makes places the primary Building-card content and lists each Place separately", async () => {
    render(
      <CampusMapRuntime
        initialBrowseProjection={formalCurrentFactsProjection()}
      />,
    );
    const search = screen.getByPlaceholderText("搜索建筑或地点…");
    fireEvent.change(search, { target: { value: "何善衡工程学大楼" } });
    const buildingResult = await waitFor(() =>
      document.querySelector(
        '[data-search-result="10000000-0000-4000-8000-000000000010"]',
      ),
    );
    fireEvent.click(buildingResult!);
    const buildingHeading = await screen.findByRole("heading", {
      name: "何善衡工程学大楼",
    });

    expect(document.activeElement).toBe(buildingHeading);
    expect(screen.getByText("Ho Sin-Hang Engineering Building")).not.toBeNull();
    expect(screen.queryByText(/Current facts/i)).toBeNull();
    const facilityTypeSummary = screen.getByRole("list", {
      name: "楼内设施",
    });
    expect(facilityTypeSummary.textContent).toContain("洗手间");
    expect(facilityTypeSummary.textContent).toContain("2 处");
    expect(screen.queryByText("2 处设施")).toBeNull();
    const addFacility = screen.getByRole("button", {
      name: "在何善衡工程学大楼新增设施",
    });
    expect(addFacility.textContent).toBe("新增");
    const buildingPreview = await waitFor(() =>
      document.querySelector("[data-building-preview]"),
    );
    expect(buildingPreview?.textContent).toContain("东翼洗手间");
    expect(buildingPreview?.textContent).toContain("1/F");
    expect(buildingPreview?.getAttribute("data-return-result")).toBe(
      "30000000-0000-4000-8000-000000000010",
    );
    expect(buildingPreview?.className).toContain("py-1");
    const buildingCta = screen.getByRole("button", {
      name: "查看全部楼内设施",
    });
    expect(buildingCta).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "展开地点卡片" }));

    expect(screen.getByRole("heading", { name: "1/F" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "2/F" })).not.toBeNull();
    expect(screen.queryByRole("heading", { name: "建筑内设施" })).toBeNull();
    expect(screen.getByRole("button", { name: /东翼洗手间/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /西翼洗手间/ })).not.toBeNull();
  });

  it("keeps an empty Building card informative without offering a zero-item expansion", async () => {
    render(
      <CampusMapRuntime initialBrowseProjection={emptyBuildingProjection()} />,
    );
    const search = screen.getByPlaceholderText("搜索建筑或地点…");
    fireEvent.change(search, { target: { value: "空置测试楼" } });
    fireEvent.click(await screen.findByRole("button", { name: /空置测试楼/ }));

    expect(
      await screen.findByRole("heading", { name: "空置测试楼" }),
    ).not.toBeNull();
    expect(screen.getByText("暂未收录设施")).not.toBeNull();
    expect(screen.queryByText("正式校舍资料")).toBeNull();
    expect(screen.queryByRole("button", { name: "查看 0 项设施" })).toBeNull();
    expect(screen.queryByRole("button", { name: "展开地点卡片" })).toBeNull();
    expect(
      screen.getByRole("button", { name: "在空置测试楼新增第一处设施" }),
    ).not.toBeNull();
  });

  it("shows refresh and read-error states for a Building that was previously empty", async () => {
    const buildingId = "10000000-0000-4000-8000-000000000012";
    const placeId = "30000000-0000-4000-8000-000000000029";
    const idempotencyKey = "10000000-0000-4000-8000-000000000029";
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey,
    }).session!;
    const positioned = transitionCampusMapEdit(started, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.208,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    }).session!;
    const publishing = transitionCampusMapEdit(positioned, {
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-27",
    }).session!;
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(publishing),
    );
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&task=create&anchor=map",
    );
    vi.mocked(reconcileCampusMapEditPublish).mockResolvedValueOnce({
      status: "committed",
      receipt: {
        status: "published",
        changesetId: "50000000-0000-4000-8000-000000000029",
        changes: [
          {
            placeId,
            revisionId: "40000000-0000-4000-8000-000000000029",
          },
        ],
        warnings: [],
        suggestions: [],
      },
    });
    let rejectRefresh!: (reason?: unknown) => void;
    mockLoadBrowseProjection.mockReturnValueOnce(
      new Promise<ReturnType<typeof emptyBuildingProjection>>(
        (_resolve, reject) => {
          rejectRefresh = reject;
        },
      ),
    );

    render(
      <CampusMapRuntime
        initialSearch={window.location.search}
        initialBrowseProjection={emptyBuildingProjection()}
      />,
    );
    await waitFor(() =>
      expect(mockLoadBrowseProjection).toHaveBeenCalledOnce(),
    );

    await act(async () => {
      window.history.replaceState(
        window.history.state,
        "",
        `/campus-map?v=1&scene=building&id=${buildingId}&snap=peek`,
      );
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state }),
      );
      await Promise.resolve();
    });

    expect(
      await screen.findByRole("heading", { name: "空置测试楼" }),
    ).toBeTruthy();
    expect(screen.getByRole("status").textContent).toContain(
      "正在读取楼内设施",
    );
    expect(screen.queryByText("暂未收录设施")).toBeNull();
    expect(screen.queryByRole("button", { name: "展开地点卡片" })).toBeNull();

    await act(async () => {
      rejectRefresh(new Error("temporary read failure"));
      await Promise.resolve();
    });

    expect((await screen.findByRole("alert")).textContent).toContain(
      "无法读取楼内设施",
    );
    expect(screen.getByRole("button", { name: "重新读取" })).toBeTruthy();
    expect(screen.queryByText("暂未收录设施")).toBeNull();
  });

  it("exposes every Place action as an accessible control", async () => {
    const placeId = "71000000-0000-4000-8000-000000000005";
    render(
      <CampusMapRuntime
        initialSearch={`?v=1&scene=place&id=${placeId}&snap=peek`}
      />,
    );

    await screen.findByRole("heading", { name: "饮水机" });
    expect(screen.queryByRole("button", { name: "展开地点卡片" })).toBeNull();
    expect(screen.queryByText("G/F")).toBeNull();
    expect(screen.queryByText(/开放条件未完全核实/)).toBeNull();
    expect(screen.queryByText(/尚无室内精确坐标/)).toBeNull();
    expect(
      screen.getByRole("button", { name: "建议修改" }).hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen
        .getByRole("button", { name: "定位所属建筑" })
        .hasAttribute("disabled"),
    ).toBe(false);
    expect(
      screen.getByRole("link", { name: "查看完整详情" }).getAttribute("href"),
    ).toBe(`/campus-map/places/${placeId}`);
    const actions = screen.getByRole("group", { name: "地点操作" });
    const controls = Array.from(actions.children) as HTMLElement[];
    expect(controls.map((control) => control.textContent)).toEqual([
      "查看完整详情",
      "定位所属建筑",
      "建议修改",
    ]);
    expect(
      controls.every((control) => control.classList.contains("min-h-11")),
    ).toBe(true);
    expect(controls[0]?.classList.contains("bg-[#174b38]")).toBe(true);
    expect(controls[1]?.classList.contains("border-[#174b38]")).toBe(true);
    expect(controls[2]?.classList.contains("text-neutral-700")).toBe(true);
    expect(
      controls[2]?.className
        .split(" ")
        .some((token) => /(?:^|:)(?:bg|border|text)-(?:red|rose)-/.test(token)),
    ).toBe(false);
  });

  it("refetches Current facts after publish so the Building Place is searchable", async () => {
    installAmapRuntime();
    const placeId = "71000000-0000-4000-8000-000000000005";
    const initialProjectionObserver = vi.fn();
    const latestProjectionObserver = vi.fn();
    const publishedProjection = createCampusMapBrowseFixture();
    const initialBrowseProjection = {
      ...publishedProjection,
      places: [],
      markers: [],
    };
    vi.mocked(publishCampusMapEdit).mockResolvedValueOnce({
      status: "published",
      changesetId: "50000000-0000-4000-8000-000000000020",
      changes: [
        {
          placeId,
          revisionId: "40000000-0000-4000-8000-000000000020",
        },
      ],
      warnings: [],
      suggestions: [],
    });
    mockLoadBrowseProjection.mockResolvedValueOnce(publishedProjection);
    const { rerender } = render(
      <CampusMapRuntime
        initialBrowseProjection={initialBrowseProjection}
        onPublishedProjectionRefreshed={initialProjectionObserver}
      />,
    );
    rerender(
      <CampusMapRuntime
        initialBrowseProjection={initialBrowseProjection}
        onPublishedProjectionRefreshed={latestProjectionObserver}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    await selectScienceCentreForAdd();
    fireEvent.click(screen.getByRole("radio", { name: "饮水点" }));
    fireEvent.click(screen.getByRole("button", { name: "发布设施" }));

    await waitFor(() =>
      expect(mockLoadBrowseProjection).toHaveBeenCalledOnce(),
    );
    expect(mockLoadBrowseProjection).toHaveBeenCalledAfter(
      vi.mocked(publishCampusMapEdit),
    );
    await act(async () => {
      await mockLoadBrowseProjection.mock.results[0]!.value;
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(latestProjectionObserver).toHaveBeenCalledWith({
        status: "applied",
        selectionTarget: {
          kind: "place",
          placeId,
          buildingId: "university-library",
          floorId: "G",
        },
      }),
    );
    expect(initialProjectionObserver).not.toHaveBeenCalled();
    await screen.findByRole("heading", { name: "饮水机" });
    const publishStatus = screen.getByRole("status");
    expect(publishStatus.textContent).toContain("已添加到 大学图书馆 · G/F");
    expect(
      document.querySelector('[aria-live="polite"]')?.textContent,
    ).not.toContain("已添加到");
    expect(screen.getByText("饮水点 · 大学图书馆 · G/F")).not.toBeNull();
    expect(screen.queryByText("PUBLISHED")).toBeNull();
    expect(
      screen.queryByRole("link", { name: "查看此次 Changeset" }),
    ).toBeNull();
    expect(window.location.search).toContain(`scene=place&id=${placeId}`);
    const search = screen.getByPlaceholderText("搜索建筑或地点…");
    expect(search.closest("header")?.hasAttribute("inert")).toBe(false);
    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state }),
      );
      await Promise.resolve();
    });
    const activeSearch = screen.getByPlaceholderText("搜索建筑或地点…");
    fireEvent.change(activeSearch, { target: { value: "饮水机" } });
    fireEvent.submit(activeSearch.closest("form")!);

    await waitFor(() =>
      expect(window.location.search).toContain("scene=search"),
    );
    expect(screen.queryByRole("status")).toBeNull();
    expect(
      document.querySelector('[aria-live="polite"]')?.textContent,
    ).not.toContain("正在发布地点资料");
    await waitFor(() =>
      expect(
        document.querySelector(`[data-search-result="${placeId}"]`),
      ).not.toBeNull(),
    );
    const result = document.querySelector<HTMLButtonElement>(
      `[data-search-result="${placeId}"]`,
    );
    expect(result).not.toBeNull();
    fireEvent.click(result!);
    expect(
      await screen.findByRole("heading", { name: "饮水机" }),
    ).not.toBeNull();
    expect(window.location.search).toContain(`scene=place&id=${placeId}`);
  });

  it("reconciles a publishing snapshot after remount when its browser actor binding was lost", async () => {
    const placeId = "30000000-0000-4000-8000-000000000021";
    const idempotencyKey = "10000000-0000-4000-8000-000000000021";
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey,
    }).session!;
    const positioned = transitionCampusMapEdit(started, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.208,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    }).session!;
    const publishing = transitionCampusMapEdit(positioned, {
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-27",
    }).session!;
    const receipt = {
      status: "published" as const,
      changesetId: "50000000-0000-4000-8000-000000000021",
      changes: [
        {
          placeId,
          revisionId: "40000000-0000-4000-8000-000000000021",
        },
      ],
      warnings: [],
      suggestions: [],
    };
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(publishing),
    );
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&task=create&anchor=map",
    );
    vi.mocked(reconcileCampusMapEditPublish).mockResolvedValueOnce({
      status: "committed",
      receipt,
    });
    mockLoadBrowseProjection.mockResolvedValueOnce(
      publishedOutdoorProjection(placeId),
    );

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    expect(
      await screen.findByRole("heading", { name: "新发布饮水点" }),
    ).toBeTruthy();
    expect(window.location.search).toContain(`scene=place&id=${placeId}`);
    expect(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1"),
    ).toBeNull();
    expect(reconcileCampusMapEditPublish).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey }),
      "60000000-0000-4000-8000-000000000001",
    );
    expect(publishCampusMapEdit).not.toHaveBeenCalled();
  });

  it("ends a stale task without replaying a completed receipt in a duplicate tab", async () => {
    const placeId = "30000000-0000-4000-8000-000000000026";
    const idempotencyKey = "10000000-0000-4000-8000-000000000026";
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey,
    }).session!;
    const positioned = transitionCampusMapEdit(started, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.208,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    }).session!;
    const publishing = transitionCampusMapEdit(positioned, {
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-27",
    }).session!;
    const receipt = {
      status: "published" as const,
      changesetId: "50000000-0000-4000-8000-000000000026",
      changes: [
        {
          placeId,
          revisionId: "40000000-0000-4000-8000-000000000026",
        },
      ],
      warnings: [],
      suggestions: [],
    };
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(publishing),
    );
    bindBrowserCampusMapPublishActor(
      idempotencyKey,
      "60000000-0000-4000-8000-000000000001",
    );
    writeBrowserCampusMapPublishReceiptState(idempotencyKey, {
      phase: "completed",
      receipt,
    });
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&task=create&anchor=map",
    );
    vi.mocked(reconcileCampusMapEditPublish).mockResolvedValueOnce({
      status: "committed",
      receipt,
    });

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    await waitFor(() =>
      expect(
        window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1"),
      ).toBeNull(),
    );
    expect(window.location.search).not.toContain("task=create");
    expect(window.location.search).not.toContain(`id=${placeId}`);
    expect(mockLoadBrowseProjection).not.toHaveBeenCalled();
    expect(publishCampusMapEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "新增设施" })).toBeNull();
  });

  it("keeps newer B navigation when A publish handoff is superseded", async () => {
    const publishedPlaceId = "30000000-0000-4000-8000-000000000027";
    const newerPlaceId = "30000000-0000-4000-8000-000000000028";
    const idempotencyKey = "10000000-0000-4000-8000-000000000027";
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey,
    }).session!;
    const positioned = transitionCampusMapEdit(started, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.208,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    }).session!;
    const publishing = transitionCampusMapEdit(positioned, {
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-27",
    }).session!;
    const receipt = {
      status: "published" as const,
      changesetId: "50000000-0000-4000-8000-000000000027",
      changes: [
        {
          placeId: publishedPlaceId,
          revisionId: "40000000-0000-4000-8000-000000000027",
        },
      ],
      warnings: [],
      suggestions: [],
    };
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(publishing),
    );
    bindBrowserCampusMapPublishActor(
      idempotencyKey,
      "60000000-0000-4000-8000-000000000001",
    );
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&task=create&anchor=map",
    );
    vi.mocked(reconcileCampusMapEditPublish).mockResolvedValueOnce({
      status: "committed",
      receipt,
    });
    let resolveRefresh!: (
      value: ReturnType<typeof publishedOutdoorProjectionFor>,
    ) => void;
    mockLoadBrowseProjection.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    render(
      <CampusMapRuntime
        initialSearch={window.location.search}
        initialBrowseProjection={publishedOutdoorProjectionFor([
          { id: newerPlaceId, name: "较新的导航地点" },
        ])}
      />,
    );

    await waitFor(() =>
      expect(mockLoadBrowseProjection).toHaveBeenCalledOnce(),
    );
    window.history.replaceState(
      window.history.state,
      "",
      `/campus-map?v=1&scene=place&id=${newerPlaceId}&snap=peek`,
    );
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: window.history.state }),
    );
    expect(
      await screen.findByRole("heading", { name: "较新的导航地点" }),
    ).toBeTruthy();

    resolveRefresh(
      publishedOutdoorProjectionFor([
        { id: publishedPlaceId, name: "迟到的 A 发布地点" },
        { id: newerPlaceId, name: "较新的导航地点" },
      ]),
    );

    await waitFor(() =>
      expect(
        window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1"),
      ).toBeNull(),
    );
    expect(window.location.search).toContain(`id=${newerPlaceId}`);
    expect(
      screen.getByRole("heading", { name: "较新的导航地点" }),
    ).toBeTruthy();
    expect(screen.queryByText("正在确认发布结果")).toBeNull();
    expect(screen.queryByText("正在发布地点资料")).toBeNull();
    expect(screen.queryByLabelText("关闭地图编辑")).toBeNull();
  });

  it("keeps newer B editing when restored A is already consumed", async () => {
    const publishedPlaceId = "30000000-0000-4000-8000-000000000057";
    const idempotencyKey = "10000000-0000-4000-8000-000000000057";
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey,
    }).session!;
    const positioned = transitionCampusMapEdit(started, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.208,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    }).session!;
    const publishing = transitionCampusMapEdit(positioned, {
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-27",
    }).session!;
    const receipt = {
      status: "published" as const,
      changesetId: "50000000-0000-4000-8000-000000000057",
      changes: [
        {
          placeId: publishedPlaceId,
          revisionId: "40000000-0000-4000-8000-000000000057",
        },
      ],
      warnings: [],
      suggestions: [],
    };
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(publishing),
    );
    bindBrowserCampusMapPublishActor(
      idempotencyKey,
      "60000000-0000-4000-8000-000000000001",
    );
    writeBrowserCampusMapPublishReceiptState(idempotencyKey, {
      phase: "completed",
      receipt,
    });
    vi.mocked(reconcileCampusMapEditPublish).mockResolvedValueOnce({
      status: "committed",
      receipt,
    });
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&task=create&anchor=map",
    );
    let resolveIdentity!: () => void;
    vi.mocked(identifyCampusMapEditPublisher).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveIdentity = () =>
          resolve({
            status: "authenticated",
            actorId: "60000000-0000-4000-8000-000000000001",
          });
      }),
    );

    render(<CampusMapRuntime initialSearch={window.location.search} />);
    await waitFor(() =>
      expect(identifyCampusMapEditPublisher).toHaveBeenCalledOnce(),
    );

    window.history.replaceState(null, "", "/campus-map");
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: window.history.state }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "新增设施" }));
    await selectScienceCentreForAdd();
    fireEvent.click(screen.getByRole("radio", { name: "打印服务" }));
    const replacementSnapshot = window.sessionStorage.getItem(
      "cupedia:campus-map:edit-session:v1",
    );

    await act(async () => resolveIdentity());

    await waitFor(() =>
      expect(window.location.search).toContain("task=create"),
    );
    expect(
      (screen.getByRole("radio", { name: "打印服务" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1"),
    ).toBe(replacementSnapshot);
  });

  it("drops queued edit focus and announcements after newer navigation", async () => {
    render(<CampusMapRuntime />);

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    const queuedFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    });
    const focusSpy = vi.spyOn(HTMLElement.prototype, "focus");
    const contributionTitle = document.querySelector<HTMLElement>(
      "#campus-map-panel-title",
    );

    await selectScienceCentreForAdd();
    window.history.replaceState(null, "", "/campus-map");
    window.dispatchEvent(
      new PopStateEvent("popstate", { state: window.history.state }),
    );

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      while (queuedFrames.length > 0) {
        queuedFrames.shift()!(0);
        await Promise.resolve();
      }
    });

    expect(screen.queryByText("位置已锁定，请填写地点资料")).toBeNull();
    expect(focusSpy.mock.instances).not.toContain(contributionTitle);
    focusSpy.mockRestore();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
  });

  it("rechecks an unknown publish snapshot after refresh", async () => {
    const idempotencyKey = "10000000-0000-4000-8000-000000000029";
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey,
    }).session!;
    const positioned = transitionCampusMapEdit(started, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.208,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    }).session!;
    const publishing = transitionCampusMapEdit(positioned, {
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-27",
    }).session!;
    const unknown = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RECOVERY_RESULT",
      idempotencyKey,
      reason: "reconciliation-unavailable",
    }).session!;
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(unknown),
    );
    bindBrowserCampusMapPublishActor(
      idempotencyKey,
      "60000000-0000-4000-8000-000000000001",
    );
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&task=create&anchor=map",
    );
    vi.mocked(reconcileCampusMapEditPublish).mockResolvedValueOnce({
      status: "unavailable",
    });

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    expect(
      await screen.findByRole("button", { name: "检查发布结果" }),
    ).toBeTruthy();
    expect(reconcileCampusMapEditPublish).toHaveBeenCalledOnce();
    expect(publishCampusMapEdit).not.toHaveBeenCalled();
    expect(
      JSON.parse(
        window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
      ).session,
    ).toMatchObject({
      status: "publish-unknown",
      publishFeedbackReason: "reconciliation-unavailable",
    });
  });

  it("finishes a refreshed unknown publish when the original result is found", async () => {
    const placeId = "30000000-0000-4000-8000-000000000059";
    const idempotencyKey = "10000000-0000-4000-8000-000000000059";
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey,
    }).session!;
    const positioned = transitionCampusMapEdit(started, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.208,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    }).session!;
    const publishing = transitionCampusMapEdit(positioned, {
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-27",
    }).session!;
    const unknown = transitionCampusMapEdit(publishing, {
      type: "PUBLISH_RECOVERY_RESULT",
      idempotencyKey,
      reason: "reconciliation-unavailable",
    }).session!;
    const receipt = {
      status: "published" as const,
      changesetId: "50000000-0000-4000-8000-000000000059",
      changes: [
        {
          placeId,
          revisionId: "40000000-0000-4000-8000-000000000059",
        },
      ],
      warnings: [],
      suggestions: [],
    };
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(unknown),
    );
    bindBrowserCampusMapPublishActor(
      idempotencyKey,
      "60000000-0000-4000-8000-000000000001",
    );
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&task=create&anchor=map",
    );
    vi.mocked(reconcileCampusMapEditPublish).mockResolvedValueOnce({
      status: "committed",
      receipt,
    });
    mockLoadBrowseProjection.mockResolvedValueOnce(
      publishedOutdoorProjection(placeId),
    );

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    await waitFor(() =>
      expect(window.location.search).toContain(`id=${placeId}`),
    );
    expect(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1"),
    ).toBeNull();
    expect(screen.queryByText("正在确认发布结果")).toBeNull();
    expect(publishCampusMapEdit).not.toHaveBeenCalled();
  });

  it("discards a publishing snapshot instead of reclaiming selection after remounting on B", async () => {
    const idempotencyKey = "10000000-0000-4000-8000-000000000022";
    const selectedPlaceId = "30000000-0000-4000-8000-000000000022";
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey,
    }).session!;
    const positioned = transitionCampusMapEdit(started, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.208,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    }).session!;
    const publishing = transitionCampusMapEdit(positioned, {
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-27",
    }).session!;
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(publishing),
    );
    bindBrowserCampusMapPublishActor(
      publishing.draft.idempotencyKey,
      "60000000-0000-4000-8000-000000000001",
    );
    window.history.replaceState(
      null,
      "",
      `/campus-map?v=1&scene=place&id=${selectedPlaceId}&snap=peek`,
    );

    render(
      <CampusMapRuntime
        initialSearch={window.location.search}
        initialBrowseProjection={publishedOutdoorProjection(selectedPlaceId)}
      />,
    );

    await waitFor(() =>
      expect(
        window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1"),
      ).toBeNull(),
    );
    expect(window.location.search).toContain(
      `scene=place&id=${selectedPlaceId}`,
    );
    expect(reconcileCampusMapEditPublish).not.toHaveBeenCalled();
    expect(publishCampusMapEdit).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "新增设施" })).toBeNull();
  });

  it("shows an identity mismatch without revealing the restored draft", async () => {
    const idempotencyKey = "10000000-0000-4000-8000-000000000023";
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey,
    }).session!;
    const positioned = transitionCampusMapEdit(started, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.208,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    }).session!;
    const publishing = transitionCampusMapEdit(positioned, {
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-27",
    }).session!;
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(publishing),
    );
    bindBrowserCampusMapPublishActor(
      idempotencyKey,
      "60000000-0000-4000-8000-000000000001",
    );
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&task=create&anchor=map",
    );
    vi.mocked(identifyCampusMapEditPublisher).mockResolvedValueOnce({
      status: "authenticated",
      actorId: "60000000-0000-4000-8000-000000000002",
    });

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    expect(
      await screen.findByText(
        "当前账号与原发布账号不同。为保护隐私，这里不会显示原草稿。",
      ),
    ).toBeTruthy();
    expect(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1"),
    ).toBeNull();
    expect(window.location.search).toContain("task=create");
    expect(document.body.textContent).not.toContain("正在发布地点资料");
    expect(document.body.textContent).not.toContain("饮水机");
    expect(reconcileCampusMapEditPublish).not.toHaveBeenCalled();
    expect(publishCampusMapEdit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "返回地图" }));
    await waitFor(() =>
      expect(window.location.search).not.toContain("task=create"),
    );
  });

  it("presents a later server identity mismatch without restoring draft fields", async () => {
    const idempotencyKey = "10000000-0000-4000-8000-000000000024";
    const started = transitionCampusMapEdit(null, {
      type: "START_ADD",
      idempotencyKey,
    }).session!;
    const positioned = transitionCampusMapEdit(started, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.208,
        latitude: 22.42,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    }).session!;
    const publishing = transitionCampusMapEdit(positioned, {
      type: "REQUEST_PUBLISH",
      accessedOn: "2026-08-27",
    }).session!;
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(publishing),
    );
    bindBrowserCampusMapPublishActor(
      idempotencyKey,
      "60000000-0000-4000-8000-000000000001",
    );
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&task=create&anchor=map",
    );
    vi.mocked(reconcileCampusMapEditPublish).mockResolvedValueOnce({
      status: "identity-mismatch",
    });

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    expect(
      await screen.findByText(
        "当前账号与原发布账号不同。为保护隐私，这里不会显示原草稿。",
      ),
    ).toBeTruthy();
    expect(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1"),
    ).toBeNull();
    expect(window.location.search).toContain("task=create");
    expect(document.body.textContent).not.toContain("正在发布地点资料");
    expect(document.body.textContent).not.toContain("饮水机");
    expect(reconcileCampusMapEditPublish).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey }),
      "60000000-0000-4000-8000-000000000001",
    );
    expect(publishCampusMapEdit).not.toHaveBeenCalled();
  });

  it.each([
    {
      identity: { status: "unavailable" as const },
      message: "暂时无法确认当前登录状态。为保护隐私，这里不会显示草稿。",
      expectedStatus: "publish-identity",
    },
    {
      identity: { status: "authentication-required" as const },
      message: "登录后会回到这份草稿，但不会自动发布。",
      expectedStatus: "authentication-required",
    },
  ])(
    "shows safe identity feedback for $identity.status after refresh",
    async ({ identity, message, expectedStatus }) => {
      const idempotencyKey = "10000000-0000-4000-8000-000000000025";
      const started = transitionCampusMapEdit(null, {
        type: "START_ADD",
        idempotencyKey,
      }).session!;
      const positioned = transitionCampusMapEdit(started, {
        type: "CONFIRM_POSITION",
        position: {
          longitude: 114.208,
          latitude: 22.42,
          crs: "wgs84",
          precision: "approximate",
          method: "keyboard",
        },
      }).session!;
      const publishing = transitionCampusMapEdit(positioned, {
        type: "REQUEST_PUBLISH",
        accessedOn: "2026-08-27",
      }).session!;
      const encoded = encodeCampusMapEditSnapshot(publishing);
      window.sessionStorage.setItem(
        "cupedia:campus-map:edit-session:v1",
        encoded,
      );
      bindBrowserCampusMapPublishActor(
        idempotencyKey,
        "60000000-0000-4000-8000-000000000001",
      );
      window.history.replaceState(
        null,
        "",
        "/campus-map?v=1&task=create&anchor=map",
      );
      vi.mocked(identifyCampusMapEditPublisher).mockResolvedValueOnce(identity);

      render(<CampusMapRuntime initialSearch={window.location.search} />);

      await waitFor(() =>
        expect(identifyCampusMapEditPublisher).toHaveBeenCalledOnce(),
      );
      expect(await screen.findByText(message)).toBeTruthy();
      expect(
        JSON.parse(
          window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1")!,
        ).session.status,
      ).toBe(expectedStatus);
      expect(document.body.textContent).not.toContain("正在发布地点资料");
      expect(document.body.textContent).not.toContain("饮水机");
      expect(reconcileCampusMapEditPublish).not.toHaveBeenCalled();
      expect(publishCampusMapEdit).not.toHaveBeenCalled();
    },
  );

  it("restores standalone Current Place search results from formal data after refresh", async () => {
    const placeId = "30000000-0000-4000-8000-000000000020";

    render(
      <CampusMapRuntime
        initialSearch="?v=1&scene=search&q=新发布饮水点&snap=peek"
        initialBrowseProjection={publishedOutdoorProjection(placeId)}
      />,
    );

    await waitFor(() =>
      expect(
        document.querySelector(`[data-search-result="${placeId}"]`),
      ).not.toBeNull(),
    );
    expect(screen.getByText("新发布饮水点")).not.toBeNull();
    expect(screen.getByText("室外位置")).not.toBeNull();
    expect(screen.queryByText(/校内独立地点/)).toBeNull();
    expect(screen.queryByText(/开放条件未完全核实/)).toBeNull();
    expect(screen.queryByText(/公众可达/)).toBeNull();
    expect(window.location.search).toContain("scene=search");
  });

  it("describes an outdoor category Place without claiming a Building association", async () => {
    const placeId = "30000000-0000-4000-8000-000000000020";

    render(
      <CampusMapRuntime
        initialSearch="?v=1&scene=category&id=water&snap=peek"
        initialBrowseProjection={publishedOutdoorProjection(placeId)}
      />,
    );

    const heading = await screen.findByRole("heading", { name: "饮水点" });
    expect(heading.textContent).toBe("饮水点 · 1 处");
    await waitFor(() => expect(document.activeElement).toBe(heading));
    expect(screen.queryByText(/0 栋建筑/)).toBeNull();
    expect(await screen.findByText("新发布饮水点")).not.toBeNull();
    expect(screen.getByText("室外位置")).not.toBeNull();
    expect(screen.queryByText(/校内独立地点/)).toBeNull();
  });

  it("falls back to the category heading when a restored Place row is not rendered", async () => {
    const places = [1, 2, 3, 4].map((index) => ({
      id: `30000000-0000-4000-8000-00000000003${index}`,
      name: `饮水点 ${index}`,
    }));
    const selected = places[3]!;
    window.history.replaceState(
      { campusMapScene: true, version: 1, depth: 1 },
      "",
      `/campus-map?v=1&scene=place&id=${selected.id}&snap=peek`,
    );
    render(
      <CampusMapRuntime
        initialSearch={window.location.search}
        initialBrowseProjection={publishedOutdoorProjectionFor(places)}
      />,
    );
    await screen.findByRole("heading", { name: selected.name });

    await act(async () => {
      const state = { campusMapScene: true, version: 1, depth: 0 };
      window.history.replaceState(
        state,
        "",
        "/campus-map?v=1&scene=category&id=water&snap=peek",
      );
      window.dispatchEvent(new PopStateEvent("popstate", { state }));
    });

    const categoryHeading = await screen.findByRole("heading", {
      name: "饮水点",
    });
    expect(
      document.querySelector(`[data-return-result="${selected.id}"]`),
    ).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(categoryHeading));
  });

  it("distinguishes outdoor Places from Building-contained category results", async () => {
    render(
      <CampusMapRuntime
        initialSearch="?v=1&scene=category&id=water&snap=peek"
        initialBrowseProjection={mixedWaterProjection()}
      />,
    );

    expect(
      (await screen.findByRole("heading", { name: "饮水点" })).textContent,
    ).toBe("饮水点 · 3 处");
    expect(screen.queryByText(/校园内已收录/)).toBeNull();
    expect(document.querySelectorAll("[data-return-result] svg")).toHaveLength(
      3,
    );
  });

  it("keeps the draft and does not publish when contributor setup is cancelled", async () => {
    mockRequestContributorSetup.mockResolvedValueOnce("cancelled");
    render(<CampusMapRuntime />);

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    await selectScienceCentreForAdd();
    fireEvent.click(screen.getByRole("radio", { name: "洗手间" }));
    fireEvent.click(screen.getByRole("button", { name: "发布设施" }));

    await waitFor(() => expect(mockRequestContributorSetup).toHaveBeenCalled());
    expect(publishCampusMapEdit).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "新增设施" })).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: "洗手间" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("lets the publisher report expired authentication when setup status is unavailable", async () => {
    mockRequestContributorSetup.mockResolvedValueOnce("unavailable");
    vi.mocked(publishCampusMapEdit).mockResolvedValueOnce({
      status: "authentication-required",
      code: "authentication-required",
    });
    render(<CampusMapRuntime />);

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    await selectScienceCentreForAdd();
    fireEvent.click(screen.getByRole("radio", { name: "洗手间" }));
    fireEvent.click(screen.getByRole("button", { name: "发布设施" }));

    expect(
      await screen.findByText("登录后会回到这份草稿，但不会自动发布。"),
    ).toBeTruthy();
    expect(publishCampusMapEdit).toHaveBeenCalledOnce();
  });

  it("reconciles an unknown result before retrying the original command", async () => {
    vi.mocked(publishCampusMapEdit).mockRejectedValueOnce(
      new Error("response lost"),
    );
    vi.mocked(reconcileCampusMapEditPublish).mockResolvedValueOnce({
      status: "unavailable",
    });
    render(<CampusMapRuntime />);

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    await selectScienceCentreForAdd();
    fireEvent.click(screen.getByRole("radio", { name: "洗手间" }));
    const queuedFrames: FrameRequestCallback[] = [];
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      queuedFrames.push(callback);
      return queuedFrames.length;
    });
    fireEvent.click(screen.getByRole("button", { name: "发布设施" }));
    const retry = await screen.findByRole("button", {
      name: "检查发布结果",
    });
    await act(async () => {
      while (queuedFrames.length > 0) {
        queuedFrames.shift()!(0);
        await Promise.resolve();
      }
    });
    expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe(
      "正在确认发布结果，你的修改已经保留",
    );
    await waitFor(() =>
      expect(document.activeElement).toBe(
        retry.closest('[data-edit-field="publish-feedback"]'),
      ),
    );

    vi.mocked(publishCampusMapEdit).mockClear();
    vi.mocked(reconcileCampusMapEditPublish).mockClear();
    vi.mocked(reconcileCampusMapEditPublish).mockResolvedValueOnce({
      status: "not-committed",
    });
    vi.mocked(publishCampusMapEdit).mockResolvedValueOnce({
      status: "authentication-required",
      code: "authentication-required",
    });
    fireEvent.click(retry);
    fireEvent.click(retry);

    await waitFor(() => expect(publishCampusMapEdit).toHaveBeenCalledOnce());
    expect(reconcileCampusMapEditPublish).toHaveBeenCalledOnce();
    expect(
      vi.mocked(reconcileCampusMapEditPublish).mock.invocationCallOrder[0],
    ).toBeLessThan(
      vi.mocked(publishCampusMapEdit).mock.invocationCallOrder[0]!,
    );
  });

  it("does not apply a completed setup check to a replacement edit session", async () => {
    let resolveSetup!: () => void;
    mockRequestContributorSetup.mockReturnValueOnce(
      new Promise<"complete">((resolve) => {
        resolveSetup = () => resolve("complete");
      }),
    );
    render(<CampusMapRuntime />);

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    await selectScienceCentreForAdd();
    fireEvent.click(screen.getByRole("radio", { name: "洗手间" }));
    fireEvent.click(screen.getByRole("button", { name: "发布设施" }));
    await waitFor(() => expect(mockRequestContributorSetup).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "关闭地图编辑" }));
    fireEvent.click(await screen.findByRole("button", { name: "放弃草稿" }));
    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    await selectScienceCentreForAdd();
    fireEvent.click(screen.getByRole("radio", { name: "打印服务" }));

    await act(async () => resolveSetup());

    expect(publishCampusMapEdit).not.toHaveBeenCalled();
    expect(
      (screen.getByRole("radio", { name: "打印服务" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
  });

  it("keeps a replacement Add session when the discarded task's Back completes late", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    render(<CampusMapRuntime />);

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    await selectScienceCentreForAdd();
    fireEvent.click(screen.getByRole("radio", { name: "洗手间" }));
    fireEvent.click(screen.getByRole("button", { name: "关闭地图编辑" }));
    fireEvent.click(await screen.findByRole("button", { name: "放弃草稿" }));
    expect(back).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    await selectScienceCentreForAdd();
    fireEvent.click(screen.getByRole("radio", { name: "打印服务" }));

    window.history.replaceState(null, "", "/campus-map");
    await act(async () => {
      window.dispatchEvent(new PopStateEvent("popstate", { state: null }));
    });

    await waitFor(() =>
      expect(
        (screen.getByRole("radio", { name: "打印服务" }) as HTMLInputElement)
          .checked,
      ).toBe(true),
    );
    expect(window.location.search).toContain("task=create");
    expect(
      screen.queryByRole("heading", { name: "放弃未发布的修改？" }),
    ).toBeNull();
  });

  it("asks the server to discard unbound photos when a draft is abandoned", async () => {
    const assetId = "71000000-0000-4000-8000-000000000862";
    const started = transitionCampusMapEdit(null, {
      type: "START_FACILITY_ADD",
      idempotencyKey: "10000000-0000-4000-8000-000000000862",
      entry: { kind: "global" },
    }).session!;
    const placing = transitionCampusMapEdit(started, {
      type: "START_OUTDOOR_PLACEMENT",
    }).session!;
    const positioned = transitionCampusMapEdit(placing, {
      type: "CONFIRM_POSITION",
      position: {
        longitude: 114.20801,
        latitude: 22.41966,
        crs: "wgs84",
        precision: "approximate",
        method: "keyboard",
      },
    }).session!;
    const withPhoto = transitionCampusMapEdit(positioned, {
      type: "CHANGE_PHOTOS",
      photos: [{ assetId, role: "overview" }],
    }).session!;
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(withPhoto),
    );
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&task=create&anchor=map",
    );

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    await screen.findByRole("heading", { name: "新增设施" });
    fireEvent.click(screen.getByRole("button", { name: "关闭地图编辑" }));
    fireEvent.click(await screen.findByRole("button", { name: "放弃草稿" }));

    await waitFor(() => {
      const discardCall = vi
        .mocked(fetch)
        .mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(discardCall).toBeTruthy();
      expect(JSON.parse(String(discardCall?.[1]?.body))).toEqual({
        assetIds: [assetId],
      });
      expect(discardCall?.[1]).toMatchObject({ keepalive: true });
    });
  });

  it("keeps global Add in location selection until an explicit location is chosen", async () => {
    render(<CampusMapRuntime />);

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    expect(
      await screen.findByRole("heading", { name: "选择设施位置" }),
    ).toBeTruthy();
    expect(
      screen.queryByRole("textbox", { name: "设施名称或编号" }),
    ).toBeNull();
    expect(screen.queryByRole("radio", { name: "饮水点" })).toBeNull();
    expect(screen.queryByRole("group", { name: "所属建筑" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "经度（WGS84）" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "室外" })).toBeNull();
    expect(screen.queryByRole("radio", { name: "建筑内" })).toBeNull();
    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "选择设施位置" }),
    );
    await selectScienceCentreForAdd();
    expect(screen.queryByRole("combobox", { name: "建筑" })).toBeNull();
    expect(screen.getByRole("button", { name: "更改位置" })).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "无障碍通行" })).toBeNull();
    expect(screen.queryByRole("button", { name: "更多信息" })).toBeNull();
    expect(screen.queryByText("资料依据")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭地图编辑" }));
    expect(
      await screen.findByRole("heading", { name: "放弃未发布的修改？" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
    expect(
      await screen.findByRole("heading", { name: "新增设施" }),
    ).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(
      await screen.findByRole("heading", { name: "放弃未发布的修改？" }),
    ).toBeTruthy();
  });

  it("uses an explicit Building-card action to inherit the selected floor", async () => {
    render(<CampusMapRuntime />);
    await selectScienceCentre();
    fireEvent.click(screen.getByRole("button", { name: "1/F" }));

    expect(screen.queryByRole("button", { name: "新增设施" })).toBeNull();
    fireEvent.click(
      screen.getByRole("button", { name: "在科学馆的 1/F 新增设施" }),
    );

    await screen.findByRole("dialog", { name: "新增设施" });
    const buildingGroup = screen.getByRole("group", { name: "所属建筑" });
    expect(within(buildingGroup).getByText("1/F")).not.toBeNull();
    expect(within(buildingGroup).queryByText(/已从建筑卡片带入/)).toBeNull();
    expect(screen.queryByRole("combobox", { name: "建筑" })).toBeNull();
    expect(screen.queryByRole("button", { name: "更改位置" })).toBeNull();
    expect(
      (screen.getByRole("combobox", { name: "楼层" }) as HTMLSelectElement)
        .value,
    ).toBe("1");
    expect(screen.queryByRole("radio", { name: "室外" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "关闭地图编辑" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "新增设施" })).toBeNull(),
    );
    expect(
      screen.queryByRole("heading", { name: "放弃未发布的修改？" }),
    ).toBeNull();
  });

  it("keeps the selected type when an empty category starts Add", async () => {
    render(<CampusMapRuntime />);
    fireEvent.click(screen.getByRole("button", { name: "课室" }));

    fireEvent.click(await screen.findByRole("button", { name: "新增课室" }));

    expect(
      await screen.findByRole("dialog", { name: "选择设施位置" }),
    ).not.toBeNull();
    await selectScienceCentreForAdd();
    expect(
      (screen.getByRole("radio", { name: "课室" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      screen.queryByRole("textbox", { name: "设施名称或编号" }),
    ).toBeNull();
  });

  it("keeps a dirty Add draft when browser Back is cancelled", async () => {
    render(<CampusMapRuntime />);
    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    await selectScienceCentreForAdd();
    await screen.findByRole("group", { name: "设施类型" });

    await act(async () => window.history.back());
    expect(
      await screen.findByRole("heading", { name: "放弃未发布的修改？" }),
    ).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));

    expect(
      await screen.findByRole("group", { name: "设施类型" }),
    ).not.toBeNull();
    await waitFor(() =>
      expect(window.location.search).toContain("task=create"),
    );
  });

  it("opens canonical Place Edit cleanly with stable task identity", async () => {
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&scene=place&id=71000000-0000-4000-8000-000000000005&snap=peek",
    );
    render(<CampusMapRuntime initialSearch={window.location.search} />);

    await screen.findByRole("heading", { name: "饮水机" });
    fireEvent.click(screen.getByRole("button", { name: "建议修改" }));
    expect(
      await screen.findByRole("heading", { name: "修改设施" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "发布修改" }).hasAttribute("disabled"),
    ).toBe(true);
    expect(window.location.search).toBe(
      "?v=1&task=edit&id=71000000-0000-4000-8000-000000000005",
    );
    fireEvent.click(screen.getByRole("radio", { name: "洗手间" }));
    expect(
      screen.getByRole("button", { name: "发布修改" }).hasAttribute("disabled"),
    ).toBe(false);
  });

  it("uses neutral success feedback after publishing an existing Place edit", async () => {
    const placeId = "71000000-0000-4000-8000-000000000005";
    window.history.replaceState(
      null,
      "",
      `/campus-map?v=1&scene=place&id=${placeId}&snap=peek`,
    );
    vi.mocked(publishCampusMapEdit).mockResolvedValueOnce({
      status: "published",
      changesetId: "50000000-0000-4000-8000-000000000030",
      changes: [
        {
          placeId,
          revisionId: "40000000-0000-4000-8000-000000000030",
        },
      ],
      warnings: [],
      suggestions: [],
    });

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    await screen.findByRole("heading", { name: "饮水机" });
    fireEvent.click(screen.getByRole("button", { name: "建议修改" }));
    await screen.findByRole("heading", { name: "修改设施" });
    fireEvent.click(screen.getByRole("radio", { name: "洗手间" }));
    fireEvent.click(screen.getByRole("button", { name: "发布修改" }));

    const publishStatus = await screen.findByRole("status");
    expect(publishStatus.textContent).toContain("地点已发布");
    expect(publishStatus.textContent).not.toContain("添加");
  });

  it("refreshes a removed Place-photo cover before reopening the category", async () => {
    const placeId = "71000000-0000-4000-8000-000000000005";
    const assetId = "71000000-0000-4000-8000-000000000818";
    window.history.replaceState(
      null,
      "",
      `/campus-map?v=1&scene=place&id=${placeId}&snap=peek`,
    );
    const current = await vi.mocked(loadCampusMapEditablePlace)(placeId);
    if (!current) throw new Error("missing edit fixture");
    vi.mocked(loadCampusMapEditablePlace).mockResolvedValueOnce({
      ...current,
      photos: [{ assetId, role: "overview" }],
    });
    vi.mocked(publishCampusMapEdit).mockResolvedValueOnce({
      status: "published",
      changesetId: "50000000-0000-4000-8000-000000000818",
      changes: [
        {
          placeId,
          revisionId: "40000000-0000-4000-8000-000000000818",
        },
      ],
      warnings: [],
      suggestions: [],
    });
    mockLoadBrowseProjection.mockResolvedValueOnce(
      createCampusMapBrowseFixture(),
    );
    mockLoadPlaceCover.mockResolvedValueOnce(null);

    render(
      <CampusMapRuntime
        initialSearch={window.location.search}
        initialPlaceCovers={{
          [placeId]: {
            id: assetId,
            url: `/api/campus-map/place-photos/${assetId}/full`,
            thumbnailUrl: `/api/campus-map/place-photos/${assetId}/thumbnail`,
            width: 1200,
            height: 800,
            thumbnailWidth: 480,
            thumbnailHeight: 320,
            role: "overview",
            sortOrder: 0,
          },
        }}
      />,
    );

    await screen.findByRole("heading", { name: "饮水机" });
    fireEvent.click(screen.getByRole("button", { name: "建议修改" }));
    await screen.findByRole("heading", { name: "修改设施" });
    fireEvent.click(
      screen.getByRole("button", { name: "移除第 1 张地点照片" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "发布修改" }));
    await screen.findByRole("status");
    await waitFor(() =>
      expect(mockLoadPlaceCover).toHaveBeenCalledWith(placeId),
    );

    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    const result = await screen.findByRole("button", {
      name: /饮水机.*大学图书馆 · G\/F/u,
    });
    expect(result.querySelector("img")).toBeNull();
  });

  it("recovers a Note-origin Edit task directly from its refreshed URL", async () => {
    const placeId = "71000000-0000-4000-8000-000000000005";
    const noteId = "72000000-0000-4000-8000-000000000003";
    window.history.replaceState(
      null,
      "",
      `/campus-map?v=1&task=edit&id=${placeId}&returnNote=${noteId}`,
    );

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    expect(
      await screen.findByRole("heading", { name: "修改设施" }),
    ).toBeTruthy();
    expect(loadCampusMapEditablePlace).toHaveBeenCalledWith(placeId);
    expect(window.location.search).toBe(
      `?v=1&task=edit&id=${placeId}&returnNote=${noteId}`,
    );
  });

  it("rejects a restored Edit draft for a different URL Place", async () => {
    const urlPlaceId = "71000000-0000-4000-8000-000000000005";
    const savedPlaceId = "71000000-0000-4000-8000-000000000002";
    const current = await vi.mocked(loadCampusMapEditablePlace)(savedPlaceId);
    if (!current) throw new Error("missing edit fixture");
    const saved = transitionCampusMapEdit(null, {
      type: "START_EDIT",
      placeId: savedPlaceId,
      baseRevisionId: current.baseRevisionId,
      fact: current.fact,
      sources: [],
      idempotencyKey: "10000000-0000-4000-8000-000000000009",
    }).session!;
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(saved),
    );
    window.history.replaceState(
      null,
      "",
      `/campus-map?v=1&task=edit&id=${urlPlaceId}`,
    );

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    expect(await screen.findByText(/草稿与当前编辑目标不一致/)).toBeTruthy();
    expect(
      window.sessionStorage.getItem("cupedia:campus-map:edit-session:v1"),
    ).toBeNull();
    await waitFor(() => expect(window.location.search).not.toContain("task="));
    expect(screen.queryByRole("heading", { name: "修改设施" })).toBeNull();
  });

  it("hydrates canonical indoor labels before showing a publish conflict", async () => {
    const placeId = "71000000-0000-4000-8000-000000000005";
    const baseRevisionId = "72000000-0000-4000-8000-000000000005";
    const currentRevisionId = "72000000-0000-4000-8000-000000000006";
    const buildingId = "73000000-0000-4000-8000-000000000001";
    const floorId = "74000000-0000-4000-8000-000000000001";
    const initialFact: CampusMapPublishFactInput = {
      name: "饮水机",
      buildingId: null,
      floorId: null,
      pinType: "water",
      capabilities: [],
      gender: "unknown",
      wheelchairAccess: "unknown",
      audience: "cuhk-member",
      credentialRequirement: "unknown",
      accessSchedule: { kind: "unknown" },
      reservationRequirement: "unknown",
      temporaryStatus: "unknown",
      location: {
        kind: "outdoor-point",
        longitude: 114.2049,
        latitude: 22.4195,
        crs: "wgs84",
        precision: "approximate",
      },
      observedAt: null,
    };
    const source: CampusMapPublishSourceInput = {
      kind: "field-observation",
      ref: "现场观察 2026-08-25 12:00",
      url: null,
      owner: null,
      version: null,
      snapshotHash: null,
      accessedOn: "2026-08-25",
      observedAt: "2026-08-25T04:00:00.000Z",
      rightsStatus: "original-observation",
      limitations: null,
      note: null,
      sourceCoordinate: null,
    };
    const currentFact: CampusMapPublishFactInput = {
      ...initialFact,
      name: "科学馆饮水机",
      buildingId,
      floorId,
      location: { kind: "floor" },
    };
    const started = transitionCampusMapEdit(null, {
      type: "START_EDIT",
      placeId,
      baseRevisionId,
      fact: initialFact,
      sources: [source],
      idempotencyKey: "10000000-0000-4000-8000-000000000008",
    }).session!;
    const changed = transitionCampusMapEdit(started, {
      type: "CHANGE_FACT",
      fact: { ...initialFact, name: "我的饮水机" },
    }).session!;
    const publishing = transitionCampusMapEdit(changed, {
      type: "REQUEST_PUBLISH",
    }).session!;
    window.sessionStorage.setItem(
      "cupedia:campus-map:edit-session:v1",
      encodeCampusMapEditSnapshot(publishing),
    );
    bindBrowserCampusMapPublishActor(
      publishing.draft.idempotencyKey,
      "60000000-0000-4000-8000-000000000001",
    );
    window.history.replaceState(
      null,
      "",
      `/campus-map?v=1&task=edit&id=${placeId}`,
    );
    vi.mocked(publishCampusMapEdit).mockResolvedValueOnce({
      status: "conflict",
      code: "base-revision-conflict",
      conflicts: [
        {
          code: "base-revision-conflict",
          anchor: { changeIndex: 0, placeId },
          placeId,
          expectedRevisionId: baseRevisionId,
          currentRevisionId,
          currentStatus: "active",
          currentSnapshot: { ...currentFact, factSchemaVersion: 1 },
        },
      ],
    });
    vi.mocked(loadCampusMapEditablePlace).mockResolvedValueOnce({
      placeId,
      baseRevisionId: currentRevisionId,
      fact: currentFact,
      photos: [],
      locationDisplay: {
        buildingId,
        buildingName: "科学馆",
        floorId,
        floorLabel: "1/F",
      },
    });

    render(<CampusMapRuntime initialSearch={window.location.search} />);
    expect(await screen.findByText("最新：科学馆 · 1/F")).toBeTruthy();
    expect(document.body.textContent).not.toContain(buildingId);
    expect(document.body.textContent).not.toContain(floorId);
  });

  it("shows a same-position conflict without waiting for another canonical read", async () => {
    const placeId = "71000000-0000-4000-8000-000000000005";
    const current = await vi.mocked(loadCampusMapEditablePlace)(placeId);
    if (!current) throw new Error("missing edit fixture");
    window.history.replaceState(
      null,
      "",
      `/campus-map?v=1&scene=place&id=${placeId}&snap=peek`,
    );
    render(<CampusMapRuntime initialSearch={window.location.search} />);

    await screen.findByRole("heading", { name: "饮水机" });
    fireEvent.click(screen.getByRole("button", { name: "建议修改" }));
    await screen.findByRole("heading", { name: "修改设施" });
    fireEvent.click(screen.getByRole("radio", { name: "洗手间" }));
    vi.mocked(loadCampusMapEditablePlace).mockClear();
    vi.mocked(publishCampusMapEdit).mockResolvedValueOnce({
      status: "conflict",
      code: "base-revision-conflict",
      conflicts: [
        {
          code: "base-revision-conflict",
          anchor: { changeIndex: 0, placeId },
          placeId,
          expectedRevisionId: current.baseRevisionId,
          currentRevisionId: "72000000-0000-4000-8000-000000000006",
          currentStatus: "active",
          currentSnapshot: {
            ...current.fact,
            name: "最新名称",
            factSchemaVersion: 1,
          },
        },
      ],
    });

    fireEvent.click(screen.getByRole("button", { name: "发布修改" }));

    expect(await screen.findByText("这处地点刚刚被其他人更新")).toBeTruthy();
    expect(loadCampusMapEditablePlace).not.toHaveBeenCalled();
  });

  it("removes hidden map chrome from keyboard and screen-reader navigation during editing", async () => {
    render(<CampusMapRuntime />);
    const searchHeader = screen
      .getByPlaceholderText("搜索建筑或地点…")
      .closest("header");
    const filterNav = screen.getByRole("navigation", { name: "设施筛选" });
    const addButton = screen.getByRole("button", { name: "新增设施" });
    const mapControls = addButton.parentElement;

    fireEvent.click(addButton);
    await screen.findByRole("heading", { name: "选择设施位置" });

    expect(searchHeader?.getAttribute("aria-hidden")).toBe("true");
    expect(searchHeader?.hasAttribute("inert")).toBe(true);
    expect(filterNav.parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(filterNav.parentElement?.hasAttribute("inert")).toBe(true);
    expect(mapControls?.getAttribute("aria-hidden")).toBe("true");
    expect(mapControls?.hasAttribute("inert")).toBe(true);
  });

  it("drops a delayed Edit read after Escape changes the scene", async () => {
    const placeId = "71000000-0000-4000-8000-000000000005";
    const canonical = await vi.mocked(loadCampusMapEditablePlace)(placeId);
    let resolveRead!: (value: typeof canonical) => void;
    vi.mocked(loadCampusMapEditablePlace).mockImplementationOnce(
      () => new Promise((resolve) => (resolveRead = resolve)),
    );
    window.history.replaceState(
      null,
      "",
      `/campus-map?v=1&scene=place&id=${placeId}&snap=peek`,
    );
    render(<CampusMapRuntime initialSearch={window.location.search} />);

    await screen.findByRole("heading", { name: "饮水机" });
    fireEvent.click(screen.getByRole("button", { name: "建议修改" }));
    fireEvent.keyDown(window, { key: "Escape" });
    resolveRead(canonical);

    await waitFor(() => expect(window.location.search).toBe("?v=1"));
    expect(screen.queryByRole("heading", { name: "修改设施" })).toBeNull();
  });

  it("hydrates a canonical facility deep link through the scene driver", async () => {
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&scene=place&id=71000000-0000-4000-8000-000000000005&snap=peek",
    );

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    const heading = await screen.findByRole("heading", { name: "饮水机" });
    expect(heading.parentElement?.textContent).toContain("大学图书馆 · G/F");
    expect(window.location.search).toBe(
      "?v=1&scene=place&id=71000000-0000-4000-8000-000000000005&snap=peek",
    );
    expect(window.history.state).toEqual({
      campusMapScene: true,
      version: 1,
      depth: 0,
    });
  });

  it("gives the AMap-owned container an explicit full-size parent", async () => {
    const { container } = render(<CampusMapRuntime />);
    const canvas = container.querySelector("#amap-campus-canvas");

    expect(canvas?.classList.contains("h-full")).toBe(true);
    expect(canvas?.classList.contains("w-full")).toBe(true);
    expect(canvas?.parentElement?.classList.contains("absolute")).toBe(true);
    expect(canvas?.parentElement?.classList.contains("inset-0")).toBe(true);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
  });

  it("inserts the AMap script after browser configuration loads", async () => {
    render(<CampusMapRuntime />);

    await waitFor(() => {
      const script = document.querySelector<HTMLScriptElement>(
        "script[data-amap-campus]",
      );
      expect(script).not.toBeNull();
      expect(script?.src).toContain("https://webapi.amap.com/maps?v=2.0");
      expect(window._AMapSecurityConfig).toEqual({
        serviceHost: "/_AMapService",
      });
      expect(window._AMapSecurityConfig).not.toHaveProperty("securityJsCode");
    });
  });

  it("shows an ordinary non-blocking state when map configuration is missing", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        configured: false,
      }),
    } as Response);

    render(<CampusMapRuntime />);

    const status = await screen.findByRole("status");
    expect(
      within(status).getByRole("heading", { name: "地图暂时不可用" }),
    ).not.toBeNull();
    expect(status.textContent).toContain(
      "仍可搜索和查看校园地点卡片。请稍后重新加载地图。",
    );
    expect(status.textContent).not.toContain("配置");
    expect(status.textContent).not.toContain("高德");
    expect(document.querySelector("script[data-amap-campus]")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "新增设施" }));
    expect(
      await screen.findByRole("dialog", { name: "选择设施位置" }),
    ).not.toBeNull();
    expect(screen.queryByRole("combobox", { name: "建筑" })).toBeNull();
    expect(
      screen.getByRole("heading", { name: "地图暂时不可用" }),
    ).not.toBeNull();
  });

  it("retries from a fail-closed state when the AMap SDK script fails", async () => {
    render(<CampusMapRuntime />);
    const script = await waitFor(() => {
      const value = document.querySelector<HTMLScriptElement>(
        "script[data-amap-campus]",
      );
      expect(value).not.toBeNull();
      return value!;
    });

    fireEvent.error(script);

    const status = await screen.findByRole("status");
    expect(
      within(status).getByRole("heading", { name: "地图暂时不可用" }),
    ).not.toBeNull();
    expect(status.textContent).toContain(
      "仍可搜索和查看校园地点卡片。请稍后重新加载地图。",
    );
    expect(status.textContent).not.toContain("高德");

    fireEvent.click(screen.getByRole("button", { name: "重新加载地图" }));

    await waitFor(() => {
      const replacement = document.querySelector<HTMLScriptElement>(
        "script[data-amap-campus]",
      );
      expect(replacement).not.toBeNull();
      expect(replacement).not.toBe(script);
    });
  });

  it("pushes semantic selections and replaces floor filter history", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    render(<CampusMapRuntime initialSearch={window.location.search} />);

    await selectScienceCentre();
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain(
      "scene=building&id=science-centre",
    );

    const floor = screen.getByRole("button", { name: "LG/F" });
    expect(
      screen
        .getByRole("button", { name: "全部楼层" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(floor.getAttribute("aria-pressed")).toBe("false");
    floor.focus();
    fireEvent.click(floor);
    expect(push).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalled();
    expect(window.location.search).toContain("floor=LG");
    expect(document.activeElement).toBe(floor);
    expect(
      screen
        .getByRole("button", { name: "全部楼层" })
        .getAttribute("aria-pressed"),
    ).toBe("false");
    expect(floor.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: /洗手间.*公众可达/ }));
    await screen.findByRole("heading", { name: "洗手间" });
    expect(push).toHaveBeenCalledTimes(2);
    expect(window.location.search).toContain(
      "scene=place&id=71000000-0000-4000-8000-000000000001",
    );
    expect(window.location.search).toContain("snap=peek");
  });

  it("uses browser history for facility back and hydrates the building", async () => {
    render(<CampusMapRuntime initialSearch={window.location.search} />);
    await selectScienceCentre();
    fireEvent.click(screen.getByRole("button", { name: /洗手间.*公众可达/ }));
    await screen.findByRole("heading", { name: "洗手间" });

    fireEvent.click(screen.getByRole("button", { name: "返回建筑" }));
    await screen.findByRole("heading", { name: "科学馆" });
    expect(window.location.search).not.toContain("scene=place");

    await act(async () => {
      window.history.forward();
    });
    await screen.findByRole("heading", { name: "洗手间" });
    expect(window.location.search).toContain(
      "scene=place&id=71000000-0000-4000-8000-000000000001",
    );
  });

  it("restores focus for a Place id that contains CSS selector characters", async () => {
    const sourcePlaceId = "71000000-0000-4000-8000-000000000001";
    const specialPlaceId = 'place-with-"quote"]';
    const projection = createCampusMapBrowseFixture();
    const withSpecialPlaceId = {
      ...projection,
      buildings: projection.buildings.map((building) => ({
        ...building,
        placeIds: building.placeIds.map((placeId) =>
          placeId === sourcePlaceId ? specialPlaceId : placeId,
        ),
      })),
      places: projection.places.map((place) =>
        place.placeId === sourcePlaceId
          ? {
              ...place,
              placeId: specialPlaceId,
              selectionTarget: {
                ...place.selectionTarget,
                placeId: specialPlaceId,
              },
            }
          : place,
      ),
      markers: projection.markers.map((marker) =>
        marker.kind === "place" && marker.placeId === sourcePlaceId
          ? { ...marker, placeId: specialPlaceId }
          : marker.kind === "building-presence"
            ? {
                ...marker,
                placeIds: marker.placeIds.map((placeId) =>
                  placeId === sourcePlaceId ? specialPlaceId : placeId,
                ),
              }
            : marker,
      ),
    };
    render(
      <CampusMapRuntime
        initialSearch="?v=1&scene=building&id=science-centre&snap=peek"
        initialBrowseProjection={withSpecialPlaceId}
      />,
    );

    const result = await waitFor(() =>
      Array.from(
        document.querySelectorAll<HTMLElement>("[data-return-result]"),
      ).find((candidate) => candidate.dataset.returnResult === specialPlaceId),
    );
    fireEvent.click(result!);
    await screen.findByRole("heading", { name: "洗手间" });

    fireEvent.click(screen.getByRole("button", { name: "返回建筑" }));
    await screen.findByRole("heading", { name: "科学馆" });
    await waitFor(() => {
      const restoredResult = Array.from(
        document.querySelectorAll<HTMLElement>("[data-return-result]"),
      ).find((candidate) => candidate.dataset.returnResult === specialPlaceId);
      expect(document.activeElement).toBe(restoredResult);
    });
  });

  it("canonicalizes a mismatched facility deep link to its real building", async () => {
    window.history.replaceState(
      null,
      "",
      "/campus-map?v=1&scene=place&id=71000000-0000-4000-8000-000000000005&snap=full",
    );
    render(<CampusMapRuntime initialSearch={window.location.search} />);

    const heading = await screen.findByRole("heading", { name: "饮水机" });
    expect(heading.parentElement?.textContent).toContain("大学图书馆 · G/F");
    await waitFor(() => {
      expect(window.location.search).toBe(
        "?v=1&scene=place&id=71000000-0000-4000-8000-000000000005&snap=peek",
      );
    });
  });

  it("moves from a direct Place link to its category in one intent", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(
      <CampusMapRuntime initialSearch="?v=1&scene=place&id=71000000-0000-4000-8000-000000000003&snap=peek" />,
    );
    await screen.findByRole("heading", { name: "洗手间" });
    const before = push.mock.calls.length;

    fireEvent.click(
      screen.getByRole("button", { name: "洗手间", pressed: false }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "洗手间",
      }),
    ).not.toBeNull();
    expect(window.location.search).toContain("scene=category&id=toilet");
    expect(window.location.search).not.toContain("scene=place");
    expect(push.mock.calls.length - before).toBe(1);

    await act(async () => {
      window.history.back();
    });
    expect(
      await screen.findByRole("heading", { name: "洗手间" }),
    ).not.toBeNull();

    await act(async () => {
      window.history.forward();
    });
    expect(
      await screen.findByRole("heading", {
        name: "洗手间",
      }),
    ).not.toBeNull();
  });

  it("replaces history when switching category filters", async () => {
    const push = vi.spyOn(window.history, "pushState");
    const replace = vi.spyOn(window.history, "replaceState");
    render(
      <CampusMapRuntime initialSearch="?v=1&scene=category&id=toilet&snap=peek" />,
    );
    await screen.findByRole("heading", {
      name: "洗手间",
    });
    const pushesBefore = push.mock.calls.length;
    const replacesBefore = replace.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));

    expect(
      await screen.findByRole("heading", {
        name: "饮水点",
      }),
    ).not.toBeNull();
    expect(push.mock.calls.length).toBe(pushesBefore);
    expect(replace.mock.calls.length - replacesBefore).toBe(1);
  });

  it("keeps a direct facility deep-link building fallback reversible", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(
      <CampusMapRuntime initialSearch="?v=1&scene=place&id=71000000-0000-4000-8000-000000000003&snap=peek" />,
    );
    await screen.findByRole("heading", { name: "洗手间" });
    const before = push.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    expect(
      await screen.findByRole("heading", { name: "伍何曼原楼" }),
    ).not.toBeNull();
    expect(push.mock.calls.length - before).toBe(1);
  });

  it("uses the location action without repeating an indoor precision warning", async () => {
    render(
      <CampusMapRuntime initialSearch="?v=1&scene=place&id=71000000-0000-4000-8000-000000000003&snap=peek" />,
    );

    await screen.findByRole("heading", { name: "洗手间" });
    expect(screen.queryByText(/尚无室内精确坐标/)).toBeNull();
    expect(screen.getByRole("button", { name: "定位所属建筑" })).not.toBeNull();
  });

  it("closes with Escape and restores focus to the search result trigger", async () => {
    render(<CampusMapRuntime />);
    const search = screen.getByPlaceholderText("搜索建筑或地点…");
    fireEvent.change(search, { target: { value: "科学馆" } });
    fireEvent.submit(search.closest("form")!);
    const result = await screen.findByRole("button", { name: /科学馆/ });
    fireEvent.click(result);
    await screen.findByRole("heading", { name: "科学馆" });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "科学馆" })).toBeNull(),
    );
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: /科学馆/ }),
    );
  });

  it("returns focus to the map when dismissing a non-search selection", async () => {
    render(
      <CampusMapRuntime initialSearch="?v=1&scene=building&id=science-centre&snap=peek" />,
    );
    await screen.findByRole("heading", { name: "科学馆" });
    fireEvent.click(screen.getByRole("button", { name: "关闭地点详情" }));

    await waitFor(() => {
      expect(document.activeElement).toBe(
        document.querySelector("#amap-campus-canvas"),
      );
    });
  });

  it("writes one history entry per selection in Strict Mode", async () => {
    const push = vi.spyOn(window.history, "pushState");
    render(
      <StrictMode>
        <CampusMapRuntime />
      </StrictMode>,
    );

    await selectScienceCentre();
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("shows search results while typing instead of requiring a hidden submit step", async () => {
    render(<CampusMapRuntime />);
    const search = screen.getByPlaceholderText("搜索建筑或地点…");

    fireEvent.input(search, { target: { value: "科学馆" } });

    expect(
      await screen.findByRole("button", { name: /科学馆/ }),
    ).not.toBeNull();
  });

  it("preserves a typed word separator for multi-token facility search", async () => {
    render(<CampusMapRuntime initialSearch="?v=1" />);
    const search = screen.getByPlaceholderText("搜索建筑或地点…");

    fireEvent.change(search, { target: { value: "大学图书馆" } });
    fireEvent.change(search, { target: { value: "大学图书馆 " } });
    expect((search as HTMLInputElement).value).toBe("大学图书馆 ");
    fireEvent.change(search, { target: { value: "大学图书馆 饮水机" } });

    expect(
      await screen.findByRole("button", { name: /饮水机.*大学图书馆/ }),
    ).not.toBeNull();
  });

  it("dismisses search results with Escape", async () => {
    render(<CampusMapRuntime initialSearch="?v=1" />);
    const search = screen.getByPlaceholderText("搜索建筑或地点…");
    fireEvent.change(search, { target: { value: "科学馆" } });
    expect(
      await screen.findByRole("button", { name: /科学馆/ }),
    ).not.toBeNull();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect((search as HTMLInputElement).value).toBe(""));
    expect(window.location.search).toBe("?v=1");
  });

  it("opens a facility search result at the same canonical facility URL", async () => {
    render(<CampusMapRuntime />);
    const search = screen.getByPlaceholderText("搜索建筑或地点…");

    fireEvent.change(search, { target: { value: "大学图书馆 饮水机" } });
    fireEvent.click(
      await screen.findByRole("button", { name: /饮水机.*大学图书馆/ }),
    );

    expect(
      await screen.findByRole("heading", { name: "饮水机" }),
    ).not.toBeNull();
    expect(window.location.search).toBe(
      "?v=1&scene=place&id=71000000-0000-4000-8000-000000000005&snap=peek",
    );
    expect(screen.getByRole("button", { name: "返回搜索结果" })).not.toBeNull();
  });

  it("uses a generic Back label for a direct outdoor Place", async () => {
    const placeId = "30000000-0000-4000-8000-000000000020";
    render(
      <CampusMapRuntime
        initialSearch={`?v=1&scene=place&id=${placeId}&snap=peek`}
        initialBrowseProjection={publishedOutdoorProjection(placeId)}
      />,
    );

    await screen.findByRole("heading", { name: "新发布饮水点" });
    fireEvent.click(screen.getByRole("button", { name: "返回" }));

    await waitFor(() => expect(window.location.search).toBe("?v=1"));
  });

  it("uses a truthful generic Back label without a return context", async () => {
    const placeId = "71000000-0000-4000-8000-000000000005";
    window.history.replaceState(
      { campusMapScene: true, version: 1, depth: 1 },
      "",
      `/campus-map?v=1&scene=place&id=${placeId}&snap=peek`,
    );

    render(<CampusMapRuntime initialSearch={window.location.search} />);

    await screen.findByRole("heading", { name: "饮水机" });
    expect(screen.getByRole("button", { name: "返回" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "返回建筑" })).toBeNull();
    expect(screen.queryByRole("button", { name: "返回地图" })).toBeNull();
  });

  it("links the selected canonical Place to its full details", async () => {
    render(
      <CampusMapRuntime initialSearch="?v=1&scene=place&id=71000000-0000-4000-8000-000000000005&snap=full" />,
    );

    const details = await screen.findByRole("link", {
      name: "查看完整详情",
    });
    expect(details.getAttribute("href")).toBe(
      "/campus-map/places/71000000-0000-4000-8000-000000000005",
    );
    expect(screen.getByRole("group", { name: "地点操作" })).not.toBeNull();
    const facilityRegion = screen.getByRole("region", { name: "饮水机" });
    expect(facilityRegion.textContent).toContain("饮水点");
    expect(screen.queryByRole("button", { name: "展开地点卡片" })).toBeNull();
    await waitFor(() =>
      expect(window.location.search).toBe(
        "?v=1&scene=place&id=71000000-0000-4000-8000-000000000005&snap=peek",
      ),
    );
    expect(screen.queryByText(/Current fact/i)).toBeNull();
    expect(screen.queryByText(/2026/)).toBeNull();
  });

  it("degrades a removed legacy query to the canonical map scene", async () => {
    render(
      <CampusMapRuntime initialSearch="?building=building%3A15&panel=peek" />,
    );

    await waitFor(() => expect(window.location.search).toBe("?v=1"));
    expect(screen.queryByRole("heading", { name: "科学馆" })).toBeNull();
  });

  it("keeps a multi-category Building summary short enough for the mobile header", async () => {
    render(<CampusMapRuntime />);
    await selectScienceCentre();

    expect(screen.queryByText("2 处设施")).toBeNull();
    const facilityTypes = screen.getByRole("list", { name: "楼内设施" });
    expect(facilityTypes.textContent).toContain("洗手间");
    expect(facilityTypes.textContent).toContain("饮水点");
  });

  it("opens a browsable result sheet when a facility category is selected", async () => {
    render(<CampusMapRuntime />);

    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));

    const heading = await screen.findByRole("heading", {
      name: "饮水点",
    });
    expect(heading.textContent).toBe("饮水点 · 2 处");
    expect(heading.getAttribute("aria-describedby")).toBe(
      "campus-map-category-count",
    );
    const accessibleCount = document.getElementById(
      "campus-map-category-count",
    );
    expect(accessibleCount?.textContent).toBe("2 处设施");
    expect(accessibleCount?.classList.contains("sr-only")).toBe(true);
    expect(screen.queryByText(/Current facts/i)).toBeNull();
    const firstCategoryResult = screen.getByRole("button", {
      name: /科学馆 · 1\/F/,
    });
    expect(firstCategoryResult).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /大学图书馆 · G\/F/ }),
    ).not.toBeNull();
    expect(
      screen.queryByRole("button", { name: "查看全部 2 处设施" }),
    ).toBeNull();
    expect(screen.getByRole("button", { name: "新增饮水点" })).not.toBeNull();
  });

  it("returns focus to the category filter when its card is dismissed", async () => {
    render(<CampusMapRuntime />);

    fireEvent.click(
      screen.getByRole("button", { name: "饮水点", pressed: false }),
    );
    await screen.findByRole("heading", { name: "饮水点" });
    const activeFilter = screen.getByRole("button", {
      name: "饮水点",
      pressed: true,
    });

    fireEvent.click(activeFilter);

    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "饮水点" })).toBeNull(),
    );
    await waitFor(() => expect(document.activeElement).toBe(activeFilter));
  });

  it("shows three category results before offering the full list", async () => {
    const projection = createCampusMapBrowseFixture();
    const waterPlace = projection.places.find(
      (place) => place.pinType === "water",
    );
    if (!waterPlace) throw new Error("water fixture missing");
    const extraPlaces = [
      {
        ...waterPlace,
        placeId: "71000000-0000-4000-8000-000000000006",
        name: "东门饮水机",
        selectionTarget: {
          ...waterPlace.selectionTarget,
          placeId: "71000000-0000-4000-8000-000000000006",
        },
      },
      {
        ...waterPlace,
        placeId: "71000000-0000-4000-8000-000000000007",
        name: "西门饮水机",
        selectionTarget: {
          ...waterPlace.selectionTarget,
          placeId: "71000000-0000-4000-8000-000000000007",
        },
      },
    ];
    render(
      <CampusMapRuntime
        initialBrowseProjection={{
          ...projection,
          places: [...projection.places, ...extraPlaces],
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));

    expect(
      await screen.findByRole("button", { name: /东门饮水机/ }),
    ).not.toBeNull();
    expect(screen.queryByRole("button", { name: /西门饮水机/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "查看全部 4 处设施" }));
    expect(screen.getByRole("button", { name: /西门饮水机/ })).not.toBeNull();
  });

  it("restores navigation from browser history state", async () => {
    render(<CampusMapRuntime />);
    fireEvent.click(screen.getByRole("button", { name: "饮水点" }));
    fireEvent.click(screen.getByRole("button", { name: /科学馆 · 1\/F/ }));
    const facilityHistory = window.history.state;

    window.history.replaceState(facilityHistory, "", window.location.href);
    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: facilityHistory }),
      );
    });
    await screen.findByRole("heading", { name: "饮水机" });
    fireEvent.click(screen.getByRole("button", { name: "返回饮水点列表" }));
    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: window.history.state }),
      );
    });
    expect(
      await screen.findByRole("heading", {
        name: "饮水点",
      }),
    ).not.toBeNull();
  });
});
