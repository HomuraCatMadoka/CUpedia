/** Deterministic mock icon art until real assets exist under public/assets/canteen-icons. */

const FILLS = [
  "#ebebf0",
  "#e8e8ed",
  "#f0f0f5",
  "#e5e5ea",
  "#ededf2",
  "#e9e9ef",
] as const;

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Short label for empty-state app icon (no emoji). */
export function canteenIconInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "?";

  if (/[\u4e00-\u9fff]/.test(trimmed)) {
    return trimmed.slice(0, 1);
  }

  const hyphenParts = trimmed.split(/[-_]+/).filter(Boolean);
  if (hyphenParts.length >= 2) {
    return hyphenParts
      .slice(0, 2)
      .map((part) => part[0]!.toUpperCase())
      .join("");
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return words
      .slice(0, 2)
      .map((word) => word[0]!.toUpperCase())
      .join("");
  }

  return trimmed.slice(0, 2).toUpperCase();
}

export function mockCanteenIcon(canteenId: string, name: string) {
  const seed = hashSeed(`${canteenId}:${name}`);
  return {
    fill: FILLS[seed % FILLS.length]!,
    initials: canteenIconInitials(name),
  };
}
