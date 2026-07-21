const CONTROL_CHAR_RE = /[\p{Cc}\p{Cf}]/u;
const ALLOWED_CHAR_RE = /^[a-zA-Z0-9_\p{Script=Han} ]+$/u;

export function normalizeNickname(input: string): string {
  return input.trim().replace(/\s+/g, " ");
}

export function validateNickname(
  input: string,
): { ok: true; nickname: string } | { ok: false; error: string } {
  if (CONTROL_CHAR_RE.test(input)) {
    return { ok: false, error: "昵称不能包含控制字符" };
  }
  const nickname = normalizeNickname(input);
  if (!ALLOWED_CHAR_RE.test(nickname)) {
    return { ok: false, error: "昵称只能包含中英文、数字、下划线和空格" };
  }
  const len = nickname.length;
  if (len < 2) {
    return { ok: false, error: "昵称至少需要 2 个字符" };
  }
  if (len > 20) {
    return { ok: false, error: "昵称最多 20 个字符" };
  }
  return { ok: true, nickname };
}

export function validateSignupNickname(input: unknown) {
  return validateNickname(typeof input === "string" ? input : "");
}
