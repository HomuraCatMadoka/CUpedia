import type { Canteen, CanteenMenuItem, MenuItemVoteCounts, VoteChoice } from "@/lib/canteen-types";
import { parseMealPeriod, validateCanteenName, validateLocation, validateMenuItemName, validatePrice, validateSortOrder, validateSvgKey, compareMealPeriods } from "@/lib/canteen-types";

/** Dev/demo mode: in-memory canteen data, no PostgreSQL required. */
export function isCanteenMockMode(): boolean {
  return process.env.CANTEEN_MOCK_DATA === "true";
}

type MockVote = {
  id: string;
  menuItemId: string;
  userId: string | null;
  anonymousSessionId: string | null;
  vote: VoteChoice;
};

type MockState = {
  canteens: Canteen[];
  items: CanteenMenuItem[];
  votes: MockVote[];
  anonSessionId: string | null;
  mockUserId: string | null;
};

function now() {
  return new Date();
}

function seedState(): MockState {
  const t = now();
  const demo: Canteen = {
    id: "mock-canteen-demo",
    name: "演示食堂",
    location: null,
    createdAt: t,
    updatedAt: t,
  };
  const items: CanteenMenuItem[] = [
    {
      id: "mock-item-breakfast",
      canteenId: demo.id,
      name: "演示早餐",
      price: 8,
      mealPeriod: "breakfast",
      sortOrder: 0,
      svgKey: "default",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "mock-item-demo",
      canteenId: demo.id,
      name: "演示菜品",
      price: 10,
      mealPeriod: "lunch",
      sortOrder: 0,
      svgKey: "default",
      createdAt: t,
      updatedAt: t,
    },
    {
      id: "mock-item-dinner",
      canteenId: demo.id,
      name: "演示晚餐",
      price: 12,
      mealPeriod: "dinner",
      sortOrder: 0,
      svgKey: "default",
      createdAt: t,
      updatedAt: t,
    },
  ];
  return { canteens: [demo], items, votes: [], anonSessionId: null, mockUserId: null };
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
      const periodCmp = compareMealPeriods(a.mealPeriod, b.mealPeriod);
      if (periodCmp !== 0) return periodCmp;
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
  const removedItemIds = new Set(
    s.items.filter((i) => i.canteenId === id).map((i) => i.id),
  );
  s.canteens.splice(idx, 1);
  s.items = s.items.filter((i) => i.canteenId !== id);
  s.votes = s.votes.filter((v) => !removedItemIds.has(v.menuItemId));
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
  s.votes = s.votes.filter((v) => v.menuItemId !== itemId);
}

function mockCountVotesForCanteen(canteenId: string): number {
  const itemIds = new Set(
    getState().items.filter((i) => i.canteenId === canteenId).map((i) => i.id),
  );
  return getState().votes.filter(
    (v) =>
      itemIds.has(v.menuItemId) &&
      (v.vote === "like" || v.vote === "dislike"),
  ).length;
}

function mockCountVotesForMenuItem(menuItemId: string): number {
  return getState().votes.filter(
    (v) =>
      v.menuItemId === menuItemId &&
      (v.vote === "like" || v.vote === "dislike"),
  ).length;
}

export function mockEnsureAnonSession(): string {
  const s = getState();
  if (!s.anonSessionId) s.anonSessionId = crypto.randomUUID();
  return s.anonSessionId;
}

/** Test helper: simulate logged-in voter in mock mode. */
export function mockSetVoterUserId(userId: string | null) {
  getState().mockUserId = userId;
}

function mockResolveVoter(requireAnon: boolean): {
  userId: string | null;
  anonymousSessionId: string | null;
} {
  const s = getState();
  if (s.mockUserId) {
    return { userId: s.mockUserId, anonymousSessionId: null };
  }
  const anonId = s.anonSessionId;
  if (!anonId) {
    if (requireAnon) throw new Error("ANON_SESSION_REQUIRED");
    return { userId: null, anonymousSessionId: null };
  }
  return { userId: null, anonymousSessionId: anonId };
}

export function mockGetRateLimitKey(): string | null {
  const voter = mockResolveVoter(false);
  if (voter.userId) return `user:${voter.userId}`;
  if (voter.anonymousSessionId) return `anon:${voter.anonymousSessionId}`;
  return null;
}

export function mockMenuItemExists(menuItemId: string): boolean {
  return getState().items.some((item) => item.id === menuItemId);
}

export function mockUpsertDishVote(
  menuItemId: string,
  vote: VoteChoice,
): { menuItemId: string; vote: VoteChoice } {
  const s = getState();
  const item = s.items.find((i) => i.id === menuItemId);
  if (!item) throw new Error("MENU_ITEM_NOT_FOUND");

  const voter = mockResolveVoter(true);
  const idx = s.votes.findIndex((v) => {
    if (voter.userId) {
      return v.menuItemId === menuItemId && v.userId === voter.userId;
    }
    return (
      v.menuItemId === menuItemId &&
      v.anonymousSessionId === voter.anonymousSessionId
    );
  });

  if (idx >= 0) {
    s.votes[idx].vote = vote;
  } else {
    s.votes.push({
      id: crypto.randomUUID(),
      menuItemId,
      userId: voter.userId,
      anonymousSessionId: voter.anonymousSessionId,
      vote,
    });
  }
  return { menuItemId, vote };
}

export function mockGetVoteCountsForCanteen(
  canteenId: string,
): Record<string, MenuItemVoteCounts> {
  const itemIds = new Set(
    getState().items.filter((i) => i.canteenId === canteenId).map((i) => i.id),
  );
  const result: Record<string, MenuItemVoteCounts> = {};
  for (const vote of getState().votes) {
    if (!itemIds.has(vote.menuItemId)) continue;
    if (vote.vote !== "like" && vote.vote !== "dislike") continue;
    const bucket = result[vote.menuItemId] ?? { likes: 0, dislikes: 0 };
    if (vote.vote === "like") bucket.likes += 1;
    if (vote.vote === "dislike") bucket.dislikes += 1;
    result[vote.menuItemId] = bucket;
  }
  return result;
}

export function mockGetMyVotesForCanteen(
  canteenId: string,
): Record<string, VoteChoice> {
  const voter = mockResolveVoter(false);
  if (!voter.userId && !voter.anonymousSessionId) return {};

  const itemIds = new Set(
    getState().items.filter((i) => i.canteenId === canteenId).map((i) => i.id),
  );
  const result: Record<string, VoteChoice> = {};
  for (const vote of getState().votes) {
    if (!itemIds.has(vote.menuItemId)) continue;
    const mine = voter.userId
      ? vote.userId === voter.userId
      : vote.anonymousSessionId === voter.anonymousSessionId;
    if (!mine) continue;
    if (vote.vote === "like" || vote.vote === "dislike") {
      result[vote.menuItemId] = vote.vote;
    }
  }
  return result;
}

export function mockDeleteImpactForCanteen(canteenId: string) {
  const items = mockListMenuItems(canteenId);
  return {
    menuItemCount: items.length,
    voteCount: mockCountVotesForCanteen(canteenId),
    commentCount: 0,
  };
}

export function mockDeleteImpactForMenuItem(itemId: string) {
  return {
    menuItemCount: 1,
    voteCount: mockCountVotesForMenuItem(itemId),
    commentCount: 0,
  };
}

/** Reset for tests */
export function resetCanteenMockState() {
  state = null;
}
