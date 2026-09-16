/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CampusMapCategoryResultsPanel } from "@/components/campus-map/category-results-panel";
import { createCampusMapBrowseFixture } from "../helpers/campus-map-browse-projection";

afterEach(cleanup);

describe("campus-map classroom building jumps", () => {
  it("can jump to the same Building again after scrolling away", () => {
    const fixture = createCampusMapBrowseFixture();
    const resultsRef = createRef<HTMLDivElement>();
    render(
      <CampusMapCategoryResultsPanel
        category="classroom"
        facilities={[fixture.places[0]!, fixture.places[2]!].map((place) => ({
          ...place,
          placeType: "classroom",
        }))}
        buildings={
          new Map(
            fixture.buildings.map((building) => [
              building.buildingId,
              building,
            ]),
          )
        }
        buildingLabel={(building) => building.name}
        rowMetadata={() => ({ location: "建筑内", summary: "" })}
        covers={{}}
        expanded
        clusterStatus="ready"
        titleRef={null}
        resultsRef={resultsRef}
        onSelect={vi.fn()}
        onClose={vi.fn()}
        onAdd={vi.fn()}
        onExpand={vi.fn()}
        onSwitchCategory={vi.fn()}
      />,
    );
    const picker = screen.getByRole<HTMLSelectElement>("combobox", {
      name: "查找建筑分组",
    });
    const heading = screen.getByRole("heading", { name: /^科学馆/ });
    const scroller = resultsRef.current!;
    const scrollIntoView = vi.fn(() => {
      scroller.scrollTop = 120;
    });
    Object.defineProperty(heading, "scrollIntoView", { value: scrollIntoView });
    const chooseBuilding = () => {
      picker.focus();
      // Native selects emit change only when the selected value changes;
      // fireEvent alone would incorrectly emit it for an already selected item.
      if (picker.value !== heading.id) {
        fireEvent.change(picker, { target: { value: heading.id } });
      }
    };

    chooseBuilding();
    expect(scroller.scrollTop).toBe(120);
    expect(document.activeElement).toBe(heading);

    scroller.scrollTop = 0;
    fireEvent.scroll(scroller);
    chooseBuilding();

    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    expect(scroller.scrollTop).toBe(120);
    expect(document.activeElement).toBe(heading);
  });
});

describe("campus-map cluster member entry", () => {
  it("lists every canonical member once when one map position cannot split", () => {
    const fixture = createCampusMapBrowseFixture();
    const facilities = fixture.places.filter(
      (place) => place.placeType === "water",
    );
    const onSelect = vi.fn();
    const { container } = render(
      <CampusMapCategoryResultsPanel
        category="water"
        facilities={facilities}
        featuredFacilities={facilities}
        buildings={
          new Map(
            fixture.buildings.map((building) => [
              building.buildingId,
              building,
            ]),
          )
        }
        buildingLabel={(building) => building.name}
        rowMetadata={(place) => ({
          location: place.buildingId ?? "独立地点",
          summary: "",
        })}
        covers={{}}
        expanded
        clusterStatus="ready"
        titleRef={null}
        resultsRef={null}
        onSelect={onSelect}
        onClose={vi.fn()}
        onAdd={vi.fn()}
        onExpand={vi.fn()}
        onSwitchCategory={vi.fn()}
      />,
    );

    const memberList = container.querySelector<HTMLElement>(
      "[data-campus-map-cluster-members]",
    )!;
    expect(
      within(memberList).getByRole("heading", {
        name: "此地图位置的地点2 处",
      }),
    ).not.toBeNull();
    const memberButtons = within(memberList).getAllByRole("button");
    expect(memberButtons).toHaveLength(2);
    fireEvent.click(memberButtons[1]!);
    expect(onSelect).toHaveBeenCalledWith(facilities[1]);
  });
});
