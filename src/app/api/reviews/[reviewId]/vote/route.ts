import { NextResponse } from "next/server";
import { voteCourseReview } from "@/lib/course-actions";

function isRedirectError(error: Error) {
  const digest = (error as { digest?: unknown }).digest;
  return (
    error.message === "NEXT_REDIRECT" ||
    (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT"))
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ reviewId: string }> },
) {
  try {
    const body = await request.json();
    const { reviewId } = await params;
    const result = await voteCourseReview(reviewId, body.value);
    return NextResponse.json(result);
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
    if (error.message === "Review not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error.message === "value must be 1 or -1") {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
