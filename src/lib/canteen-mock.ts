import type {
  AdminDishComment,
  Canteen,
  CanteenDishComment,
  CanteenMenuItem,
  MealPeriod,
  MenuImportDraft,
  MenuImportDraftItem,
  MenuItemVoteCounts,
  VoteChoice,
} from "@/lib/canteen-types";
import {
  ADMIN_DISH_COMMENT_LIST_LIMIT,
  mealPeriodsFromRow,
  primaryMealPeriodSortKey,
  validateAnnouncement,
  validateCanteenName,
  validateLocation,
  validateMenuItemName,
  validatePricingInput,
  validateSortOrder,
  validateSvgKey,
} from "@/lib/canteen-types";
import type {
  AdminAuditLog,
  DishCommentDeleteAuditDetails,
} from "@/lib/admin-audit-types";
import { DISH_COMMENT_DELETE_AUDIT_ACTION } from "@/lib/admin-audit-types";

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
  authorEmail: string;
  createdAt: Date;
  updatedAt: Date;
};

type MockShameVote = {
  id: string;
  canteenId: string;
  userId: string | null;
  anonymousSessionId: string | null;
  voteDate: string;
  createdAt: Date;
};

type MockState = {
  canteens: Canteen[];
  items: CanteenMenuItem[];
  votes: MockVote[];
  shameVotes: MockShameVote[];
  comments: MockComment[];
  auditLogs: AdminAuditLog[];
  importDrafts: MenuImportDraft[];
  anonSessionId: string | null;
  mockUserId: string | null;
};

