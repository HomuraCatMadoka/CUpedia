import { describe, expect, it } from "vitest";

import {
  AmapInteractionAdapter,
  resolveAmapHotspotTarget,
} from "@/lib/campus-map/amap-interaction-adapter";

describe("AmapInteractionAdapter", () => {
  function manualSettlement() {
    const pending: Array<() => void> = [];
    return {
      schedule(callback: () => void) {
        pending.push(callback);
        return () => {
          const index = pending.indexOf(callback);
          if (index >= 0) pending.splice(index, 1);
        };
      },
      flush() {
        for (const callback of pending.splice(0)) callback();
      },
    };
  }

  it("emits one command for provider then companion map click", () => {
    const settlement = manualSettlement();
    const adapter = new AmapInteractionAdapter(settlement.schedule);
    const commands: string[] = [];

    adapter.beginPointerGesture();
    adapter.dispatchProviderTarget(() => commands.push("open-provider"));
    adapter.dispatchMapClick(() => commands.push("dismiss-entity"));
    settlement.flush();

    expect(commands).toEqual(["open-provider"]);
  });

  it("lets a long-press claim the pointer cycle before its companion click", () => {
    const settlement = manualSettlement();
    const adapter = new AmapInteractionAdapter(settlement.schedule);
    const commands: string[] = [];

    adapter.beginPointerGesture();
    adapter.dispatchExclusiveAction(() => commands.push("start-add"));
    adapter.dispatchMapClick(() => commands.push("dismiss-entity"));
    settlement.flush();

    expect(commands).toEqual(["start-add"]);
  });

  it("emits one command when map click arrives before its provider target", () => {
    const settlement = manualSettlement();
    const adapter = new AmapInteractionAdapter(settlement.schedule);
    const commands: string[] = [];

    adapter.beginPointerGesture();
    adapter.dispatchMapClick(() => commands.push("dismiss-entity"));
    adapter.dispatchProviderTarget(() => commands.push("open-provider"));
    settlement.flush();

    expect(commands).toEqual(["open-provider"]);
  });

  it("allows only the first provider target to claim a pointer cycle", () => {
    const settlement = manualSettlement();
    const adapter = new AmapInteractionAdapter(settlement.schedule);
    const commands: string[] = [];

    adapter.beginPointerGesture();
    adapter.dispatchProviderTarget(() => commands.push("open-marker"));
    adapter.dispatchProviderTarget(() => commands.push("open-hotspot"));
    adapter.dispatchMapClick(() => commands.push("dismiss-entity"));
    settlement.flush();

    expect(commands).toEqual(["open-marker"]);
  });

  it("settles an unclaimed blank-map click as one dismiss command", () => {
    const settlement = manualSettlement();
    const adapter = new AmapInteractionAdapter(settlement.schedule);
    const commands: string[] = [];

    adapter.beginPointerGesture();
    adapter.dispatchMapClick(() => commands.push("dismiss-entity"));
    expect(commands).toEqual([]);

    settlement.flush();

    expect(commands).toEqual(["dismiss-entity"]);
  });

  it("does not let an unfinished gesture swallow the next blank-map gesture", () => {
    const settlement = manualSettlement();
    const adapter = new AmapInteractionAdapter(settlement.schedule);
    const commands: string[] = [];

    adapter.beginPointerGesture();
    adapter.dispatchProviderTarget(() => commands.push("open-provider"));
    adapter.beginPointerGesture();
    adapter.dispatchMapClick(() => commands.push("dismiss-entity"));
    settlement.flush();

    expect(commands).toEqual(["open-provider", "dismiss-entity"]);
  });
});

describe("resolveAmapHotspotTarget", () => {
  const links = [
    {
      buildingId: "science-centre",
      providerPoiIds: ["B0J2RXUQB6"],
    },
  ];

  it("prefers an explicit provider POI id", () => {
    expect(
      resolveAmapHotspotTarget(
        {
          id: "B0J2RXUQB6",
          name: "provider label changed",
          lnglat: { lng: 114.20801, lat: 22.41966 },
        },
        links,
      ),
    ).toEqual({ kind: "building", buildingId: "science-centre" });
  });

  it("keeps both exact and nearby provider names transient without an explicit id mapping", () => {
    expect(
      resolveAmapHotspotTarget(
        {
          name: "ScienceCentre 科学馆",
          lnglat: { lng: 114.20801, lat: 22.41966 },
        },
        links,
      ),
    ).toEqual({
      kind: "external",
      providerId: "114.20801,22.41966",
      name: "ScienceCentre 科学馆",
      position: [114.20801, 22.41966],
    });
    expect(
      resolveAmapHotspotTarget(
        {
          name: "科学馆东座",
          lnglat: { lng: 114.2084, lat: 22.4198 },
        },
        links,
      ),
    ).toEqual({
      kind: "external",
      providerId: "114.2084,22.4198",
      name: "科学馆东座",
      position: [114.2084, 22.4198],
    });
  });
});
