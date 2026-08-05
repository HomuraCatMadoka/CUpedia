import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import { and, eq, like, sql } from "drizzle-orm";
import { Pool } from "pg";
import {
  courseEnrollments,
  courseInstructors,
  courseOfferingInstructors,
  professorCourses,
  professorStaffIdentities,
  professors,
  staffPeople,
  staffPersonSources,
  staffTeachingAssignments,
} from "../src/db/schema";
import {
  buildProfessorCatalog,
  normalizeProfessorName,
  type CourseInstructorOverride,
  type TeachingStaffSource,
} from "./professor-catalog";

dotenv.config({ path: resolve(process.cwd(), ".env.local") });

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  const file = resolve(process.cwd(), "scripts/data/professors.json");
  const source = JSON.parse(await readFile(file, "utf8")) as {
    capturedAt: string;
    professors: TeachingStaffSource[];
    enrollments: Array<{
      academicYear: string;
      term: string;
      courseCode: string;
      classCode: string;
      classNbr: string;
      component: string;
      section: string;
      quota: number;
      vacancy: number;
      instructors: string[];
    }>;
  };
  const overrides = JSON.parse(
    await readFile(
      resolve(process.cwd(), "scripts/course-instructor-overrides.json"),
      "utf8",
    ),
  ) as CourseInstructorOverride[];
  const catalog = buildProfessorCatalog(source.professors, overrides);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool);
  await db.transaction(async (tx) => {
    await tx.delete(professorCourses);
    await tx.delete(courseEnrollments);
    for (const professor of catalog) {
      await tx
        .insert(professors)
        .values(professor)
        .onConflictDoUpdate({
          target: professors.id,
          set: {
            name: professor.name,
            searchText: professor.searchText,
            updatedAt: new Date(),
          },
        });
      let personId: string;
      if (professor.identityProfileUrl) {
        const [person] = await tx
          .select({ id: staffPeople.id })
          .from(staffPeople)
          .where(eq(staffPeople.profileUrl, professor.identityProfileUrl));
        if (!person) {
          throw new Error(
            `Professor identity profile is missing: ${professor.identityProfileUrl}`,
          );
        }
        personId = person.id;
        await tx
          .insert(professorStaffIdentities)
          .values({
            professorId: professor.id,
            personId: person.id,
            matchMethod: "manual_override",
            sourceUrl: professor.identityEvidenceUrl,
          })
          .onConflictDoUpdate({
            target: professorStaffIdentities.professorId,
            set: {
              personId: person.id,
              matchMethod: "manual_override",
              sourceUrl: professor.identityEvidenceUrl,
              verifiedAt: new Date(),
            },
          });
      } else {
        const [existingIdentity] = await tx
          .select({ personId: professorStaffIdentities.personId })
          .from(professorStaffIdentities)
          .where(eq(professorStaffIdentities.professorId, professor.id));
        if (existingIdentity) {
          personId = existingIdentity.personId;
        } else {
          const [existingSource] = await tx
            .select({ personId: staffPersonSources.personId })
            .from(staffPersonSources)
            .where(
              and(
                eq(staffPersonSources.source, "cuhk_timetable"),
                eq(staffPersonSources.sourceKey, professor.id),
              ),
            );
          personId =
            existingSource?.personId ?? `timetable-professor:${professor.id}`;
          if (!existingSource) {
            await tx
              .insert(staffPeople)
              .values({
                id: personId,
                canonicalName: professor.name,
                source: "cuhk_timetable",
                identityKind: "unverified",
              })
              .onConflictDoUpdate({
                target: staffPeople.id,
                set: {
                  canonicalName: professor.name,
                  lastSeenAt: new Date(),
                  isCurrent: true,
                  missingRuns: 0,
                  updatedAt: new Date(),
                },
              });
            await tx
              .insert(staffPersonSources)
              .values({
                personId,
                source: "cuhk_timetable",
                sourceKey: professor.id,
                sourceUrl:
                  "https://rgsntl.rgs.cuhk.edu.hk/rws_prd_applx2/Public/tt_dsp_timetable.aspx",
              })
              .onConflictDoNothing();
          }
          await tx.insert(professorStaffIdentities).values({
            professorId: professor.id,
            personId,
            matchMethod: "source_native",
            sourceUrl:
              "https://rgsntl.rgs.cuhk.edu.hk/rws_prd_applx2/Public/tt_dsp_timetable.aspx",
          });
        }
      }
      await tx
        .insert(courseInstructors)
        .values({ personId })
        .onConflictDoUpdate({
          target: courseInstructors.personId,
          set: { updatedAt: new Date() },
        });
      await tx
        .insert(professorCourses)
        .values(
          professor.courses.map((courseCode) => ({
            professorId: professor.id,
            instructorPersonId: personId,
            courseCode,
          })),
        )
        .onConflictDoNothing();
    }
    for (let i = 0; i < source.enrollments.length; i += 500) {
      await tx.insert(courseEnrollments).values(
        source.enrollments.slice(i, i + 500).map((row) => ({
          ...row,
          instructors: row.instructors.map(normalizeProfessorName),
          capturedAt: new Date(source.capturedAt),
        })),
      );
    }
    await tx.execute(sql`
      with unique_aliases as (
        select alias, min(person_id) as person_id
        from staff_aliases
        group by alias
        having count(distinct person_id) = 1
      )
      insert into course_offering_instructors (
        academic_year,
        term,
        course_code,
        class_code,
        component,
        section,
        instructor_name,
        person_id,
        match_status,
        evidence_url,
        captured_at
      )
      select
        enrollments.academic_year,
        enrollments.term,
        enrollments.course_code,
        enrollments.class_code,
        enrollments.component,
        enrollments.section,
        instructor.name,
        aliases.person_id,
        case
          when people.identity_kind = 'external' then 'external'
          when aliases.person_id is not null then 'automatic'
          else 'unverified'
        end,
        people.profile_url,
        enrollments.captured_at
      from course_enrollments enrollments
      cross join lateral unnest(enrollments.instructors) as instructor(name)
      left join unique_aliases aliases on aliases.alias = instructor.name
      left join staff_people people on people.id = aliases.person_id
      on conflict do nothing
    `);
    for (const override of overrides) {
      const [person] = await tx
        .select({ id: staffPeople.id })
        .from(staffPeople)
        .where(eq(staffPeople.profileUrl, override.profileUrl));
      if (!person) {
        throw new Error(
          `Course instructor override profile is missing: ${override.profileUrl}`,
        );
      }
      const updated = await tx
        .update(courseOfferingInstructors)
        .set({
          personId: person.id,
          matchStatus: "manual",
          evidenceUrl: override.evidenceUrl,
        })
        .where(
          and(
            eq(
              courseOfferingInstructors.instructorName,
              override.instructorName,
            ),
            like(
              courseOfferingInstructors.courseCode,
              `${override.coursePrefix}%`,
            ),
          ),
        )
        .returning({
          instructorName: courseOfferingInstructors.instructorName,
        });
      if (updated.length === 0) {
        throw new Error(
          `Course instructor override matched no offerings: ${override.coursePrefix}/${override.instructorName}`,
        );
      }
    }
    await tx.delete(staffTeachingAssignments);
    await tx.execute(sql`
      insert into staff_teaching_assignments (
        person_id, academic_year, term, course_code, captured_at
      )
      select distinct
        offering.person_id,
        offering.academic_year,
        case
          when offering.term = 'Summer Session' then 'Summer'
          else offering.term
        end,
        offering.course_code,
        offering.captured_at
      from course_offering_instructors offering
      where offering.person_id is not null
      on conflict do nothing
    `);
    await tx.execute(sql`
      delete from professors professor
      where not exists (
        select 1 from professor_courses course
        where course.professor_id = professor.id
      )
        and not exists (
          select 1 from professor_staff_identities identity
          where identity.professor_id = professor.id
        )
        and not exists (
          select 1 from course_reviews review
          where review.professor_id = professor.id
        )
        and not exists (
          select 1 from course_ratings rating
          where rating.professor_id = professor.id
        )
    `);
  });
  await pool.end();
  console.log(
    `Updated ${catalog.length} professors and ${source.enrollments.length} enrollment rows from ${file}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
