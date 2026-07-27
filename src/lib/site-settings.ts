import { db } from "@/db";
import { siteSettings } from "@/db/schema";
import { sql } from "drizzle-orm";

type WikiEditRole = "admin" | "user";
const WIKI_EDIT_ROLE_KEY = "wiki_edit_role";
const DEFAULT_ROLE: WikiEditRole = "admin";

let cached: WikiEditRole | null = null;

export function _clearCache() {
  cached = null;
}

export async function getWikiEditRoleFresh(): Promise<WikiEditRole> {
  const result = await db.execute(
    sql`SELECT ${siteSettings.value} FROM ${siteSettings} WHERE ${siteSettings.key} = ${WIKI_EDIT_ROLE_KEY}`,
  );
  const rows = (result.rows ?? result) as { value: string }[];
  if (rows.length === 0) return DEFAULT_ROLE;
  return rows[0].value as WikiEditRole;
}

export async function getWikiEditRole(): Promise<WikiEditRole> {
  if (cached !== null) return cached;
  cached = await getWikiEditRoleFresh();
  return cached;
}

export async function setWikiEditRole(role: WikiEditRole) {
  await db.execute(
    sql`INSERT INTO ${siteSettings} (${sql.identifier("key")}, ${sql.identifier("value")}) VALUES (${WIKI_EDIT_ROLE_KEY}, ${role}) ON CONFLICT (${sql.identifier("key")}) DO UPDATE SET ${sql.identifier("value")} = ${role}`,
  );
  _clearCache();
}

const OWNER_USER_ID_KEY = "owner_user_id";
const CANTEEN_SHAME_VOTE_END_DATE_KEY = "canteen_shame_vote_end_date";
export const DEFAULT_CANTEEN_SHAME_VOTE_END_DATE = "2026-09-01";
let mockCanteenShameVoteEndDate = DEFAULT_CANTEEN_SHAME_VOTE_END_DATE;

export function _resetCanteenShameVoteEndDateForTests(): void {
  mockCanteenShameVoteEndDate = DEFAULT_CANTEEN_SHAME_VOTE_END_DATE;
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(
    Date.UTC(Number(year), Number(month) - 1, Number(day)),
  );
  return (
    parsed.getUTCFullYear() === Number(year) &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day)
  );
}

export async function getCanteenShameVoteEndDate(): Promise<string> {
  if (process.env.CANTEEN_MOCK_DATA === "true") {
    return mockCanteenShameVoteEndDate;
  }
  const result = await db.execute(
    sql`SELECT ${siteSettings.value} FROM ${siteSettings} WHERE ${siteSettings.key} = ${CANTEEN_SHAME_VOTE_END_DATE_KEY}`,
  );
  const rows = (result.rows ?? result) as { value: string }[];
  const value = rows[0]?.value;
  return value && isCalendarDate(value)
    ? value
    : DEFAULT_CANTEEN_SHAME_VOTE_END_DATE;
}

export async function setCanteenShameVoteEndDate(value: string): Promise<void> {
  if (!isCalendarDate(value)) throw new Error("INVALID_END_DATE");
  if (process.env.CANTEEN_MOCK_DATA === "true") {
    mockCanteenShameVoteEndDate = value;
    return;
  }
  await db.execute(
    sql`INSERT INTO ${siteSettings} (${sql.identifier("key")}, ${sql.identifier("value")}) VALUES (${CANTEEN_SHAME_VOTE_END_DATE_KEY}, ${value}) ON CONFLICT (${sql.identifier("key")}) DO UPDATE SET ${sql.identifier("value")} = ${value}`,
  );
}

// The site Owner (站长) — the single admin allowed to manage roles. Read fresh
// every call (no module cache): a freshly set/transferred Owner must take effect
// immediately for role-management gating, not lag behind a cache.
export async function getOwnerUserId(): Promise<string | null> {
  const result = await db.execute(
    sql`SELECT ${siteSettings.value} FROM ${siteSettings} WHERE ${siteSettings.key} = ${OWNER_USER_ID_KEY}`,
  );
  const rows = (result.rows ?? result) as { value: string }[];
  return rows[0]?.value ?? null;
}
