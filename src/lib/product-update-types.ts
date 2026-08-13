export const PRODUCT_UPDATE_TYPES = [
  "feature",
  "improvement",
  "fix",
  "adjustment",
] as const;
export type ProductUpdateType = (typeof PRODUCT_UPDATE_TYPES)[number];

export const PRODUCT_UPDATE_AREAS = [
  "wiki",
  "courses",
  "canteen",
  "map",
  "account",
] as const;
export type ProductUpdateArea = (typeof PRODUCT_UPDATE_AREAS)[number];

export const PRODUCT_UPDATE_TITLE_MAX_LENGTH = 120;
export const PRODUCT_UPDATE_SUMMARY_MAX_LENGTH = 280;
export const PRODUCT_UPDATE_CONTENT_MAX_LENGTH = 5_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const PRODUCT_UPDATE_TYPE_LABELS: Record<ProductUpdateType, string> = {
  feature: "新功能",
  improvement: "体验改善",
  fix: "问题修复",
  adjustment: "功能调整",
};

export const PRODUCT_UPDATE_AREA_LABELS: Record<ProductUpdateArea, string> = {
  wiki: "百科",
  courses: "课程",
  canteen: "食堂",
  map: "地图",
  account: "账户",
};

export type ProductUpdateInput = {
  title: string;
  summary: string;
  content: string;
  type: ProductUpdateType;
  areas: ProductUpdateArea[];
};

export type PublicProductUpdate = ProductUpdateInput & {
  id: string;
  publishedAt: string;
};

export function isProductUpdateId(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function parseProductUpdateInput(
  input: ProductUpdateInput,
): ProductUpdateInput {
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const summary = typeof input.summary === "string" ? input.summary.trim() : "";
  const content = typeof input.content === "string" ? input.content.trim() : "";

  if (!title) throw new Error("请输入产品更新标题");
  if (title.length > PRODUCT_UPDATE_TITLE_MAX_LENGTH) {
    throw new Error(`标题不能超过 ${PRODUCT_UPDATE_TITLE_MAX_LENGTH} 个字符`);
  }
  if (!summary) throw new Error("请输入产品更新摘要");
  if (summary.length > PRODUCT_UPDATE_SUMMARY_MAX_LENGTH) {
    throw new Error(`摘要不能超过 ${PRODUCT_UPDATE_SUMMARY_MAX_LENGTH} 个字符`);
  }
  if (!content) throw new Error("请输入产品更新正文");
  if (content.length > PRODUCT_UPDATE_CONTENT_MAX_LENGTH) {
    throw new Error(`正文不能超过 ${PRODUCT_UPDATE_CONTENT_MAX_LENGTH} 个字符`);
  }

  if (!PRODUCT_UPDATE_TYPES.includes(input.type)) {
    throw new Error("请选择有效的更新类型");
  }
  if (!Array.isArray(input.areas) || input.areas.length === 0) {
    throw new Error("请至少选择一个产品领域");
  }
  const areas = [...new Set(input.areas)];
  if (!areas.every((area) => PRODUCT_UPDATE_AREAS.includes(area))) {
    throw new Error("请选择有效的产品领域");
  }

  return { title, summary, content, type: input.type, areas };
}
