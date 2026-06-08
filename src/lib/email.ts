const ALLOWED_DOMAINS = new Set(["link.cuhk.edu.hk", "cuhk.edu.hk"]);
const LINK_PREFIX_RE = /^1155\d{6}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function parseEmail(
  email: string,
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
  if (process.env.SKIP_EMAIL_WHITELIST === "true") return true;

  const parsed = parseEmail(email);
  if (!parsed.ok) return false;
  const at = parsed.email.lastIndexOf("@");
  const prefix = parsed.email.slice(0, at);
  const domain = parsed.email.slice(at + 1);

  if (!ALLOWED_DOMAINS.has(domain)) return false;
  if (domain === "link.cuhk.edu.hk" && !LINK_PREFIX_RE.test(prefix))
    return false;

  return true;
}

const OTP_WHITELIST_PATHS = new Set([
  "/email-otp/send-verification-otp",
  "/sign-in/email-otp",
  "/email-otp/request-password-reset",
  "/email-otp/reset-password",
]);

// Authoritative server-side eligible-account gate for the email-OTP endpoints.
// The login/register pages also call isAllowedEmail, but that client check is
// bypassable; this gate (wired in the auth.ts before-hook) is the real boundary.
export function shouldRejectOtpRequest(path: string, email: unknown): boolean {
  if (!OTP_WHITELIST_PATHS.has(path)) return false;
  return typeof email === "string" && !isAllowedEmail(email);
}
