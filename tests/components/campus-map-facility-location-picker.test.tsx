// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FacilityLocationPicker } from "@/components/campus-map/facility-location-picker";
import { asWgs84Position } from "@/lib/campus-map/amap-position";

const submit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/campus-map/map-note-actions", () => ({
  commandCampusMapNoteAction: submit,
}));
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

function hotspotReference(
  name: string,
  providerObjectId: string,
  position: readonly [number, number] = [114.2, 22.4],
) {
  return {
    identity: { provider: "amap", providerObjectId },
    name,
    position: asWgs84Position(position),
  };
}

describe("missing building feedback", () => {
  it("waits for a search before showing directory results", () => {
    render(
      <FacilityLocationPicker
        buildings={[
          {
            buildingId: "science",
            name: "科学馆",
            englishName: "Science Centre",
            code: null,
            aliases: [],
            anchor: null,
            floors: [],
            placeIds: [],
            selectionTarget: { kind: "building", buildingId: "science" },
          },
        ]}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "科学馆" })).toBeNull();
    fireEvent.change(screen.getByRole("searchbox", { name: "搜索建筑" }), {
      target: { value: "科学馆" },
    });
    expect(screen.getByRole("button", { name: "科学馆" })).not.toBeNull();
  });

  it("suggests the clicked bilingual building without silently selecting it", () => {
    const onEvent = vi.fn();
    render(
      <FacilityLocationPicker
        buildings={[
          {
            buildingId: "science",
            name: "科学馆",
            englishName: "Science Centre",
            code: null,
            aliases: [],
            anchor: null,
            floors: [],
            placeIds: [],
            selectionTarget: { kind: "building", buildingId: "science" },
          },
        ]}
        reference={hotspotReference("ScienceCentre科学馆", "science-centre")}
        onEvent={onEvent}
      />,
    );
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe(
      "ScienceCentre科学馆",
    );
    expect(onEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "科学馆" }));
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "SELECT_BUILDING_LOCATION",
        locationDisplay: expect.objectContaining({ buildingId: "science" }),
      }),
    );
  });

  it("submits the clicked reference as a map note without publishing a facility", async () => {
    submit.mockResolvedValue({ status: "created", noteId: "note-1" });
    const onEvent = vi.fn();
    render(
      <FacilityLocationPicker
        buildings={[]}
        reference={hotspotReference("科学馆东座", "science-east-wing")}
        onEvent={onEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "补充说明（选填）" }),
      { target: { value: "入口旁有饮水机" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await screen.findByRole("link", { name: "查看反馈" });
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "create",
        placeId: null,
        position: { longitude: 114.2, latitude: 22.4, crs: "wgs84" },
        openingComment: "缺失建筑：科学馆东座\n入口旁有饮水机",
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "返回选建筑" }));
    expect(onEvent).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    expect(screen.queryByRole("button", { name: "提交反馈" })).toBeNull();
  });

  it("starts fresh feedback for a different provider hotspot with the same display", async () => {
    submit.mockResolvedValue({ status: "created", noteId: "note-1" });
    const onEvent = vi.fn();
    const { rerender } = render(
      <FacilityLocationPicker
        buildings={[]}
        reference={hotspotReference("同名建筑", "building-a")}
        onEvent={onEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "补充说明（选填）" }),
      { target: { value: "A 的入口" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await screen.findByRole("link", { name: "查看反馈" });
    fireEvent.click(screen.getByRole("button", { name: "返回选建筑" }));

    rerender(
      <FacilityLocationPicker
        buildings={[]}
        reference={hotspotReference("同名建筑", "building-b")}
        onEvent={onEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));

    expect(
      (
        screen.getByRole("textbox", {
          name: "补充说明（选填）",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("");
    expect(screen.queryByText("已提交建筑反馈")).toBeNull();
    expect(screen.getByRole("button", { name: "提交反馈" })).not.toBeNull();
  });

  it("starts fresh feedback when an unidentified hotspot is clicked again", () => {
    const reference = (interactionKey: string) => ({
      identity: null,
      interactionKey,
      name: "没有 ID 的建筑",
      position: asWgs84Position([114.2, 22.4]),
    });
    const onEvent = vi.fn();
    const { rerender } = render(
      <FacilityLocationPicker
        buildings={[]}
        reference={reference("first-click")}
        onEvent={onEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "补充说明（选填）" }),
      { target: { value: "第一次填写" } },
    );

    rerender(
      <FacilityLocationPicker
        buildings={[]}
        reference={reference("second-click")}
        onEvent={onEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    expect(
      (
        screen.getByRole("textbox", {
          name: "补充说明（选填）",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("");
  });

  it("keeps feedback state when the same provider hotspot changes display", async () => {
    let resolveRequest:
      | ((result: { status: "created"; noteId: string }) => void)
      | null = null;
    submit.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const onEvent = vi.fn();
    const reference = (
      name = "建筑 A",
      position: readonly [number, number] = [114.2, 22.4],
    ) => hotspotReference(name, "building-a", position);
    const { rerender } = render(
      <FacilityLocationPicker
        buildings={[]}
        reference={reference("建筑 A（地图更新）", [114.21, 22.41])}
        onEvent={onEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "补充说明（选填）" }),
      { target: { value: "保留这段说明" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    rerender(
      <FacilityLocationPicker
        buildings={[]}
        reference={reference("建筑 A（地图更新）", [114.21, 22.41])}
        onEvent={onEvent}
      />,
    );
    expect(
      (
        screen.getByRole("textbox", {
          name: "补充说明（选填）",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("保留这段说明");

    await act(async () => {
      resolveRequest?.({ status: "created", noteId: "note-a" });
      await Promise.resolve();
    });
    await screen.findByRole("link", { name: "查看反馈" });

    rerender(
      <FacilityLocationPicker
        buildings={[]}
        reference={reference()}
        onEvent={onEvent}
      />,
    );
    expect(screen.getByRole("link", { name: "查看反馈" })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "提交反馈" })).toBeNull();
  });

  it("ignores a completed feedback request after the reference changes", async () => {
    let resolveRequest:
      | ((result: { status: "created"; noteId: string }) => void)
      | null = null;
    submit.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const onEvent = vi.fn();
    const { rerender } = render(
      <FacilityLocationPicker
        buildings={[]}
        reference={hotspotReference("建筑 A", "building-a")}
        onEvent={onEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    rerender(
      <FacilityLocationPicker
        buildings={[]}
        reference={hotspotReference("建筑 B", "building-b", [114.3, 22.5])}
        onEvent={onEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    await act(async () => {
      resolveRequest?.({ status: "created", noteId: "note-a" });
      await Promise.resolve();
    });

    expect(screen.queryByText("已提交建筑反馈")).toBeNull();
    expect(screen.getByRole("button", { name: "提交反馈" })).not.toBeNull();
  });

  it("ignores an old request after switching away and back to the same reference", async () => {
    let resolveRequest:
      | ((result: { status: "created"; noteId: string }) => void)
      | null = null;
    submit.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      }),
    );
    const onEvent = vi.fn();
    const reference = (name: string) =>
      hotspotReference(name, name === "建筑 A" ? "building-a" : "building-b", [
        name === "建筑 A" ? 114.2 : 114.3,
        22.4,
      ]);
    const { rerender } = render(
      <FacilityLocationPicker
        buildings={[]}
        reference={reference("建筑 A")}
        onEvent={onEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));

    rerender(
      <FacilityLocationPicker
        buildings={[]}
        reference={reference("建筑 B")}
        onEvent={onEvent}
      />,
    );
    rerender(
      <FacilityLocationPicker
        buildings={[]}
        reference={reference("建筑 A")}
        onEvent={onEvent}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    fireEvent.change(
      screen.getByRole("textbox", { name: "补充说明（选填）" }),
      { target: { value: "第二次填写" } },
    );

    await act(async () => {
      resolveRequest?.({ status: "created", noteId: "old-note-a" });
      await Promise.resolve();
    });

    expect(
      (
        screen.getByRole("textbox", {
          name: "补充说明（选填）",
        }) as HTMLTextAreaElement
      ).value,
    ).toBe("第二次填写");
    expect(screen.queryByText("已提交建筑反馈")).toBeNull();
    expect(screen.getByRole("button", { name: "提交反馈" })).not.toBeNull();
  });

  it("preserves feedback on return and requires an explicit position", () => {
    render(
      <FacilityLocationPicker
        buildings={[]}
        onEvent={vi.fn()}
        onPickPosition={() => asWgs84Position([114.3, 22.5])}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    fireEvent.change(screen.getByRole("textbox", { name: "建筑名称" }), {
      target: { value: "新教学楼" },
    });
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    expect(screen.getByText("请先选择建筑位置。")).not.toBeNull();
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "返回选建筑" }));
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    expect(
      (screen.getByRole("textbox", { name: "建筑名称" }) as HTMLInputElement)
        .value,
    ).toBe("新教学楼");
    fireEvent.click(screen.getByRole("button", { name: "使用图钉位置" }));
    expect(
      (screen.getByRole("button", { name: "提交反馈" }) as HTMLButtonElement)
        .disabled,
    ).toBe(false);
  });

  it("keeps the same request identity when retrying a network failure", async () => {
    submit
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ status: "created", noteId: "note-2" });
    render(
      <FacilityLocationPicker
        buildings={[]}
        reference={hotspotReference("新楼", "new-building")}
        onEvent={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await screen.findByText("网络连接失败，请重试。");
    fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit.mock.calls[0][0]).toEqual(submit.mock.calls[1][0]);
  });
});

it("requires reselecting a feedback position after the map moves", () => {
  const onEvent = vi.fn();
  const props = {
    buildings: [],
    onEvent,
    onPickPosition: () => asWgs84Position([114.2, 22.4]),
  };
  const { rerender } = render(
    <FacilityLocationPicker {...props} livePosition={[114.2, 22.4]} />,
  );
  fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
  fireEvent.change(screen.getByRole("textbox", { name: "建筑名称" }), {
    target: { value: "新楼" },
  });
  fireEvent.click(screen.getByRole("button", { name: "使用图钉位置" }));
  rerender(<FacilityLocationPicker {...props} livePosition={[114.3, 22.5]} />);
  expect(screen.getByText("位置已移动，请重新使用图钉位置。")).not.toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
  expect(submit).not.toHaveBeenCalled();
});

it("requires an explicit pin choice when a live map accompanies a hotspot reference", () => {
  render(
    <FacilityLocationPicker
      buildings={[]}
      onEvent={vi.fn()}
      reference={hotspotReference("新楼", "new-building")}
      livePosition={[114.2, 22.4]}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "找不到这栋建筑" }));
  fireEvent.click(screen.getByRole("button", { name: "提交反馈" }));
  expect(screen.getByText("请先选择建筑位置。")).not.toBeNull();
  expect(submit).not.toHaveBeenCalled();
});
