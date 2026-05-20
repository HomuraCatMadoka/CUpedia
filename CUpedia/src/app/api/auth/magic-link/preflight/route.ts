import { NextResponse } from "next/server";
import { peekMagicLinkRateLimit } from "@/lib/magic-link-rate-limit";

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, code: "INVALID_EMAIL" },
      { status: 400 }
    );
  }

  const { email } = body;
  if (!email || typeof email !== "string") {
    return NextResponse.json({ ok: false, code: "INVALID_EMAIL" });
  }

  try {
    const result = await peekMagicLinkRateLimit(email);
    return NextResponse.json(result);
  } catch (e) {
    console.error("preflight error:", e);
    return NextResponse.json(
      { ok: false, code: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
