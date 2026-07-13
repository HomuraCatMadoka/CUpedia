const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

export type HandbookConstraint = {
  dimension: "courses" | "units";
  minimum: number | null;
  maximum: number | null;
};

const number = (value: string) =>
  NUMBER_WORDS[value.toLowerCase()] ?? Number(value);

export function parseHandbookConstraints(text: string): HandbookConstraint[] {
  const constraints: HandbookConstraint[] = [];
  const add = (
    dimension: HandbookConstraint["dimension"],
    minimum: number | null,
    maximum: number | null,
  ) => {
    if (
      !constraints.some(
        (constraint) =>
          constraint.dimension === dimension &&
          constraint.minimum === minimum &&
          constraint.maximum === maximum,
      )
    ) {
      constraints.push({ dimension, minimum, maximum });
    }
  };
  const value =
    "(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\\d+)";
  for (const match of text.matchAll(
    new RegExp(`at least\\s+${value}\\s+(units?|courses?)`, "gi"),
  )) {
    add(
      match[2].toLowerCase().startsWith("unit") ? "units" : "courses",
      number(match[1]),
      null,
    );
  }
  for (const match of text.matchAll(
    new RegExp(
      `(?:at most|(?:a\\s+)?maximum of)\\s+${value}\\s+(units?|courses?)`,
      "gi",
    ),
  )) {
    add(
      match[2].toLowerCase().startsWith("unit") ? "units" : "courses",
      null,
      number(match[1]),
    );
  }
  for (const match of text.matchAll(
    new RegExp(`(?:choose|select)?\\s*any\\s+${value}\\s+courses?`, "gi"),
  )) {
    const count = number(match[1]);
    add("courses", count, count);
  }
  if (
    /\b(?:choose|select)?\s*(?:any\s+)?one\s+(?:course\s+)?(?:of|from)\b/i.test(
      text,
    )
  ) {
    add("courses", 1, 1);
  }
  return constraints;
}
