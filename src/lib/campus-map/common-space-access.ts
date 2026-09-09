export const CAMPUS_MAP_COMMON_SPACE_ACCESS_OPTIONS = [
  {
    value: "no-card",
    label: "无需拍卡",
    note: "无需拍校园卡",
  },
  {
    value: "campus-card",
    label: "需要拍校园卡",
    note: "需要拍校园卡进入",
  },
] as const;

export type CampusMapCommonSpaceAccess =
  (typeof CAMPUS_MAP_COMMON_SPACE_ACCESS_OPTIONS)[number]["value"];

export interface CampusMapCommonSpaceVisitNote {
  access: CampusMapCommonSpaceAccess | null;
  note: string;
}

export function parseCampusMapCommonSpaceVisitNote(
  visitNote: string | null,
): CampusMapCommonSpaceVisitNote {
  const note = visitNote?.trim() ?? "";
  for (const option of CAMPUS_MAP_COMMON_SPACE_ACCESS_OPTIONS) {
    if (note === option.note) {
      return { access: option.value, note: "" };
    }
    const prefix = `${option.note}；`;
    if (note.startsWith(prefix)) {
      return {
        access: option.value,
        note: note.slice(prefix.length).trim(),
      };
    }
  }
  return { access: null, note };
}

export function composeCampusMapCommonSpaceVisitNote(
  access: CampusMapCommonSpaceAccess | null,
  note: string,
): string | null {
  const accessNote = CAMPUS_MAP_COMMON_SPACE_ACCESS_OPTIONS.find(
    (option) => option.value === access,
  )?.note;
  const trimmedNote = note.trim();
  return [accessNote, trimmedNote].filter(Boolean).join("；") || null;
}

export function removeCampusMapCommonSpaceAccessFromVisitNote(
  visitNote: string | null,
): string | null {
  return parseCampusMapCommonSpaceVisitNote(visitNote).note || null;
}
