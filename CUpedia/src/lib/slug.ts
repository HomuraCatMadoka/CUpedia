const RESERVED_FIRST_SEGMENTS = new Set(["edit", "history", "new", "search"]);

const CJK = /[一-鿿㐀-䶿]/;

export function generateSlug(title: string): string {
  let s = title.replace(/[a-zA-Z]+/g, (m) => m.toLowerCase());
  // Insert dash at CJK↔Latin boundaries
  s = s.replace(/([一-鿿㐀-䶿])([a-z0-9])/g, "$1-$2");
  s = s.replace(/([a-z0-9])([一-鿿㐀-䶿])/g, "$1-$2");
  return s
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function validateSlug(slug: string): boolean {
  if (!slug) return false;
  if (/^[\p{L}\p{N}]+(?:[-/][\p{L}\p{N}]+)*$/u.test(slug) === false) return false;
  const [firstSegment] = slug.split("/");
  return !RESERVED_FIRST_SEGMENTS.has(firstSegment);
}
