export function formatCourseCode(code: string) {
  const normalized = code.trim().toUpperCase();
  const match = normalized.match(/^([A-Z]{4})(\d{4})$/);
  return match ? `${match[1]} ${match[2]}` : normalized;
}

export function getCourseSubject(code: string) {
  return code.trim().slice(0, 4).toUpperCase();
}

export function formatCourseMetric(value: number | null) {
  return value == null ? "N/A" : value.toFixed(1);
}
