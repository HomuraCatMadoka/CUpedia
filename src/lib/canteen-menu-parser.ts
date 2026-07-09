import { randomUUID } from "crypto";
import type { MealPeriod } from "@/db/schema";
import type { MenuImportDraftItem } from "@/lib/canteen-types";

const TRAILING_PRICE_RE =
  /^(.+?)\s+(?:HK?\$|￥|¥)?\s*(\d{1,4}(?:\.\d{1,2})?)\s*(?:元|港币|HKD)?\s*$/i;

const LEADING_PRICE_RE = /^(\d{1,4})\s+(.+)$/;

function parseLine(line: string): { name: string; price: number | null } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length < 2) return null;

  const trailing = trimmed.match(TRAILING_PRICE_RE);
  if (trailing) {
    const name = trailing[1].replace(/[¥￥$]/g, "").trim();
    const price = Math.round(Number(trailing[2]));
    if (name && Number.isFinite(price) && price >= 0 && price <= 9999) {
      return { name, price };
    }
  }

  const leading = trimmed.match(LEADING_PRICE_RE);
  if (leading) {
    const price = Number(leading[1]);
    const name = leading[2].trim();
    if (name && Number.isFinite(price) && price >= 0 && price <= 9999) {
      return { name, price };
    }
  }

  return { name: trimmed, price: null };
}

/** Best-effort parse of OCR plain text into editable draft rows. Meal period defaults to lunch. */
export function parseOcrTextToDraftItems(
  ocrText: string,
  defaultMealPeriod: MealPeriod = "lunch",
): MenuImportDraftItem[] {
  const lines = ocrText.split(/\r?\n/);
  const items: MenuImportDraftItem[] = [];

  for (const line of lines) {
    const parsed = parseLine(line);
    if (!parsed) continue;
    if (parsed.name.length > 200) continue;

    items.push({
      tempId: randomUUID(),
      name: parsed.name,
      price: parsed.price,
      mealPeriod: defaultMealPeriod,
      sortOrder: items.length,
    });
  }

  return items;
}
