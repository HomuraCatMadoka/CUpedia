import { Client, type QueryResultRow } from "pg";

export async function withDatabaseClient<T>(
  callback: (client: Client) => Promise<T>,
) {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

export function queryDatabase<T extends QueryResultRow>(
  text: string,
  values: unknown[] = [],
) {
  return withDatabaseClient((client) => client.query<T>(text, values));
}
