import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import {
  courseInstructors,
  staffPeople,
  staffPersonSources,
} from "@/db/schema";
import {
  selectProfessorDepartmentSource,
  type ProfessorAppointmentKind,
} from "@/lib/professor-card-source";

export function isAllowedProfessorPortraitUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      (url.hostname === "cuhk.edu.hk" ||
        url.hostname.endsWith(".cuhk.edu.hk") ||
        url.hostname === "i0.wp.com")
    );
  } catch {
    return false;
  }
}

export async function getProfessorDepartmentPortrait(
  publicId: string,
): Promise<{ imageUrl: string; profileUrl: string } | null> {
  const rows = await db
    .select({
      source: staffPersonSources.source,
      sourceKey: staffPersonSources.sourceKey,
      profileUrl: staffPersonSources.profileUrl,
      profileVerifiedAt: staffPersonSources.profileVerifiedAt,
      appointmentKind: staffPersonSources.appointmentKind,
      isCurrent: staffPersonSources.isCurrent,
      imageUrl: staffPersonSources.imageUrl,
    })
    .from(courseInstructors)
    .innerJoin(
      staffPeople,
      and(
        eq(staffPeople.id, courseInstructors.personId),
        eq(staffPeople.identityKind, "official"),
      ),
    )
    .innerJoin(
      staffPersonSources,
      eq(staffPersonSources.personId, courseInstructors.personId),
    )
    .where(eq(courseInstructors.publicId, publicId));
  const selected = selectProfessorDepartmentSource(
    rows.map((row) => ({
      ...row,
      appointmentKind: row.appointmentKind as ProfessorAppointmentKind | null,
    })),
  );

  return selected?.profileUrl && selected.imageUrl
    ? { profileUrl: selected.profileUrl, imageUrl: selected.imageUrl }
    : null;
}
