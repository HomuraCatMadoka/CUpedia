import { describe, expect, it } from "vitest";

import { isAllowedProfessorPortraitUrl } from "@/lib/professor-portrait-assets";

describe("isAllowedProfessorPortraitUrl", () => {
  it("allows HTTPS CUHK and configured WordPress CDN images only", () => {
    expect(
      isAllowedProfessorPortraitUrl(
        "https://www.peu.cuhk.edu.hk/wp-content/uploads/photo.jpg",
      ),
    ).toBe(true);
    expect(
      isAllowedProfessorPortraitUrl(
        "https://i0.wp.com/chem.cuhk.edu.hk/photo.jpg",
      ),
    ).toBe(true);
    expect(
      isAllowedProfessorPortraitUrl("http://www.peu.cuhk.edu.hk/a.jpg"),
    ).toBe(false);
    expect(isAllowedProfessorPortraitUrl("https://example.com/a.jpg")).toBe(
      false,
    );
    expect(isAllowedProfessorPortraitUrl("not a url")).toBe(false);
  });
});
