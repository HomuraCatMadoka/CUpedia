import type { MajorSkeleton } from "@/lib/parseHandbookLeaf";

export type HandbookSnapshotEntry = {
  meta: {
    file: string;
    programme: string;
    programmeKind: "major";
    handbookYear: string;
  };
  leaf: MajorSkeleton;
};

export function validateHandbookSnapshot(
  entries: HandbookSnapshotEntry[],
  allowPartial = false,
) {
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const { meta, leaf } of entries) {
    const key = `${meta.programme}\0${meta.handbookYear}`;
    if (keys.has(key))
      errors.push(`duplicate: ${meta.programme} (${meta.handbookYear})`);
    keys.add(key);
    if (meta.programmeKind !== "major" || leaf.programmeKind !== "major")
      errors.push(`not a Major Programme: ${meta.file}`);
    if (!/^20\d{2}-\d{2}$/.test(meta.handbookYear))
      errors.push(`unknown year: ${meta.file}`);
    if (!leaf.categories.length) errors.push(`empty categories: ${meta.file}`);
  }
  const years = [
    ...new Set(entries.map(({ meta }) => meta.handbookYear)),
  ].sort();
  if (years.length !== 4 && !allowPartial)
    errors.push(`expected 4 admission years, got ${years.length}`);
  return { errors, years };
}

export function snapshotMajorName(
  entry: HandbookSnapshotEntry,
  entries: HandbookSnapshotEntry[],
) {
  const sameTitle = entries.filter(
    ({ meta, leaf }) =>
      meta.handbookYear === entry.meta.handbookYear &&
      leaf.title === entry.leaf.title,
  );
  return sameTitle.length > 1 ? entry.meta.programme : entry.leaf.title;
}
