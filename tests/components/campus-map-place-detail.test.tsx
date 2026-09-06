/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lifecycleAction, feedbackAction, reportAction, hideAction, refresh } =
  vi.hoisted(() => ({
    lifecycleAction: vi.fn(),
    feedbackAction: vi.fn(),
    reportAction: vi.fn(),
    hideAction: vi.fn(),
    refresh: vi.fn(),
  }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/campus-map/place-lifecycle-actions", () => ({
  runCampusMapPlaceLifecycleAction: (...args: unknown[]) =>
    lifecycleAction(...args),
}));
vi.mock("@/lib/campus-map/place-feedback-actions", () => ({
  runCampusMapPlaceFeedbackAction: (...args: unknown[]) =>
    feedbackAction(...args),
  reportCampusMapPlaceFeedback: (...args: unknown[]) => reportAction(...args),
  hideCampusMapPlaceFeedback: (...args: unknown[]) => hideAction(...args),
}));

import { CampusMapPlaceDetail } from "@/components/campus-map/place-detail";
import type {
  CampusMapHistoricalFactV1,
  CampusMapHistoricalFactV2,
} from "@/lib/campus-map/fact-store";

const placeId = "00000000-0000-4000-8000-000000008160";
const revisionId = "00000000-0000-4000-8000-000000008161";
const fact: CampusMapHistoricalFactV1 = {
  factSchemaVersion: 1,
  name: "联合书院图书馆饮水机",
  pinType: "water",
  capabilities: [],
  gender: "unknown",
  wheelchairAccess: "yes",
  audience: "cuhk-member",
  credentialRequirement: "campus-card",
  accessSchedule: {
    kind: "weekly",
    timezone: "Asia/Hong_Kong",
    intervals: [{ days: ["mon", "tue"], opensAt: "08:30", closesAt: "22:00" }],
  },
  reservationRequirement: "none",
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
};

