import { isAllowedEmail } from "@/lib/email";
import { isEmailRegistered } from "@/lib/auth-guard";
import { NextResponse } from "next/server";

// Lets the register page warn before sending an OTP that an email already has
// an account (→ direct them to login / reset-password). Returns registered:
// false for ineligible or non-string emails so the caller falls through to its
// own whitelist error rather than this gate.
export async function POST(req: Request) {
  const { email } = await req.json();
  if (typeof email !== "string" || !isAllowedEmail(email)) {
    return NextResponse.json({ registered: false });
  }
  return NextResponse.json({ registered: await isEmailRegistered(email) });
}
