"use server";

import { and, asc, desc, eq, inArray, ne, or, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";

import { db } from "@/db";
import {
  courseInstructors,
  courseRatingProfessors,
  courseRatings,
  courseReviews,
  courses,
  staffAliases,
  staffOrganisationAffiliations,
  staffOrganisations,
  staffPeople,
  staffPersonSources,
  staffTeachingAssignments,
} from "@/db/schema";
import {
  hasProfessorCourseEvidence,
  professorCourseCodes,
} from "@/lib/professor-course-evidence";
import {
  selectProfessorDepartmentSource,
  selectProfessorImages,
  selectProfessorProfile,
  type ProfessorAppointmentKind,
  type ProfessorCardSource,
} from "@/lib/professor-card-source";
import {
  rankProfessorCandidates,
  searchProfessorCandidates,
} from "@/lib/professor-search";

const PAGE_SIZE = 24;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STAFF_PERSON_ID = sql.raw('"staff_people"."id"');
const COURSE_CODE = sql.raw('"courses"."code"');

export type ProfessorDirectoryFilter = {
  q?: string;
  department?: string;
  page?: number;
  sort?: "name" | "rating-count" | "rating";
  ratedOnly?: boolean;
};

export type ProfessorDepartmentOption = {
  id: string;
  name: string;
  count: number;
};

export type ProfessorDirectorySearchOption = {
  publicId: string;
  name: string;
  description?: string;
};

export type ProfessorReviewCourseOption = {
  code: string;
  title: string;
};

export type ProfessorDirectoryItem = {
  publicId: string;
  personId: string;
  name: string;
  title: string | null;
  faculty: string | null;
  department: string | null;
  imageUrls: string[];
  profile: { kind: "department" | "research_portal"; url: string } | null;
  rating: number | null;
  ratingCount: number;
};

export type ProfessorDirectoryPage = {
  professors: ProfessorDirectoryItem[];
  total: number;
  page: number;
  pageSize: number;
  departments: ProfessorDepartmentOption[];
};

export type ProfessorCourse = {
  code: string;
  title: string;
  academicYears: string[];
  rating: number | null;
  ratingCount: number;
};

export type ProfessorReview = {
  id: string;
  courseCode: string;
  academicYear: string | null;
  term: string | null;
  score: number | null;
  content: string;
};

export type ProfessorDetail = ProfessorDirectoryItem & {
  courses: ProfessorCourse[];
  reviews: ProfessorReview[];
};

type DirectoryCorpusItem = {
  id: string;
  publicId: string;
  name: string;
  searchText: string;
  faculty: string | null;
  description: string | null;
  departmentIds: string[];
  rating: number | null;
  ratingCount: number;
};

const getDirectoryCorpus = unstable_cache(
  async (): Promise<DirectoryCorpusItem[]> =>
    db
      .select({
        id: courseInstructors.personId,
        publicId: courseInstructors.publicId,
        name: staffPeople.canonicalName,
        searchText: sql<string>`concat_ws(
          ' ',
          ${staffPeople.canonicalName},
          (
            select string_agg(alias.alias, ' ' order by alias.alias)
            from ${staffAliases} alias
            where alias.person_id = ${STAFF_PERSON_ID}
          ),
          (
            select string_agg(distinct organisation.name, ' ' order by organisation.name)
            from ${staffOrganisationAffiliations} affiliation
            join ${staffOrganisations} organisation
              on organisation.id = affiliation.organisation_id
            where affiliation.person_id = ${STAFF_PERSON_ID}
              and affiliation.is_current = true
              and organisation.is_current = true
          ),
          (
            select string_agg(
              concat(evidence.course_code, ' ', taught_course.title),
              ' '
              order by concat(evidence.course_code, ' ', taught_course.title)
            )
            from (${professorCourseCodes(STAFF_PERSON_ID)}) evidence
            join ${courses} taught_course on taught_course.code = evidence.course_code
          )
        )`,
        faculty: sql<string | null>`(
          select organisation.name
          from ${staffOrganisationAffiliations} affiliation
          join ${staffOrganisations} organisation
            on organisation.id = affiliation.organisation_id
          where affiliation.person_id = ${STAFF_PERSON_ID}
            and affiliation.is_current = true
            and organisation.is_current = true
            and organisation.organisation_type = 'faculty'
          order by organisation.name
          limit 1
        )`,
        description: sql<string | null>`(
          select string_agg(distinct organisation.name, ' · ' order by organisation.name)
          from ${staffOrganisationAffiliations} affiliation
          join ${staffOrganisations} organisation
            on organisation.id = affiliation.organisation_id
          where affiliation.person_id = ${STAFF_PERSON_ID}
            and affiliation.is_current = true
            and organisation.is_current = true
            and organisation.organisation_type <> 'faculty'
        )`,
        departmentIds: sql<string[]>`coalesce((
          select array_agg(distinct organisation.id order by organisation.id)
          from ${staffOrganisationAffiliations} affiliation
          join ${staffOrganisations} organisation
            on organisation.id = affiliation.organisation_id
          where affiliation.person_id = ${STAFF_PERSON_ID}
            and affiliation.is_current = true
            and organisation.is_current = true
            and organisation.organisation_type in ('department', 'school')
        ), array[]::text[])`,
        rating: sql<number | null>`(
          select avg(rating.score)::double precision
          from ${courseRatings} rating
          where rating.instructor_person_id = ${STAFF_PERSON_ID}
            or exists (
              select 1 from ${courseRatingProfessors} selected
              where selected.rating_id = rating.id
                and selected.instructor_person_id = ${STAFF_PERSON_ID}
            )
        )`,
        ratingCount: sql<number>`(
          select count(*)::integer
          from ${courseRatings} rating
          where rating.instructor_person_id = ${STAFF_PERSON_ID}
            or exists (
              select 1 from ${courseRatingProfessors} selected
              where selected.rating_id = rating.id
                and selected.instructor_person_id = ${STAFF_PERSON_ID}
            )
        )`,
      })
      .from(courseInstructors)
      .innerJoin(staffPeople, eq(courseInstructors.personId, staffPeople.id))
      .where(eq(staffPeople.identityKind, "official"))
      .orderBy(asc(staffPeople.canonicalName), asc(courseInstructors.publicId)),
  ["professor-directory-corpus-v5"],
  { revalidate: 300, tags: ["professor-catalog"] },
);

const getDirectoryDepartments = unstable_cache(
  async (): Promise<ProfessorDepartmentOption[]> =>
    db
      .select({
        id: staffOrganisations.id,
        name: staffOrganisations.name,
        count: sql<number>`count(distinct ${courseInstructors.personId})::integer`,
      })
      .from(staffOrganisations)
      .innerJoin(
        staffOrganisationAffiliations,
        eq(staffOrganisationAffiliations.organisationId, staffOrganisations.id),
      )
      .innerJoin(
        courseInstructors,
        eq(courseInstructors.personId, staffOrganisationAffiliations.personId),
      )
      .innerJoin(staffPeople, eq(staffPeople.id, courseInstructors.personId))
      .where(
        and(
          eq(staffPeople.identityKind, "official"),
          eq(staffOrganisationAffiliations.isCurrent, true),
          eq(staffOrganisations.isCurrent, true),
          inArray(staffOrganisations.organisationType, [
            "department",
            "school",
          ]),
        ),
      )
      .groupBy(staffOrganisations.id, staffOrganisations.name)
      .orderBy(asc(staffOrganisations.name), asc(staffOrganisations.id)),
  ["professor-directory-departments-v1"],
  { revalidate: 300, tags: ["professor-catalog"] },
);

function roundScore(value: string | number | null): number | null {
  if (value === null) return null;
  return Math.round(Number(value) * 10) / 10;
}

type HydratedProfessorSource = ProfessorCardSource & {
  imageUrl: string | null;
  roleLabel: string | null;
};

function groupSources(rows: (typeof staffPersonSources.$inferSelect)[]) {
  const grouped = new Map<string, HydratedProfessorSource[]>();
  for (const row of rows) {
    const current = grouped.get(row.personId) ?? [];
    current.push({
      ...row,
      appointmentKind: row.appointmentKind as ProfessorAppointmentKind | null,
    });
    grouped.set(row.personId, current);
  }
  return grouped;
}

async function hydrateDirectoryItems(
  corpus: DirectoryCorpusItem[],
): Promise<ProfessorDirectoryItem[]> {
  if (!corpus.length) return [];
  const personIds = corpus.map((item) => item.id);
  const [sources, rows] = await Promise.all([
    db
      .select()
      .from(staffPersonSources)
      .where(
        and(
          inArray(staffPersonSources.personId, personIds),
          eq(staffPersonSources.isCurrent, true),
        ),
      ),
    db
      .select({
        personId: staffPeople.id,
        researchPortalUrl: staffPeople.profileUrl,
      })
      .from(staffPeople)
      .where(inArray(staffPeople.id, personIds)),
  ]);
  const sourceByPerson = groupSources(sources);
  const statsByPerson = new Map(rows.map((row) => [row.personId, row]));

  return corpus.map((item) => {
    const personSources = sourceByPerson.get(item.id) ?? [];
    const selected = selectProfessorDepartmentSource(personSources);
    const stats = statsByPerson.get(item.id);
    return {
      publicId: item.publicId,
      personId: item.id,
      name: item.name,
      title: selected?.roleLabel ?? null,
      faculty: item.faculty,
      department: item.description,
      imageUrls: selectProfessorImages(
        personSources,
        `/api/professor-portraits/${item.publicId}`,
      ),
      profile: selectProfessorProfile(
        stats?.researchPortalUrl ?? null,
        personSources,
      ),
      rating: roundScore(item.rating),
      ratingCount: item.ratingCount,
    };
  });
}

export async function getProfessorDirectory(
  filter: ProfessorDirectoryFilter = {},
): Promise<ProfessorDirectoryPage> {
  const [corpus, departments] = await Promise.all([
    getDirectoryCorpus(),
    getDirectoryDepartments(),
  ]);
  const department = departments.some((item) => item.id === filter.department)
    ? filter.department
    : undefined;
  const departmentCorpus = department
    ? corpus.filter((item) => item.departmentIds.includes(department))
    : corpus;
  const query = filter.q?.trim() ?? "";
  const queryMatches = query
    ? searchProfessorCandidates(
        departmentCorpus.map((item) => ({
          id: item.id,
          name: item.name,
          searchText: item.searchText,
          courseCode: null,
          description: item.description,
        })),
        query,
        undefined,
        departmentCorpus.length,
      )
        .map((match) => departmentCorpus.find((item) => item.id === match.id))
        .filter((item): item is DirectoryCorpusItem => Boolean(item))
    : departmentCorpus;
  const matches = filter.ratedOnly
    ? queryMatches.filter((item) => item.ratingCount > 0)
    : queryMatches;
  const sorted =
    filter.sort === "rating"
      ? rankProfessorCandidates(matches)
      : filter.sort === "rating-count"
        ? matches.toSorted(
            (left, right) =>
              right.ratingCount - left.ratingCount ||
              left.name.localeCompare(right.name) ||
              left.publicId.localeCompare(right.publicId),
          )
        : matches;
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Math.floor(filter.page ?? 1)));
  const start = (page - 1) * PAGE_SIZE;
  const pageRows = sorted.slice(start, start + PAGE_SIZE);
  const professors = await hydrateDirectoryItems(pageRows);

  return {
    professors,
    total: sorted.length,
    page,
    pageSize: PAGE_SIZE,
    departments,
  };
}

