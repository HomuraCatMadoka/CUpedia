/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import MyCourseReviewsLoading from "@/app/(main)/courses/my-reviews/loading";

describe("MyCourseReviewsLoading", () => {
  it("announces the loading state", () => {
    render(<MyCourseReviewsLoading />);
    expect(
      screen.getByRole("status", { name: "正在加载我的课程评价" }),
    ).toBeTruthy();
  });
});
