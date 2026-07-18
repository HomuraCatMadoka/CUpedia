/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnchorHTMLAttributes } from "react";
import { CourseDetailTabs } from "@/components/courses/course-detail-tabs";

vi.mock("next/link", () => ({
  default: ({
    scroll,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { scroll?: boolean }) => (
    <a data-scroll={String(scroll)} {...props} />
  ),
}));

afterEach(cleanup);

describe("CourseDetailTabs", () => {
  it("只为同学测评展示内容数量，并标记当前视图", () => {
    render(
      <CourseDetailTabs
        activeTab="enrollment"
        reviewCount={37}
        reviewsHref="/courses/ELTU1001?from=%2Fcourses"
        enrollmentHref="/courses/ELTU1001?from=%2Fcourses&tab=enrollment"
      />,
    );

    const reviews = screen.getByRole("link", { name: "同学测评 37" });
    const enrollment = screen.getByRole("link", { name: "选课人数参考" });
    expect(reviews.getAttribute("href")).toBe(
      "/courses/ELTU1001?from=%2Fcourses",
    );
    expect(reviews.getAttribute("data-scroll")).toBe("false");
    expect(enrollment.getAttribute("data-scroll")).toBe("false");
    expect(enrollment.getAttribute("aria-current")).toBe("page");
    expect(screen.queryByText("134")).toBeNull();
  });
});
