import type { Canteen, CanteenMenuItem } from "@/lib/canteen-types";
import { parseMealPeriod, validateCanteenName, validateLocation, validateMenuItemName, validatePrice, validateSortOrder, validateSvgKey } from "@/lib/canteen-types";

/** Dev/demo mode: in-memory canteen data, no PostgreSQL required. */
export function isCanteenMockMode(): boolean {
  return process.env.CANTEEN_MOCK_DATA === "true";
}

type MockState = {
  canteens: Canteen[];
  items: CanteenMenuItem[];
};

function now() {
  return new Date();
}

function seedState(): MockState {
  const t = now();
  const c1: Canteen = {
    id: "mock-canteen-union",
    name: "和声书院食堂",
    location: "SHB G/F",
    createdAt: t,
    updatedAt: t,
  };
  const c2: Canteen = {
    id: "mock-canteen-wei",
    name: "伟伦学生餐厅",
    location: "WLB",
    createdAt: t,
    updatedAt: t,
  };
  const items: CanteenMenuItem[] = [
    {
      id: "mock-item-1",
      canteenId: c1.id,
      name: "叉烧焗饭",
      price: 28,
      mealPeriod: "lunch",
      sortOrder: 0,
      svgKey: "rice",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "mock-item-2",
      canteenId: c1.id,
      name: "皮蛋瘦肉粥",
      price: 12,
      mealPeriod: "breakfast",
      sortOrder: 0,
      svgKey: "bowl",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "mock-item-3",
      canteenId: c2.id,
      name: "麻辣香锅",
      price: 35,
      mealPeriod: "dinner",
      sortOrder: 0,
      svgKey: "spicy",
      createdAt: t,
      updatedAt: t,
    },
  ];
  return { canteens: [c1, c2], items };
}

let state: MockState | null = null;

function getState(): MockState {
  if (!state) state = seedState();
  return state;
}

export function mockListCanteens(): Canteen[] {
  return [...getState().canteens].sort((a, b) => a.name.localeCompare(b.name));
}

export function mockGetCanteen(id: string): Canteen | null {
  return getState().canteens.find((c) => c.id === id) ?? null;
}

export function mockListMenuItems(canteenId: string): CanteenMenuItem[] {
  return getState()
    .items.filter((i) => i.canteenId === canteenId)
    .sort((a, b) => {
      if (a.mealPeriod !== b.mealPeriod) {
        return a.mealPeriod.localeCompare(b.mealPeriod);
      }
      if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
      return a.name.localeCompare(b.name);
    });
}

export function mockCreateCanteen(input: {
  name: unknown;
  location?: unknown;
}): Canteen {
  const t = now();
  const row: Canteen = {
    id: crypto.randomUUID(),
    name: validateCanteenName(input.name),
    location: validateLocation(input.location ?? null),
    createdAt: t,
    updatedAt: t,
  };
  getState().canteens.push(row);
  return row;
}

export function mockUpdateCanteen(
  id: string,
  input: { name?: unknown; location?: unknown },
): Canteen {
  const s = getState();
  const idx = s.canteens.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error("CANTEEN_NOT_FOUND");
  const row = s.canteens[idx];
  if (input.name !== undefined) row.name = validateCanteenName(input.name);
  if (input.location !== undefined) row.location = validateLocation(input.location);
  row.updatedAt = now();
  return { ...row };
}

export function mockDeleteCanteen(id: string): void {
  const s = getState();
  const idx = s.canteens.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error("CANTEEN_NOT_FOUND");
  s.canteens.splice(idx, 1);
  s.items = s.items.filter((i) => i.canteenId !== id);
}

export function mockCreateMenuItem(
  canteenId: string,
  input: {
    name: unknown;
    price?: unknown;
    mealPeriod?: unknown;
    sortOrder?: unknown;
    svgKey?: unknown;
  },
): CanteenMenuItem {
  if (!mockGetCanteen(canteenId)) throw new Error("CANTEEN_NOT_FOUND");
  const mealPeriod = parseMealPeriod(String(input.mealPeriod ?? "lunch"));
  if (!mealPeriod) throw new Error("INVALID_MEAL_PERIOD");
  const t = now();
  const row: CanteenMenuItem = {
    id: crypto.randomUUID(),
    canteenId,
    name: validateMenuItemName(input.name),
    price: validatePrice(input.price),
    mealPeriod,
    sortOrder: validateSortOrder(input.sortOrder),
    svgKey: validateSvgKey(input.svgKey),
    createdAt: t,
    updatedAt: t,
  };
  getState().items.push(row);
  return row;
}

export function mockUpdateMenuItem(
  canteenId: string,
  itemId: string,
  input: {
    name?: unknown;
    price?: unknown;
    mealPeriod?: unknown;
    sortOrder?: unknown;
    svgKey?: unknown;
  },
): CanteenMenuItem {
  const s = getState();
  const idx = s.items.findIndex((i) => i.id === itemId && i.canteenId === canteenId);
  if (idx < 0) throw new Error("MENU_ITEM_NOT_FOUND");
  const row = s.items[idx];
  if (input.name !== undefined) row.name = validateMenuItemName(input.name);
  if (input.price !== undefined) row.price = validatePrice(input.price);
  if (input.mealPeriod !== undefined) {
    const mp = parseMealPeriod(String(input.mealPeriod));
    if (!mp) throw new Error("INVALID_MEAL_PERIOD");
    row.mealPeriod = mp;
  }
  if (input.sortOrder !== undefined) row.sortOrder = validateSortOrder(input.sortOrder);
  if (input.svgKey !== undefined) row.svgKey = validateSvgKey(input.svgKey);
  row.updatedAt = now();
  return { ...row };
}

export function mockDeleteMenuItem(canteenId: string, itemId: string): void {
  const s = getState();
  const idx = s.items.findIndex((i) => i.id === itemId && i.canteenId === canteenId);
  if (idx < 0) throw new Error("MENU_ITEM_NOT_FOUND");
  s.items.splice(idx, 1);
}

export function mockDeleteImpactForCanteen(canteenId: string) {
  const items = mockListMenuItems(canteenId);
  return {
    menuItemCount: items.length,
    voteCount: 0,
    commentCount: 0,
  };
}

export function mockDeleteImpactForMenuItem(_itemId: string) {
  return { menuItemCount: 1, voteCount: 0, commentCount: 0 };
}

/** Reset for tests */
export function resetCanteenMockState() {
  state = null;
}
