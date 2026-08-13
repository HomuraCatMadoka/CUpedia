"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { productUpdates } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import {
  parseProductUpdateInput,
  ProductUpdateValidationError,
  type ProductUpdateInput,
} from "@/lib/product-update-types";

export type PublishProductUpdateResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function publishProductUpdate(
  input: ProductUpdateInput,
): Promise<PublishProductUpdateResult> {
  const admin = await requireAdmin();
  let parsed: ProductUpdateInput;
  try {
    parsed = parseProductUpdateInput(input);
  } catch (error) {
    if (error instanceof ProductUpdateValidationError) {
      return { ok: false, error: error.message };
    }
    throw error;
  }
  const now = new Date();
  const [created] = await db
    .insert(productUpdates)
    .values({
      ...parsed,
      publishedAt: now,
      createdBy: admin.id,
      createdAt: now,
      updatedAt: now,
    })
    .returning({ id: productUpdates.id });
  if (!created) throw new Error("产品更新发布失败");

  revalidatePath("/updates");
  revalidatePath(`/updates/${created.id}`);
  return { ok: true, id: created.id };
}
