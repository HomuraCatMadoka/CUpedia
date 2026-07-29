/** Deterministic fallback styling until real assets exist under public/assets/canteen-icons. */

const FILLS = ["#4f6272", "#5f645d", "#6c5f66"] as const;

function hashSeed(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function canteenWordmark(name: string): string {
  const trimmed = name.trim();
  const trailingNumber = trimmed.match(/(\d{1,2})$/)?.[1];
  if (trailingNumber) return trailingNumber.padStart(2, "0");

  const normalized = trimmed.replace(
    /学生|學生|食堂|饭堂|飯堂|膳堂|餐厅|餐廳|书院|書院/g,
    "",
  );
  const chinese = normalized.match(/[\u3400-\u9fff]/g);
  if (chinese?.length) {
    return chinese.length === 1
      ? chinese[0]!
      : `${chinese[0]}${chinese[chinese.length - 1]}`;
  }

  const words = normalized.split(/[\s_-]+/).filter(Boolean);
  return words.length > 1
    ? words
        .slice(0, 2)
        .map((word) => word[0]!.toUpperCase())
        .join("")
    : normalized.slice(0, 2).toUpperCase() || "?";
}

export function mockCanteenIcon(canteenId: string, name: string) {
  const seed = hashSeed(`${canteenId}:${name}`);
  return {
    fill: FILLS[seed % FILLS.length]!,
    initials: canteenWordmark(name),
  };
}
