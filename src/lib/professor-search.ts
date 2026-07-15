import Fuse, { type FuseIndex } from "fuse.js";

export type ProfessorSearchCandidate = {
  id: string;
  name: string;
  courseCode: string | null;
};

export type ProfessorSearchResult = { id: string; name: string };

export type ProfessorSearchIndex = ReturnType<
  FuseIndex<ProfessorSearchCandidate>["toJSON"]
>;

const MAX_RESULTS = 10;
const MAX_FUSE_SCORE = 0.6;

export function buildProfessorSearchIndex(
  candidates: ProfessorSearchCandidate[],
): ProfessorSearchIndex {
  return Fuse.createIndex(["name"], candidates).toJSON();
}

export function searchProfessorCandidates(
  candidates: ProfessorSearchCandidate[],
  query: string,
  serializedIndex?: ProfessorSearchIndex,
): ProfessorSearchResult[] {
  const normalizedQuery = query.trim().normalize("NFKC");
  if (!normalizedQuery) return [];

  const fuse = new Fuse(
    candidates,
    {
      keys: ["name"],
      threshold: 0.4,
      ignoreLocation: true,
      ignoreDiacritics: true,
      useTokenSearch: !/\p{Script=Han}/u.test(normalizedQuery),
      includeScore: true,
    },
    serializedIndex
      ? Fuse.parseIndex<ProfessorSearchCandidate>(serializedIndex)
      : undefined,
  );

  return fuse
    .search(normalizedQuery)
    .filter(({ score }) => (score ?? 1) <= MAX_FUSE_SCORE)
    .sort((left, right) => {
      const scoreDifference = (left.score ?? 1) - (right.score ?? 1);
      if (scoreDifference !== 0) return scoreDifference;
      return (
        Number(Boolean(right.item.courseCode)) -
        Number(Boolean(left.item.courseCode))
      );
    })
    .slice(0, MAX_RESULTS)
    .map(({ item }) => ({
      id: item.id,
      name: item.name,
    }));
}
