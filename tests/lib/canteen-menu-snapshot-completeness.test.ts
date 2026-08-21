import { describe, expect, it } from "vitest";
import {
  assertProviderSnapshotCompleteness,
  expectedMenuSnapshotCompleteness,
  menuSnapshotComparisonContext,
  parseMenuSnapshotCompleteness,
  snapshotAbsenceIsEvidence,
} from "@/lib/canteen-menu-snapshot-completeness";
import { parseMenuSyncJson } from "@/lib/canteen-types";

describe("menu snapshot completeness", () => {
  it("defines completeness at the provider boundary", () => {
    expect(expectedMenuSnapshotCompleteness("pinme")).toBe("partial");
    expect(expectedMenuSnapshotCompleteness("aigens")).toBe("partial");
    expect(expectedMenuSnapshotCompleteness("ichef")).toBe("complete");
    expect(expectedMenuSnapshotCompleteness("qmai")).toBe("complete");

    expect(() =>
      assertProviderSnapshotCompleteness("pinme", "complete"),
    ).toThrow("MENU_SNAPSHOT_COMPLETENESS_MISMATCH");
    expect(() =>
      assertProviderSnapshotCompleteness("pinme", "partial"),
    ).not.toThrow();
    expect(() =>
      assertProviderSnapshotCompleteness("pinme", "partial", {
        provider: "pinme",
        serviceWindows: [{ startTime: "11:00", endTime: "14:00" }],
      }),
    ).not.toThrow();
    expect(() =>
      assertProviderSnapshotCompleteness("aigens", "partial"),
    ).not.toThrow();
  });

  it("does not promote an Aigens ordering observation with diagnostic scope", () => {
    expect(() =>
      assertProviderSnapshotCompleteness("aigens", "complete"),
    ).toThrow("MENU_SNAPSHOT_COMPLETENESS_MISMATCH");
    expect(() =>
      assertProviderSnapshotCompleteness(
        "aigens",
        "complete",
        {
          provider: "aigens",
          externalStoreId: "102830",
          storeName: "中文大學善衡書院",
          menuName: "中文大學",
          providerPeriodCodes: ["B", "L"],
          categoryPeriodCodes: ["B", "L"],
          categoryCount: 44,
          groupCount: 60,
        },
        "102830",
      ),
    ).toThrow("MENU_SNAPSHOT_COMPLETENESS_MISMATCH");
    expect(() =>
      assertProviderSnapshotCompleteness(
        "aigens",
        "partial",
        {
          provider: "aigens",
          externalStoreId: "102830",
          storeName: "中文大學善衡書院",
          menuName: "中文大學",
          providerPeriodCodes: ["B", "L"],
          categoryPeriodCodes: ["B", "L"],
          categoryCount: 44,
          groupCount: 60,
        },
        "112891",
      ),
    ).toThrow("MENU_SNAPSHOT_SCOPE_EVIDENCE_MISMATCH");
  });

  it("requires the caller to assert completeness explicitly", () => {
    const item = { externalProductId: "item-1", name: "Item 1" };
    expect(
      parseMenuSyncJson({ snapshotCompleteness: "partial", items: [item] }),
    ).toMatchObject({ snapshotCompleteness: "partial" });
    expect(() => parseMenuSyncJson({ items: [item] })).toThrow(
      "INVALID_MENU_SNAPSHOT_COMPLETENESS",
    );
    expect(() => parseMenuSnapshotCompleteness(undefined)).toThrow(
      "INVALID_MENU_SNAPSHOT_COMPLETENESS",
    );
  });

  it("rejects invalid completeness instead of manufacturing complete", () => {
    expect(() =>
      parseMenuSyncJson({
        snapshotCompleteness: "unknown",
        items: [{ externalProductId: "item-1", name: "Item 1" }],
      }),
    ).toThrow("INVALID_MENU_SNAPSHOT_COMPLETENESS");
  });

  it("treats absence as evidence only for complete snapshots", () => {
    expect(snapshotAbsenceIsEvidence("complete")).toBe(true);
    expect(snapshotAbsenceIsEvidence("partial")).toBe(false);
  });

  it("compares stable provider context without result-dependent counts", () => {
    expect(
      menuSnapshotComparisonContext({
        provider: "aigens",
        externalStoreId: "102830",
        storeName: "旧名称",
        menuName: "中文大學",
        providerPeriodCodes: ["L"],
        categoryPeriodCodes: ["L"],
        categoryCount: 44,
        groupCount: 60,
      }),
    ).toEqual({
      provider: "aigens",
      externalStoreId: "102830",
      menuName: "中文大學",
      providerPeriodCodes: ["L"],
      categoryPeriodCodes: ["L"],
    });
  });
});
