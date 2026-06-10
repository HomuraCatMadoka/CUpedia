import { NextResponse } from "next/server";
import { getCourseDetail } from "@/lib/course-actions";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId } = await params;
    const detail = await getCourseDetail(courseId);
    return NextResponse.json(detail);
  } catch (error) {
    if (error instanceof Error && error.message === "Course not found") {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
