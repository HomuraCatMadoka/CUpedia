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
import { createContext, useContext } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CourseTreeView } from "@/app/(main)/course-tree/course-tree-view";
import { computeTree } from "@/lib/course-tree/compute-tree";
import type {
  CategoryInput,
  CourseInfo,
  MajorListItem,
  MajorMeta,
  MajorTree,
} from "@/lib/course-tree/types";

const { getMajorTree, listMyBuilds, loadBuild, saveBuild } = vi.hoisted(() => ({
  getMajorTree: vi.fn(),
  listMyBuilds: vi.fn(),
  loadBuild: vi.fn(),
  saveBuild: vi.fn(),
}));

vi.mock("@/lib/course-actions", () => ({ getMajorTree }));
vi.mock("@/lib/build-actions", () => ({
  listMyBuilds,
  loadBuild,
  saveBuild,
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

const majors: MajorListItem[] = [
  {
    id: "cs",
    name: "Computer Science (Seed)",
    handbookYear: "2023-24",
    totalUnits: 99,
  },
  {
    id: "math",
    name: "Mathematics (Seed)",
    handbookYear: "2023-24",
    totalUnits: 90,
  },
];

function course(code: string, options: Partial<CourseInfo> = {}): CourseInfo {
  return {
    code,
    title: code,
    units: 3,
    description: "",
    terms: [],
    ...options,
  };
}

const csMajor: MajorMeta = {
  id: "cs",
  name: "Computer Science (Seed)",
  handbookYear: "2023-24",
  totalUnits: 99,
  normativeYears: 4,
};
const csCategories: CategoryInput[] = [
  {
    id: "core",
    name: "Required Core",
    kind: "required",
    unitsRequired: 12,
    pickN: null,
    members: ["CSCI1130", "CSCI1120", "CSCI2100", "ENGG2020"].map(
      (courseCode) => ({ courseCode, missing: false }),
    ),
  },
  {
    id: "math",
    name: "Mathematics Requirement",
    kind: "one-of",
    unitsRequired: null,
    pickN: 1,
    members: ["MATH1510", "MATH1030"].map((courseCode) => ({
      courseCode,
      missing: false,
    })),
  },
  {
    id: "advanced",
    name: "Advanced Electives",
    kind: "basket",
    unitsRequired: 9,
    pickN: null,
    members: ["CSCI3230", "CSCI3130", "STAT2001", "CSCI3150"]
      .map((courseCode) => ({ courseCode, missing: false }))
      .concat({ courseCode: "GESC1000", missing: true }),
  },
];
const csCourses: CourseInfo[] = [
  course("CSCI1130", {
    title: "Introduction to Java",
    description: "Java programming",
    terms: ["T1"],
    exclusions: ["CSCI1120"],
  }),
  course("CSCI1120", { exclusions: ["CSCI1130"] }),
  course("CSCI2100", {
    prerequisites: [{ codes: ["CSCI1120", "CSCI1130"] }],
  }),
  course("ENGG2020"),
  course("MATH1510"),
  course("MATH1030"),
  course("CSCI3230", {
    prerequisites: [{ codes: ["CSCI2100"] }],
    prerequisiteWarning: "旁路条款",
  }),
  course("CSCI3130", { prerequisites: [{ codes: ["CSCI2110"] }] }),
  course("STAT2001"),
  course("CSCI3150"),
];
const csTree = computeTree(csMajor, csCategories, csCourses);

const mathTree: MajorTree = {
  majorId: "math",
  name: "Mathematics (Seed)",
  handbookYear: "2023-24",
  totalUnits: 90,
  groups: [
    {
      id: "math-core",
      name: "Core",
      kind: "required",
      unitsRequired: 3,
      pickN: null,
      nodes: [
        {
          code: "MATH2010",
          title: "MATH2010",
          units: 3,
          description: "",
          terms: [],
          level: 2,
          missing: false,
          prereqCodes: [],
          prereqNote: null,
        },
      ],
    },
    {
      id: "math-elective",
      name: "Elective",
      kind: "basket",
      unitsRequired: 3,
      pickN: null,
      nodes: [],
    },
  ],
  equivalenceGroups: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  getMajorTree.mockImplementation(async (id: string) =>
    id === "math" ? mathTree : csTree,
  );
  listMyBuilds.mockResolvedValue([]);
  saveBuild.mockResolvedValue(undefined);
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderTree(isAuthenticated = false) {
  render(<CourseTreeView majors={majors} isAuthenticated={isAuthenticated} />);
  await screen.findByTestId("total-units");
}

function node(code: string) {
  return document.querySelector(`[data-code="${code}"]`) as HTMLButtonElement;
}

describe("CourseTreeView", () => {
  it("renders the complete default tree, missing placeholder and topology", async () => {
    await renderTree();

    expect(screen.getAllByTestId("course-node")).toHaveLength(11);
    expect(screen.getAllByTestId("category-group")).toHaveLength(3);
    expect(screen.getByTestId("total-units").textContent).toBe("0 / 99");
    expect(node("GESC1000").disabled).toBe(true);
    expect(node("GESC1000").textContent).toContain("暂无课程详情");
    expect(node("CSCI1130").title).toContain("Java");
    expect(screen.getAllByTestId("prereq-edge")).toHaveLength(3);
    expect(document.querySelectorAll('[data-to="CSCI2100"]')).toHaveLength(2);

    fireEvent.mouseEnter(node("CSCI3130"));
    expect(screen.getByTestId("course-tip").textContent).toContain("CSCI2110");
  });

  it("updates progress, enforces equivalence and highlights satisfied edges", async () => {
    await renderTree();
    const core = screen
      .getAllByTestId("category-group")
      .find((group) => group.textContent?.includes("Required Core"))!;
    expect(within(core).getByTestId("category-progress").textContent).toContain(
      "还差 12 学分",
    );

    fireEvent.click(node("CSCI1130"));
    expect(screen.getByTestId("total-units").textContent).toBe("3 / 99");
    expect(within(core).getByTestId("category-progress").textContent).toContain(
      "还差 9 学分",
    );
    expect(node("CSCI1120").disabled).toBe(true);
    expect(node("CSCI1120").dataset.blocked).toBe("true");
    expect(
      document
        .querySelector('[data-from="CSCI1120"][data-to="CSCI2100"]')
        ?.getAttribute("data-hot"),
    ).toBe("true");

    fireEvent.click(node("CSCI1130"));
    expect(node("CSCI1120").disabled).toBe(false);

    const aiEdge = document.querySelector(
      '[data-from="CSCI2100"][data-to="CSCI3230"]',
    );
    fireEvent.click(node("CSCI3230"));
    expect(node("CSCI3230").dataset.lit).toBe("true");
    expect(node("CSCI2100").dataset.lit).toBe("false");
    expect(aiEdge?.getAttribute("data-hot")).toBe("false");
    fireEvent.click(node("CSCI2100"));
    expect(aiEdge?.getAttribute("data-hot")).toBe("true");

    fireEvent.click(node("MATH1510"));
    const math = screen
      .getAllByTestId("category-group")
      .find((group) => group.textContent?.includes("Mathematics Requirement"))!;
    expect(within(math).getByTestId("category-progress").textContent).toContain(
      "已满",
    );
  });

  it("loads another major and clears the local build", async () => {
    await renderTree();
    fireEvent.click(node("CSCI1130"));
    expect(screen.getByTestId("total-units").textContent).toBe("3 / 99");

    fireEvent.change(screen.getByTestId("major-select"), {
      target: { value: "math" },
    });
    await screen.findByText("0 / 90");

    expect(screen.getAllByTestId("category-group")).toHaveLength(2);
    expect(node("CSCI1130")).toBeNull();
  });

  it("reports strict-mode season, bypass and term-cap outcomes", async () => {
    await renderTree();
    fireEvent.click(screen.getByRole("button", { name: "严格模式" }));
    expect(
      screen.getByTestId("active-term").querySelectorAll("option"),
    ).toHaveLength(8);
    fireEvent.change(screen.getByTestId("active-term"), {
      target: { value: "2" },
    });
    fireEvent.click(node("CSCI1130"));
    expect(node("CSCI1130").dataset.lit).toBe("false");
    expect(screen.getByTestId("strict-feedback").textContent).toContain(
      "不在当前季节开课",
    );

    fireEvent.click(node("CSCI3230"));
    expect(node("CSCI3230").dataset.term).toBe("2");
    expect(screen.getByTestId("strict-feedback").textContent).toContain(
      "旁路条款",
    );

    fireEvent.change(screen.getByTestId("active-term"), {
      target: { value: "1" },
    });
    fireEvent.change(screen.getByTestId("term-cap"), {
      target: { value: "3" },
    });
    fireEvent.click(node("MATH1510"));
    fireEvent.click(node("STAT2001"));
    expect(node("STAT2001").dataset.lit).toBe("false");
    expect(screen.getByTestId("strict-feedback").textContent).toContain(
      "超过上限 3",
    );
  });

  it("sends anonymous users to login instead of showing persistence controls", async () => {
    await renderTree();

    expect(screen.getByTestId("login-to-save").getAttribute("href")).toBe(
      "/login",
    );
    expect(screen.queryByTestId("save-build")).toBeNull();
  });
});
