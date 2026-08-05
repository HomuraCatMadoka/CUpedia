import Fuse, { type FuseIndex } from "fuse.js";

export type ProfessorSearchCandidate = {
  id: string;
  name: string;
  searchText?: string | null;
  courseCode: string | null;
  description?: string | null;
};

export type ProfessorSearchResult = {
  id: string;
  name: string;
  description?: string;
};

export type ProfessorSearchIndex = ReturnType<
  FuseIndex<ProfessorSearchCandidate>["toJSON"]
>;

export const PROFESSOR_RANKING_MIN_RATINGS = 5;

export type ProfessorRankingCandidate = {
  name: string;
  publicId: string;
  rating: number | null;
  ratingCount: number;
};

const MAX_RESULTS = 10;
const MAX_FUSE_SCORE = 0.6;

export function buildProfessorSearchIndex(
  candidates: ProfessorSearchCandidate[],
): ProfessorSearchIndex {
  return Fuse.createIndex(["name", "searchText"], candidates).toJSON();
}

export function searchProfessorCandidates(
  candidates: ProfessorSearchCandidate[],
  query: string,
  serializedIndex?: ProfessorSearchIndex,
  limit = MAX_RESULTS,
): ProfessorSearchResult[] {
  const normalizedQuery = query.trim().normalize("NFKC");
  if (!normalizedQuery) return [];

  const fuse = new Fuse(
    candidates,
    {
      keys: ["name", "searchText"],
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
    .slice(0, limit)
    .map(({ item }) => ({
      id: item.id,
      name: item.name,
      ...(item.description ? { description: item.description } : {}),
    }));
}

export function rankProfessorCandidates<T extends ProfessorRankingCandidate>(
  candidates: T[],
): T[] {
  return candidates
    .filter(
      (candidate) =>
        candidate.rating !== null &&
        candidate.ratingCount >= PROFESSOR_RANKING_MIN_RATINGS,
    )
    .toSorted(
      (left, right) =>
        right.rating! - left.rating! ||
        right.ratingCount - left.ratingCount ||
        left.name.localeCompare(right.name) ||
        left.publicId.localeCompare(right.publicId),
    );
}
