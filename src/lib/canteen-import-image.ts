export const MENU_IMPORT_MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export const MENU_IMPORT_ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export type MenuImportAllowedType = (typeof MENU_IMPORT_ALLOWED_TYPES)[number];

export function isAllowedMenuImportType(
  mimeType: string,
): mimeType is MenuImportAllowedType {
  return (MENU_IMPORT_ALLOWED_TYPES as readonly string[]).includes(mimeType);
}

export function assertMenuImportImageSize(byteLength: number): void {
  if (byteLength <= 0 || byteLength > MENU_IMPORT_MAX_IMAGE_BYTES) {
    throw new Error("IMAGE_TOO_LARGE");
  }
}
