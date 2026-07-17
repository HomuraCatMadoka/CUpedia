import type {
  Canteen,
  CanteenDishComment,
  CanteenMenuItem,
  MenuImportDraft,
  MenuImportDraftItem,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";
import {
  parseMealPeriod,
  validateAnnouncement,
  validateCanteenName,
  validateLocation,
  validateMenuItemName,
  validatePricingInput,
  validateSortOrder,
  validateSvgKey,
  compareMealPeriods,
} from "@/lib/canteen-types";

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

type MockComment = {
  id: string;
  menuItemId: string;
  userId: string;
  content: string;
  authorNickname: string;
  createdAt: Date;
  updatedAt: Date;
};

type MockState = {
  canteens: Canteen[];
  items: CanteenMenuItem[];
  votes: MockVote[];
  comments: MockComment[];
  importDrafts: MenuImportDraft[];
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
    announcement: "外带加 $1 · 随餐饮品加 $3",
    createdAt: t,
    updatedAt: t,
  };
  const items: CanteenMenuItem[] = [
    {
      id: "mock-item-breakfast",
      canteenId: demo.id,
      name: "演示早餐",
      pricing: {
        options: [
          {
            id: "mock-price-breakfast",
            label: null,
            amountMinor: 800,
            currency: "HKD",
            sortOrder: 0,
          },
        ],
      },
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
      pricing: {
        options: [
          {
            id: "mock-price-demo",
            label: null,
            amountMinor: 1000,
            currency: "HKD",
            sortOrder: 0,
          },
        ],
      },
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
      pricing: {
        options: [
          {
            id: "mock-price-dinner",
            label: null,
            amountMinor: 1200,
            currency: "HKD",
            sortOrder: 0,
          },
        ],
      },
      mealPeriod: "dinner",
      sortOrder: 0,
      svgKey: "default",
      createdAt: t,
      updatedAt: t,
    },
  ];
  return {
    canteens: [demo],
    items,
    votes: [],
    comments: [],
    importDrafts: [],
    anonSessionId: null,
    mockUserId: null,
  };
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
  announcement?: unknown;
}): Canteen {
  const t = now();
  const row: Canteen = {
    id: crypto.randomUUID(),
    name: validateCanteenName(input.name),
    location: validateLocation(input.location ?? null),
    announcement: validateAnnouncement(input.announcement ?? null),
    createdAt: t,
    updatedAt: t,
  };
  getState().canteens.push(row);
  return row;
}

export function mockUpdateCanteen(
  id: string,
  input: { name?: unknown; location?: unknown; announcement?: unknown },
): Canteen {
  const s = getState();
  const idx = s.canteens.findIndex((c) => c.id === id);
  if (idx < 0) throw new Error("CANTEEN_NOT_FOUND");
  const row = s.canteens[idx];
  if (input.name !== undefined) row.name = validateCanteenName(input.name);
  if (input.location !== undefined)
    row.location = validateLocation(input.location);
  if (input.announcement !== undefined)
    row.announcement = validateAnnouncement(input.announcement);
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
  s.comments = s.comments.filter((c) => !removedItemIds.has(c.menuItemId));
  s.importDrafts = s.importDrafts.filter((d) => d.canteenId !== id);
}