function toPublicComment(comment: MockComment): CanteenDishComment {
  return {
    id: comment.id,
    menuItemId: comment.menuItemId,
    userId: comment.userId,
    content: comment.content,
    authorNickname: comment.authorNickname,
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}

function now() {
  return new Date();
}

function seedState(): MockState {
  const t = now();
  const demo: Canteen = {
    id: "mock-canteen-demo",
    name: "演示食堂",
    location: "演示区域 A",
    announcement: "外带加 $1 · 随餐饮品加 $3",
    createdAt: t,
    updatedAt: t,
  };
  const demoB: Canteen = {
    id: "mock-canteen-demo-b",
    name: "演示食堂乙",
    location: "演示区域 B",
    announcement: null,
    createdAt: t,
    updatedAt: t,
  };
  const demoC: Canteen = {
    id: "mock-canteen-demo-c",
    name: "演示食堂丙",
    location: null,
    announcement: "周末休息",
    createdAt: t,
    updatedAt: t,
  };
  const rankingCanteens: Canteen[] = [
    ["benjamin-franklin", "范克廉楼学生膳堂", "本部"],
    ["new-asia", "新亚书院学生饭堂", "新亚书院"],
    ["chung-chi", "崇基学院众志堂", "崇基学院"],
    ["united", "联合书院学生饭堂", "联合书院"],
    ["shaw", "逸夫书院学生饭堂", "逸夫书院"],
    ["lee-woo-sing", "伍宜孙书院学生饭堂", "伍宜孙书院"],
    ["sh-ho", "善衡书院学生饭堂", "善衡书院"],
    ["cw-chu", "敬文书院学生饭堂", "敬文书院"],
    ["wu-yee-sun", "和声书院学生饭堂", "和声书院"],
    ["morningside", "晨兴书院学生饭堂", "晨兴书院"],
    ["lee-shau-kee", "李慧珍楼学生膳堂", "本部"],
    ["basic-medical", "基本医学大楼小食亭", "医学院"],
    ["central-campus-cafe", "本部咖啡阁", "本部"],
    ["orchid-lodge", "兰苑", "崇基学院"],
    ["lake-ad-via", "荷花池畔餐厅", "崇基学院"],
    ["university-guest-house", "大学宾馆餐厅", "本部"],
    ["pommerenke-cafe", "伍何曼原楼咖啡阁", "本部"],
  ].map(([id, name, location]) => ({
    id: `mock-canteen-${id}`,
    name,
    location,
    announcement: null,
    createdAt: t,
    updatedAt: t,
  }));

  function dish(
    id: string,
    canteenId: string,
    name: string,
    mealPeriod: MealPeriod,
    amountMinor: number,
    svgKey: string,
    sortOrder: number,
  ): CanteenMenuItem {
    return {
      id,
      canteenId,
      name,
      pricing: {
        options: [
          {
            id: `${id}-price`,
            label: null,
            amountMinor,
            currency: "HKD",
            sortOrder: 0,
          },
        ],
      },
      mealPeriods: [mealPeriod],
      sortOrder,
      svgKey,
      createdAt: t,
      updatedAt: t,
    };
  }

  const items: CanteenMenuItem[] = [
    // Keep stable IDs used by unit tests.
    dish(
      "mock-item-breakfast",
      demo.id,
      "演示粥品",
      "breakfast",
      800,
      "bowl",
      0,
    ),
    dish("mock-item-demo", demo.id, "演示菜品", "lunch", 1000, "default", 0),
    dish(
      "mock-item-dinner",
      demo.id,
      "演示晚餐定食",
      "dinner",
      1200,
      "rice",
      0,
    ),

    dish(
      "mock-item-bf-egg",
      demo.id,
      "演示煎蛋多士",
      "breakfast",
      1200,
      "default",
      1,
    ),
    dish(
      "mock-item-bf-noodle",
      demo.id,
      "演示早餐面",
      "breakfast",
      1500,
      "noodle",
      2,
    ),
    dish(
      "mock-item-bf-drink",
      demo.id,
      "演示豆浆",
      "breakfast",
      600,
      "drink",
      3,
    ),

    dish("mock-item-ln-rice", demo.id, "演示叉烧饭", "lunch", 2800, "rice", 1),
    dish(
      "mock-item-ln-rice-2",
      demo.id,
      "演示咖喱鸡饭",
      "lunch",
      3000,
      "rice",
      2,
    ),
    dish(
      "mock-item-ln-bowl",
      demo.id,
      "演示番茄蛋汤",
      "lunch",
      1200,
      "bowl",
      3,
    ),
    dish(
      "mock-item-ln-noodle",
      demo.id,
      "演示牛肉面",
      "lunch",
      3200,
      "noodle",
      4,
    ),
    dish(
      "mock-item-ln-noodle-2",
      demo.id,
      "演示云吞面",
      "lunch",
      2800,
      "noodle",
      5,
    ),
    dish(
      "mock-item-ln-drink",
      demo.id,
      "演示柠檬茶",
      "lunch",
      1000,
      "drink",
      6,
    ),
    dish(
      "mock-item-ln-drink-2",
      demo.id,
      "演示奶茶",
      "lunch",
      1200,
      "drink",
      7,
    ),
    dish(
      "mock-item-ln-dessert",
      demo.id,
      "演示双皮奶",
      "lunch",
      1500,
      "dessert",
      8,
    ),
    dish(
      "mock-item-ln-snack",
      demo.id,
      "演示炸鸡块",
      "lunch",
      1800,
      "default",
      9,
    ),
    dish("mock-item-ln-veg", demo.id, "演示青菜", "lunch", 800, "default", 10),
    dish(
      "mock-item-ln-fish",
      demo.id,
      "演示蒸鱼",
      "lunch",
      3500,
      "default",
      11,
    ),
    dish(
      "mock-item-ln-tofu",
      demo.id,
      "演示麻婆豆腐",
      "lunch",
      1600,
      "bowl",
      12,
    ),

    dish("mock-item-dn-rice", demo.id, "演示烧鸭饭", "dinner", 3200, "rice", 1),
    dish(
      "mock-item-dn-noodle",
      demo.id,
      "演示炒河粉",
      "dinner",
      2800,
      "noodle",
      2,
    ),
    dish("mock-item-dn-bowl", demo.id, "演示例汤", "dinner", 1000, "bowl", 3),
    dish("mock-item-dn-drink", demo.id, "演示汽水", "dinner", 800, "drink", 4),
    dish(
      "mock-item-dn-dessert",
      demo.id,
      "演示红豆沙",
      "dinner",
      1200,
      "dessert",
      5,
    ),
    dish(
      "mock-item-dn-snack",
      demo.id,
      "演示春卷",
      "dinner",
      1400,
      "default",
      6,
    ),

    dish(
      "mock-item-b-ln-1",
      demoB.id,
      "演示乙食堂饭",
      "lunch",
      2500,
      "rice",
      0,
    ),
    dish(
      "mock-item-b-ln-2",
      demoB.id,
      "演示乙食堂面",
      "lunch",
      2600,
      "noodle",
      1,
    ),
    dish(
      "mock-item-b-dn-1",
      demoB.id,
      "演示乙食堂晚餐",
      "dinner",
      2800,
      "rice",
      0,
    ),

    dish(
      "mock-item-c-ln-1",
      demoC.id,
      "演示丙食堂简餐",
      "lunch",
      2000,
      "default",
      0,
    ),
  ];

  return {
    canteens: [demo, demoB, demoC, ...rankingCanteens],
    items,
    votes: [],
    shameVotes: [],
    comments: [],
    auditLogs: [],
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
      const periodCmp =
        primaryMealPeriodSortKey(a.mealPeriods) -
        primaryMealPeriodSortKey(b.mealPeriods);
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
  s.shameVotes = s.shameVotes.filter((v) => v.canteenId !== id);
  s.importDrafts = s.importDrafts.filter((d) => d.canteenId !== id);
}

export function mockCreateMenuItem(
  canteenId: string,
  input: {
    name: unknown;
    pricing?: unknown;
    price?: unknown;
    mealPeriods?: unknown;
    mealPeriod?: unknown;
    sortOrder?: unknown;
    svgKey?: unknown;
  },
): CanteenMenuItem {
  if (!mockGetCanteen(canteenId)) throw new Error("CANTEEN_NOT_FOUND");
  const mealPeriods = mealPeriodsFromRow(input as Record<string, unknown>);
  if (!mealPeriods) throw new Error("INVALID_MEAL_PERIOD");
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
    mealPeriods,
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
    mealPeriods?: unknown;
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
  if (input.mealPeriods !== undefined || input.mealPeriod !== undefined) {
    const mealPeriods = mealPeriodsFromRow(input as Record<string, unknown>);
    if (!mealPeriods) throw new Error("INVALID_MEAL_PERIOD");
    row.mealPeriods = mealPeriods;
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

/** Hard-delete every menu item for a canteen (votes/comments cascade in mock). */
export function mockDeleteAllMenuItems(canteenId: string): {
  deletedCount: number;
} {
  const s = getState();
  if (!s.canteens.some((c) => c.id === canteenId)) {
    throw new Error("CANTEEN_NOT_FOUND");
  }
  const removedItemIds = new Set(
    s.items.filter((i) => i.canteenId === canteenId).map((i) => i.id),
  );
  const deletedCount = removedItemIds.size;
  s.items = s.items.filter((i) => i.canteenId !== canteenId);
  s.votes = s.votes.filter((v) => !removedItemIds.has(v.menuItemId));
  s.comments = s.comments.filter((c) => !removedItemIds.has(c.menuItemId));
  return { deletedCount };
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
    .map(toPublicComment);
}

export function mockAdminListRecentDishComments(
  limit = ADMIN_DISH_COMMENT_LIST_LIMIT,
): AdminDishComment[] {
  const s = getState();
  const itemsById = new Map(s.items.map((item) => [item.id, item]));
  const canteensById = new Map(s.canteens.map((c) => [c.id, c]));

  return [...s.comments]
    .map((c, index) => ({ c, index }))
    .sort((a, b) => {
      const byTime = b.c.createdAt.getTime() - a.c.createdAt.getTime();
      if (byTime !== 0) return byTime;
      return b.index - a.index;
    })
    .flatMap(({ c }) => {
      const item = itemsById.get(c.menuItemId);
      if (!item) return [];
      const canteen = canteensById.get(item.canteenId);
      if (!canteen) return [];
      return [
        {
          ...c,
          canteenId: canteen.id,
          canteenName: canteen.name,
          menuItemName: item.name,
        },
      ];
    })
    .slice(0, limit);
}

export function mockCreateDishComment(
  menuItemId: string,
  userId: string,
  authorNickname: string,
  authorEmail: string,
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
    authorEmail,
    createdAt: t,
    updatedAt: t,
  };
  getState().comments.push(row);
  return toPublicComment(row);
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
  return toPublicComment(row);
}

export function mockDeleteDishComment(commentId: string, userId: string): void {
  const s = getState();
  const idx = s.comments.findIndex(
    (c) => c.id === commentId && c.userId === userId,
  );
  if (idx < 0) throw new Error("COMMENT_NOT_FOUND");
  s.comments.splice(idx, 1);
}

export function mockAdminDeleteDishComment(
  commentId: string,
  actor: { id: string; email: string; nickname: string },
): void {
  const s = getState();
  const idx = s.comments.findIndex((c) => c.id === commentId);
  if (idx < 0) throw new Error("COMMENT_NOT_FOUND");
  const comment = s.comments[idx];
  const item = s.items.find((row) => row.id === comment.menuItemId);
  const canteen = item
    ? s.canteens.find((row) => row.id === item.canteenId)
    : null;
  if (!item || !canteen) throw new Error("COMMENT_CONTEXT_NOT_FOUND");

  const details: DishCommentDeleteAuditDetails = {
    content: comment.content,
    authorEmail: comment.authorEmail,
    authorNickname: comment.authorNickname,
    canteenId: canteen.id,
    canteenName: canteen.name,
    menuItemId: item.id,
    menuItemName: item.name,
    commentCreatedAt: comment.createdAt.toISOString(),
  };
  s.auditLogs.push({
    id: crypto.randomUUID(),
    actorUserId: actor.id,
    actorEmail: actor.email,
    actorNickname: actor.nickname,
    action: DISH_COMMENT_DELETE_AUDIT_ACTION,
    targetType: "canteen_dish_comment",
    targetId: comment.id,
    targetUserId: comment.userId,
    details,
    createdAt: now(),
  });
  s.comments.splice(idx, 1);
}

export function mockAdminListDishCommentAuditLogs(
  limit: number,
): AdminAuditLog[] {
  return [...getState().auditLogs]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, limit)
    .map((log) => ({ ...log, details: { ...log.details } }));
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

export function mockCanteenExists(canteenId: string): boolean {
  return getState().canteens.some((c) => c.id === canteenId);
}

/** Append-only; each call adds one dislike for the given HKT voteDate. */
export function mockAppendShameVote(
  canteenId: string,
  voteDate: string,
): { canteenId: string; voteDate: string } {
  const s = getState();
  if (!s.canteens.some((c) => c.id === canteenId)) {
    throw new Error("CANTEEN_NOT_FOUND");
  }
  const voter = mockResolveVoter(true);
  s.shameVotes.push({
    id: crypto.randomUUID(),
    canteenId,
    userId: voter.userId,
    anonymousSessionId: voter.anonymousSessionId,
    voteDate,
    createdAt: now(),
  });
  return { canteenId, voteDate };
}

export function mockCountAnonShameVotesForDate(
  anonymousSessionId: string,
  voteDate: string,
): number {
  return getState().shameVotes.filter(
    (v) =>
      v.voteDate === voteDate && v.anonymousSessionId === anonymousSessionId,
  ).length;
}

export function mockGetShameVoteCountsForDate(
  voteDate: string,
): Record<string, number> {
  const result: Record<string, number> = {};
  for (const vote of getState().shameVotes) {
    if (vote.voteDate !== voteDate) continue;
    result[vote.canteenId] = (result[vote.canteenId] ?? 0) + 1;
  }
  return result;
}

export function mockGetShameVoteCounts(): Record<string, number> {
  const result: Record<string, number> = {};
  for (const vote of getState().shameVotes) {
    result[vote.canteenId] = (result[vote.canteenId] ?? 0) + 1;
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
      mealPeriods: item.mealPeriods,
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
