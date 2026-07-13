export type WikiEditRole = "admin" | "user";

/** Everything the edit-permission rule needs to know about the viewer. Both the
 * session user (display side) and the fresh DB user (enforce side) satisfy this
 * shape — only the freshness of the values differs. */
export interface EditableViewer {
  role?: string | null;
  banned?: boolean | null;
}

/** Single source of truth for "can this viewer edit the wiki under the current
 * edit policy". The display side feeds cheap/cached inputs (session role+banned,
 * module-cached editRole); the enforce side feeds fresh DB inputs. The predicate
 * is identical, so the two sides cannot diverge on the rule itself. See ADR 0012. */
export function canViewerEdit(
  viewer: EditableViewer | null | undefined,
  editRole: WikiEditRole,
): boolean {
  if (!viewer || viewer.banned) return false;
  return editRole === "user" || viewer.role === "admin";
}
