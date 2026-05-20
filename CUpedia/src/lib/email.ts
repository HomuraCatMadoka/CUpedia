const ALLOWED_DOMAINS = new Set(["link.cuhk.edu.hk", "cuhk.edu.hk"]);

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseEmail(
  email: string
): { ok: true; email: string } | { ok: false; code: "INVALID_EMAIL" } {
  const normalized = normalizeEmail(email);
  const at = normalized.lastIndexOf("@");
  if (at <= 0 || at !== normalized.indexOf("@")) {
    return { ok: false, code: "INVALID_EMAIL" };
  }
  const domain = normalized.slice(at + 1);
  if (!domain) {
    return { ok: false, code: "INVALID_EMAIL" };
  }
  return { ok: true, email: normalized };
}

export function isAllowedEmail(email: string): boolean {
  const parsed = parseEmail(email);
  if (!parsed.ok) return false;
  const at = parsed.email.lastIndexOf("@");
  const domain = parsed.email.slice(at + 1);
  return ALLOWED_DOMAINS.has(domain);
}
