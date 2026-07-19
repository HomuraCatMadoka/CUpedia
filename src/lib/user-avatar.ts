export const DEFAULT_AVATAR_URL = "/images/default-avatar.jpg";

export type EquippedPersonTitle = {
  displayName: string;
  badgeCode: string;
};

export function resolveAvatarUrl(image: string | null | undefined) {
  return image?.trim() || DEFAULT_AVATAR_URL;
}
