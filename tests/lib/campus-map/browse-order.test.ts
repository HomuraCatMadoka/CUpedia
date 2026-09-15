import { describe, expect, it } from "vitest";
import {
  compareCampusMapNames,
  orderedCampusMapFloors,
} from "@/lib/campus-map/browse-order";

describe("Campus Map directory ordering (#909)", () => {
  it("uses numeric room runs and stable name/identity fallbacks", () => {
    const names = [
      { name: "YIA 10", id: "10" },
      { name: "YIA 2", id: "2" },
      { name: "休闲空间", id: "b" },
      { name: "休闲空间", id: "a" },
    ];
    const ordered = names.sort(compareCampusMapNames);
    expect(
      ordered
        .filter((item) => item.name.startsWith("YIA"))
        .map((item) => item.id),
    ).toEqual(["2", "10"]);
    expect(
      ordered.filter((item) => item.name === "休闲空间").map((item) => item.id),
    ).toEqual(["a", "b"]);
  });
  it("uses supplied Floor order even when labels look like numbers", () => {
    expect(
      orderedCampusMapFloors([
        { floorId: "upper", displayLabel: "2", sortOrder: 9 },
        { floorId: "lower", displayLabel: "10", sortOrder: -1 },
      ]).map((floor) => floor.floorId),
    ).toEqual(["lower", "upper"]);
  });
});
