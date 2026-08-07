import { NextResponse } from "next/server";

/**
 * Minimal response helpers for the CLI API route handlers.
 *
 * `ok` / `fail` return NextResponse instances directly; `parseJsonBody`
 * returns the parsed body or null when the body is not valid JSON (routes
 * then respond with INVALID_JSON — see src/lib/cli-api/errors.ts).
 */

/** Success payload with default 200 (pass 201 for creates). */
export function ok(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

/** Error payload following the existing `{ error }` convention. */
export function fail(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

/** Parse a JSON request body; null when unparseable or empty. */
export async function parseJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