export async function searchProfessorReviewCourses(
  query: string,
): Promise<ProfessorReviewCourseOption[]> {
  const normalizedQuery = query.trim().normalize("NFKC");
  if (normalizedQuery.length < 2) return [];
  const compactCode = normalizedQuery.replaceAll(" ", "").toLowerCase();
  const like = `%${normalizedQuery.toLowerCase()}%`;
  const codeLike = `%${compactCode}%`;
  const codePrefix = `${compactCode}%`;

  return db
    .select({ code: courses.code, title: courses.title })
    .from(courses)
    .where(
      or(
        sql`lower(${courses.code}) like ${codeLike}`,
        sql`lower(${courses.title}) like ${like}`,
      ),
    )
    .orderBy(
      sql`case when lower(${courses.code}) like ${codePrefix} then 0 else 1 end`,
      asc(courses.code),
    )
    .limit(8);
}

export async function searchProfessorDirectory(
  query: string,
  department?: string,
): Promise<ProfessorDirectorySearchOption[]> {
  if (!query.trim()) return [];
  const corpus = await getDirectoryCorpus();
  const candidates = department
    ? corpus.filter((item) => item.departmentIds.includes(department))
    : corpus;
  const byId = new Map(candidates.map((item) => [item.id, item]));

  return searchProfessorCandidates(
    candidates.map((item) => ({
      id: item.id,
      name: item.name,
      searchText: item.searchText,
      courseCode: null,
      description: item.description,
    })),
    query,
  ).flatMap((result) => {
    const professor = byId.get(result.id);
    return professor
      ? [
          {
            publicId: professor.publicId,
            name: professor.name,
            ...(result.description ? { description: result.description } : {}),
          },
        ]
      : [];
  });
}

