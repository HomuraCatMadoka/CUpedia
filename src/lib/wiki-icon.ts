const MAX_WIKI_ICON_LENGTH = 32;

const segmenter = new Intl.Segmenter(undefined, {
  granularity: "grapheme",
});

const EMOJI_GRAPHEME_PATTERN =
  /(?:\p{Extended_Pictographic}|\p{Regional_Indicator}{2}|[0-9#*]\uFE0F?\u20E3)/u;

/**
 * Normalize a page icon at the server boundary.
 *
 * Page icons intentionally stay as one native Unicode emoji grapheme. That
 * keeps the value portable while still allowing ZWJ sequences, skin tones,
 * flags, and keycaps.
 */
export function normalizeWikiIcon(
  value: string | null | undefined,
): string | null {
  if (value == null) return null;

  const icon = value.trim();
  if (!icon) return null;
  if (icon.length > MAX_WIKI_ICON_LENGTH) {
    throw new Error("Invalid page icon");
  }

  const graphemes = Array.from(
    segmenter.segment(icon),
    ({ segment }) => segment,
  );
  if (
    graphemes.length !== 1 ||
    graphemes[0] !== icon ||
    !EMOJI_GRAPHEME_PATTERN.test(icon)
  ) {
    throw new Error("Invalid page icon");
  }

  return icon;
}
