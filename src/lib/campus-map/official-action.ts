import type { CampusMapOfficialAction } from "@/db/schema";

export const CAMPUS_MAP_OFFICIAL_ACTION_MAX_COUNT = 8;
export const CAMPUS_MAP_OFFICIAL_ACTION_LABEL_MAX_BYTES = 120;
export const CAMPUS_MAP_OFFICIAL_ACTION_URL_MAX_BYTES = 2_048;

const CAMPUS_MAP_OFFICIAL_HTTPS_URL_PATTERN =
  /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?:[/?#][^\s]*)?$/i;

function utf8Bytes(value: string) {
  return new TextEncoder().encode(value).byteLength;
}

function containsInvalidText(value: string) {
  if (value.includes("\u0000")) return true;
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return true;
    }
  }
  return false;
}

type CampusMapOfficialActionKind = "https" | "phone" | "email";

function campusMapOfficialActionKind(
  rawUrl: string,
): CampusMapOfficialActionKind | null {
  if (rawUrl !== rawUrl.trim()) return null;
  if (/^tel:/i.test(rawUrl)) {
    const contact = rawUrl.slice(4);
    return /^\+?[0-9][0-9 ()-]{5,24}$/.test(contact) ? "phone" : null;
  }
  if (/^mailto:/i.test(rawUrl)) {
    const contact = rawUrl.slice(7);
    return /^[^\s@?]+@[^\s@?]+\.[^\s@?]+$/.test(contact) ? "email" : null;
  }
  try {
    const parsed = new URL(rawUrl);
    return CAMPUS_MAP_OFFICIAL_HTTPS_URL_PATTERN.test(rawUrl) &&
      parsed.protocol === "https:" &&
      parsed.hostname.length > 0 &&
      parsed.username === "" &&
      parsed.password === ""
      ? "https"
      : null;
  } catch {
    return null;
  }
}

export function campusMapOfficialActionError(
  action: unknown,
): "invalid-label" | "invalid-url" | null {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    return "invalid-url";
  }
  const candidate = action as Partial<CampusMapOfficialAction> &
    Record<string, unknown>;
  if (
    Object.keys(candidate).some((key) => key !== "label" && key !== "url") ||
    typeof candidate.label !== "string" ||
    candidate.label.trim() === "" ||
    containsInvalidText(candidate.label) ||
    utf8Bytes(candidate.label) > CAMPUS_MAP_OFFICIAL_ACTION_LABEL_MAX_BYTES
  ) {
    return "invalid-label";
  }
  if (
    typeof candidate.url !== "string" ||
    containsInvalidText(candidate.url) ||
    utf8Bytes(candidate.url) > CAMPUS_MAP_OFFICIAL_ACTION_URL_MAX_BYTES ||
    campusMapOfficialActionKind(candidate.url) === null
  ) {
    return "invalid-url";
  }
  return null;
}

export function isCampusMapOfficialAction(
  action: unknown,
): action is CampusMapOfficialAction {
  return campusMapOfficialActionError(action) === null;
}