export function mockCreateMenuItem(
  canteenId: string,
  input: {
    name: unknown;
    pricing?: unknown;
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
  const priceOptions = validatePricingInput(input.pricing, input.price) ?? [];
  const row: CanteenMenuItem = {
    id: crypto.randomUUID(),
    canteenId,
    name: validateMenuItemName(input.name),
    pricing:
      priceOptions.length === 0
        ? null
        : {
            options: priceOptions.map((option) => ({
              id: crypto.randomUUID(),
              ...option,
            })),
          },
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
    pricing?: unknown;
    price?: unknown;
    mealPeriod?: unknown;
    sortOrder?: unknown;
    svgKey?: unknown;
  },
): CanteenMenuItem {
  const s = getState();
  const idx = s.items.findIndex(
    (i) => i.id === itemId && i.canteenId === canteenId,
  );
  if (idx < 0) throw new Error("MENU_ITEM_NOT_FOUND");
  const row = s.items[idx];
  if (input.name !== undefined) row.name = validateMenuItemName(input.name);
  const priceOptions = validatePricingInput(input.pricing, input.price);
  if (priceOptions !== undefined) {
    row.pricing =
      priceOptions.length === 0
        ? null
        : {
            options: priceOptions.map((option) => ({
              id: crypto.randomUUID(),
              ...option,
            })),
          };
  }
  if (input.mealPeriod !== undefined) {
    const mp = parseMealPeriod(String(input.mealPeriod));
    if (!mp) throw new Error("INVALID_MEAL_PERIOD");
    row.mealPeriod = mp;
  }
  if (input.sortOrder !== undefined)
    row.sortOrder = validateSortOrder(input.sortOrder);
  if (input.svgKey !== undefined) row.svgKey = validateSvgKey(input.svgKey);
  row.updatedAt = now();
  return { ...row };
}

export function mockDeleteMenuItem(canteenId: string, itemId: string): void {
  const s = getState();
  const idx = s.items.findIndex(
    (i) => i.id === itemId && i.canteenId === canteenId,
  );
  if (idx < 0) throw new Error("MENU_ITEM_NOT_FOUND");
  s.items.splice(idx, 1);
  s.votes = s.votes.filter((v) => v.menuItemId !== itemId);
  s.comments = s.comments.filter((c) => c.menuItemId !== itemId);
}

function mockCountCommentsForCanteen(canteenId: string): number {
  const itemIds = new Set(
    getState()
      .items.filter((i) => i.canteenId === canteenId)
      .map((i) => i.id),
  );
  return getState().comments.filter((c) => itemIds.has(c.menuItemId)).length;
}

function mockCountCommentsForMenuItem(menuItemId: string): number {
  return getState().comments.filter((c) => c.menuItemId === menuItemId).length;
}

export function mockGetCommentCountsForCanteen(
  canteenId: string,
): Record<string, number> {
  const itemIds = new Set(
    getState()
      .items.filter((i) => i.canteenId === canteenId)
      .map((i) => i.id),
  );
  const result: Record<string, number> = {};
  for (const comment of getState().comments) {
    if (!itemIds.has(comment.menuItemId)) continue;
    result[comment.menuItemId] = (result[comment.menuItemId] ?? 0) + 1;
  }
  return result;
}

export function mockGetCommentsForMenuItem(
  menuItemId: string,
): CanteenDishComment[] {
  return getState()
    .comments.filter((c) => c.menuItemId === menuItemId)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((c) => ({ ...c }));
}

export function mockCreateDishComment(
  menuItemId: string,
  userId: string,
  authorNickname: string,
  content: string,
): CanteenDishComment {
  if (!mockMenuItemExists(menuItemId)) throw new Error("MENU_ITEM_NOT_FOUND");
  const t = now();
  const row: MockComment = {
    id: crypto.randomUUID(),
    menuItemId,
    userId,
    content,
    authorNickname,
    createdAt: t,
    updatedAt: t,
  };
  getState().comments.push(row);
  return { ...row };
}

export function mockUpdateDishComment(
  commentId: string,
  userId: string,
  content: string,
): CanteenDishComment {
  const s = getState();
  const idx = s.comments.findIndex(
    (c) => c.id === commentId && c.userId === userId,
  );
  if (idx < 0) throw new Error("COMMENT_NOT_FOUND");
  const row = s.comments[idx];
  row.content = content;
  row.updatedAt = now();
  return { ...row };
}

export function mockDeleteDishComment(commentId: string, userId: string): void {
  const s = getState();
  const idx = s.comments.findIndex(
    (c) => c.id === commentId && c.userId === userId,
  );
  if (idx < 0) throw new Error("COMMENT_NOT_FOUND");
  s.comments.splice(idx, 1);
}

export function mockAdminDeleteDishComment(commentId: string): void {
  const s = getState();
  const idx = s.comments.findIndex((c) => c.id === commentId);
  if (idx < 0) throw new Error("COMMENT_NOT_FOUND");
  s.comments.splice(idx, 1);
}

function mockCountVotesForCanteen(canteenId: string): number {
  const itemIds = new Set(
    getState()
      .items.filter((i) => i.canteenId === canteenId)
      .map((i) => i.id),
  );
  return getState().votes.filter(
    (v) =>
      itemIds.has(v.menuItemId) && (v.vote === "like" || v.vote === "dislike"),
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
    getState()
      .items.filter((i) => i.canteenId === canteenId)
      .map((i) => i.id),
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
    getState()
      .items.filter((i) => i.canteenId === canteenId)
      .map((i) => i.id),
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
    commentCount: mockCountCommentsForCanteen(canteenId),
  };
}

export function mockDeleteImpactForMenuItem(itemId: string) {
  return {
    menuItemCount: 1,
    voteCount: mockCountVotesForMenuItem(itemId),
    commentCount: mockCountCommentsForMenuItem(itemId),
  };
}

export function mockCreateMenuImportDraft(input: {
  canteenId: string;
  sourceImageUrl: string;
  ocrRawText: string | null;
  items: MenuImportDraftItem[];
  status: MenuImportDraft["status"];
  errorMessage?: string | null;
}): MenuImportDraft {
  if (!mockGetCanteen(input.canteenId)) throw new Error("CANTEEN_NOT_FOUND");
  const t = now();
  const row: MenuImportDraft = {
    id: crypto.randomUUID(),
    canteenId: input.canteenId,
    sourceImageUrl: input.sourceImageUrl,
    ocrRawText: input.ocrRawText,
    items: input.items,
    status: input.status,
    errorMessage: input.errorMessage ?? null,
    createdAt: t,
    updatedAt: t,
  };
  getState().importDrafts.push(row);
  return { ...row, items: [...row.items] };
}

export function mockGetMenuImportDraft(
  canteenId: string,
  draftId: string,
): MenuImportDraft | null {
  const row = getState().importDrafts.find(
    (d) => d.id === draftId && d.canteenId === canteenId,
  );
  return row ? { ...row, items: [...row.items] } : null;
}

export function mockUpdateMenuImportDraft(
  canteenId: string,
  draftId: string,
  items: MenuImportDraftItem[],
): MenuImportDraft {
  const s = getState();
  const idx = s.importDrafts.findIndex(
    (d) => d.id === draftId && d.canteenId === canteenId,
  );
  if (idx < 0) throw new Error("IMPORT_DRAFT_NOT_FOUND");
  const row = s.importDrafts[idx];
  if (row.status === "published")
    throw new Error("IMPORT_DRAFT_ALREADY_PUBLISHED");
  row.items = items;
  row.status = "ready";
  row.errorMessage = null;
  row.updatedAt = now();
  return { ...row, items: [...row.items] };
}

export function mockPublishMenuImportDraft(
  canteenId: string,
  draftId: string,
): CanteenMenuItem[] {
  const draft = mockGetMenuImportDraft(canteenId, draftId);
  if (!draft) throw new Error("IMPORT_DRAFT_NOT_FOUND");
  if (draft.status === "published")
    throw new Error("IMPORT_DRAFT_ALREADY_PUBLISHED");
  if (draft.items.length === 0) throw new Error("IMPORT_DRAFT_EMPTY");

  const created = draft.items.map((item) =>
    mockCreateMenuItem(canteenId, {
      name: item.name,
      price: item.price,
      mealPeriod: item.mealPeriod,
      sortOrder: item.sortOrder,
    }),
  );

  const s = getState();
  const idx = s.importDrafts.findIndex((d) => d.id === draftId);
  s.importDrafts[idx].status = "published";
  s.importDrafts[idx].updatedAt = now();
  return created;
}

export function mockDeleteMenuImportDraft(
  canteenId: string,
  draftId: string,
): void {
  const s = getState();
  const idx = s.importDrafts.findIndex(
    (d) => d.id === draftId && d.canteenId === canteenId,
  );
  if (idx < 0) throw new Error("IMPORT_DRAFT_NOT_FOUND");
  s.importDrafts.splice(idx, 1);
}

/** Reset for tests */
export function resetCanteenMockState() {
  state = null;
}
