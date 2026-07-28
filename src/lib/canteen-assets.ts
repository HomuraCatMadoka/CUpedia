import { existsSync } from "node:fs";
import path from "node:path";

const IMAGE_EXTENSIONS = ["png", "webp", "jpg", "jpeg", "svg"] as const;

function isSafeAssetKey(key: string): boolean {
  return Boolean(
    key &&
      !key.includes("..") &&
      !key.includes("/") &&
      !key.includes("\\"),
  );
}

function resolveKeyInFolder(
  folder: "canteen-qr" | "canteen-icons",
  key: string,
): string | null {
  if (!isSafeAssetKey(key)) return null;

  const dir = path.join(process.cwd(), "public", "assets", folder);
  for (const ext of IMAGE_EXTENSIONS) {
    const filename = `${key}.${ext}`;
    if (existsSync(path.join(dir, filename))) {
      return `/assets/${folder}/${filename}`;
    }
  }
  return null;
}

function resolvePublicAssetSrc(
  folder: "canteen-qr" | "canteen-icons",
  ...keys: Array<string | null | undefined>
): string | null {
  for (const key of keys) {
    if (!key) continue;
    const src = resolveKeyInFolder(folder, key);
    if (src) return src;
  }
  return null;
}

/** Public URL for a canteen QR image, or null when missing. */
export function resolveCanteenQrSrc(
  ...keys: Array<string | null | undefined>
): string | null {
  return resolvePublicAssetSrc("canteen-qr", ...keys);
}

/** Public URL for a canteen launcher icon, or null when missing. */
export function resolveCanteenIconSrc(
  ...keys: Array<string | null | undefined>
): string | null {
  return resolvePublicAssetSrc("canteen-icons", ...keys);
}
