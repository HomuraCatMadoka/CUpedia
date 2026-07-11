import { describe, expect, it } from "vitest";
import { assertDatabaseReady, deriveE2eRuntime } from "../../e2e/runtime";

describe("deriveE2eRuntime", () => {
  it("isolates the port and local database for each worktree", () => {
    const databaseUrl = "postgresql://postgres:postgres@localhost:5433/cuclaw";

    const first = deriveE2eRuntime({
      projectRoot: "/repo/wt/first",
      databaseUrl,
    });
    const second = deriveE2eRuntime({
      projectRoot: "/repo/wt/second",
      databaseUrl,
    });

    expect(first.port).not.toBe(second.port);
    expect(first.databaseUrl).not.toBe(second.databaseUrl);
    expect(new URL(first.databaseUrl).pathname).toMatch(/^\/cuclaw_e2e_/);
    expect(new URL(second.databaseUrl).pathname).toMatch(/^\/cuclaw_e2e_/);
  });

  it("is idempotent when Playwright workers reload the config", () => {
    const input = {
      projectRoot: "/repo/wt/reloaded",
      databaseUrl: "postgresql://postgres:postgres@localhost:5433/cuclaw",
    };
    const first = deriveE2eRuntime(input);
    const second = deriveE2eRuntime({
      ...input,
      databaseUrl: first.databaseUrl,
    });

    expect(second.databaseUrl).toBe(first.databaseUrl);
  });

  it("refuses to derive a test database from a remote DATABASE_URL", () => {
    expect(() =>
      deriveE2eRuntime({
        projectRoot: "/repo/wt/remote",
        databaseUrl:
          "postgresql://postgres:secret@db.example.supabase.co:5432/postgres",
      }),
    ).toThrow(/E2E_DATABASE_URL/);
  });

  it("rejects an explicit database whose name is not marked for e2e", () => {
    expect(() =>
      deriveE2eRuntime({
        projectRoot: "/repo/wt/unsafe",
        databaseUrl: "postgresql://postgres:postgres@localhost:5433/cuclaw",
        e2eDatabaseUrl:
          "postgresql://postgres:secret@db.example.com:5432/production",
      }),
    ).toThrow(/E2E database name/);
  });

  it("allows an explicitly named remote e2e database", () => {
    const runtime = deriveE2eRuntime({
      projectRoot: "/repo/wt/explicit",
      databaseUrl: "postgresql://postgres:postgres@localhost:5433/cuclaw",
      e2eDatabaseUrl:
        "postgresql://postgres:secret@db.example.com:5432/staging_e2e",
    });

    expect(new URL(runtime.databaseUrl).hostname).toBe("db.example.com");
    expect(new URL(runtime.databaseUrl).pathname).toBe("/staging_e2e");
  });

  it("reports how to start Docker when local Postgres is unavailable", async () => {
    const url =
      "postgresql://postgres:super-secret@127.0.0.1:1/cuclaw_e2e_test";

    await expect(assertDatabaseReady(url, 250)).rejects.toThrow(
      /docker compose up -d db/,
    );
    await expect(assertDatabaseReady(url, 250)).rejects.not.toThrow(
      /super-secret/,
    );
  });

  it("points remote connection failures back to E2E_DATABASE_URL", async () => {
    const url =
      "postgresql://postgres:super-secret@unavailable.invalid:5432/staging_e2e";

    await expect(assertDatabaseReady(url, 250)).rejects.toThrow(
      /E2E_DATABASE_URL/,
    );
    await expect(assertDatabaseReady(url, 250)).rejects.not.toThrow(
      /super-secret/,
    );
  });
});
