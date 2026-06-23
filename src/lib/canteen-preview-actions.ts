"use server";

import { revalidatePath } from "next/cache";
import {
  isCanteenMockMode,
  mockCreateCanteen,
  mockCreateMenuItem,
  mockDeleteCanteen,
  mockDeleteMenuItem,
  mockDeleteImpactForCanteen,
  mockDeleteImpactForMenuItem,
  mockUpdateCanteen,
  mockUpdateMenuItem,
} from "@/lib/canteen-mock";

function assertPreview() {
  if (!isCanteenMockMode() || process.env.NODE_ENV !== "development") {
    throw new Error("PREVIEW_UNAVAILABLE");
  }
}

export async function previewCreateCanteen(input: {
  name: unknown;
  location?: unknown;
}) {
  assertPreview();
  const row = mockCreateCanteen(input);
  revalidatePath("/canteen");
  revalidatePath("/canteen/manage");
  return row;
}

export async function previewUpdateCanteen(
  id: string,
  input: { name?: unknown; location?: unknown },
) {
  assertPreview();
  const row = mockUpdateCanteen(id, input);
  revalidatePath("/canteen");
  revalidatePath("/canteen/manage");
  revalidatePath(`/canteen/manage/${id}`);
  return row;
}

export async function previewDeleteCanteen(id: string) {
  assertPreview();
  mockDeleteCanteen(id);
  revalidatePath("/canteen");
  revalidatePath("/canteen/manage");
}

export async function previewGetCanteenDeleteImpact(id: string) {
  assertPreview();
  return mockDeleteImpactForCanteen(id);
}

export async function previewCreateMenuItem(
  canteenId: string,
  input: {
    name: unknown;
    price?: unknown;
    mealPeriod?: unknown;
    sortOrder?: unknown;
    svgKey?: unknown;
  },
) {
  assertPreview();
  const row = mockCreateMenuItem(canteenId, input);
  revalidatePath(`/canteen/${canteenId}`);
  revalidatePath(`/canteen/manage/${canteenId}`);
  return row;
}

export async function previewUpdateMenuItem(
  canteenId: string,
  itemId: string,
  input: {
    name?: unknown;
    price?: unknown;
    mealPeriod?: unknown;
    sortOrder?: unknown;
    svgKey?: unknown;
  },
) {
  assertPreview();
  const row = mockUpdateMenuItem(canteenId, itemId, input);
  revalidatePath(`/canteen/${canteenId}`);
  revalidatePath(`/canteen/manage/${canteenId}`);
  return row;
}

export async function previewDeleteMenuItem(canteenId: string, itemId: string) {
  assertPreview();
  mockDeleteMenuItem(canteenId, itemId);
  revalidatePath(`/canteen/${canteenId}`);
  revalidatePath(`/canteen/manage/${canteenId}`);
}

export async function previewGetMenuItemDeleteImpact(itemId: string) {
  assertPreview();
  return mockDeleteImpactForMenuItem(itemId);
}
