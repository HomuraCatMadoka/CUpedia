import { createHash } from "node:crypto";
import { Client } from "pg";

type RuntimeInput = {
  projectRoot: string;
  databaseUrl: string;
  e2eDatabaseUrl?: string;
  port?: number;
};

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function deriveE2eRuntime({
  projectRoot,
  databaseUrl,
  e2eDatabaseUrl,
  port,
}: RuntimeInput) {
  const digest = createHash("sha256").update(projectRoot).digest();
  const worktreeId = digest.toString("hex", 0, 4);
  const url = new URL(e2eDatabaseUrl ?? databaseUrl);

  if (!e2eDatabaseUrl) {
    if (!LOCAL_HOSTS.has(url.hostname)) {
      throw new Error(
        "Refusing to derive an E2E database from a remote DATABASE_URL; set E2E_DATABASE_URL explicitly",
      );
    }
    const baseName = url.pathname.slice(1).replace(/_e2e_[a-f0-9]{8}$/i, "");
    url.pathname = `/${baseName}_e2e_${worktreeId}`;
  }

  assertSafeE2eDatabase(url.toString());

  return {
    databaseUrl: url.toString(),
    port: port ?? 31_000 + (digest.readUInt32BE(0) % 10_000),
    worktreeId,
  };
}

export function assertSafeE2eDatabase(connectionUrl: string) {
  const databaseName = new URL(connectionUrl).pathname.slice(1);
  if (
    !/(^|_)e2e($|_)/i.test(databaseName) ||
    !/^[a-zA-Z0-9_-]+$/.test(databaseName)
  ) {
    throw new Error(
      "E2E database name must contain an e2e marker and only safe characters",
    );
  }
}

export async function assertDatabaseReady(
  connectionUrl: string,
  timeoutMs = 5_000,
) {
  const client = new Client({
    connectionString: connectionUrl,
    connectionTimeoutMillis: timeoutMs,
  });

  try {
    await client.connect();
  } catch {
    const { hostname, port } = new URL(connectionUrl);
    const address = `${hostname}:${port || "5432"}`;
    throw new Error(
      LOCAL_HOSTS.has(hostname)
        ? `Cannot reach E2E Postgres at ${address}. Run: docker compose up -d db`
        : `Cannot reach E2E Postgres at ${address}. Check E2E_DATABASE_URL`,
    );
  } finally {
    await client.end().catch(() => undefined);
  }
}
