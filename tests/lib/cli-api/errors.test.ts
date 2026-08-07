import { describe, it, expect } from "vitest";

import { ERROR_CODES, cliError } from "@/lib/cli-api/errors";

describe("cliError", () => {
  it("builds an { error, status } payload without a message", () => {
    expect(cliError("UNAUTHORIZED", 401)).toEqual({
      error: "UNAUTHORIZED",
      status: 401,
    });
  });

  it("includes the message when provided", () => {
    expect(cliError("RATE_LIMIT_EXCEEDED", 429, "slow down")).toEqual({
      error: "RATE_LIMIT_EXCEEDED",
      status: 429,
      message: "slow down",
    });
  });

  it("keeps the documented code set stable", () => {
    expect(ERROR_CODES.UNAUTHORIZED).toBe("UNAUTHORIZED");
    expect(ERROR_CODES.USER_BANNED).toBe("USER_BANNED");
    expect(ERROR_CODES.FORBIDDEN).toBe("FORBIDDEN");
    expect(ERROR_CODES.ACCOUNT_SETUP_REQUIRED).toBe("ACCOUNT_SETUP_REQUIRED");
    expect(ERROR_CODES.INVALID_JSON).toBe("INVALID_JSON");
    expect(ERROR_CODES.INVALID_PARAMS).toBe("INVALID_PARAMS");
    expect(ERROR_CODES.INVALID_VOTE).toBe("INVALID_VOTE");
    expect(ERROR_CODES.INVALID_DANMAKU).toBe("INVALID_DANMAKU");
    expect(ERROR_CODES.NOT_FOUND).toBe("NOT_FOUND");
    expect(ERROR_CODES.RATE_LIMIT_EXCEEDED).toBe("RATE_LIMIT_EXCEEDED");
    expect(ERROR_CODES.INTERNAL_ERROR).toBe("INTERNAL_ERROR");
  });
});
