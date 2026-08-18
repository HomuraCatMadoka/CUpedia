import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { assertSafeE2eDatabase } from "../e2e/runtime";

const DEFAULT_SHARD_COUNT = 1;

export function shardDistDir(shardIndex: number) {
  return `.next-e2e-shard-${shardIndex}`;
}

function prepareShardBuild(projectRoot: string, shardIndex: number) {
  const source = path.join(projectRoot, ".next");
  const target = path.join(projectRoot, shardDistDir(shardIndex));
  rmSync(target, { recursive: true, force: true });

  if (process.platform === "darwin") {
    execFileSync("cp", ["-cR", source, target]);
  } else {
    execFileSync("cp", ["-al", source, target]);
  }

  // The build output is immutable and shared through clone/hard links. The
  // runtime cache must contain data from only this shard's database.
  rmSync(path.join(target, "cache"), { recursive: true, force: true });
  mkdirSync(path.join(target, "cache"), { recursive: true });
}

export function deriveShardRuntime(
  connectionUrl: string,
  basePort: number,
  shardIndex: number,
) {
  if (!Number.isInteger(shardIndex) || shardIndex < 1) {
    throw new Error("shardIndex must be a positive integer");
  }
  const url = new URL(connectionUrl);
  const baseName = url.pathname.slice(1).replace(/_s\d+$/i, "");
  url.pathname = `/${baseName.includes("e2e") ? baseName : `${baseName}_e2e`}_s${shardIndex}`;
  const databaseUrl = url.toString();
  assertSafeE2eDatabase(databaseUrl);

  const port = basePort + shardIndex;
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`Invalid E2E shard port: ${port}`);
  }

  return { databaseUrl, port };
}

function runShard(
  playwrightArgs: string[],
  shardIndex: number,
  shardCount: number,
  baseDatabaseUrl: string,
  basePort: number,
) {
  const runtime = deriveShardRuntime(baseDatabaseUrl, basePort, shardIndex);
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const child = spawn(
    pnpm,
    [
      "exec",
      "playwright",
      "test",
      ...playwrightArgs,
      `--shard=${shardIndex}/${shardCount}`,
    ],
    {
      env: {
        ...process.env,
        DATABASE_URL: runtime.databaseUrl,
        E2E_DATABASE_URL: runtime.databaseUrl,
        E2E_PORT: String(runtime.port),
        AUTH_URL: `http://localhost:${runtime.port}`,
        PLAYWRIGHT_HTML_OUTPUT_DIR: `playwright-report-shard-${shardIndex}`,
        PLAYWRIGHT_OUTPUT_DIR: `test-results-shard-${shardIndex}`,
        NEXT_DIST_DIR: shardDistDir(shardIndex),
      },
      stdio: "inherit",
    },
  );

  return new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (signal) {
        reject(new Error(`Playwright shard ${shardIndex} exited on ${signal}`));
        return;
      }
      resolve(code ?? 1);
    });
  });
}

async function main() {
  const databaseUrl = process.env.E2E_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for E2E shards");

  const shardCount = Number(process.env.E2E_SHARD_COUNT ?? DEFAULT_SHARD_COUNT);
  if (!Number.isInteger(shardCount) || shardCount < 1) {
    throw new Error("E2E_SHARD_COUNT must be a positive integer");
  }
  const basePort = Number(process.env.E2E_PORT ?? 31_000);
  const playwrightArgs = process.argv.slice(2);
  const shardIndexes = Array.from(
    { length: shardCount },
    (_, index) => index + 1,
  );
  const useDevServer = process.env.E2E_SERVER_MODE === "dev";
  if (!useDevServer) {
    for (const shardIndex of shardIndexes) {
      prepareShardBuild(process.cwd(), shardIndex);
    }
  }

  let results: number[];
  try {
    results = await Promise.all(
      shardIndexes.map((shardIndex) =>
        runShard(playwrightArgs, shardIndex, shardCount, databaseUrl, basePort),
      ),
    );
  } finally {
    if (!useDevServer) {
      for (const shardIndex of shardIndexes) {
        rmSync(path.join(process.cwd(), shardDistDir(shardIndex)), {
          recursive: true,
          force: true,
        });
      }
    }
  }

  if (results.some((code) => code !== 0)) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
