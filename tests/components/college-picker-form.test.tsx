/**
 * @vitest-environment jsdom
 */
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";
import { createContext, createElement, useContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CollegePickerForm } from "@/app/(main)/college-picker/college-picker-form";

const toastError = vi.hoisted(() => vi.fn());

vi.mock("sonner", () => ({ toast: { error: toastError } }));
vi.mock("next/image", () => ({
  default: (props: ComponentProps<"img">) => createElement("img", props),
}));

vi.mock("@/components/ui/checkbox", () => ({
  Checkbox: ({
    checked,
    onCheckedChange,
    ...props
  }: ComponentProps<"button"> & {
    checked?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  }) => (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
      {...props}
    />
  ),
}));

vi.mock("@/components/ui/select", () => {
  type SelectState = {
    items?: Record<string, string>;
    value?: string;
    onValueChange?: (value: string) => void;
  };
  const SelectContext = createContext<SelectState>({});

  return {
    Select: ({
      children,
      items,
      value,
      onValueChange,
    }: SelectState & { children: ReactNode }) => (
      <SelectContext.Provider value={{ items, value, onValueChange }}>
        {children}
      </SelectContext.Provider>
    ),
    SelectTrigger: (props: ComponentProps<"select">) => {
      const state = useContext(SelectContext);
      return (
        <select
          {...props}
          value={state.value}
          onChange={(event) => state.onValueChange?.(event.target.value)}
        >
          {Object.entries(state.items ?? {}).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      );
    },
    SelectValue: () => null,
    SelectContent: () => null,
    SelectItem: () => null,
  };
});

beforeEach(() => {
  toastError.mockReset();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  delete (Element.prototype as { scrollIntoView?: () => void }).scrollIntoView;
});

function renderForm() {
  render(<CollegePickerForm />);
}

function recommend() {
  fireEvent.click(screen.getByTestId("recommend-button"));
}

describe("CollegePickerForm", () => {
  it("renders all nine default recommendations with captures and crest paths", () => {
    renderForm();
    recommend();

    const result = screen.getByTestId("picker-result");
    const items = within(result).getAllByTestId("picker-item");
    expect(items).toHaveLength(9);
    expect(items[0].textContent).toContain("善衡书院");
    expect(items[0].textContent).toContain("地理位置优越");
    expect(items[0].textContent).toContain("共膳/高桌难吃");
    const crests = result.querySelectorAll('img[alt=""]');
    expect(crests).toHaveLength(9);
    for (const crest of crests) {
      expect(crest.getAttribute("src")).toMatch(
        /^\/college-crests\/[a-z]+\.svg$/,
      );
    }
  });

  it("keeps avoided colleges in their regions and labels all FYP hits", () => {
    renderForm();
    fireEvent.click(screen.getByTestId("avoid-College_FYP"));
    recommend();

    const items = screen.getAllByTestId("picker-item");
    expect(items).toHaveLength(9);
    expect(screen.getAllByText("已避雷")).toHaveLength(4);
    expect(items[0].textContent).not.toContain("已避雷");
    expect(items.at(-1)?.textContent).toContain("已避雷");
  });

  it("applies the selected MTR bonus to the rendered recommendation", () => {
    renderForm();
    fireEvent.click(screen.getByTestId("bonus-MTR_Distance"));
    recommend();

    const first = screen.getAllByTestId("picker-item")[0];
    expect(first.textContent).toContain("善衡书院");
    expect(first.textContent).toContain("推荐指数 94.0");
  });

  it("rejects a duplicate priority without changing the empty selection", () => {
    renderForm();
    const second = screen.getByTestId("priority-1");
    fireEvent.change(second, { target: { value: "Commute_Time" } });

    expect(toastError).toHaveBeenCalledWith("该因素已被选择！");
    expect((second as HTMLSelectElement).value).toBe("__none__");
  });

  it("clears the third priority when the second becomes None", () => {
    renderForm();
    const second = screen.getByTestId("priority-1");
    const third = screen.getByTestId("priority-2");
    fireEvent.change(second, {
      target: { value: "Accommodation_Environment" },
    });
    fireEvent.change(third, { target: { value: "Hostel_Guarantee" } });
    fireEvent.change(second, { target: { value: "__none__" } });

    expect((second as HTMLSelectElement).value).toBe("__none__");
    expect((third as HTMLSelectElement).value).toBe("__none__");
  });

  it("shows the small-college questionnaire only for preference A", () => {
    renderForm();
    expect(screen.queryByText("小书院精选")).toBeNull();

    fireEvent.click(screen.getByDisplayValue("aim"));
    expect(screen.getByText("小书院精选")).toBeTruthy();

    fireEvent.click(screen.getByDisplayValue("avoid"));
    expect(screen.queryByText("小书院精选")).toBeNull();
  });

  it("blocks an incomplete preference-A questionnaire", () => {
    renderForm();
    fireEvent.click(screen.getByDisplayValue("aim"));
    recommend();

    expect(toastError).toHaveBeenCalledWith(
      "小书院精选题未做完，做完后生成结果",
    );
    expect(screen.queryByTestId("picker-result")).toBeNull();
  });

  it("renders recommendations after all preference-A questions are answered", () => {
    renderForm();
    fireEvent.click(screen.getByDisplayValue("aim"));
    for (let index = 0; index < 4; index += 1) {
      fireEvent.click(
        within(screen.getByTestId(`sc-q-${index}`)).getByDisplayValue("A"),
      );
    }
    recommend();

    expect(screen.getByTestId("picker-result")).toBeTruthy();
    expect(screen.getAllByTestId("picker-score")[0].textContent).toContain(
      "推荐指数",
    );
  });
});
