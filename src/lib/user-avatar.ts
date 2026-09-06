// When replacing the image, bump this version and its next.config.ts cache rule.
export const DEFAULT_AVATAR_URL = "/images/default-avatar.jpg?v=1";

export type EquippedPersonTitle = {
  displayName: string;
  badgeCode: string;
};

export function resolveAvatarUrl(image: string | null | undefined) {
  return image?.trim() || DEFAULT_AVATAR_URL;
}
