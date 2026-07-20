export type PersonTitleRecipeKind = "dual_bronze" | "same_profession_gold";

export type NormalizedPersonTitleRecipe = {
  recipeKey: string;
  version: number;
  kind: PersonTitleRecipeKind;
  displayName: string;
  description: string;
  badgeCode: string;
  sourceRuleKeys: string[];
  enabled: boolean;
};

export type NormalizedPersonTitleCatalog = {
  version: number;
  sourceLabel: string;
  recipes: NormalizedPersonTitleRecipe[];
};

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label}格式无效`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string, max = 120) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
    throw new Error(`${label}格式无效`);
  }
  return value.trim();
}

export function parsePersonTitleCatalogJson(
  rawJson: string,
): NormalizedPersonTitleCatalog {
  if (typeof rawJson !== "string" || rawJson.length > 500_000) {
    throw new Error("人名称号目录过大或格式无效");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error("人名称号目录不是有效的 JSON");
  }
  return validatePersonTitleCatalog(parsed);
}

export function validatePersonTitleCatalog(
  input: unknown,
): NormalizedPersonTitleCatalog {
  const catalog = asRecord(input, "人名称号目录");
  if (!Number.isInteger(catalog.version) || Number(catalog.version) < 1) {
    throw new Error("人名称号目录版本须为正整数");
  }
  const version = Number(catalog.version);
  const sourceLabel = requiredString(catalog.sourceLabel, "目录来源", 160);
  if (
    !Array.isArray(catalog.recipes) ||
    catalog.recipes.length === 0 ||
    catalog.recipes.length > 300
  ) {
    throw new Error("人名称号目录须包含 1 至 300 条配方");
  }

  const recipeKeys = new Set<string>();
  const targetNames = new Set<string>();
  const recipes = catalog.recipes.map((rawRecipe, index) => {
    const label = `第 ${index + 1} 条配方`;
    const recipe = asRecord(rawRecipe, label);
    const recipeKey = requiredString(
      recipe.recipeKey,
      `${label}标识`,
      64,
    ).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,63}$/.test(recipeKey)) {
      throw new Error(`${label}标识格式无效`);
    }
    if (recipeKeys.has(recipeKey)) {
      throw new Error(`配方标识 ${recipeKey} 重复`);
    }
    recipeKeys.add(recipeKey);

    const kind = requiredString(recipe.kind, `${label}类型`, 32);
    if (kind !== "dual_bronze" && kind !== "same_profession_gold") {
      throw new Error(`${label}类型无效`);
    }
    const normalizedKind: PersonTitleRecipeKind = kind;
    const displayName = requiredString(
      recipe.displayName,
      `${label}称号名称`,
      80,
    );
    const badgeCode = requiredString(recipe.badgeCode, `${label}代码`, 4);
    if (!/^[A-Z]{4}$/.test(badgeCode)) {
      throw new Error(`${label}代码须为四位大写字母`);
    }
    if (!Array.isArray(recipe.sourceRuleKeys)) {
      throw new Error(`${label}来源规则格式无效`);
    }
    const sourceRuleKeys = recipe.sourceRuleKeys.map((value) =>
      requiredString(value, `${label}来源规则`, 64).toLowerCase(),
    );
    const expectedSources = normalizedKind === "dual_bronze" ? 2 : 1;
    if (
      sourceRuleKeys.length !== expectedSources ||
      new Set(sourceRuleKeys).size !== expectedSources ||
      sourceRuleKeys.some((key) => !/^[a-z0-9][a-z0-9-]{1,63}$/.test(key))
    ) {
      throw new Error(
        normalizedKind === "dual_bronze"
          ? `${label}须指定两个不同的铜标来源`
          : `${label}须指定一个金标来源`,
      );
    }
    const targetName = `${sourceRuleKeys.join("+")}\0${displayName}`;
    if (targetNames.has(targetName)) {
      throw new Error(`${label}与已有来源及称号名称重复`);
    }
    targetNames.add(targetName);

    return {
      recipeKey,
      version,
      kind: normalizedKind,
      displayName,
      description:
        typeof recipe.description === "string"
          ? recipe.description.trim().slice(0, 240)
          : "",
      badgeCode,
      sourceRuleKeys,
      enabled: recipe.enabled !== false,
    };
  });

  return { version, sourceLabel, recipes };
}
