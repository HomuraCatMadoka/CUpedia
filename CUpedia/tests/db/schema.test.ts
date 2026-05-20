import { describe, it, expect } from "vitest";
import { getTableColumns } from "drizzle-orm";
import {
  users,
  wikiPages,
  wikiRevisions,
  verificationTokens,
  sessions,
} from "@/db/schema";

describe("schema", () => {
  it("users table has required custom fields", () => {
    const cols = getTableColumns(users);
    expect(cols.nickname).toBeDefined();
    expect(cols.role).toBeDefined();
    expect(cols.banned).toBeDefined();
    expect(cols.email).toBeDefined();
  });

  it("wikiPages table has required fields", () => {
    const cols = getTableColumns(wikiPages);
    expect(cols.slug).toBeDefined();
    expect(cols.title).toBeDefined();
    expect(cols.content).toBeDefined();
    expect(cols.parentId).toBeDefined();
    expect(cols.deletedAt).toBeDefined();
    expect(cols.createdBy).toBeDefined();
    expect(cols.updatedBy).toBeDefined();
  });

  it("wikiRevisions table has required fields", () => {
    const cols = getTableColumns(wikiRevisions);
    expect(cols.pageId).toBeDefined();
    expect(cols.title).toBeDefined();
    expect(cols.content).toBeDefined();
    expect(cols.editedBy).toBeDefined();
    expect(cols.editSummary).toBeDefined();
  });

  it("verificationTokens table has required fields", () => {
    const cols = getTableColumns(verificationTokens);
    expect(cols.identifier).toBeDefined();
    expect(cols.token).toBeDefined();
    expect(cols.expires).toBeDefined();
  });

  it("sessions table has required Auth.js fields", () => {
    const cols = getTableColumns(sessions);
    expect(cols.sessionToken).toBeDefined();
    expect(cols.userId).toBeDefined();
    expect(cols.expires).toBeDefined();
  });
});
