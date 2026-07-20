import { describe, expect, it } from "vitest";

import catalogV1 from "@/data/person-title-catalog.v1.json";
import {
  parsePersonTitleCatalogJson,
  validatePersonTitleCatalog,
} from "@/lib/person-title-catalog";

const validRecipe = {
  recipeKey: "socrates",
  kind: "same_profession_gold",
  displayName: "苏格拉底",
  badgeCode: "SOCR",
  sourceRuleKeys: ["phil-gold"],
};

describe("person-title catalog validation", () => {
  it("contains only the approved single-programme recipes", () => {
    const catalog = validatePersonTitleCatalog(catalogV1);

    expect(catalog.recipes).toHaveLength(56);
    expect(
      new Set(catalog.recipes.flatMap((recipe) => recipe.sourceRuleKeys)),
    ).toHaveProperty("size", 49);
    expect(
      catalog.recipes.every((recipe) => recipe.kind === "same_profession_gold"),
    ).toBe(true);
    expect(catalog.recipes.map((recipe) => recipe.displayName)).toEqual(
      expect.arrayContaining([
        "苏格拉底",
        "Elda（小叽）",
        "塞巴斯蒂安",
        "阿福",
        "AlphaFold",
        "僵王博士（Dr. Zomboss）",
        "马可波罗",
        "梁思成",
      ]),
    );
    expect(catalog.recipes.map((recipe) => recipe.displayName)).not.toContain(
      "门捷列夫",
    );
    expect(
      catalog.recipes.flatMap((recipe) => recipe.sourceRuleKeys),
    ).not.toEqual(
      expect.arrayContaining(["cdas-gold", "cmbi-gold", "mbte-gold"]),
    );
    expect(
      catalog.recipes
        .filter((recipe) => recipe.sourceRuleKeys.includes("pacc-gold"))
        .map((recipe) => recipe.displayName),
    ).toEqual(["不学会计", "巴菲特"]);
    expect(
      catalog.recipes
        .filter((recipe) => recipe.sourceRuleKeys.includes("seem-gold"))
        .map((recipe) => recipe.displayName),
    ).toEqual(["塞巴斯蒂安", "阿福", "诸葛亮"]);
  });

  it("normalizes a valid catalog and defaults recipes to enabled", () => {
    expect(
      validatePersonTitleCatalog({
        version: 2,
        sourceLabel: "approved sheet",
        recipes: [validRecipe],
      }),
    ).toMatchObject({
      version: 2,
      recipes: [
        {
          recipeKey: "socrates",
          version: 2,
          enabled: true,
          sourceRuleKeys: ["phil-gold"],
        },
      ],
    });
  });

  it("rejects duplicate recipes and malformed source counts", () => {
    expect(() =>
      validatePersonTitleCatalog({
        version: 1,
        sourceLabel: "duplicates",
        recipes: [validRecipe, validRecipe],
      }),
    ).toThrow(/重复/);
    expect(() =>
      validatePersonTitleCatalog({
        version: 1,
        sourceLabel: "wrong source count",
        recipes: [{ ...validRecipe, sourceRuleKeys: [] }],
      }),
    ).toThrow(/一个金标来源/);
  });

  it("rejects malformed JSON", () => {
    expect(() => parsePersonTitleCatalogJson("{")).toThrow(/有效的 JSON/);
  });
});
