/** Compare normalized provider text by Unicode code point for stable snapshots. */
export function compareProviderText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
