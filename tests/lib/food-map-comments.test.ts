import { describe, expect, it } from "vitest";

import {
  addFoodMapComment,
  emptyFoodMapCommentStore,
  parseFoodMapCommentStore,
  serializeFoodMapCommentStore,
} from "@/lib/food-map/comments";

describe("food map comments", () => {
  it("adds trimmed comments without mutating the previous store", () => {
    const empty = emptyFoodMapCommentStore();
    const next = addFoodMapComment(
      empty,
      "restaurant-1",
      "  值得再来  ",
      "2026-08-04T10:00:00.000Z",
    );

    expect(empty.comments).toEqual([]);
    expect(next.comments[0]).toMatchObject({
      restaurantId: "restaurant-1",
      body: "值得再来",
      createdAt: "2026-08-04T10:00:00.000Z",
    });
    expect(
      parseFoodMapCommentStore(serializeFoodMapCommentStore(next)),
    ).toEqual(next);
  });

  it("drops malformed records and ignores empty submissions", () => {
    const empty = emptyFoodMapCommentStore();
    expect(addFoodMapComment(empty, "restaurant-1", "  ")).toBe(empty);
    expect(
      parseFoodMapCommentStore(
        JSON.stringify({
          version: 1,
          comments: [
            {
              id: "good",
              restaurantId: "restaurant-1",
              body: " 可以 ",
              createdAt: "now",
            },
            { id: "bad" },
          ],
        }),
      ).comments,
    ).toEqual([
      {
        id: "good",
        restaurantId: "restaurant-1",
        body: "可以",
        createdAt: "now",
      },
    ]);
  });
});
