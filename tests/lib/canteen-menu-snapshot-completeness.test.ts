import { describe, expect, it } from "vitest";
import {
  assertProviderSnapshotCompleteness,
  expectedMenuSnapshotCompleteness,
  parseMenuSnapshotCompleteness,
  snapshotAbsenceIsEvidence,
} from "@/lib/canteen-menu-snapshot-completeness";
import { parseMenuSyncJson } from "@/lib/canteen-types";

describe("menu snapshot completeness", () => {
  it("defines completeness at the provider boundary", () => {
    expect(expectedMenuSnapshotCompleteness("pinme")).toBe("partial");
    expect(expectedMenuSnapshotCompleteness("aigens")).toBe("complete");
    expect(expectedMenuSnapshotCompleteness("ichef")).toBe("complete");
    expect(expectedMenuSnapshotCompleteness("qmai")).toBe("complete");

    expect(() =>
      assertProviderSnapshotCompleteness("pinme", "complete"),
    ).toThrow("MENU_SNAPSHOT_COMPLETENESS_MISMATCH");
    expect(() =>
      assertProviderSnapshotCompleteness("pinme", "partial"),
    ).not.toThrow();
  });

  it("requires validated scope evidence before Aigens can remove absent items", () => {
    expect(() =>
      assertProviderSnapshotCompleteness("aigens", "complete"),
    ).toThrow("MENU_SNAPSHOT_SCOPE_EVIDENCE_REQUIRED");
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
    ).not.toThrow();
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
});
