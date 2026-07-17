/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { CourseDetailTabs } from "@/components/courses/course-detail-tabs";

afterEach(cleanup);

describe("CourseDetailTabs", () => {
  it("展示两个带数量的深链标签并标记当前视图", () => {
    render(
      <CourseDetailTabs
        activeTab="enrollment"
        reviewCount={37}
        enrollmentCount={134}
        reviewsHref="/courses/ELTU1001?from=%2Fcourses"
        enrollmentHref="/courses/ELTU1001?from=%2Fcourses&tab=enrollment"
      />,
    );

    const reviews = screen.getByRole("link", { name: "同学测评 37" });
    const enrollment = screen.getByRole("link", { name: "选课人数 134" });
    expect(reviews.getAttribute("href")).toBe(
      "/courses/ELTU1001?from=%2Fcourses",
    );
    expect(enrollment.getAttribute("aria-current")).toBe("page");
  });
});