export async function getProfessorDetail(
  publicId: string,
): Promise<ProfessorDetail | null> {
  if (!UUID_PATTERN.test(publicId)) return null;
  const corpus = await getDirectoryCorpus();
  const person = corpus.find((item) => item.publicId === publicId);
  if (!person) return null;
  const [base] = await hydrateDirectoryItems([person]);
  if (!base) return null;

  const associatedRating = sql`(
    ${courseRatings.instructorPersonId} = ${person.id}
    or exists (
      select 1 from ${courseRatingProfessors} selected
      where selected.rating_id = ${courseRatings.id}
        and selected.instructor_person_id = ${person.id}
    )
  )`;
  const [courseRows, reviewRows] = await Promise.all([
    db
      .select({
        code: courses.code,
        title: courses.title,
        academicYears: sql<string[]>`coalesce((
          select array_agg(distinct assignment.academic_year order by assignment.academic_year desc)
          from ${staffTeachingAssignments} assignment
          where assignment.person_id = ${person.id}
            and assignment.course_code = ${COURSE_CODE}
        ), array[]::text[])`,
        rating: sql<string | null>`(
          select avg(rating.score)
          from ${courseRatings} rating
          where rating.course_code = ${COURSE_CODE}
            and (
              rating.instructor_person_id = ${person.id}
              or exists (
                select 1 from ${courseRatingProfessors} selected
                where selected.rating_id = rating.id
                  and selected.instructor_person_id = ${person.id}
              )
            )
        )`,
        ratingCount: sql<number>`(
          select count(*)
          from ${courseRatings} rating
          where rating.course_code = ${COURSE_CODE}
            and (
              rating.instructor_person_id = ${person.id}
              or exists (
                select 1 from ${courseRatingProfessors} selected
                where selected.rating_id = rating.id
                  and selected.instructor_person_id = ${person.id}
              )
            )
        )`,
      })
      .from(courses)
      .where(hasProfessorCourseEvidence(sql`${person.id}`, COURSE_CODE))
      .orderBy(
        desc(sql`coalesce((
        select max(assignment.academic_year)
        from ${staffTeachingAssignments} assignment
        where assignment.person_id = ${person.id}
          and assignment.course_code = ${COURSE_CODE}
      ), '')`),
        asc(courses.code),
      ),
    db
      .select({
        id: courseReviews.id,
        courseCode: courseReviews.courseCode,
        academicYear: courseReviews.academicYear,
        term: courseReviews.term,
        score: courseReviews.score,
        content: courseReviews.content,
      })
      .from(courseReviews)
      .innerJoin(
        courseRatings,
        and(
          eq(courseReviews.courseCode, courseRatings.courseCode),
          eq(courseReviews.userId, courseRatings.userId),
        ),
      )
      .where(and(ne(courseReviews.content, ""), associatedRating))
      .orderBy(desc(courseReviews.createdAt), desc(courseReviews.id))
      .limit(20),
  ]);

  return {
    ...base,
    courses: courseRows.map((course) => ({
      ...course,
      rating: roundScore(course.rating),
      ratingCount: Number(course.ratingCount),
    })),
    reviews: reviewRows,
  };
}
