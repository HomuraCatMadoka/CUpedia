import { describe, it, expect } from "vitest";

import { ok, fail, parseJsonBody } from "@/lib/cli-api/respond";

describe("ok", () => {
  it("wraps data with default 200 status", async () => {
    const res = ok({ hello: "world" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ hello: "world" });
  });

  it("respects a custom status (e.g. 201 for creates)", async () => {
    const res = ok({ id: "x" }, 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "x" });
  });
});

describe("fail", () => {
  it("wraps the message as { error } with the given status", async () => {
    const res = fail("UNAUTHORIZED", 401);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "UNAUTHORIZED" });
  });
});

describe("parseJsonBody", () => {
  it("parses a valid JSON body", async () => {
    const request = new Request("http://localhost/api/cli/test", {
      method: "POST",
      body: JSON.stringify({ a: 1 }),
    });
    await expect(parseJsonBody(request)).resolves.toEqual({ a: 1 });
  });

  it("returns null for malformed JSON", async () => {
    const request = new Request("http://localhost/api/cli/test", {
      method: "POST",
      body: "{not json",
    });
    await expect(parseJsonBody(request)).resolves.toBeNull();
  });

  it("returns null for an empty body", async () => {
    const request = new Request("http://localhost/api/cli/test", {
      method: "POST",
    });
    await expect(parseJsonBody(request)).resolves.toBeNull();
  });
});
