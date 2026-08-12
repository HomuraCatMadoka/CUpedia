/**
 * External ordering entry URLs previously encoded in canteen QR PNGs.
 * Keys are canteen name (preferred) and/or UUID.
 */
const CANTEEN_ORDER_URLS: Record<string, string> = {
  "ws-can": "https://meal.pin2eat.com/store/4898/takeout",
  "uc-can": "https://meal.pin2eat.com/store/5198/takeout",
  "na-can": "https://meal.pin2eat.com/store/5500/takeout",
  "mc-can":
    "https://shop.ichefpos.com/store/UQftKWxU/instore/qrcode?tableName=VDE",
  "Ebeneezer's": "https://www.ebeneezers.com/",
  "9539dbf3-3f22-4749-b532-e42357e0be96": "https://www.ebeneezers.com/",
  "Cafe Tolo":
    "https://meal.pin2eat.com/v2/package_store/pages/store/home?store_id=4899#index",
};

/** Ordering page URL for a canteen, or null when not configured. */
export function resolveCanteenOrderUrl(
  ...keys: Array<string | null | undefined>
): string | null {
  for (const key of keys) {
    if (!key) continue;
    const url = CANTEEN_ORDER_URLS[key];
    if (url) return url;
  }
  return null;
}
