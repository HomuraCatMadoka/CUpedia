/** Presentation only: the original name remains the search and accessible name. */
export function campusMapPlaceName(name: string) {
  const split = name.indexOf("（");
  if (split > 0 && name.endsWith("）")) {
    const leading = name.slice(0, split).trim();
    const translation = name.slice(split + 1, -1).trim();
    if (
      !/[\p{Script=Han}]/u.test(leading) &&
      /[\p{Script=Han}]/u.test(translation)
    ) {
      const code = leading.match(
        /^([A-Z]{2,5} (?:[A-Z]*\d+[A-Z]*(?:\/[A-Z]*\d+[A-Z]*)*|(?:LG|UG|G|\d+)\/F))\s+/u,
      )?.[1];
      return {
        primary: `${code ?? leading} ${translation}`,
        secondary: leading,
      };
    }
  }
  return { primary: name, secondary: null };
}
