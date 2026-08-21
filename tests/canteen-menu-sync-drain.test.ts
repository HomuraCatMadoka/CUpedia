import { describe, expect, it, vi } from "vitest";
import {
  drainMenuSync,
  MAX_ENDPOINT_CALLS,
  MENU_SYNC_ENDPOINT,
  WALL_CLOCK_BUDGET_MS,
} from "../scripts/drain-canteen-menu-sync.mjs";

const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const applied = {
  disposition: "continue",
  window: "2026-08-21/lunch",
  sourceId: "source-1",
  result: {
    sourceId: "source-1",
    status: "applied",
    code: "MENU_SYNC_APPLIED",
    itemCount: 2,
  },
};

const unchanged = {
  disposition: "continue",
  window: "2026-08-21/lunch",
  sourceId: "source-2",
  result: {
    sourceId: "source-2",
    status: "unchanged",
    code: "MENU_SYNC_UNCHANGED",
    itemCount: 2,
  },
};

const noWork = {
  disposition: "no-work",
  window: "2026-08-21/lunch",
};
const retryLater = {
  disposition: "retry-later",
  window: "2026-08-21/lunch",
  sourceId: "source-1",
  code: "PROVIDER_TIMEOUT",
};

function makeDrainOptions(fetchImpl: typeof fetch) {
  return {
    secret: "test-secret",
    fetchImpl,
    log: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
  };
}

describe("production canteen menu sync drain (#635)", () => {
  it("drains applied and unchanged sources until no work remains", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(applied))
      .mockResolvedValueOnce(response(unchanged))
      .mockResolvedValueOnce(response(noWork));

    await expect(drainMenuSync(makeDrainOptions(fetchImpl))).resolves.toEqual({
      calls: 3,
      disposition: "no-work",
    });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledWith(
      MENU_SYNC_ENDPOINT,
      expect.objectContaining({
        method: "POST",
        headers: { authorization: "Bearer test-secret" },
      }),
    );
  });

  it("retries only endpoint-classified transient outcomes with bounded backoff", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(response(retryLater))
      .mockResolvedValueOnce(response(applied))
      .mockResolvedValueOnce(response(noWork));
    const config = makeDrainOptions(fetchImpl);

    await expect(drainMenuSync(config)).resolves.toMatchObject({ calls: 3 });
    expect(config.sleep).toHaveBeenCalledOnce();
    expect(config.sleep).toHaveBeenCalledWith(2 * 60 * 1_000);
  });

  it("fails after the bounded retry-later budget", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => response(retryLater));

    await expect(
      drainMenuSync({
        ...makeDrainOptions(fetchImpl),
        retryDelaysMs: [1],
      }),
    ).rejects.toThrow("Retry budget exhausted: PROVIDER_TIMEOUT");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it.each([
    "MENU_SYNC_CONFLICT",
    "MENU_SYNC_IDENTITY_CHURN",
    "MENU_SYNC_SUSPICIOUS_DROP",
  ])("fails immediately when %s stops for review", async (code) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        disposition: "stop-for-review",
        window: "2026-08-21/lunch",
        sourceId: "source-1",
        code,
      }),
    );

    await expect(drainMenuSync(makeDrainOptions(fetchImpl))).rejects.toThrow(
      `Review required: ${code}`,
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([401, 403, 404, 503])(
    "fails an HTTP %s response without retrying",
    async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(response({}, status));
      const config = makeDrainOptions(fetchImpl);

      await expect(drainMenuSync(config)).rejects.toThrow(
        `Endpoint request failed with HTTP ${status}`,
      );
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(config.sleep).not.toHaveBeenCalled();
    },
  );

  it("fails locally when the dedicated secret is not configured", async () => {
    const fetchImpl = vi.fn();
    await expect(
      drainMenuSync({ ...makeDrainOptions(fetchImpl), secret: "" }),
    ).rejects.toThrow("MENU_SYNC_TRIGGER_SECRET is not configured");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("fails malformed JSON and malformed dispositions without retrying", async () => {
    const invalidJson = vi
      .fn()
      .mockResolvedValue(new Response("not-json", { status: 200 }));
    await expect(drainMenuSync(makeDrainOptions(invalidJson))).rejects.toThrow(
      "Malformed endpoint response: invalid JSON",
    );

    const invalidDisposition = vi
      .fn()
      .mockResolvedValue(response({ disposition: "try-again" }));
    await expect(
      drainMenuSync(makeDrainOptions(invalidDisposition)),
    ).rejects.toThrow("Malformed endpoint response: invalid disposition");
  });

  it("fails a semantically invalid continue result", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        response({
          disposition: "continue",
          window: "2026-08-21/lunch",
          sourceId: "source-1",
          result: {
            sourceId: "source-1",
            status: "bogus",
            code: "bogus",
          },
        }),
      )
      .mockResolvedValueOnce(response(noWork));

    await expect(drainMenuSync(makeDrainOptions(fetchImpl))).rejects.toThrow(
      "Malformed endpoint response: invalid result status",
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "invalid result code",
      {
        sourceId: "source-1",
        status: "applied",
        code: "BOGUS",
        itemCount: 1,
      },
    ],
    [
      "result status contradicts disposition",
      {
        sourceId: "source-1",
        status: "blocked",
        code: "MENU_SYNC_CONFLICT",
      },
    ],
    [
      "mismatched result sourceId",
      {
        sourceId: "source-2",
        status: "applied",
        code: "MENU_SYNC_APPLIED",
        itemCount: 1,
      },
    ],
    [
      "invalid result itemCount",
      {
        sourceId: "source-1",
        status: "applied",
        code: "MENU_SYNC_APPLIED",
        itemCount: -1,
      },
    ],
  ])("fails a continue result with %s", async (message, result) => {
    const fetchImpl = vi.fn().mockResolvedValue(
      response({
        disposition: "continue",
        window: "2026-08-21/lunch",
        sourceId: "source-1",
        result,
      }),
    );

    await expect(drainMenuSync(makeDrainOptions(fetchImpl))).rejects.toThrow(
      `Malformed endpoint response: ${message}`,
    );
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("fails a timed-out request without retrying", async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      });
    });
    const pending = drainMenuSync({
      ...makeDrainOptions(fetchImpl as typeof fetch),
      requestTimeoutMs: 50,
    });
    const assertion = expect(pending).rejects.toThrow(
      "Endpoint request timed out after 50ms",
    );
    await vi.advanceTimersByTimeAsync(50);
    await assertion;
    expect(fetchImpl).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it("enforces endpoint-call and wall-clock budgets", async () => {
    const fetchImpl = vi.fn().mockImplementation(() => response(applied));
    await expect(
      drainMenuSync({ ...makeDrainOptions(fetchImpl), maxEndpointCalls: 2 }),
    ).rejects.toThrow("Endpoint-call budget exhausted after 2 calls");

    const now = vi
      .fn()
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValue(WALL_CLOCK_BUDGET_MS);
    await expect(
      drainMenuSync({ ...makeDrainOptions(fetchImpl), now }),
    ).rejects.toThrow("Wall-clock budget exhausted before call 2");
    expect(MAX_ENDPOINT_CALLS).toBe(16);
  });
});
