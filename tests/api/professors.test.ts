import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockSearchProfessors } = vi.hoisted(() => ({
  mockSearchProfessors: vi.fn(),
}));

vi.mock("@/lib/course-review-actions", () => ({
  searchProfessors: (...args: unknown[]) => mockSearchProfessors(...args),
}));

import { GET } from "@/app/api/professors/route";

const PROFESSORS = [
  { id: "person-1", publicId: "pub-1", name: "Professor CHAN" },
];

function makeRequest(search = ""): Request {
  return new Request(`http://localhost/api/professors${search}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSearchProfessors.mockResolvedValue(PROFESSORS);
});

describe("GET /api/professors", () => {
  it("requires the course param", async () => {
    const res = await GET(makeRequest("?q=chan"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "INVALID_PARAMS" });
    expect(mockSearchProfessors).not.toHaveBeenCalled();
  });

  it("returns professor options for a course + query", async () => {
    const res = await GET(makeRequest("?course=CSCI3150&q=chan"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ professors: PROFESSORS });
    expect(mockSearchProfessors).toHaveBeenCalledWith("CSCI3150", "chan");
  });

  it("passes an empty q through (searchProfessors returns [])", async () => {
    mockSearchProfessors.mockResolvedValue([]);
    const res = await GET(makeRequest("?course=CSCI3150"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ professors: [] });
    expect(mockSearchProfessors).toHaveBeenCalledWith("CSCI3150", "");
  });
});
