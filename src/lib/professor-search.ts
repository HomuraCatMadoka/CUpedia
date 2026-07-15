import Fuse from "fuse.js";

export type ProfessorSearchCandidate = {
  id: string;
  name: string;
  courseCode: string | null;
};

export type ProfessorSearchResult = { id: string; name: string };

const MAX_RESULTS = 10;
const MAX_FUSE_SCORE = 0.6;

export function searchProfessorCandidates(
  candidates: ProfessorSearchCandidate[],
  query: string,
): ProfessorSearchResult[] {
  const normalizedQuery = query.trim().normalize("NFKC");
  if (!normalizedQuery) return [];

  const fuse = new Fuse(candidates, {
    keys: ["name"],
    threshold: 0.4,
    ignoreLocation: true,
    ignoreDiacritics: true,
    useTokenSearch: !/\p{Script=Han}/u.test(normalizedQuery),
    includeScore: true,
  });

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
