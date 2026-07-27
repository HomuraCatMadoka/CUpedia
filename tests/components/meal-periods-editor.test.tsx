/**
 * @vitest-environment jsdom
 */
import { useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MealPeriodsEditor } from "@/components/admin/meal-periods-editor";
import type { MealPeriodAssignment } from "@/lib/canteen-types";

afterEach(cleanup);

describe("MealPeriodsEditor", () => {
  it("keeps all-day exclusive and supports multiple specific periods", () => {
    function Harness() {
      const [periods, setPeriods] = useState<MealPeriodAssignment[]>([
        "allday",
      ]);
      return (
        <>
          <MealPeriodsEditor
            idPrefix="test-meal"
            value={periods}
            onChange={setPeriods}
          />
          <output>{periods.join(",")}</output>
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getByLabelText("午餐"));
    expect(screen.getByText("lunch")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("晚餐"));
    expect(screen.getByText("lunch,dinner")).toBeTruthy();

    fireEvent.click(screen.getByLabelText("午餐"));
    fireEvent.click(screen.getByLabelText("晚餐"));
    expect(screen.getByText("allday")).toBeTruthy();
  });
});
