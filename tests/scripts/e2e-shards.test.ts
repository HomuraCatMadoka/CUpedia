import { describe, expect, it } from "vitest";
import { deriveShardRuntime, shardDistDir } from "../../scripts/run-e2e-shards";

describe("parallel E2E shard runtime (#669)", () => {
  it("gives every shard an isolated real database and server port", () => {
    expect(
      deriveShardRuntime(
        "postgresql://postgres:postgres@localhost:5433/cuclaw",
        31_000,
        1,
      ),
    ).toEqual({
      databaseUrl:
        "postgresql://postgres:postgres@localhost:5433/cuclaw_e2e_s1",
      port: 31_001,
    });
    expect(
      deriveShardRuntime(
        "postgresql://postgres:postgres@localhost:5433/cuclaw_e2e",
        31_000,
        2,
      ),
    ).toEqual({
      databaseUrl:
        "postgresql://postgres:postgres@localhost:5433/cuclaw_e2e_s2",
      port: 31_002,
    });
    expect(shardDistDir(1)).toBe(".next-e2e-shard-1");
    expect(shardDistDir(2)).toBe(".next-e2e-shard-2");
  });

  it("rejects invalid shard identities and ports", () => {
    expect(() =>
      deriveShardRuntime(
        "postgresql://postgres:postgres@localhost:5433/cuclaw",
        31_000,
        0,
      ),
    ).toThrow("shardIndex must be a positive integer");
    expect(() =>
      deriveShardRuntime(
        "postgresql://postgres:postgres@localhost:5433/cuclaw",
        65_535,
        1,
      ),
    ).toThrow("Invalid E2E shard port");
  });
});