function v2Fact(
  overrides: Partial<CampusMapHistoricalFactV2> = {},
): CampusMapHistoricalFactV2 {
  return {
    factSchemaVersion: 2,
    name: "室外饮水点",
    placeType: "water",
    regularHours: null,
    officialActions: [],
    visitNote: null,
    capabilities: [],
    gender: null,
    wheelchairAccess: null,
    buildingId: null,
    floorId: null,
    locationKind: "outdoor-point",
    pointPrecision: "approximate",
    longitude: 114.205,
    latitude: 22.419,
    coordinateCrs: "wgs84",
    observedAt: null,
    verifiedAt: null,
    provenance: [],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-31T15:59:00.000Z"));
  lifecycleAction.mockResolvedValue({
    status: "published",
    changesetId: "00000000-0000-4000-8000-000000008164",
    revisionId: "00000000-0000-4000-8000-000000008165",
  });
  feedbackAction.mockResolvedValue({
    status: "updated",
    feedback: {
      id: "00000000-0000-4000-8000-000000008170",
      placeId,
      rating: 5,
      content: "更新后的体验",
      version: 2,
      visibility: "public",
      createdAt: "2026-08-30T00:00:00.000Z",
      updatedAt: "2026-08-31T00:00:00.000Z",
    },
  });
  reportAction.mockResolvedValue({ status: "reported" });
  hideAction.mockResolvedValue({ status: "decided" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Campus Map Place detail (#816, #825)", () => {
  it("shows canonical facts and one ordinary history entry without highlighting internal revision terms", () => {
    render(
      <CampusMapPlaceDetail
        placeId={placeId}
        head={{
          revisionId,
          status: "active",
          visibility: "public",
          mergedIntoPlaceId: null,
          name: fact.name,
        }}
        fact={fact}
        retirementReason={null}
        mapHref={`/campus-map?v=1&scene=place&id=${placeId}&snap=peek`}
        building={{ name: "联合书院图书馆", floorLabel: "1/F" }}
        isAdmin={false}
      />,
    );

    expect(screen.getByRole("heading", { name: fact.name })).toBeTruthy();
    expect(screen.getByText("地图已收录", { exact: true })).toBeTruthy();
    expect(screen.queryByText("使用中", { exact: true })).toBeNull();
    expect(screen.getByText("饮水点")).toBeTruthy();
    expect(screen.getByText("联合书院图书馆 · 1/F")).toBeTruthy();
    expect(screen.getByText("中大成员")).toBeTruthy();
    expect(screen.getByText("校园卡")).toBeTruthy();
    expect(screen.getByText("周一、周二 08:30–22:00")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "返回地图" }).getAttribute("href"),
    ).toBe(`/campus-map?v=1&scene=place&id=${placeId}&snap=peek`);
    expect(
      screen.getAllByRole("link", { name: "查看编辑记录 / History" }),
    ).toHaveLength(1);
    expect(screen.queryByText(placeId)).toBeNull();
    expect(document.body.textContent).not.toMatch(/Revision|Changeset/);
    expect(screen.queryByRole("button", { name: "停用地点" })).toBeNull();
  });

  it("renders a V2 health-service card with reviewed booking actions first", () => {
    const healthFact: CampusMapHistoricalFactV2 = {
      factSchemaVersion: 2,
      name: "门诊（Outpatient Service）",
      placeType: "health-service",
      regularHours: {
        timezone: "Asia/Hong_Kong",
        intervals: [
          {
            days: ["mon", "tue", "wed", "thu", "fri"],
            opensAt: "08:45",
            closesAt: "13:00",
          },
        ],
      },
      officialActions: [
        {
          label: "网上预约",
          url: "https://booking.umso.cuhk.edu.hk/booking/",
        },
        { label: "电话预约", url: "tel:+85239436439" },
        { label: "官方详情", url: "https://www.umso.cuhk.edu.hk/" },
      ],
      visitNote: "登记时须出示个人身份证明。",
      capabilities: [],
      gender: null,
      wheelchairAccess: null,
      buildingId: "00000000-0000-4000-8000-000000008162",
      floorId: null,
      locationKind: "building",
      pointPrecision: null,
      longitude: null,
      latitude: null,
      coordinateCrs: null,
      observedAt: null,
      verifiedAt: new Date("2026-09-02T00:00:00.000Z"),
      provenance: [
        {
          kind: "official",
          accessedOn: "2026-09-02",
          observedAt: null,
          rightsStatus: "unknown",
          hasLocationEvidence: false,
        },
      ],
    };

    render(
      <CampusMapPlaceDetail
        placeId={placeId}
        head={{
          revisionId,
          status: "active",
          visibility: "public",
          mergedIntoPlaceId: null,
          name: healthFact.name,
        }}
        fact={healthFact}
        retirementReason={null}
        mapHref="/campus-map?v=1"
        building={{ name: "大学保健处", floorLabel: null }}
        isAdmin={false}
      />,
    );

    expect(screen.getByText("医疗服务")).toBeTruthy();
    expect(screen.getAllByText("大学保健处")).toHaveLength(1);
    expect(screen.getByText("周一至周五 08:45–13:00")).toBeTruthy();
    const officialLinks = screen
      .getAllByRole("link")
      .filter((link) =>
        ["网上预约", "电话预约"].some((label) =>
          link.textContent?.includes(label),
        ),
      );
    expect(officialLinks.map((link) => link.textContent)).toEqual([
      "网上预约booking.umso.cuhk.edu.hk",
      "电话预约电话 +85239436439",
    ]);
    expect(screen.queryByText("官方详情")).toBeNull();
    expect(document.body.textContent).not.toContain("楼层未知");
    expect(document.body.textContent).not.toContain("未记录");
    expect(document.body.textContent).not.toContain("实时");

    const details = screen
      .getByText("查看其他已知资料与来源")
      .closest("details");
    expect(details?.open).toBe(false);
    fireEvent.click(screen.getByText("查看其他已知资料与来源"));
    expect(details?.open).toBe(true);
    expect(screen.getByText("登记时须出示个人身份证明。")).toBeTruthy();
    expect(screen.getByText(/官方资料 · 查阅于 2026-09-02/u)).toBeTruthy();
  });

  it("keeps a reserved V2 type out of the public detail presentation", () => {
    const vendingFact = v2Fact({
      name: "图书馆自动售卖机",
      placeType: "vending-machine",
    });

    render(
      <CampusMapPlaceDetail
        placeId={placeId}
        head={{
          revisionId,
          status: "active",
          visibility: "public",
          mergedIntoPlaceId: null,
          name: vendingFact.name,
        }}
        fact={vendingFact}
        retirementReason={null}
        mapHref="/campus-map?v=1"
        building={null}
        isAdmin={false}
      />,
    );

    expect(screen.queryByRole("heading", { name: "地点资料" })).toBeNull();
    expect(
      screen.getByText(
        "这份地点资料目前不可公开，但稳定链接和公开历史仍然保留。",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("自动售卖机", { exact: true })).toBeNull();
  });

  it("separates map inclusion from a temporary closure", () => {
    render(
      <CampusMapPlaceDetail
        placeId={placeId}
        head={{
          revisionId,
          status: "active",
          visibility: "public",
          mergedIntoPlaceId: null,
          name: fact.name,
        }}
        fact={{ ...fact, temporaryStatus: "temporarily-closed" }}
        retirementReason={null}
        mapHref="/campus-map?v=1"
        building={{ name: "联合书院图书馆", floorLabel: "1/F" }}
        isAdmin={false}
      />,
    );

    expect(screen.getByText("地图已收录", { exact: true })).toBeTruthy();
    expect(screen.getByText("暂时关闭", { exact: true })).toBeTruthy();
    expect(screen.queryByText("使用中", { exact: true })).toBeNull();
  });

  it("keeps a readable retired tombstone and only gives an admin the restore entry", () => {
    const { rerender } = render(
      <CampusMapPlaceDetail
        placeId={placeId}
        head={{
          revisionId,
          status: "retired",
          visibility: "public",
          mergedIntoPlaceId: null,
          name: fact.name,
        }}
        fact={fact}
        retirementReason="原位置已拆除"
        mapHref="/campus-map?v=1"
        building={{ name: "联合书院图书馆", floorLabel: "1/F" }}
        isAdmin={false}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "这个地点已停用" }),
    ).toBeTruthy();
    expect(document.body.textContent).toContain("停用原因：原位置已拆除");
    expect(screen.getByText(`稳定地点编号：${placeId}`)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "恢复地点" })).toBeNull();

    rerender(
      <CampusMapPlaceDetail
        placeId={placeId}
        head={{
          revisionId,
          status: "retired",
          visibility: "public",
          mergedIntoPlaceId: null,
          name: fact.name,
        }}
        fact={fact}
        retirementReason="原位置已拆除"
        mapHref="/campus-map?v=1"
        building={{ name: "联合书院图书馆", floorLabel: "1/F" }}
        isAdmin
      />,
    );
    expect(screen.getByRole("button", { name: "恢复地点" })).toBeTruthy();
  });

  it("requires a reason, moves focus into confirmation, closes with Escape, and restores trigger focus", async () => {
    render(
      <CampusMapPlaceDetail
        placeId={placeId}
        head={{
          revisionId,
          status: "active",
          visibility: "public",
          mergedIntoPlaceId: null,
          name: fact.name,
        }}
        fact={fact}
        retirementReason={null}
        mapHref="/campus-map?v=1"
        building={{ name: "联合书院图书馆", floorLabel: "1/F" }}
        isAdmin
      />,
    );

    const trigger = screen.getByRole("button", { name: "停用地点" });
    fireEvent.click(trigger);
    const reason = await screen.findByLabelText("停用原因");
    expect(reason.getAttribute("name")).toBe("place-lifecycle-reason");
    expect(reason.getAttribute("autocomplete")).toBe("off");
    expect(reason.getAttribute("placeholder")).toBe(
      "例如：地点已拆除或不再提供这项服务…",
    );
    expect(reason.closest('[role="alertdialog"]')?.className).toContain(
      "overscroll-contain",
    );
    await waitFor(() => expect(document.activeElement).toBe(reason));
    fireEvent.click(
      await screen.findByRole("button", { name: /确认停用：停用原因/ }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "请填写原因",
    );
    expect(lifecycleAction).not.toHaveBeenCalled();

    fireEvent.keyDown(reason, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("停用原因")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("submits the admin reason once, exposes pending state, defers refresh, and reports errors", async () => {
    let resolveAction: ((value: { status: "published" }) => void) | undefined;
    let refreshedWhilePending: boolean | null = null;
    refresh.mockImplementationOnce(() => {
      refreshedWhilePending =
        screen.queryByRole("button", { name: "正在停用…" }) !== null;
    });
    lifecycleAction.mockReturnValueOnce(
      new Promise<{ status: "published" }>((resolve) => {
        resolveAction = resolve;
      }),
    );
    render(
      <CampusMapPlaceDetail
        placeId={placeId}
        head={{
          revisionId,
          status: "active",
          visibility: "public",
          mergedIntoPlaceId: null,
          name: fact.name,
        }}
        fact={fact}
        retirementReason={null}
        mapHref="/campus-map?v=1"
        building={{ name: "联合书院图书馆", floorLabel: "1/F" }}
        isAdmin
      />,
    );

    const trigger = screen.getByRole("button", { name: "停用地点" });
    fireEvent.click(trigger);
    fireEvent.change(await screen.findByLabelText("停用原因"), {
      target: { value: "地点已拆除" },
    });
    const submit = screen.getByRole("button", { name: /确认停用：停用原因/ });
    fireEvent.click(submit);
    await waitFor(() => expect(submit.textContent).toBe("正在停用…"));
    expect(submit.hasAttribute("disabled")).toBe(true);
    expect(submit.getAttribute("aria-busy")).toBe("true");
    expect(submit.getAttribute("aria-label")).toBe("正在停用…");
    expect(lifecycleAction).toHaveBeenCalledOnce();
    expect(lifecycleAction.mock.calls[0][0]).toMatchObject({
      operation: "retire",
      placeId,
      baseRevisionId: revisionId,
      reason: "地点已拆除",
      idempotencyKey: expect.any(String),
    });
    expect(lifecycleAction.mock.calls[0][0]).not.toHaveProperty(
      "sourceAccessedOn",
    );
    const completedRequest = lifecycleAction.mock.calls[0][0];
    resolveAction?.({ status: "published" });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(refreshedWhilePending).toBe(false);
    await waitFor(() =>
      expect(trigger.getAttribute("aria-expanded")).toBe("false"),
    );

    lifecycleAction.mockResolvedValueOnce({
      status: "forbidden",
      code: "admin-required",
    });
    fireEvent.click(trigger);
    await waitFor(() =>
      expect(trigger.getAttribute("aria-expanded")).toBe("true"),
    );
    fireEvent.change(await screen.findByLabelText("停用原因"), {
      target: { value: "再次尝试" },
    });
    fireEvent.click(screen.getByRole("button", { name: /确认停用：停用原因/ }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "只有管理员可以执行这项操作。",
    );
    expect(screen.getByLabelText("停用原因").hasAttribute("aria-invalid")).toBe(
      false,
    );
    const retryableRequest = lifecycleAction.mock.calls.at(-1)![0];
    expect(retryableRequest).not.toHaveProperty("sourceAccessedOn");
    expect(retryableRequest.idempotencyKey).not.toBe(
      completedRequest.idempotencyKey,
    );

    vi.setSystemTime(new Date("2026-08-31T16:01:00.000Z"));

    lifecycleAction.mockRejectedValueOnce(new Error("connection lost"));
    fireEvent.click(
      await screen.findByRole("button", { name: /确认停用：停用原因/ }),
    );
    expect((await screen.findByRole("alert")).textContent).toContain(
      "网络连接中断",
    );
    expect(screen.getByLabelText("停用原因").hasAttribute("aria-invalid")).toBe(
      false,
    );
    expect(lifecycleAction.mock.calls.at(-1)?.[0]).toMatchObject({
      idempotencyKey: retryableRequest.idempotencyKey,
    });

    lifecycleAction.mockResolvedValueOnce({
      status: "forbidden",
      code: "admin-required",
    });
    fireEvent.change(screen.getByLabelText("停用原因"), {
      target: { value: "香港日期改变后开始新操作" },
    });
    fireEvent.click(
      await screen.findByRole("button", { name: /确认停用：停用原因/ }),
    );
    expect(lifecycleAction.mock.calls.at(-1)?.[0]).not.toHaveProperty(
      "sourceAccessedOn",
    );
    expect(lifecycleAction.mock.calls.at(-1)?.[0].idempotencyKey).not.toBe(
      retryableRequest.idempotencyKey,
    );
  });

  it("shows summary and long reviews, then updates an accessible one-to-five-star form", async () => {
    const longReview = "很长的到访体验".repeat(80);
    const mapListReturnPath =
      "/campus-map?v=1&scene=search&q=%E9%A5%AE%E6%B0%B4&snap=peek";
    let resolveFeedback: ((value: unknown) => void) | undefined;
    let refreshedWhilePending: boolean | null = null;
    refresh.mockImplementationOnce(() => {
      refreshedWhilePending =
        screen.queryByRole("button", { name: "正在保存…" }) !== null;
    });
    feedbackAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFeedback = resolve;
        }),
    );
    render(
      <CampusMapPlaceDetail
        placeId={placeId}
        head={{
          revisionId,
          status: "active",
          visibility: "public",
          mergedIntoPlaceId: null,
          name: fact.name,
        }}
        fact={fact}
        retirementReason={null}
        mapHref={mapListReturnPath}
        building={{ name: "联合书院图书馆", floorLabel: "1/F" }}
        isAdmin
        reviewsAfter="opaque-current-page"
        feedback={{
          placeStatus: "active",
          summary: {
            placeId,
            averageRating: 4.3,
            ratingCount: 12,
            reviewCount: 8,
          },
          page: {
            items: [
              {
                id: "00000000-0000-4000-8000-000000008171",
                author: { nickname: "地图同学" },
                rating: 4,
                content: longReview,
                createdAt: "2026-08-30T00:00:00.000Z",
                updatedAt: "2026-08-30T00:00:00.000Z",
              },
            ],
            nextCursor: "opaque-cursor",
            isPaginated: true,
          },
        }}
        viewerFeedback={{
          id: "00000000-0000-4000-8000-000000008170",
          placeId,
          rating: 4,
          content: "原来的体验",
          version: 1,
          visibility: "public",
          createdAt: "2026-08-30T00:00:00.000Z",
          updatedAt: "2026-08-30T00:00:00.000Z",
        }}
      />,
    );

    expect(
      screen.getByLabelText(/平均 4.3 分，共 12 个评分、8 条文字评价/),
    ).toBeTruthy();
    expect(screen.getByText(longReview).className).toContain("break-words");
    expect(
      screen.getByRole("link", { name: "查看下一页评价" }).getAttribute("href"),
    ).toBe(
      `/campus-map/places/${placeId}?reviewsAfter=opaque-cursor&from=${encodeURIComponent(mapListReturnPath)}#place-feedback`,
    );
    expect(
      screen
        .getByRole("link", { name: "查看编辑记录 / History" })
        .getAttribute("href"),
    ).toBe(
      `/campus-map/places/${placeId}/history?from=${encodeURIComponent(mapListReturnPath)}`,
    );
    expect(
      (screen.getByRole("radio", { name: "4 星" }) as HTMLInputElement).checked,
    ).toBe(true);

    fireEvent.click(screen.getByText("5 星"));
    fireEvent.change(screen.getByLabelText("评价（选填）"), {
      target: { value: "更新后的体验" },
    });
    fireEvent.click(screen.getByRole("button", { name: "更新我的评价" }));
    await waitFor(() => expect(feedbackAction).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "正在保存…" })).toBeTruthy();
    expect(feedbackAction).toHaveBeenCalledWith(
      {
        kind: "update",
        feedbackId: "00000000-0000-4000-8000-000000008170",
        expectedVersion: 1,
        rating: 5,
        content: "更新后的体验",
      },
      { placeId, cursor: "opaque-current-page" },
    );
    resolveFeedback?.({
      status: "updated",
      feedback: {
        id: "00000000-0000-4000-8000-000000008170",
        placeId,
        rating: 5,
        content: "更新后的体验",
        version: 2,
        visibility: "public",
        createdAt: "2026-08-30T00:00:00.000Z",
        updatedAt: "2026-08-31T00:00:00.000Z",
      },
      snapshot: {
        placeStatus: "active",
        summary: {
          placeId,
          averageRating: 5,
          ratingCount: 1,
          reviewCount: 1,
        },
        page: {
          items: [
            {
              id: "00000000-0000-4000-8000-000000008170",
              author: { nickname: "当前用户" },
              rating: 5,
              content: "更新后的体验",
              createdAt: "2026-08-30T00:00:00.000Z",
              updatedAt: "2026-08-31T00:00:00.000Z",
            },
          ],
          nextCursor: null,
          isPaginated: true,
        },
      },
    });
    await waitFor(() => expect(screen.getByText("评价已更新。")).toBeTruthy());
    expect(
      screen.getByLabelText("平均 5.0 分，共 1 个评分、1 条文字评价"),
    ).toBeTruthy();
    expect(
      within(screen.getByRole("listitem")).getByText("更新后的体验"),
    ).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
    expect(refreshedWhilePending).toBe(false);

    expect(screen.getByText("举报评价")).toBeTruthy();
    expect(screen.getByText("管理员隐藏")).toBeTruthy();
    hideAction.mockResolvedValueOnce({
      status: "decided",
      snapshot: {
        placeStatus: "active",
        summary: {
          placeId,
          averageRating: null,
          ratingCount: 0,
          reviewCount: 0,
        },
        page: { items: [], nextCursor: null, isPaginated: true },
      },
    });
    fireEvent.click(screen.getByText("管理员隐藏"));
    fireEvent.change(screen.getByLabelText("隐藏原因"), {
      target: { value: "包含个人资料" },
    });
    fireEvent.click(screen.getByRole("button", { name: "隐藏整条评价" }));
    await waitFor(() => expect(screen.getByText("评价已隐藏。")).toBeTruthy());
    expect(hideAction).toHaveBeenCalledWith({
      placeId,
      feedbackId: "00000000-0000-4000-8000-000000008170",
      reason: "包含个人资料",
      idempotencyKey: expect.any(String),
      reviewsAfter: "opaque-current-page",
    });
    expect(screen.queryByRole("listitem")).toBeNull();
    expect(screen.getByText("暂无评分", { exact: true })).toBeTruthy();
    expect(
      screen.getByText("你的评价已被管理员隐藏。", { exact: false }),
    ).toBeTruthy();
    expect(screen.getByRole("link", { name: "返回最新评价" })).toBeTruthy();
    await waitFor(() => expect(refresh).toHaveBeenCalledTimes(2));
  });
});
