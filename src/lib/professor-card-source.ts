export type ProfessorAppointmentKind =
  | "regular"
  | "visiting"
  | "adjunct"
  | "part_time"
  | "courtesy"
  | "emeritus"
  | "honorary";

export type ProfessorCardSource = {
  source: string;
  sourceKey: string;
  profileUrl: string | null;
  profileVerifiedAt: Date | string | null;
  appointmentKind: ProfessorAppointmentKind | null;
  isCurrent: boolean;
  imageUrl: string | null;
};

const APPOINTMENT_PRIORITY: Record<ProfessorAppointmentKind, number> = {
  regular: 0,
  visiting: 1,
  adjunct: 2,
  part_time: 3,
  courtesy: 4,
  emeritus: 5,
  honorary: 6,
};

export function isProfessorCardEligible(
  identityKind: string,
  isCourseInstructor: boolean,
): boolean {
  return identityKind === "official" && isCourseInstructor;
}

export function selectProfessorProfile(
  researchPortalUrl: string | null,
  sources: ProfessorCardSource[],
): { kind: "department" | "research_portal"; url: string } | null {
  const department = selectProfessorDepartmentSource(sources);

  if (department?.profileUrl) {
    return { kind: "department", url: department.profileUrl };
  }
  return researchPortalUrl
    ? { kind: "research_portal", url: researchPortalUrl }
    : null;
}

export function selectProfessorDepartmentSource<T extends ProfessorCardSource>(
  sources: T[],
): T | null {
  return (
    sources
      .filter(
        (source) =>
          source.source.startsWith("cuhk_department:") &&
          source.isCurrent &&
          Boolean(source.profileUrl) &&
          Boolean(source.profileVerifiedAt),
      )
      .toSorted((left, right) => {
        const leftPriority = left.appointmentKind
          ? APPOINTMENT_PRIORITY[left.appointmentKind]
          : Number.MAX_SAFE_INTEGER;
        const rightPriority = right.appointmentKind
          ? APPOINTMENT_PRIORITY[right.appointmentKind]
          : Number.MAX_SAFE_INTEGER;
        return (
          leftPriority - rightPriority ||
          left.source.localeCompare(right.source) ||
          left.sourceKey.localeCompare(right.sourceKey)
        );
      })[0] ?? null
  );
}

export function selectProfessorImage(
  sources: ProfessorCardSource[],
): string | null {
  const departmentImage = selectProfessorDepartmentSource(sources)?.imageUrl;
  if (departmentImage) return departmentImage;

  return (
    sources.find(
      (source) =>
        source.source === "cuhk_research_portal" &&
        source.isCurrent &&
        Boolean(source.imageUrl),
    )?.imageUrl ?? null
  );
}
