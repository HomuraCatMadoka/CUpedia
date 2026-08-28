import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migrationSql = readFileSync(
  new URL(
    "../../src/db/migrations/0099_professor-portrait-assets.sql",
    import.meta.url,
  ),
  "utf8",
);

describe("professor portrait asset migration", () => {
  it("keeps latest-attempt state separate from last-ready asset state", () => {
    expect(migrationSql).toContain(
      '"attempted_source_fingerprint" text NOT NULL',
    );
    expect(migrationSql).toContain('"source_fingerprint" text');
    expect(migrationSql).toContain('"source_etag" text');
    expect(migrationSql).toContain('"source_last_modified" text');
    expect(migrationSql).toContain('"webp_256_key" text');
    expect(migrationSql).toContain('"webp_384_key" text');
  });

  it("constrains lifecycle state and follows the canonical person lifecycle", () => {
    expect(migrationSql).toContain(
      "CHECK (\"professor_portrait_assets\".\"status\" in ('pending', 'ready', 'failed'))",
    );
    expect(migrationSql).toContain(
      'REFERENCES "public"."staff_people"("id") ON DELETE cascade',
    );
    expect(migrationSql).toContain(
      'ALTER TABLE "professor_portrait_assets" ENABLE ROW LEVEL SECURITY',
    );
  });
});
