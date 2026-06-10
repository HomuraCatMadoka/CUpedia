import { NextResponse } from "next/server";
import { createCourseReview } from "@/lib/course-actions";

function isUniqueViolation(error: Error) {
  return error.message.includes("course_reviews_course_user_unique");
}

function isRedirectError(error: Error) {
  const digest = (error as { digest?: unknown }).digest;
  return (
    error.message === "NEXT_REDIRECT" ||
    (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT"))
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId } = await params;
    const reviewId = await createCourseReview(courseId, await request.json());
    return NextResponse.json({ id: reviewId }, { status: 201 });
  } catch (error) {
    if (!(error instanceof Error)) {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 },
      );
    }
    if (isRedirectError(error)) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 },
      );
    }
    if (error.message === "Course not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (isUniqueViolation(error)) {
      return NextResponse.json(
        { error: "Review already exists for this course" },
        { status: 409 },
      );
    }
    if (
      error.message.includes("must be an integer") ||
      error.message === "content cannot be empty"
    ) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
