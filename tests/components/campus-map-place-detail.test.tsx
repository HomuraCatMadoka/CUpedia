/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lifecycleAction, refresh } = vi.hoisted(() => ({
  lifecycleAction: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

vi.mock("@/lib/campus-map/place-lifecycle-actions", () => ({
  runCampusMapPlaceLifecycleAction: (...args: unknown[]) =>
    lifecycleAction(...args),
}));

import { CampusMapPlaceDetail } from "@/components/campus-map/place-detail";
import type { CampusMapHistoricalFact } from "@/lib/campus-map/fact-store";

const placeId = "00000000-0000-4000-8000-000000008160";
const revisionId = "00000000-0000-4000-8000-000000008161";
const fact: CampusMapHistoricalFact = {
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-08-31T15:59:00.000Z"));
  lifecycleAction.mockResolvedValue({
    status: "published",
    changesetId: "00000000-0000-4000-8000-000000008164",
    revisionId: "00000000-0000-4000-8000-000000008165",
  });
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

    expect(screen.getByText("这个地点已停用")).toBeTruthy();
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

  it("submits the admin reason once, exposes pending state, refreshes, and reports errors", async () => {
    let resolveAction: ((value: { status: "published" }) => void) | undefined;
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
      sourceAccessedOn: "2026-08-31",
    });
    const completedRequest = lifecycleAction.mock.calls[0][0];
    resolveAction?.({ status: "published" });
    await waitFor(() => expect(refresh).toHaveBeenCalledOnce());
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
    expect(retryableRequest).toMatchObject({
      sourceAccessedOn: "2026-08-31",
    });
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
      sourceAccessedOn: "2026-08-31",
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
    expect(lifecycleAction.mock.calls.at(-1)?.[0]).toMatchObject({
      sourceAccessedOn: "2026-09-01",
    });
    expect(lifecycleAction.mock.calls.at(-1)?.[0].idempotencyKey).not.toBe(
      retryableRequest.idempotencyKey,
    );
  });
});
