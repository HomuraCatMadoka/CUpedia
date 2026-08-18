import type { ComponentProps, ReactNode } from "react";
import { createContext, useContext } from "react";

type SelectState = {
  items?: Record<string, string>;
  value?: string;
  onValueChange?: (value: string) => void;
};

export function createSelectMock() {
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
}
