"use server";

import { revalidatePath } from "next/cache";

import { db } from "@/db";
import { productUpdates } from "@/db/schema";
import { requireAdmin } from "@/lib/auth-guard";
import {
  parseProductUpdateInput,
  type ProductUpdateInput,
} from "@/lib/product-update-types";

export async function publishProductUpdate(
  input: ProductUpdateInput,
): Promise<{ id: string }> {
  const admin = await requireAdmin();
  const parsed = parseProductUpdateInput(input);
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
  return created;
}
