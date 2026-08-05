import { sql, type SQLWrapper } from "drizzle-orm";

import {
  courseRatingProfessors,
  courseRatings,
  professorCourses,
  staffTeachingAssignments,
} from "@/db/schema";

export function professorCourseCodes(personId: SQLWrapper) {
  return sql`
    select assignment.course_code
    from ${staffTeachingAssignments} assignment
    where assignment.person_id = ${personId}
    union
    select professor_course.course_code
    from ${professorCourses} professor_course
    where professor_course.instructor_person_id = ${personId}
    union
    select rating.course_code
    from ${courseRatings} rating
    where rating.instructor_person_id = ${personId}
    union
    select selected_rating.course_code
    from ${courseRatingProfessors} selected_professor
    inner join ${courseRatings} selected_rating
      on selected_rating.id = selected_professor.rating_id
    where selected_professor.instructor_person_id = ${personId}
  `;
}

export function hasProfessorCourseEvidence(
  personId: SQLWrapper,
  courseCode: SQLWrapper,
) {
  return sql`exists (
    select 1
    from (${professorCourseCodes(personId)}) professor_course_evidence
    where professor_course_evidence.course_code = ${courseCode}
  )`;
}
