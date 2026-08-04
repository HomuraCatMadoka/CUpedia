export const FOOD_MAP_COMMENTS_STORAGE_KEY = "cupedia:food-map-comments:v1";

export interface FoodMapCommentRecord {
  id: string;
  restaurantId: string;
  body: string;
  createdAt: string;
}

export interface FoodMapCommentStore {
  version: 1;
  comments: FoodMapCommentRecord[];
}

export function emptyFoodMapCommentStore(): FoodMapCommentStore {
  return { version: 1, comments: [] };
}

export function parseFoodMapCommentStore(
  raw: string | null | undefined,
): FoodMapCommentStore {
  if (!raw) return emptyFoodMapCommentStore();

  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return emptyFoodMapCommentStore();
    }
    const candidate = value as { version?: unknown; comments?: unknown };
    if (candidate.version !== 1 || !Array.isArray(candidate.comments)) {
      return emptyFoodMapCommentStore();
    }

    const comments = candidate.comments.flatMap((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return [];
      const comment = item as Record<string, unknown>;
      if (
        typeof comment.id !== "string" ||
        typeof comment.restaurantId !== "string" ||
        typeof comment.body !== "string" ||
        typeof comment.createdAt !== "string"
      ) {
        return [];
      }
      const body = comment.body.trim();
      if (!body) return [];
      return [
        {
          id: comment.id,
          restaurantId: comment.restaurantId,
          body,
          createdAt: comment.createdAt,
        },
      ];
    });

    return { version: 1, comments };
  } catch {
    return emptyFoodMapCommentStore();
  }
}

export function serializeFoodMapCommentStore(store: FoodMapCommentStore) {
  return JSON.stringify(store);
}

export function addFoodMapComment(
  store: FoodMapCommentStore,
  restaurantId: string,
  body: string,
  createdAt = new Date().toISOString(),
): FoodMapCommentStore {
  const text = body.trim();
  const id = restaurantId.trim();
  if (!text || !id) return store;

  return {
    version: 1,
    comments: [
      {
        id: `${createdAt}:${id}:${store.comments.length}`,
        restaurantId: id,
        body: text,
        createdAt,
      },
      ...store.comments,
    ],
  };
}
