export function safeAuthReturnPath(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/u.test(value)
  ) {
    return "/";
  }
  return value;
}
